// @ts-nocheck
/**
 * test-devnet.ts — Suite completa de pruebas de transacciones en Devnet
 *
 * Prerrequisito: npm run init:devnet (crea mint USDC, config PDA, wallet)
 * Uso:           npx ts-node scripts/test-devnet.ts
 *
 * Flujos cubiertos:
 *   1. Happy Path:      crear → depositar → QR release (ambas firmas) → finalizar
 *   2. Cancelación:     crear → cancelar antes de fondear
 *   3. Disputa/Receiver: crear → depositar → disputa → resolver a favor del receptor
 *   4. Disputa/Refund:  crear → depositar → disputa → refund al depositor
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  Keypair,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// CONFIG
// ============================================================

const DEVNET_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("bzopvkvUsqbUCy47wWmkvR53U2GecG9ZJD7yQg3cDtp");
const PROJECT_ROOT = path.resolve(__dirname, "..");
const WALLET_PATH = path.join(PROJECT_ROOT, "target", "wallet", "wallet.json");
const DEPLOY_INFO_PATH = path.join(PROJECT_ROOT, "target", "deploy_info.json");
const IDL_PATH = path.join(PROJECT_ROOT, "target", "idl", "workspace.json");

const USDC_AMOUNT = 10_000_000;  // 10 USDC (6 decimals)
const FEE_BPS = 250;             // 2.5%
const ESCROW_DURATION = 3600;    // 1 hora
const SESSION_DURATION = 600;    // 10 minutos

// ============================================================
// TIPOS
// ============================================================

type Ctx = {
  program: any;
  connection: Connection;
  provider: AnchorProvider;
  adminKp: Keypair;
  receiverKp: Keypair;
  usdcMint: PublicKey;
  configPDA: PublicKey;
  adminAta: PublicKey;
  receiverAta: PublicKey;
};

// ============================================================
// UTILIDADES
// ============================================================

const fmt6 = (n: bigint | number) => (Number(n) / 1e6).toFixed(6);
const explorerTx = (sig: string) =>
  `  🔗 https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function loadWallet(): Keypair {
  if (!fs.existsSync(WALLET_PATH)) {
    throw new Error(
      `Wallet no encontrado: ${WALLET_PATH}\nEjecuta: npx ts-node scripts/init_devnet.ts`
    );
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8")))
  );
}

function loadDeployInfo() {
  if (!fs.existsSync(DEPLOY_INFO_PATH)) {
    throw new Error(
      `deploy_info.json no encontrado.\nEjecuta: npx ts-node scripts/init_devnet.ts`
    );
  }
  return JSON.parse(fs.readFileSync(DEPLOY_INFO_PATH, "utf-8"));
}

function loadIdl() {
  if (!fs.existsSync(IDL_PATH)) {
    throw new Error(`IDL no encontrado: ${IDL_PATH}\nEjecuta: anchor build`);
  }
  return JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
}

function derivePDAs(depositor: PublicKey, escrowId: BN) {
  const idBuf = escrowId.toArrayLike(Buffer, "le", 8);
  const [escrowPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), depositor.toBuffer(), idBuf],
    PROGRAM_ID
  );
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), depositor.toBuffer(), idBuf],
    PROGRAM_ID
  );
  return { escrowPDA, vaultPDA };
}

function makeSessionHash(
  escrowId: BN,
  nonce: string,
  depositor: PublicKey,
  receiver: PublicKey
): number[] {
  return Array.from(
    createHash("sha256")
      .update(
        Buffer.concat([
          escrowId.toArrayLike(Buffer, "le", 8),
          Buffer.from(nonce),
          depositor.toBuffer(),
          receiver.toBuffer(),
        ])
      )
      .digest()
  );
}

// ============================================================
// FLUJO 1: HAPPY PATH — crear → depositar → QR release → finalizar
// ============================================================

async function flowHappyPath(ctx: Ctx, escrowId: BN): Promise<void> {
  const { program, connection, adminKp, receiverKp, usdcMint, configPDA, adminAta, receiverAta } = ctx;

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  FLUJO 1: Happy Path — QR Release            ║");
  console.log(`╠  EscrowID: ${escrowId.toString().padEnd(33)}║`);
  console.log("╚══════════════════════════════════════════════╝");

  const { escrowPDA, vaultPDA } = derivePDAs(adminKp.publicKey, escrowId);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new BN(now + ESCROW_DURATION);
  const sessionExpiry = new BN(now + SESSION_DURATION);
  const nonce = `nonce_${escrowId.toString()}`;
  const hash = makeSessionHash(escrowId, nonce, adminKp.publicKey, receiverKp.publicKey);

  // 1. Crear escrow
  console.log("\n  [1/6] initializeEscrow...");
  const sig1 = await program.methods
    .initializeEscrow(escrowId, receiverKp.publicKey, new BN(USDC_AMOUNT), expiresAt)
    .accounts({
      config: configPDA,
      escrow: escrowPDA,
      vault: vaultPDA,
      mint: usdcMint,
      depositor: adminKp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKp])
    .rpc();
  console.log(`  ✅ Escrow creado | Amount: 10 USDC | Expires: ${new Date(expiresAt.toNumber() * 1000).toISOString()}`);
  console.log(explorerTx(sig1));

  // 2. Depositar fondos
  console.log("\n  [2/6] deposit()...");
  const sig2 = await program.methods
    .deposit()
    .accounts({
      escrow: escrowPDA,
      vault: vaultPDA,
      depositorToken: adminAta,
      depositor: adminKp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([adminKp])
    .rpc();
  const vaultBal = (await getAccount(connection, vaultPDA)).amount;
  console.log(`  ✅ Depositado | Vault: ${fmt6(vaultBal)} USDC`);
  console.log(explorerTx(sig2));

  // 3. Iniciar sesión QR (receptor inicia)
  console.log("\n  [3/6] startReleaseSession() — iniciado por receptor...");
  const sig3 = await program.methods
    .startReleaseSession(hash, sessionExpiry)
    .accounts({
      escrow: escrowPDA,
      caller: receiverKp.publicKey,
    })
    .signers([receiverKp])
    .rpc();
  console.log(`  ✅ Sesión QR abierta | Nonce: "${nonce}" | Expira en: ${SESSION_DURATION}s`);
  console.log(explorerTx(sig3));

  // 4. Depositor confirma via QR
  console.log("\n  [4/6] confirmReleaseAsDepositor()...");
  const sig4 = await program.methods
    .confirmReleaseAsDepositor(hash)
    .accounts({
      escrow: escrowPDA,
      depositor: adminKp.publicKey,
    })
    .signers([adminKp])
    .rpc();
  console.log(`  ✅ Admin (depositor) confirmó via QR`);
  console.log(explorerTx(sig4));

  // 5. Receptor confirma via QR
  console.log("\n  [5/6] confirmReleaseAsReceiver()...");
  const sig5 = await program.methods
    .confirmReleaseAsReceiver(hash)
    .accounts({
      escrow: escrowPDA,
      receiver: receiverKp.publicKey,
    })
    .signers([receiverKp])
    .rpc();
  console.log(`  ✅ Receptor confirmó via QR`);
  console.log(explorerTx(sig5));

  // 6. Finalizar: transfiere fondos
  console.log("\n  [6/6] finalizeRelease()...");
  const receiverBefore = (await getAccount(connection, receiverAta)).amount;
  const adminBefore = (await getAccount(connection, adminAta)).amount;
  const sig6 = await program.methods
    .finalizeRelease()
    .accounts({
      config: configPDA,
      escrow: escrowPDA,
      vault: vaultPDA,
      receiverToken: receiverAta,
      treasuryToken: adminAta,        // admin = treasury en devnet
      caller: adminKp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([adminKp])
    .rpc();

  const receiverAfter = (await getAccount(connection, receiverAta)).amount;
  const adminAfter = (await getAccount(connection, adminAta)).amount;
  const fee = Math.floor((USDC_AMOUNT * FEE_BPS) / 10000);
  const net = USDC_AMOUNT - fee;
  const vaultFinal = (await getAccount(connection, vaultPDA)).amount;

  console.log(`  ✅ Fondos liberados!`);
  console.log(`  ├─ Receptor recibió:  ${fmt6(receiverAfter - receiverBefore)} USDC (esperado: ${fmt6(net)})`);
  console.log(`  ├─ Fee al treasury:   ${fmt6(adminAfter - adminBefore + BigInt(net))} USDC (esperado: ${fmt6(fee)})`);
  console.log(`  └─ Vault final:       ${fmt6(vaultFinal)} USDC (esperado: 0)`);
  console.log(explorerTx(sig6));
  console.log("\n  ✅✅ FLUJO 1 COMPLETADO\n");
}

// ============================================================
// FLUJO 2: CANCELACIÓN ANTES DE FONDEAR
// ============================================================

async function flowCancelBeforeFunding(ctx: Ctx, escrowId: BN): Promise<void> {
  const { program, adminKp, receiverKp, usdcMint, configPDA } = ctx;

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  FLUJO 2: Cancelación Antes de Fondear       ║");
  console.log(`╠  EscrowID: ${escrowId.toString().padEnd(33)}║`);
  console.log("╚══════════════════════════════════════════════╝");

  const { escrowPDA, vaultPDA } = derivePDAs(adminKp.publicKey, escrowId);
  const expiresAt = new BN(Math.floor(Date.now() / 1000) + ESCROW_DURATION);

  // 1. Crear escrow (sin depositar)
  console.log("\n  [1/2] initializeEscrow() (sin depositar)...");
  const sig1 = await program.methods
    .initializeEscrow(escrowId, receiverKp.publicKey, new BN(USDC_AMOUNT), expiresAt)
    .accounts({
      config: configPDA,
      escrow: escrowPDA,
      vault: vaultPDA,
      mint: usdcMint,
      depositor: adminKp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKp])
    .rpc();
  const escrowCreated = await program.account.escrowAccount.fetch(escrowPDA);
  console.log(`  ✅ Escrow creado | Status: ${JSON.stringify(escrowCreated.status)}`);
  console.log(explorerTx(sig1));

  // 2. Cancelar antes de depositar
  console.log("\n  [2/2] cancelBeforeFunding()...");
  const sig2 = await program.methods
    .cancelBeforeFunding()
    .accounts({
      escrow: escrowPDA,
      vault: vaultPDA,
      depositor: adminKp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([adminKp])
    .rpc();
  // Account is closed after cancel — verify by catching the expected error
  try {
    await program.account.escrowAccount.fetch(escrowPDA);
    throw new Error("Escrow should have been closed");
  } catch (e: any) {
    if (e.message.includes("should have been closed")) throw e;
    // Expected: account no longer exists
  }
  console.log(`  ✅ Escrow cancelado y cuenta cerrada (rent reclamado)`);
  console.log(explorerTx(sig2));
  console.log("\n  ✅✅ FLUJO 2 COMPLETADO\n");
}

// ============================================================
// FLUJO 3: DISPUTA → RESOLVER A FAVOR DEL RECEPTOR
// ============================================================

async function flowDisputeForReceiver(ctx: Ctx, escrowId: BN): Promise<void> {
  const { program, connection, adminKp, receiverKp, usdcMint, configPDA, adminAta, receiverAta } = ctx;

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  FLUJO 3: Disputa → Resolver p/ Receptor     ║");
  console.log(`╠  EscrowID: ${escrowId.toString().padEnd(33)}║`);
  console.log("╚══════════════════════════════════════════════╝");

  const { escrowPDA, vaultPDA } = derivePDAs(adminKp.publicKey, escrowId);
  const expiresAt = new BN(Math.floor(Date.now() / 1000) + ESCROW_DURATION);

  // 1. Crear y fondear escrow
  console.log("\n  [1/3] initializeEscrow() + deposit()...");
  await program.methods
    .initializeEscrow(escrowId, receiverKp.publicKey, new BN(USDC_AMOUNT), expiresAt)
    .accounts({
      config: configPDA, escrow: escrowPDA, vault: vaultPDA,
      mint: usdcMint, depositor: adminKp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .signers([adminKp])
    .rpc();
  const sig2 = await program.methods
    .deposit()
    .accounts({
      escrow: escrowPDA, vault: vaultPDA, depositorToken: adminAta,
      depositor: adminKp.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([adminKp])
    .rpc();
  console.log(`  ✅ Escrow ID=${escrowId.toString()} creado y fondeado con 10 USDC`);
  console.log(explorerTx(sig2));

  // 2. Abrir disputa (depositor abre disputa — fondos no entregados)
  console.log("\n  [2/3] openDispute(reason=1) — abierta por depositor...");
  const sig3 = await program.methods
    .openDispute(1)
    .accounts({
      escrow: escrowPDA,
      caller: adminKp.publicKey,
    })
    .signers([adminKp])
    .rpc();
  const escrowDisputed = await program.account.escrowAccount.fetch(escrowPDA);
  console.log(`  ✅ Disputa abierta | reason=1 (fondos no recibidos) | Status: ${JSON.stringify(escrowDisputed.status)}`);
  console.log(explorerTx(sig3));

  // 3. Árbitro resuelve a favor del receptor → receptor recibe fondos menos fee
  console.log("\n  [3/3] resolveDispute(true) — árbitro libera al receptor...");
  const receiverBefore = (await getAccount(connection, receiverAta)).amount;
  const sig4 = await program.methods
    .resolveDispute(true)
    .accounts({
      config: configPDA,
      escrow: escrowPDA,
      vault: vaultPDA,
      receiverToken: receiverAta,
      depositorToken: adminAta,
      treasuryToken: adminAta,        // admin = treasury
      arbiter: adminKp.publicKey,     // admin = arbiter en devnet
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([adminKp])
    .rpc();

  const receiverAfter = (await getAccount(connection, receiverAta)).amount;
  const fee = Math.floor((USDC_AMOUNT * FEE_BPS) / 10000);
  const net = USDC_AMOUNT - fee;
  console.log(`  ✅ Disputa resuelta a favor del receptor`);
  console.log(`  ├─ Receptor recibió:  ${fmt6(receiverAfter - receiverBefore)} USDC (esperado: ${fmt6(net)})`);
  console.log(`  ├─ Fee al treasury:   ${fmt6(fee)} USDC`);
  console.log(`  └─ Vault + escrow cerrados (rent reclamado por árbitro)`);
  console.log(explorerTx(sig4));
  console.log("\n  ✅✅ FLUJO 3 COMPLETADO\n");
}

// ============================================================
// FLUJO 4: DISPUTA → REFUND AL DEPOSITOR
// ============================================================

async function flowDisputeRefundDepositor(ctx: Ctx, escrowId: BN): Promise<void> {
  const { program, connection, adminKp, receiverKp, usdcMint, configPDA, adminAta, receiverAta } = ctx;

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  FLUJO 4: Disputa → Refund al Depositor      ║");
  console.log(`╠  EscrowID: ${escrowId.toString().padEnd(33)}║`);
  console.log("╚══════════════════════════════════════════════╝");

  const { escrowPDA, vaultPDA } = derivePDAs(adminKp.publicKey, escrowId);
  const expiresAt = new BN(Math.floor(Date.now() / 1000) + ESCROW_DURATION);

  // 1. Crear y fondear escrow
  console.log("\n  [1/3] initializeEscrow() + deposit()...");
  await program.methods
    .initializeEscrow(escrowId, receiverKp.publicKey, new BN(USDC_AMOUNT), expiresAt)
    .accounts({
      config: configPDA, escrow: escrowPDA, vault: vaultPDA,
      mint: usdcMint, depositor: adminKp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .signers([adminKp])
    .rpc();
  const sig2 = await program.methods
    .deposit()
    .accounts({
      escrow: escrowPDA, vault: vaultPDA, depositorToken: adminAta,
      depositor: adminKp.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([adminKp])
    .rpc();
  console.log(`  ✅ Escrow ID=${escrowId.toString()} creado y fondeado con 10 USDC`);
  console.log(explorerTx(sig2));

  // 2. Abrir disputa (receptor abre disputa — servicio no prestado)
  console.log("\n  [2/3] openDispute(reason=2) — abierta por receptor...");
  const sig3 = await program.methods
    .openDispute(2)
    .accounts({
      escrow: escrowPDA,
      caller: receiverKp.publicKey,
    })
    .signers([receiverKp])
    .rpc();
  const escrowDisputed = await program.account.escrowAccount.fetch(escrowPDA);
  console.log(`  ✅ Disputa abierta | reason=2 (servicio no prestado) | Status: ${JSON.stringify(escrowDisputed.status)}`);
  console.log(explorerTx(sig3));

  // 3. Árbitro resuelve a favor del depositor → refund completo (sin fee)
  console.log("\n  [3/3] resolveDispute(false) — árbitro refundea al depositor...");
  const adminBefore = (await getAccount(connection, adminAta)).amount;
  const sig4 = await program.methods
    .resolveDispute(false)
    .accounts({
      config: configPDA,
      escrow: escrowPDA,
      vault: vaultPDA,
      receiverToken: receiverAta,
      depositorToken: adminAta,
      treasuryToken: adminAta,
      arbiter: adminKp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([adminKp])
    .rpc();

  const adminAfter = (await getAccount(connection, adminAta)).amount;
  console.log(`  ✅ Disputa resuelta: refund completo al depositor (sin fee)`);
  console.log(`  ├─ Admin recuperó:  ${fmt6(adminAfter - adminBefore)} USDC (esperado: ${fmt6(USDC_AMOUNT)})`);
  console.log(`  └─ Vault + escrow cerrados (rent reclamado por árbitro)`);
  console.log(explorerTx(sig4));
  console.log("\n  ✅✅ FLUJO 4 COMPLETADO\n");
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   Vigent Escrow — Test Suite DevNet          ║");
  console.log("╚══════════════════════════════════════════════╝");

  // Cargar configuración
  const adminKp = loadWallet();
  const deployInfo = loadDeployInfo();
  const idl = loadIdl();

  const usdcMint = new PublicKey(deployInfo.usdcMint);
  const adminAta = new PublicKey(deployInfo.adminAta);
  const configPDA = new PublicKey(deployInfo.configPDA);

  console.log(`\n🔑 Admin:      ${adminKp.publicKey.toBase58()}`);
  console.log(`🪙  USDC Mint:  ${usdcMint.toBase58()}`);
  console.log(`📍 Config PDA: ${configPDA.toBase58()}`);
  console.log(`📅 Red:        devnet (${DEVNET_URL})`);

  // Configurar provider
  const connection = new Connection(DEVNET_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(adminKp), {
    commitment: "confirmed",
    skipPreflight: false,
  });
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  // Verificar balance SOL
  const solBalance = await connection.getBalance(adminKp.publicKey);
  console.log(`\n💰 SOL Balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (solBalance < 0.05 * LAMPORTS_PER_SOL) {
    throw new Error(
      "Balance SOL insuficiente.\nEjecuta: solana airdrop 2 <ADMIN_PUBKEY> --url devnet"
    );
  }

  // Verificar balance USDC
  const adminUsdcBal = (await getAccount(connection, adminAta)).amount;
  console.log(`💵 USDC Balance: ${fmt6(adminUsdcBal)} USDC`);
  if (Number(adminUsdcBal) < USDC_AMOUNT * 4) {
    throw new Error(
      `USDC insuficiente. Necesitas al menos ${fmt6(BigInt(USDC_AMOUNT * 4))} USDC.\n` +
        "Ejecuta init_devnet.ts para mintear más tokens."
    );
  }

  // Preparar receptor (keypair fresco, fondos del admin)
  console.log("\n=== Preparando receptor de prueba ===");
  const receiverKp = Keypair.generate();
  console.log(`👤 Receiver: ${receiverKp.publicKey.toBase58()}`);

  // Fondear receptor con SOL via transferencia del admin (más confiable que airdrop)
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: adminKp.publicKey,
      toPubkey: receiverKp.publicKey,
      lamports: Math.floor(0.05 * LAMPORTS_PER_SOL),
    })
  );
  const fundSig = await provider.sendAndConfirm(fundTx, [adminKp]);
  console.log(`  ✅ Receptor fondeado con 0.05 SOL`);

  // Crear ATA del receptor (admin paga)
  const receiverAtaInfo = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKp,
    usdcMint,
    receiverKp.publicKey
  );
  const receiverAta = receiverAtaInfo.address;
  console.log(`  📂 Receiver ATA: ${receiverAta.toBase58()}`);

  // Context compartido
  const ctx: Ctx = {
    program,
    connection,
    provider,
    adminKp,
    receiverKp,
    usdcMint,
    configPDA,
    adminAta,
    receiverAta,
  };

  // IDs únicos basados en timestamp para evitar colisiones entre runs
  const baseId = Math.floor(Date.now() / 1000);
  const escrowIds = {
    happyPath: new BN(baseId),
    cancel: new BN(baseId + 1),
    disputeForReceiver: new BN(baseId + 2),
    disputeRefund: new BN(baseId + 3),
  };

  console.log(`\n🆔 Escrow IDs asignados:`);
  console.log(`   Flujo 1: ${escrowIds.happyPath.toString()}`);
  console.log(`   Flujo 2: ${escrowIds.cancel.toString()}`);
  console.log(`   Flujo 3: ${escrowIds.disputeForReceiver.toString()}`);
  console.log(`   Flujo 4: ${escrowIds.disputeRefund.toString()}`);

  // Ejecutar los 4 flujos
  const flows: Array<[string, () => Promise<void>]> = [
    ["Flujo 1: Happy Path (QR Release)", () => flowHappyPath(ctx, escrowIds.happyPath)],
    ["Flujo 2: Cancelación antes de fondear", () => flowCancelBeforeFunding(ctx, escrowIds.cancel)],
    ["Flujo 3: Disputa → Resolver p/ receptor", () => flowDisputeForReceiver(ctx, escrowIds.disputeForReceiver)],
    ["Flujo 4: Disputa → Refund al depositor", () => flowDisputeRefundDepositor(ctx, escrowIds.disputeRefund)],
  ];

  const results: { name: string; ok: boolean; error?: string }[] = [];

  for (const [name, fn] of flows) {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (err: any) {
      console.error(`\n  ❌ ERROR en "${name}":`, err.message);
      if (err.logs) {
        console.error("  Últimos logs del programa:");
        err.logs.slice(-6).forEach((l: string) => console.error("    ", l));
      }
      results.push({ name, ok: false, error: err.message });
    }
  }

  // Resumen final
  const passed = results.filter((r) => r.ok).length;
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   RESUMEN DE PRUEBAS                         ║");
  console.log("╠══════════════════════════════════════════════╣");
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    const label = r.name.padEnd(43);
    console.log(`║  ${icon} ${label}║`);
  }
  console.log("╠══════════════════════════════════════════════╣");
  const verdict = passed === flows.length ? "TODOS PASARON ✅" : `${passed}/${flows.length} pasaron`;
  console.log(`║  Resultado: ${verdict.padEnd(33)}║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  if (passed < flows.length) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err: any) => {
    console.error("\n❌ Error fatal:", err.message);
    if (err.logs) console.error("Logs:", err.logs);
    process.exit(1);
  });
