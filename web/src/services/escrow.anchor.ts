// Anchor implementation — wired to on-chain Vigent Escrow contract
import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
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

function mapStatus(onChain: number): Escrow["status"] {
  return STATUS_MAP[onChain as OnChainStatus] ?? "created";
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
  const amountRaw = raw.amount.toNumber();
  const decimals = 6; // USDC
  return {
    id: escrowId,
    escrowPda,
    depositorWallet: raw.depositor.toBase58(),
    receiverWallet: raw.receiver.toBase58(),
    amount: amountRaw,
    displayAmount: amountRaw / 10 ** decimals,
    tokenMint: raw.mint.toBase58(),
    tokenType: "USDC" as const,
    description: `Escrow #${escrowId}`,
    status: mapStatus(raw.status as number),
    expiresAt: new Date(raw.expires_at.toNumber() * 1000).toISOString(),
    createdAt: new Date(raw.created_at.toNumber() * 1000).toISOString(),
    fundedAt: raw.status >= 1 ? new Date(raw.created_at.toNumber() * 1000).toISOString() : null,
    releasedAt: raw.status >= 3 ? new Date().toISOString() : null,
    txSignature: null,
  };
}

// ============================================================
// AnchorEscrowService
// ============================================================
export class AnchorEscrowService implements IEscrowService {

  // --- createEscrow (on-chain: initialize_escrow) ---
  async createEscrow(input: CreateEscrowInput, depositorWallet: string): Promise<Escrow> {
    const connection = getConnection();

    // Use wallet adapter via a temporary provider trick
    // The actual wallet will be injected when calling fundEscrow
    // For create, we need the depositor's wallet adapter
    throw new Error(
      "createEscrow must be called via the wallet-connected flow. Use createEscrowWithWallet instead."
    );
  }

  /** Real create flow — needs wallet adapter */
  async createEscrowWithWallet(
    input: CreateEscrowInput,
    wallet: WalletContextState
  ): Promise<{ escrow: Escrow; txSignature: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const program = getProgram(wallet);
    const depositor = wallet.publicKey;
    const mint = new PublicKey(USDC_MINT);

    // Generate escrow_id client-side (timestamp-based)
    const escrowId = new BN(Date.now());
    const expiresAt = new BN(Math.floor(new Date(input.expiresAt).getTime() / 1000));
    const amount = new BN(Math.round(input.amount * 10 ** 6)); // USDC has 6 decimals
    const receiver = new PublicKey(input.receiverWallet);

    // Derive PDAs
    const [configPda] = await findConfigPDA(depositor);
    const [escrowPda] = await findEscrowPDA(depositor, escrowId);
    const [vaultPda] = await findVaultPDA(depositor, escrowId);

    const txSignature = await program.methods
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
      .rpc();

    const escrow: Escrow = {
      id: escrowId.toString(),
      escrowPda: escrowPda.toBase58(),
      depositorWallet: depositor.toBase58(),
      receiverWallet: input.receiverWallet,
      amount: input.amount,
      displayAmount: input.amount,
      tokenMint: USDC_MINT,
      tokenType: "USDC",
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
      const connection = getConnection();
      // We need a dummy provider just for deserialization
      const dummyWallet = {
        publicKey: PublicKey.unique(),
        signTransaction: async (tx: Transaction) => tx,
        signAllTransactions: async (txs: Transaction[]) => txs,
      };
      const provider = new AnchorProvider(
        connection,
        dummyWallet as any,
        { commitment: "confirmed" }
      );
      const program = new Program(IDL, provider);

      // Fetch the escrow account — we need the PDA which requires depositor + escrowId
      // Since we only have the id, we can try to fetch by the escrowPda if stored
      // For now, this is a limitation — we need the depositor to derive the PDA
      // In production, escrowPda should be stored in a DB or passed
      return null;
    } catch {
      return null;
    }
  }

  /** Fetch escrow by PDA directly */
  async getEscrowByPda(escrowPda: string): Promise<Escrow | null> {
    try {
      const connection = getConnection();
      const dummyWallet = {
        publicKey: PublicKey.unique(),
        signTransaction: async (tx: Transaction) => tx,
        signAllTransactions: async (txs: Transaction[]) => txs,
      };
      const provider = new AnchorProvider(
        connection,
        dummyWallet as any,
        { commitment: "confirmed" }
      );
      const program = new Program(IDL, provider);

      const pda = new PublicKey(escrowPda);
      const raw = await (program.account as any).escrowAccount.fetch(pda);

      return escrowToDomain(raw, escrowPda, raw.escrowId.toString());
    } catch {
      return null;
    }
  }

  // --- listEscrows ---
  async listEscrows(walletAddress: string, _filters?: EscrowFilters): Promise<Escrow[]> {
    try {
      const connection = getConnection();
      const dummyWallet = {
        publicKey: PublicKey.unique(),
        signTransaction: async (tx: Transaction) => tx,
        signAllTransactions: async (txs: Transaction[]) => txs,
      };
      const provider = new AnchorProvider(
        connection,
        dummyWallet as any,
        { commitment: "confirmed" }
      );
      const program = new Program(IDL, provider);

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
        allEscrows.push(escrowToDomain(account, pdaStr, account.escrowId.toString()));
      }

      return allEscrows;
    } catch (err) {
      console.error("[AnchorEscrowService] listEscrows error:", err);
      return [];
    }
  }

  // --- fundEscrow (on-chain: deposit) ---
  async fundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const program = getProgram(wallet);
    const depositor = wallet.publicKey;
    const escrowId = new BN(id);
    const mint = new PublicKey(USDC_MINT);

    const [escrowPda] = await findEscrowPDA(depositor, escrowId);
    const [vaultPda] = await findVaultPDA(depositor, escrowId);
    const depositorToken = await getAssociatedTokenAddress(mint, depositor);

    const txSignature = await program.methods
      .deposit()
      .accounts({
        escrow: escrowPda,
        vault: vaultPda,
        depositorToken,
        depositor,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return { txSignature };
  }

  // --- initiateRelease (on-chain: start_release_session) ---
  async initiateRelease(escrowId: string, initiatorWallet: string): Promise<ReleaseSession> {
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
    role: "depositor" | "receiver"
  ): Promise<void> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const program = getProgram(wallet);
    const caller = wallet.publicKey;

    // Parse the sessionHash from hex string
    const sessionHash = Uint8Array.from(Buffer.from(sessionId, "hex"));

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
    const connection = getConnection();
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
  async executeRelease(sessionId: string): Promise<{ txSignature: string }> {
    throw new Error("Use executeReleaseWithEscrowId for on-chain finalize");
  }

  async executeReleaseWithEscrowId(
    escrowId: string,
    depositorWallet: string,
    wallet: WalletContextState
  ): Promise<{ txSignature: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const program = getProgram(wallet);
    const caller = wallet.publicKey;
    const id = new BN(escrowId);
    const depositor = new PublicKey(depositorWallet);
    const mint = new PublicKey(USDC_MINT);

    const [configPda] = await findConfigPDA(depositor);
    const [escrowPda] = await findEscrowPDA(depositor, id);
    const [vaultPda] = await findVaultPDA(depositor, id);

    // Fetch escrow to get receiver
    const escrowAccount = await (program.account as any).escrowAccount.fetch(escrowPda);
    const receiver = escrowAccount.receiver;

    const receiverToken = await getAssociatedTokenAddress(mint, receiver);

    // Get treasury token — treasury is the config.treasury, need its ATA
    const configAccount = await (program.account as any).config.fetch(configPda);
    const treasuryToken = await getAssociatedTokenAddress(mint, configAccount.treasury);

    const txSignature = await program.methods
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
      .rpc();

    return { txSignature };
  }

  // --- refundEscrow (on-chain: refund_after_expiry) ---
  async refundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const program = getProgram(wallet);
    const depositor = wallet.publicKey;
    const escrowId = new BN(id);
    const mint = new PublicKey(USDC_MINT);

    const [escrowPda] = await findEscrowPDA(depositor, escrowId);
    const [vaultPda] = await findVaultPDA(depositor, escrowId);
    const depositorToken = await getAssociatedTokenAddress(mint, depositor);

    const txSignature = await program.methods
      .refundAfterExpiry()
      .accounts({
        escrow: escrowPda,
        vault: vaultPda,
        depositorToken,
        depositor,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

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