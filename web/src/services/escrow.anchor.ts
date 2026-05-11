// Anchor implementation — wired to on-chain Vigent Escrow contract
import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import type { CreateEscrowInput, Escrow, EscrowFilters } from "@/types/escrow";
import type { ReleaseSession } from "@/types/release";
import type { IEscrowService } from "./escrow.service";
import { getConnection } from "@/lib/solana";
import { ESCROW_PROGRAM_ID, USDC_MINT, TREASURY_WALLET } from "@/lib/constants";
import IDL_JSON from "@/lib/idl.json";

const IDL = IDL_JSON as unknown as Idl;
const PROGRAM_ID = new PublicKey(ESCROW_PROGRAM_ID);
const DEFAULT_FEE_BPS = 250;

// --- Status mapping (on-chain → frontend) ---
type OnChainStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const STATUS_MAP: Record<OnChainStatus, Escrow["status"]> = {
  0: "created",       // Created
  1: "funded",        // Funded
  2: "release_pending", // ReleaseStarted
  3: "released",      // Released
  4: "refunded",      // Cancelled → mapped as refunded (depositor got funds back)
  5: "refunded",      // Disputed → after resolution, frontend treats as refunded
  6: "refunded",      // Expired → refund_after_expiry
};

const STATUS_VARIANT_MAP: Record<string, Escrow["status"]> = {
  created: "created",
  funded: "funded",
  releaseStarted: "release_pending",
  released: "released",
  cancelled: "refunded",
  disputed: "refunded",
  expired: "expired",
};

function mapStatus(onChain: unknown): Escrow["status"] {
  if (typeof onChain === "number") {
    return STATUS_MAP[onChain as OnChainStatus] ?? "created";
  }

  if (typeof onChain === "string") {
    return STATUS_VARIANT_MAP[onChain] ?? "created";
  }

  if (onChain && typeof onChain === "object") {
    const [variant] = Object.keys(onChain);
    return STATUS_VARIANT_MAP[variant] ?? "created";
  }

  return "created";
}

function getProvider(wallet: WalletContextState): AnchorProvider {
  const connection = getConnection();
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }
  const anchorWallet = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction.bind(wallet),
    signAllTransactions: wallet.signAllTransactions?.bind(wallet) ?? (async (txs: Transaction[]) => {
      const signed: Transaction[] = [];
      for (const tx of txs) signed.push(await wallet.signTransaction!(tx));
      return signed;
    }),
  };
  return new AnchorProvider(connection, anchorWallet as any, {
    commitment: "confirmed",
    skipPreflight: false,
  });
}

function getProgram(wallet: WalletContextState): Program {
  const provider = getProvider(wallet);
  return new Program(IDL, provider);
}

function getReadOnlyProgram(): Program {
  const connection = getConnection();
  const dummyWallet = {
    publicKey: PublicKey.unique(),
    signTransaction: async (tx: Transaction) => tx,
    signAllTransactions: async (txs: Transaction[]) => txs,
  };
  const provider = new AnchorProvider(connection, dummyWallet as any, {
    commitment: "confirmed",
  });
  return new Program(IDL, provider);
}

function bnToNumber(value: unknown): number {
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number(value ?? 0);
}

function readField<T>(raw: any, camelCaseName: string, snakeCaseName: string): T {
  return (raw[camelCaseName] ?? raw[snakeCaseName]) as T;
}

function getTreasuryOwner(fallback: PublicKey): PublicKey {
  return TREASURY_WALLET ? new PublicKey(TREASURY_WALLET) : fallback;
}

function getTokenConfig(tokenType: CreateEscrowInput["tokenType"]) {
  if (tokenType === "SOL") {
    return {
      mint: NATIVE_MINT,
      decimals: 9,
      label: "SOL",
    };
  }

  return {
    mint: new PublicKey(USDC_MINT),
    decimals: 6,
    label: "USDC",
  };
}

function getMintConfig(mint: PublicKey) {
  if (mint.equals(NATIVE_MINT)) {
    return {
      decimals: 9,
      tokenType: "SOL" as const,
      label: "SOL",
    };
  }

  return {
    decimals: 6,
    tokenType: "USDC" as const,
    label: "USDC",
  };
}

function formatTokenAmount(amount: number, decimals: number): string {
  return (amount / 10 ** decimals).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
}

async function addCreateAtaIfMissing(
  transaction: Transaction,
  provider: AnchorProvider,
  payer: PublicKey,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const ataInfo = await provider.connection.getAccountInfo(ata);

  if (!ataInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        payer,
        ata,
        owner,
        mint
      )
    );
  }

  return ata;
}

// PDA helpers
function findConfigPDA(depositor: PublicKey): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress([Buffer.from("config"), depositor.toBuffer()], PROGRAM_ID);
}

function findEscrowPDA(depositor: PublicKey, escrowId: BN): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [
      Buffer.from("escrow"),
      depositor.toBuffer(),
      escrowId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
}

function findVaultPDA(depositor: PublicKey, escrowId: BN): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [
      Buffer.from("vault"),
      depositor.toBuffer(),
      escrowId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
}

function escrowToDomain(
  raw: any,
  escrowPda: string,
  escrowId: string
): Escrow {
  const amountRaw = bnToNumber(raw.amount);
  const createdAt = bnToNumber(readField(raw, "createdAt", "created_at"));
  const expiresAt = bnToNumber(readField(raw, "expiresAt", "expires_at"));
  const status = mapStatus(raw.status);
  const mint = raw.mint as PublicKey;
  const mintConfig = getMintConfig(mint);
  return {
    id: escrowId,
    escrowPda,
    depositorWallet: raw.depositor.toBase58(),
    receiverWallet: raw.receiver.toBase58(),
    amount: amountRaw,
    displayAmount: amountRaw / 10 ** mintConfig.decimals,
    tokenMint: mint.toBase58(),
    tokenType: mintConfig.tokenType,
    description: `Escrow #${escrowId}`,
    status,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    createdAt: new Date(createdAt * 1000).toISOString(),
    fundedAt: ["funded", "release_pending", "released"].includes(status)
      ? new Date(createdAt * 1000).toISOString()
      : null,
    releasedAt: status === "released" ? new Date().toISOString() : null,
    txSignature: null,
  };
}

// ============================================================
// AnchorEscrowService
// ============================================================
export class AnchorEscrowService implements IEscrowService {

  // --- createEscrow (on-chain: initialize_escrow) ---
  async createEscrow(input: CreateEscrowInput, wallet: WalletContextState): Promise<Escrow> {
    const { escrow } = await this.createEscrowWithWallet(input, wallet);
    return escrow;
  }

  /** Real create flow — needs wallet adapter */
  async createEscrowWithWallet(
    input: CreateEscrowInput,
    wallet: WalletContextState
  ): Promise<{ escrow: Escrow; txSignature: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const provider = getProvider(wallet);
    const program = new Program(IDL, provider);
    const depositor = wallet.publicKey;
    const tokenConfig = getTokenConfig(input.tokenType);
    const mint = tokenConfig.mint;

    // Generate escrow_id client-side (timestamp-based)
    const escrowId = new BN(Date.now());
    const expiresAt = new BN(Math.floor(new Date(input.expiresAt).getTime() / 1000));
    const amount = new BN(Math.round(input.amount * 10 ** tokenConfig.decimals));
    const receiver = new PublicKey(input.receiverWallet);

    // Derive PDAs
    const [configPda] = await findConfigPDA(depositor);
    const [escrowPda] = await findEscrowPDA(depositor, escrowId);
    const [vaultPda] = await findVaultPDA(depositor, escrowId);

    const transaction = new Transaction();
    const configInfo = await provider.connection.getAccountInfo(configPda);

    if (!configInfo) {
      const treasuryOwner = getTreasuryOwner(depositor);
      const initializeConfigIx = await program.methods
        .initializeConfig(DEFAULT_FEE_BPS, treasuryOwner, treasuryOwner)
        .accounts({
          config: configPda,
          authority: depositor,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      transaction.add(initializeConfigIx);
    }

    const initializeEscrowIx = await program.methods
      .initializeEscrow(escrowId, receiver, amount, expiresAt)
      .accounts({
        config: configPda,
        escrow: escrowPda,
        vault: vaultPda,
        mint,
        depositor,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    transaction.add(initializeEscrowIx);

    const txSignature = await provider.sendAndConfirm(transaction);

    const escrow: Escrow = {
      id: escrowId.toString(),
      escrowPda: escrowPda.toBase58(),
      depositorWallet: depositor.toBase58(),
      receiverWallet: input.receiverWallet,
      amount: input.amount,
      displayAmount: input.amount,
      tokenMint: mint.toBase58(),
      tokenType: input.tokenType,
      description: input.description,
      status: "created",
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
      fundedAt: null,
      releasedAt: null,
      txSignature,
    };

    return { escrow, txSignature };
  }

  // --- getEscrow ---
  async getEscrow(id: string): Promise<Escrow | null> {
    try {
      const program = getReadOnlyProgram();
      const accounts = await (program.account as any).escrowAccount.all();
      const match = accounts.find(({ account }: any) => {
        const escrowId = readField<BN | number | string>(account, "escrowId", "escrow_id");
        return String(bnToNumber(escrowId)) === id;
      });

      if (match) {
        return escrowToDomain(
          match.account,
          match.publicKey.toBase58(),
          String(bnToNumber(readField(match.account, "escrowId", "escrow_id")))
        );
      }

      return null;
    } catch {
      return null;
    }
  }

  /** Fetch escrow by PDA directly */
  async getEscrowByPda(escrowPda: string): Promise<Escrow | null> {
    try {
      const program = getReadOnlyProgram();

      const pda = new PublicKey(escrowPda);
      const raw = await (program.account as any).escrowAccount.fetch(pda);

      return escrowToDomain(
        raw,
        escrowPda,
        String(bnToNumber(readField(raw, "escrowId", "escrow_id")))
      );
    } catch {
      return null;
    }
  }

  // --- listEscrows ---
  async listEscrows(walletAddress: string, filters?: EscrowFilters): Promise<Escrow[]> {
    try {
      const program = getReadOnlyProgram();

      // Fetch all escrow accounts where depositor OR receiver matches
      const [depositorEscrows, receiverEscrows] = await Promise.all([
        (program.account as any).escrowAccount.all([
          { memcmp: { offset: 8 + 8, bytes: walletAddress } }, // depositor field offset
        ]),
        (program.account as any).escrowAccount.all([
          { memcmp: { offset: 8 + 8 + 32, bytes: walletAddress } }, // receiver field offset
        ]),
      ]);

      // Deduplicate
      const seen = new Set<string>();
      const allEscrows: Escrow[] = [];

      for (const { publicKey, account } of [...depositorEscrows, ...receiverEscrows]) {
        const pdaStr = publicKey.toBase58();
        if (seen.has(pdaStr)) continue;
        seen.add(pdaStr);
        allEscrows.push(
          escrowToDomain(
            account,
            pdaStr,
            String(bnToNumber(readField(account, "escrowId", "escrow_id")))
          )
        );
      }

      return allEscrows.filter((escrow) => {
        if (filters?.role === "depositor" && escrow.depositorWallet !== walletAddress) return false;
        if (filters?.role === "receiver" && escrow.receiverWallet !== walletAddress) return false;
        if (filters?.status && escrow.status !== filters.status) return false;
        return true;
      });
    } catch (err) {
      console.error("[AnchorEscrowService] listEscrows error:", err);
      return [];
    }
  }

  // --- fundEscrow (on-chain: deposit) ---
  async fundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const provider = getProvider(wallet);
    const program = new Program(IDL, provider);
    const depositor = wallet.publicKey;
    const escrowId = new BN(id);

    const [escrowPda] = await findEscrowPDA(depositor, escrowId);
    const [vaultPda] = await findVaultPDA(depositor, escrowId);
    const escrowAccount = await (program.account as any).escrowAccount.fetch(escrowPda);
    const mint = escrowAccount.mint as PublicKey;
    const mintConfig = getMintConfig(mint);
    const depositorToken = await getAssociatedTokenAddress(mint, depositor);
    const requiredAmount = bnToNumber(escrowAccount.amount);

    const transaction = new Transaction();
    const depositorTokenInfo = await provider.connection.getAccountInfo(depositorToken);

    if (mint.equals(NATIVE_MINT)) {
      if (!depositorTokenInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            depositor,
            depositorToken,
            depositor,
            mint
          )
        );
      }

      const availableAmount = depositorTokenInfo
        ? Number((await provider.connection.getTokenAccountBalance(depositorToken)).value.amount)
        : 0;
      const wrapAmount = requiredAmount - availableAmount;

      if (wrapAmount > 0) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: depositor,
            toPubkey: depositorToken,
            lamports: wrapAmount,
          }),
          createSyncNativeInstruction(depositorToken)
        );
      }
    } else if (!depositorTokenInfo) {
      throw new Error(
        `${mintConfig.label} token account is missing. Create and fund ${depositorToken.toBase58()} with at least ${formatTokenAmount(requiredAmount, mintConfig.decimals)} ${mintConfig.label}, then try again.`
      );
    } else {
      const balance = await provider.connection.getTokenAccountBalance(depositorToken);
      const availableAmount = Number(balance.value.amount);
      if (availableAmount < requiredAmount) {
        throw new Error(
          `Insufficient ${mintConfig.label} balance. Required ${formatTokenAmount(requiredAmount, mintConfig.decimals)} ${mintConfig.label}, available ${formatTokenAmount(availableAmount, mintConfig.decimals)} ${mintConfig.label}.`
        );
      }
    }

    const depositIx = await program.methods
      .deposit()
      .accounts({
        escrow: escrowPda,
        vault: vaultPda,
        depositorToken,
        depositor,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    transaction.add(depositIx);

    try {
      const txSignature = await provider.sendAndConfirm(transaction);
      return { txSignature };
    } catch (error) {
      if (mint.equals(NATIVE_MINT) && error instanceof Error) {
        throw new Error(
          `${error.message} Make sure your wallet has enough SOL for the escrow amount plus rent and transaction fees.`
        );
      }

      throw new Error(
        error instanceof Error ? error.message : "Fund failed"
      );
    }
  }

  // --- initiateRelease (on-chain: start_release_session) ---
  async initiateRelease(_escrowId: string, _initiatorWallet: string): Promise<ReleaseSession> {
    void _escrowId;
    void _initiatorWallet;
    // This requires wallet — use initiateReleaseWithWallet instead
    throw new Error("Use initiateReleaseWithWallet for on-chain release");
  }

  async initiateReleaseWithWallet(
    escrowId: string,
    wallet: WalletContextState
  ): Promise<{ txSignature: string; sessionHash: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const program = getProgram(wallet);
    const caller = wallet.publicKey;
    const id = new BN(escrowId);

    const [escrowPda] = await findEscrowPDA(caller, id);

    // Generate session hash (SHA-256 of escrowId || nonce || depositor || receiver)
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const escrowData = await (program.account as any).escrowAccount.fetch(escrowPda);
    const hashInput = new Uint8Array([
      ...id.toArrayLike(Buffer, "le", 8),
      ...nonce,
      ...escrowData.depositor.toBuffer(),
      ...escrowData.receiver.toBuffer(),
    ]);
    const sessionHash = await crypto.subtle.digest("SHA-256", hashInput);
    const sessionHashArray = new Uint8Array(sessionHash);

    const sessionExpiresAt = new BN(Math.floor(Date.now() / 1000) + 10 * 60); // 10 min

    const txSignature = await program.methods
      .startReleaseSession(Array.from(sessionHashArray), sessionExpiresAt)
      .accounts({
        escrow: escrowPda,
        caller,
      })
      .rpc();

    return {
      txSignature,
      sessionHash: Buffer.from(sessionHashArray).toString("hex"),
    };
  }

  // --- confirmRelease ---
  async confirmRelease(
    sessionId: string,
    wallet: WalletContextState,
    _role: "depositor" | "receiver"
  ): Promise<void> {
    void _role;
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    if (!sessionId) throw new Error("Session is required");

    // We need to find the escrow — for now assume escrowId is derivable
    // In production, sessionId should map to escrowId
    throw new Error("confirmRelease requires escrow context. Use confirmReleaseWithEscrowId");
  }

  async confirmReleaseWithEscrowId(
    escrowId: string,
    sessionHashHex: string,
    wallet: WalletContextState,
    role: "depositor" | "receiver"
  ): Promise<{ txSignature: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const program = getProgram(wallet);
    const caller = wallet.publicKey;
    const id = new BN(escrowId);

    // For confirm, we need the escrow PDA. But the PDA uses depositor, not caller.
    // If caller is receiver, we need the depositor's key from the escrow
    // Fetch the escrow first to get depositor
    const [escrowPda] = await findEscrowPDA(caller, id);
    let escrowAccount;
    try {
      escrowAccount = await (program.account as any).escrowAccount.fetch(escrowPda);
    } catch {
      // If caller is receiver, the PDA derivation with caller fails
      // We need to use the depositor's key
      throw new Error("Could not find escrow. Ensure you are the depositor or receiver.");
    }

    const depositorKey = escrowAccount.depositor;
    const [realEscrowPda] = await findEscrowPDA(depositorKey, id);
    const sessionHash = Uint8Array.from(Buffer.from(sessionHashHex, "hex"));

    if (role === "depositor") {
      const txSignature = await program.methods
        .confirmReleaseAsDepositor(Array.from(sessionHash))
        .accounts({
          escrow: realEscrowPda,
          depositor: caller,
        })
        .rpc();
      return { txSignature };
    } else {
      const txSignature = await program.methods
        .confirmReleaseAsReceiver(Array.from(sessionHash))
        .accounts({
          escrow: realEscrowPda,
          receiver: caller,
        })
        .rpc();
      return { txSignature };
    }
  }

  // --- executeRelease (on-chain: finalize_release) ---
  async executeRelease(_sessionId: string): Promise<{ txSignature: string }> {
    void _sessionId;
    throw new Error("Use executeReleaseWithEscrowId for on-chain finalize");
  }

  async executeReleaseWithEscrowId(
    escrowId: string,
    depositorWallet: string,
    wallet: WalletContextState
  ): Promise<{ txSignature: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const provider = getProvider(wallet);
    const program = new Program(IDL, provider);
    const caller = wallet.publicKey;
    const id = new BN(escrowId);
    const depositor = new PublicKey(depositorWallet);

    const [configPda] = await findConfigPDA(depositor);
    const [escrowPda] = await findEscrowPDA(depositor, id);
    const [vaultPda] = await findVaultPDA(depositor, id);

    const escrowAccount = await (program.account as any).escrowAccount.fetch(escrowPda);
    const receiver = escrowAccount.receiver;
    const mint = escrowAccount.mint as PublicKey;

    const configAccount = await (program.account as any).config.fetch(configPda);
    const transaction = new Transaction();

    const receiverToken = await addCreateAtaIfMissing(
      transaction,
      provider,
      caller,
      mint,
      receiver
    );
    const treasuryToken = await addCreateAtaIfMissing(
      transaction,
      provider,
      caller,
      mint,
      configAccount.treasury
    );

    const finalizeIx = await program.methods
      .finalizeRelease()
      .accounts({
        config: configPda,
        escrow: escrowPda,
        vault: vaultPda,
        receiverToken,
        treasuryToken,
        caller,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    transaction.add(finalizeIx);

    const txSignature = await provider.sendAndConfirm(transaction);

    return { txSignature };
  }

  // --- refundEscrow (on-chain: refund_after_expiry) ---
  async refundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const provider = getProvider(wallet);
    const program = new Program(IDL, provider);
    const depositor = wallet.publicKey;
    const escrowId = new BN(id);

    const [escrowPda] = await findEscrowPDA(depositor, escrowId);
    const [vaultPda] = await findVaultPDA(depositor, escrowId);
    const escrowAccount = await (program.account as any).escrowAccount.fetch(escrowPda);
    const mint = escrowAccount.mint as PublicKey;
    const transaction = new Transaction();
    const depositorToken = await addCreateAtaIfMissing(
      transaction,
      provider,
      depositor,
      mint,
      depositor
    );

    const refundIx = await program.methods
      .refundAfterExpiry()
      .accounts({
        escrow: escrowPda,
        vault: vaultPda,
        depositorToken,
        depositor,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    transaction.add(refundIx);

    const txSignature = await provider.sendAndConfirm(transaction);

    return { txSignature };
  }

  // --- cancelBeforeFunding ---
  async cancelEscrow(
    id: string,
    wallet: WalletContextState
  ): Promise<{ txSignature: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const program = getProgram(wallet);
    const depositor = wallet.publicKey;
    const escrowId = new BN(id);

    const [escrowPda] = await findEscrowPDA(depositor, escrowId);
    const [vaultPda] = await findVaultPDA(depositor, escrowId);

    const txSignature = await program.methods
      .cancelBeforeFunding()
      .accounts({
        escrow: escrowPda,
        vault: vaultPda,
        depositor,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return { txSignature };
  }
}