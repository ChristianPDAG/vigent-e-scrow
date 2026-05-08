import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Workspace } from "../target/types/workspace";
import { expect } from "chai";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { createHash } from "crypto";

describe("workspace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.workspace as Program<Workspace>;

  const depositor = Keypair.generate();
  const receiver = Keypair.generate();
  const treasury = Keypair.generate();
  const arbiter = Keypair.generate();
  const thirdParty = Keypair.generate();
  const usdcMint = Keypair.generate();

  let configPDA: PublicKey;
  let depositorTokenATA: PublicKey;
  let receiverTokenATA: PublicKey;
  let treasuryTokenATA: PublicKey;

  const feeBps = 250;
  const escrowAmount = new BN(10_000_000);

  // ==================== HELPERS ====================

  async function createMint(mintKp: Keypair, payer: Keypair, decimals = 6) {
    const lamports = await getMinimumBalanceForRentExemptMint(provider.connection);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKp.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(mintKp.publicKey, decimals, payer.publicKey, null)
    );
    await provider.sendAndConfirm(tx, [payer, mintKp]);
  }

  async function createATA(mint: PublicKey, owner: PublicKey, payer: Keypair): Promise<PublicKey> {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint)
    );
    await provider.sendAndConfirm(tx, [payer]);
    return ata;
  }

  async function mintTokens(mint: PublicKey, dest: PublicKey, authority: Keypair, amount: number) {
    const tx = new Transaction().add(
      createMintToInstruction(mint, dest, authority.publicKey, amount)
    );
    await provider.sendAndConfirm(tx, [authority]);
  }

  function deriveEscrowPDAs(depositorPk: PublicKey, escrowId: BN) {
    const idBuf = escrowId.toArrayLike(Buffer, "le", 8);
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), depositorPk.toBuffer(), idBuf],
      program.programId
    );
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), depositorPk.toBuffer(), idBuf],
      program.programId
    );
    return { escrowPDA, vaultPDA };
  }

  function generateSessionHash(
    escrowId: BN, nonce: string, depositorPk: PublicKey, receiverPk: PublicKey
  ): number[] {
    const hash = createHash("sha256")
      .update(Buffer.concat([
        escrowId.toArrayLike(Buffer, "le", 8),
        Buffer.from(nonce),
        depositorPk.toBuffer(),
        receiverPk.toBuffer(),
      ]))
      .digest();
    return Array.from(hash);
  }

  async function createFundedEscrow(eid: BN, expiresInSec = 86400) {
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + expiresInSec);
    const { escrowPDA, vaultPDA } = deriveEscrowPDAs(depositor.publicKey, eid);

    await program.methods
      .initializeEscrow(eid, receiver.publicKey, escrowAmount, expiresAt)
      .accounts({
        config: configPDA, escrow: escrowPDA, vault: vaultPDA,
        mint: usdcMint.publicKey, depositor: depositor.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      })
      .signers([depositor])
      .rpc();

    await program.methods
      .deposit()
      .accounts({
        escrow: escrowPDA, vault: vaultPDA, depositorToken: depositorTokenATA,
        depositor: depositor.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();

    return { escrowPDA, vaultPDA };
  }

  // ==================== SETUP ====================

  before(async () => {
    for (const kp of [depositor, receiver, treasury, arbiter, thirdParty]) {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(kp.publicKey, 100 * LAMPORTS_PER_SOL)
      );
    }

    await createMint(usdcMint, depositor);

    [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), depositor.publicKey.toBuffer()],
      program.programId
    );

    depositorTokenATA = await createATA(usdcMint.publicKey, depositor.publicKey, depositor);
    receiverTokenATA = await createATA(usdcMint.publicKey, receiver.publicKey, receiver);
    treasuryTokenATA = await createATA(usdcMint.publicKey, treasury.publicKey, treasury);

    await mintTokens(usdcMint.publicKey, depositorTokenATA, depositor, 500_000_000);
  });

  // ============================================================
  // CORE FLOW TESTS (INITIAL — MUST PASS)
  // ============================================================

  it("Initialize Config with arbiter", async () => {
    await program.methods
      .initializeConfig(feeBps, treasury.publicKey, arbiter.publicKey)
      .accounts({
        config: configPDA,
        authority: depositor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([depositor])
      .rpc();

    const config = await program.account.config.fetch(configPDA);
    expect(config.isActive).to.be.true;
    expect(config.isPaused).to.be.false;
    expect(Number(config.feeBps)).to.equal(feeBps);
    expect(config.treasury.toBase58()).to.equal(treasury.publicKey.toBase58());
    expect(config.arbiter.toBase58()).to.equal(arbiter.publicKey.toBase58());
    expect(Number(config.escrowCount.toString())).to.equal(0);
  });

  it("Initialize Escrow", async () => {
    const escrowId = new BN(1);
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 86400);
    const { escrowPDA, vaultPDA } = deriveEscrowPDAs(depositor.publicKey, escrowId);

    await program.methods
      .initializeEscrow(escrowId, receiver.publicKey, escrowAmount, expiresAt)
      .accounts({
        config: configPDA, escrow: escrowPDA, vault: vaultPDA,
        mint: usdcMint.publicKey, depositor: depositor.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      })
      .signers([depositor])
      .rpc();

    const escrow = await program.account.escrowAccount.fetch(escrowPDA);
    expect(escrow.depositor.toBase58()).to.equal(depositor.publicKey.toBase58());
    expect(escrow.receiver.toBase58()).to.equal(receiver.publicKey.toBase58());
    expect(Number(escrow.amount.toString())).to.equal(Number(escrowAmount.toString()));
    expect(JSON.stringify(escrow.status)).to.include("created");
    expect(Number(escrow.disputeReason)).to.equal(0);
  });

  it("Deposit funds into vault", async () => {
    const escrowId = new BN(1);
    const { escrowPDA, vaultPDA } = deriveEscrowPDAs(depositor.publicKey, escrowId);

    await program.methods
      .deposit()
      .accounts({
        escrow: escrowPDA, vault: vaultPDA, depositorToken: depositorTokenATA,
        depositor: depositor.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();

    const escrow = await program.account.escrowAccount.fetch(escrowPDA);
    expect(JSON.stringify(escrow.status)).to.include("funded");

    const vaultBal = await getAccount(provider.connection, vaultPDA);
    expect(Number(vaultBal.amount)).to.equal(Number(escrowAmount.toString()));
  });

  it("Start release session + confirm both + finalize", async () => {
    const escrowId = new BN(1);
    const { escrowPDA, vaultPDA } = deriveEscrowPDAs(depositor.publicKey, escrowId);
    const sessionExpiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);
    const sessionHash = generateSessionHash(
      escrowId, "nonce_main", depositor.publicKey, receiver.publicKey
    );

    await program.methods
      .startReleaseSession(sessionHash, sessionExpiresAt)
      .accounts({ escrow: escrowPDA, caller: depositor.publicKey })
      .signers([depositor])
      .rpc();

    await program.methods
      .confirmReleaseAsDepositor(sessionHash)
      .accounts({ escrow: escrowPDA, depositor: depositor.publicKey })
      .signers([depositor])
      .rpc();

    await program.methods
      .confirmReleaseAsReceiver(sessionHash)
      .accounts({ escrow: escrowPDA, receiver: receiver.publicKey })
      .signers([receiver])
      .rpc();

    const receiverBefore = await getAccount(provider.connection, receiverTokenATA);

    await program.methods
      .finalizeRelease()
      .accounts({
        config: configPDA, escrow: escrowPDA, vault: vaultPDA,
        receiverToken: receiverTokenATA, treasuryToken: treasuryTokenATA,
        caller: thirdParty.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([thirdParty])
      .rpc();

    const escrow = await program.account.escrowAccount.fetch(escrowPDA);
    expect(JSON.stringify(escrow.status)).to.include("released");

    const fee = Math.floor((Number(escrowAmount.toString()) * feeBps) / 10000);
    const net = Number(escrowAmount.toString()) - fee;
    const receiverAfter = await getAccount(provider.connection, receiverTokenATA);
    expect(Number(receiverAfter.amount) - Number(receiverBefore.amount)).to.equal(net);

    const treasuryBal = await getAccount(provider.connection, treasuryTokenATA);
    expect(Number(treasuryBal.amount)).to.equal(fee);
  });

  it("Cancel before funding", async () => {
    const escrowId = new BN(2);
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 86400);
    const { escrowPDA, vaultPDA } = deriveEscrowPDAs(depositor.publicKey, escrowId);

    await program.methods
      .initializeEscrow(escrowId, receiver.publicKey, escrowAmount, expiresAt)
      .accounts({
        config: configPDA, escrow: escrowPDA, vault: vaultPDA,
        mint: usdcMint.publicKey, depositor: depositor.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      })
      .signers([depositor])
      .rpc();

    await program.methods
      .cancelBeforeFunding()
      .accounts({ escrow: escrowPDA, depositor: depositor.publicKey })
      .signers([depositor])
      .rpc();

    const escrow = await program.account.escrowAccount.fetch(escrowPDA);
    expect(JSON.stringify(escrow.status)).to.include("cancelled");
  });

  it("Refund after expiry", async () => {
    const escrowId = new BN(3);
    const { escrowPDA, vaultPDA } = await createFundedEscrow(escrowId, 2);

    const beforeBal = await getAccount(provider.connection, depositorTokenATA);
    await new Promise((r) => setTimeout(r, 3000));

    await program.methods
      .refundAfterExpiry()
      .accounts({
        escrow: escrowPDA, vault: vaultPDA, depositorToken: depositorTokenATA,
        depositor: depositor.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();

    const escrow = await program.account.escrowAccount.fetch(escrowPDA);
    expect(JSON.stringify(escrow.status)).to.include("expired");

    const afterBal = await getAccount(provider.connection, depositorTokenATA);
    expect(Number(afterBal.amount) - Number(beforeBal.amount)).to.equal(
      Number(escrowAmount.toString())
    );
  });

  // ============================================================
  // DISPUTE FLOW TESTS
  // ============================================================

  it("Depositor opens dispute on funded escrow", async () => {
    const escrowId = new BN(20);
    const { escrowPDA } = await createFundedEscrow(escrowId);

    await program.methods
      .openDispute(1)
      .accounts({ escrow: escrowPDA, caller: depositor.publicKey })
      .signers([depositor])
      .rpc();

    const escrow = await program.account.escrowAccount.fetch(escrowPDA);
    expect(JSON.stringify(escrow.status)).to.include("disputed");
    expect(Number(escrow.disputeReason)).to.equal(1);
  });

  it("Receiver opens dispute on funded escrow", async () => {
    const escrowId = new BN(21);
    const { escrowPDA } = await createFundedEscrow(escrowId);

    await program.methods
      .openDispute(2)
      .accounts({ escrow: escrowPDA, caller: receiver.publicKey })
      .signers([receiver])
      .rpc();

    const escrow = await program.account.escrowAccount.fetch(escrowPDA);
    expect(JSON.stringify(escrow.status)).to.include("disputed");
    expect(Number(escrow.disputeReason)).to.equal(2);
  });

  it("Third party cannot open dispute", async () => {
    const escrowId = new BN(22);
    const { escrowPDA } = await createFundedEscrow(escrowId);

    try {
      await program.methods
        .openDispute(1)
        .accounts({ escrow: escrowPDA, caller: thirdParty.publicKey })
        .signers([thirdParty])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error.message).to.include("Unauthorized");
    }
  });

  it("Cannot dispute a released escrow", async () => {
    const escrowId = new BN(1);
    const { escrowPDA } = deriveEscrowPDAs(depositor.publicKey, escrowId);

    try {
      await program.methods
        .openDispute(1)
        .accounts({ escrow: escrowPDA, caller: depositor.publicKey })
        .signers([depositor])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error.message).to.include("InvalidStatus");
    }
  });

  it("Arbiter resolves dispute in favor of receiver", async () => {
    const escrowId = new BN(30);
    const { escrowPDA, vaultPDA } = await createFundedEscrow(escrowId);

    await program.methods
      .openDispute(1)
      .accounts({ escrow: escrowPDA, caller: depositor.publicKey })
      .signers([depositor])
      .rpc();

    const receiverBefore = await getAccount(provider.connection, receiverTokenATA);
    const treasuryBefore = await getAccount(provider.connection, treasuryTokenATA);

    await program.methods
      .resolveDispute(true)
      .accounts({
        config: configPDA, escrow: escrowPDA, vault: vaultPDA,
        receiverToken: receiverTokenATA, depositorToken: depositorTokenATA,
        treasuryToken: treasuryTokenATA, arbiter: arbiter.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([arbiter])
      .rpc();

    const escrow = await program.account.escrowAccount.fetch(escrowPDA);
    expect(JSON.stringify(escrow.status)).to.include("released");

    const fee = Math.floor((Number(escrowAmount.toString()) * feeBps) / 10000);
    const net = Number(escrowAmount.toString()) - fee;

    const receiverAfter = await getAccount(provider.connection, receiverTokenATA);
    expect(Number(receiverAfter.amount) - Number(receiverBefore.amount)).to.equal(net);

    const treasuryAfter = await getAccount(provider.connection, treasuryTokenATA);
    expect(Number(treasuryAfter.amount) - Number(treasuryBefore.amount)).to.equal(fee);

    const vaultBal = await getAccount(provider.connection, vaultPDA);
    expect(Number(vaultBal.amount)).to.equal(0);
  });

  it("Arbiter resolves dispute in favor of depositor (refund)", async () => {
    const escrowId = new BN(31);
    const { escrowPDA, vaultPDA } = await createFundedEscrow(escrowId);

    await program.methods
      .openDispute(3)
      .accounts({ escrow: escrowPDA, caller: receiver.publicKey })
      .signers([receiver])
      .rpc();

    const depositorBefore = await getAccount(provider.connection, depositorTokenATA);

    await program.methods
      .resolveDispute(false)
      .accounts({
        config: configPDA, escrow: escrowPDA, vault: vaultPDA,
        receiverToken: receiverTokenATA, depositorToken: depositorTokenATA,
        treasuryToken: treasuryTokenATA, arbiter: arbiter.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([arbiter])
      .rpc();

    const escrow = await program.account.escrowAccount.fetch(escrowPDA);
    expect(JSON.stringify(escrow.status)).to.include("cancelled");

    const depositorAfter = await getAccount(provider.connection, depositorTokenATA);
    expect(Number(depositorAfter.amount) - Number(depositorBefore.amount)).to.equal(
      Number(escrowAmount.toString())
    );

    const vaultBal = await getAccount(provider.connection, vaultPDA);
    expect(Number(vaultBal.amount)).to.equal(0);
  });

  it("Non-arbiter cannot resolve dispute", async () => {
    const escrowId = new BN(32);
    const { escrowPDA, vaultPDA } = await createFundedEscrow(escrowId);

    await program.methods
      .openDispute(1)
      .accounts({ escrow: escrowPDA, caller: depositor.publicKey })
      .signers([depositor])
      .rpc();

    try {
      await program.methods
        .resolveDispute(true)
        .accounts({
          config: configPDA, escrow: escrowPDA, vault: vaultPDA,
          receiverToken: receiverTokenATA, depositorToken: depositorTokenATA,
          treasuryToken: treasuryTokenATA, arbiter: thirdParty.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([thirdParty])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error.message).to.include("Unauthorized");
    }
  });

  it("Cannot resolve non-disputed escrow", async () => {
    const escrowId = new BN(33);
    const { escrowPDA, vaultPDA } = await createFundedEscrow(escrowId);

    try {
      await program.methods
        .resolveDispute(true)
        .accounts({
          config: configPDA, escrow: escrowPDA, vault: vaultPDA,
          receiverToken: receiverTokenATA, depositorToken: depositorTokenATA,
          treasuryToken: treasuryTokenATA, arbiter: arbiter.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([arbiter])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error.message).to.include("InvalidStatus");
    }
  });

  it("Cannot open dispute with reason 0", async () => {
    const escrowId = new BN(34);
    const { escrowPDA } = await createFundedEscrow(escrowId);

    try {
      await program.methods
        .openDispute(0)
        .accounts({ escrow: escrowPDA, caller: depositor.publicKey })
        .signers([depositor])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error.message).to.include("InvalidParameter");
    }
  });

  // ============================================================
  // SECURITY EDGE CASE TESTS
  // ============================================================

  it("Wrong session hash rejected", async () => {
    const escrowId = new BN(40);
    const { escrowPDA } = await createFundedEscrow(escrowId);
    const sessionExpiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);
    const sessionHash = generateSessionHash(
      escrowId, "real_nonce", depositor.publicKey, receiver.publicKey
    );
    const wrongHash = generateSessionHash(
      escrowId, "wrong_nonce", depositor.publicKey, receiver.publicKey
    );

    await program.methods
      .startReleaseSession(sessionHash, sessionExpiresAt)
      .accounts({ escrow: escrowPDA, caller: depositor.publicKey })
      .signers([depositor])
      .rpc();

    try {
      await program.methods
        .confirmReleaseAsDepositor(wrongHash)
        .accounts({ escrow: escrowPDA, depositor: depositor.publicKey })
        .signers([depositor])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error.message).to.include("InvalidSessionHash");
    }
  });

  it("Cannot finalize without both confirmations", async () => {
    const escrowId = new BN(41);
    const { escrowPDA, vaultPDA } = await createFundedEscrow(escrowId);
    const sessionExpiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);
    const sessionHash = generateSessionHash(
      escrowId, "nonce_41", depositor.publicKey, receiver.publicKey
    );

    await program.methods
      .startReleaseSession(sessionHash, sessionExpiresAt)
      .accounts({ escrow: escrowPDA, caller: depositor.publicKey })
      .signers([depositor])
      .rpc();

    await program.methods
      .confirmReleaseAsDepositor(sessionHash)
      .accounts({ escrow: escrowPDA, depositor: depositor.publicKey })
      .signers([depositor])
      .rpc();

    try {
      await program.methods
        .finalizeRelease()
        .accounts({
          config: configPDA, escrow: escrowPDA, vault: vaultPDA,
          receiverToken: receiverTokenATA, treasuryToken: treasuryTokenATA,
          caller: thirdParty.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([thirdParty])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error.message).to.include("NotFullyConfirmed");
    }
  });

  it("Non-depositor cannot cancel before funding", async () => {
    const escrowId = new BN(42);
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 86400);
    const { escrowPDA, vaultPDA } = deriveEscrowPDAs(depositor.publicKey, escrowId);

    await program.methods
      .initializeEscrow(escrowId, receiver.publicKey, escrowAmount, expiresAt)
      .accounts({
        config: configPDA, escrow: escrowPDA, vault: vaultPDA,
        mint: usdcMint.publicKey, depositor: depositor.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      })
      .signers([depositor])
      .rpc();

    try {
      await program.methods
        .cancelBeforeFunding()
        .accounts({ escrow: escrowPDA, depositor: thirdParty.publicKey })
        .signers([thirdParty])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error.message).to.not.be.empty;
    }
  });

  it("Cannot refund before expiry", async () => {
    const escrowId = new BN(43);
    const { escrowPDA, vaultPDA } = await createFundedEscrow(escrowId);

    try {
      await program.methods
        .refundAfterExpiry()
        .accounts({
          escrow: escrowPDA, vault: vaultPDA, depositorToken: depositorTokenATA,
          depositor: depositor.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([depositor])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error.message).to.include("NotExpired");
    }
  });

  it("Cannot cancel after funding", async () => {
    const escrowId = new BN(44);
    const { escrowPDA } = await createFundedEscrow(escrowId);

    try {
      await program.methods
        .cancelBeforeFunding()
        .accounts({ escrow: escrowPDA, depositor: depositor.publicKey })
        .signers([depositor])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error.message).to.include("InvalidStatus");
    }
  });

  // ============================================================
  // HACKATHON DEMO FLOW — Full Happy Path (3 min script)
  // ============================================================

  describe("DEMO FLOW — Hackathon Presentation", () => {
    const demoDepositor = Keypair.generate();
    const demoReceiver = Keypair.generate();
    const demoTreasury = Keypair.generate();
    const demoArbiter = Keypair.generate();
    const demoMint = Keypair.generate();
    const demoEscrowId = new BN(999);
    const demoAmount = new BN(10_000_000); // 10 USDC (6 decimals)

    let demoConfigPDA: PublicKey;
    let demoDepositorATA: PublicKey;
    let demoReceiverATA: PublicKey;
    let demoTreasuryATA: PublicKey;
    let demoEscrowPDA: PublicKey;
    let demoVaultPDA: PublicKey;

    it("DEMO 0:00 — Setup: Create mock USDC + fund wallets", async () => {
      // Fund all demo wallets
      for (const kp of [demoDepositor, demoReceiver, demoTreasury, demoArbiter]) {
        await provider.connection.confirmTransaction(
          await provider.connection.requestAirdrop(kp.publicKey, 100 * LAMPORTS_PER_SOL)
        );
      }

      // Create mock USDC mint (6 decimals)
      await createMint(demoMint, demoDepositor, 6);

      // Derive all PDAs
      [demoConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("config"), demoDepositor.publicKey.toBuffer()],
        program.programId
      );
      const pdas = deriveEscrowPDAs(demoDepositor.publicKey, demoEscrowId);
      demoEscrowPDA = pdas.escrowPDA;
      demoVaultPDA = pdas.vaultPDA;

      // Create ATAs
      demoDepositorATA = await createATA(demoMint.publicKey, demoDepositor.publicKey, demoDepositor);
      demoReceiverATA = await createATA(demoMint.publicKey, demoReceiver.publicKey, demoReceiver);
      demoTreasuryATA = await createATA(demoMint.publicKey, demoTreasury.publicKey, demoTreasury);

      // Mint 100 USDC to depositor
      await mintTokens(demoMint.publicKey, demoDepositorATA, demoDepositor, 100_000_000);

      // Verify starting balances
      const depositorBal = await getAccount(provider.connection, demoDepositorATA);
      const receiverBal = await getAccount(provider.connection, demoReceiverATA);
      console.log("  ┌─── DEMO BALANCES (Before) ───────────────");
      console.log(`  │ Alice (depositor): ${Number(depositorBal.amount) / 1e6} USDC`);
      console.log(`  │ Bob   (receiver):  ${Number(receiverBal.amount) / 1e6} USDC`);
      console.log("  └────────���─────────────────────────────────");

      expect(Number(depositorBal.amount)).to.equal(100_000_000);
      expect(Number(receiverBal.amount)).to.equal(0);
    });

    it("DEMO 0:30 — Initialize config + create escrow", async () => {
      // Admin initializes protocol config
      await program.methods
        .initializeConfig(250, demoTreasury.publicKey, demoArbiter.publicKey)
        .accounts({
          config: demoConfigPDA,
          authority: demoDepositor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([demoDepositor])
        .rpc();

      // Alice creates escrow for 10 USDC to Bob, expires in 1 hour
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);
      await program.methods
        .initializeEscrow(demoEscrowId, demoReceiver.publicKey, demoAmount, expiresAt)
        .accounts({
          config: demoConfigPDA, escrow: demoEscrowPDA, vault: demoVaultPDA,
          mint: demoMint.publicKey, depositor: demoDepositor.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([demoDepositor])
        .rpc();

      const escrow = await program.account.escrowAccount.fetch(demoEscrowPDA);
      console.log("  ┌─── ESCROW CREATED ───────────────────────");
      console.log(`  │ ID:        ${escrow.escrowId.toString()}`);
      console.log(`  │ Amount:    ${Number(escrow.amount.toString()) / 1e6} USDC`);
      console.log(`  │ Status:    Created`);
      console.log(`  │ Depositor: ${escrow.depositor.toBase58().slice(0, 8)}...`);
      console.log(`  │ Receiver:  ${escrow.receiver.toBase58().slice(0, 8)}...`);
      console.log("  └──────────────────────────────────────────");

      expect(JSON.stringify(escrow.status)).to.include("created");
    });

    it("DEMO 1:00 — Alice deposits 10 USDC into vault", async () => {
      const depositorBefore = await getAccount(provider.connection, demoDepositorATA);

      await program.methods
        .deposit()
        .accounts({
          escrow: demoEscrowPDA, vault: demoVaultPDA,
          depositorToken: demoDepositorATA, depositor: demoDepositor.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([demoDepositor])
        .rpc();

      const depositorAfter = await getAccount(provider.connection, demoDepositorATA);
      const vaultBal = await getAccount(provider.connection, demoVaultPDA);

      console.log("  ┌─── FUNDS DEPOSITED ──────────────────────");
      console.log(`  │ Alice balance: ${Number(depositorBefore.amount) / 1e6} → ${Number(depositorAfter.amount) / 1e6} USDC`);
      console.log(`  │ Vault balance: ${Number(vaultBal.amount) / 1e6} USDC`);
      console.log(`  │ Status:        Funded`);
      console.log("  └──────────────────────────────────────────");

      expect(Number(vaultBal.amount)).to.equal(Number(demoAmount.toString()));
    });

    it("DEMO 1:30 — QR flow: start session → both confirm", async () => {
      // Bob generates QR with nonce
      const nonce = "hackathon_demo_2026";
      const sessionHash = generateSessionHash(
        demoEscrowId, nonce, demoDepositor.publicKey, demoReceiver.publicKey
      );
      const sessionExpiresAt = new BN(Math.floor(Date.now() / 1000) + 300); // 5 min

      // Bob starts release session
      await program.methods
        .startReleaseSession(sessionHash, sessionExpiresAt)
        .accounts({ escrow: demoEscrowPDA, caller: demoReceiver.publicKey })
        .signers([demoReceiver])
        .rpc();

      console.log("  ┌─── QR SESSION STARTED ───────────────────");
      console.log(`  │ Nonce:   ${nonce}`);
      console.log(`  │ Expires: 5 minutes`);
      console.log(`  │ Status:  ReleaseStarted`);
      console.log("  └──────────────────────────────────────────");

      // Alice scans QR → confirms
      await program.methods
        .confirmReleaseAsDepositor(sessionHash)
        .accounts({ escrow: demoEscrowPDA, depositor: demoDepositor.publicKey })
        .signers([demoDepositor])
        .rpc();

      console.log("  │ ✅ Alice (depositor) confirmed via QR scan");

      // Bob confirms
      await program.methods
        .confirmReleaseAsReceiver(sessionHash)
        .accounts({ escrow: demoEscrowPDA, receiver: demoReceiver.publicKey })
        .signers([demoReceiver])
        .rpc();

      console.log("  │ ✅ Bob   (receiver)  confirmed via QR scan");

      const escrow = await program.account.escrowAccount.fetch(demoEscrowPDA);
      expect(escrow.depositorReleased).to.be.true;
      expect(escrow.receiverReleased).to.be.true;
    });

    it("DEMO 2:00 — Finalize release → funds to Bob", async () => {
      const receiverBefore = await getAccount(provider.connection, demoReceiverATA);
      const treasuryBefore = await getAccount(provider.connection, demoTreasuryATA);

      await program.methods
        .finalizeRelease()
        .accounts({
          config: demoConfigPDA, escrow: demoEscrowPDA, vault: demoVaultPDA,
          receiverToken: demoReceiverATA, treasuryToken: demoTreasuryATA,
          caller: demoDepositor.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([demoDepositor])
        .rpc();

      const receiverAfter = await getAccount(provider.connection, demoReceiverATA);
      const treasuryAfter = await getAccount(provider.connection, demoTreasuryATA);
      const vaultFinal = await getAccount(provider.connection, demoVaultPDA);
      const depositorFinal = await getAccount(provider.connection, demoDepositorATA);
      const escrow = await program.account.escrowAccount.fetch(demoEscrowPDA);

      const fee = Math.floor(Number(demoAmount.toString()) * 250 / 10000);
      const net = Number(demoAmount.toString()) - fee;

      console.log("  ┌─── ESCROW RELEASED ✅ ────────────────────");
      console.log(`  │ Status:          Released`);
      console.log(`  │ Bob received:    ${(Number(receiverAfter.amount) - Number(receiverBefore.amount)) / 1e6} USDC (net)`);
      console.log(`  │ Treasury fee:    ${(Number(treasuryAfter.amount) - Number(treasuryBefore.amount)) / 1e6} USDC (2.5%)`);
      console.log(`  │ Vault remaining: ${Number(vaultFinal.amount) / 1e6} USDC`);
      console.log("  ├─── FINAL BALANCES ────────────────────────");
      console.log(`  │ Alice (depositor): ${Number(depositorFinal.amount) / 1e6} USDC`);
      console.log(`  │ Bob   (receiver):  ${Number(receiverAfter.amount) / 1e6} USDC`);
      console.log(`  │ Treasury:          ${Number(treasuryAfter.amount) / 1e6} USDC`);
      console.log("  └──────────────────────────────────────────");

      expect(JSON.stringify(escrow.status)).to.include("released");
      expect(Number(receiverAfter.amount) - Number(receiverBefore.amount)).to.equal(net);
      expect(Number(treasuryAfter.amount) - Number(treasuryBefore.amount)).to.equal(fee);
      expect(Number(vaultFinal.amount)).to.equal(0);
    });
  });
});