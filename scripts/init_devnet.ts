// @ts-nocheck
/**
 * init_devnet.ts — Inicializa el contrato Escrow en Solana Devnet
 * Construye transacciones manualmente (sin Program.methods) para evitar
 * incompatibilidades del parser IDL de Anchor 0.31.
 *
 * Uso: npx ts-node scripts/init_devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// CONFIGURACIÓN
// ============================================================

const USDC_MINT = new PublicKey("2m9MGSgwzjiMcxU15pgB431bukuQECvyECzCeZ3k5Ewy");
const FEE_BPS = 250; // 2.5%
const PROGRAM_ID = new PublicKey("GJpDE682RqjTKT75Hjii3KqUaW5ddhwqLWy1afH4XR5u");

// Discriminator de initialize_config (sha256("global:initialize_config")[0..8])
const INIT_CONFIG_DISCRIM = Buffer.from([208, 127, 21, 1, 194, 190, 196, 70]);

// ============================================================
// SERIALIZACIÓN MANUAL
// ============================================================

function serializeU16(val: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(val);
  return buf;
}

function buildInitConfigIx(
  configPda: PublicKey,
  authority: PublicKey,
  feeBps: number,
  treasury: PublicKey,
  arbiter: PublicKey
): TransactionInstruction {
  // initialize_config(fee_bps: u16, treasury: Pubkey, arbiter: Pubkey)
  // Data layout: [8 discriminator][2 fee_bps][32 treasury][32 arbiter]
  const data = Buffer.concat([
    INIT_CONFIG_DISCRIM,
    serializeU16(feeBps),
    treasury.toBuffer(),
    arbiter.toBuffer(),
  ]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     VIGENT ESCROW — Inicialización Devnet               ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Cargar wallet admin
  const walletPath = path.join(__dirname, "..", "target", "wallet", "wallet.json");
  const walletKp = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  console.log(`👤 Admin Wallet: ${walletKp.publicKey.toBase58()}`);

  // Provider
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new anchor.Wallet(walletKp);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    skipPreflight: false,
  });

  console.log(`📦 Program ID:   ${PROGRAM_ID.toBase58()}`);
  console.log(`🪙  USDC Mint:    ${USDC_MINT.toBase58()}`);
  console.log(`💰 Fee:          ${FEE_BPS / 100}% (${FEE_BPS} bps)\n`);

  // Verificar balance SOL
  const solBalance = await connection.getBalance(walletKp.publicKey);
  console.log(`💎 SOL Balance:  ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (solBalance < 0.5 * LAMPORTS_PER_SOL) {
    console.log("⚠️  Solicitando airdrop...");
    const sig = await connection.requestAirdrop(walletKp.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
    console.log("✅ Airdrop: +2 SOL");
  }

  // Derivar Config PDA: seeds = ["config", authority]
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), walletKp.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log(`📋 Config PDA:   ${configPDA.toBase58()}`);

  // Verificar si config ya existe
  const configInfo = await connection.getAccountInfo(configPDA);
  if (configInfo && configInfo.data.length > 0) {
    console.log("\n✅ Config YA existe!");
    console.log(`   Data: ${configInfo.data.length} bytes`);
    console.log(`\n🔍 https://explorer.solana.com/address/${configPDA.toBase58()}?cluster=devnet`);
    return { configPDA };
  }

  // Crear Treasury ATA (para fees USDC)
  const treasuryATA = await getAssociatedTokenAddress(USDC_MINT, walletKp.publicKey);
  console.log(`🏦 Treasury ATA: ${treasuryATA.toBase58()}`);

  let needsAta = false;
  try {
    await getAccount(connection, treasuryATA);
    console.log("   ✅ Treasury ATA existe");
  } catch {
    needsAta = true;
    console.log("   📝 Se creará Treasury ATA...");
  }

  // Treasury y Arbiter = admin wallet (devnet testing)
  const treasuryPk = walletKp.publicKey;
  const arbiterPk = walletKp.publicKey;

  console.log("\n🚀 Inicializando Config PDA...");
  console.log(`   Fee:        ${FEE_BPS / 100}%`);
  console.log(`   Treasury:   ${treasuryPk.toBase58()}`);
  console.log(`   Arbiter:    ${arbiterPk.toBase58()}`);

  // Construir transacción
  const tx = new Transaction();

  // Agregar creación ATA si es necesaria
  if (needsAta) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        walletKp.publicKey,
        treasuryATA,
        walletKp.publicKey,
        USDC_MINT
      )
    );
  }

  // Agregar instrucción initialize_config
  const initIx = buildInitConfigIx(configPDA, walletKp.publicKey, FEE_BPS, treasuryPk, arbiterPk);
  tx.add(initIx);

  // Enviar transacción
  try {
    const sig = await provider.sendAndConfirm(tx, [walletKp]);
    console.log(`\n✅ Config inicializado!`);
    console.log(`📝 Tx: ${sig}`);

    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║     ESTADO DEL CONTRATO                                  ║");
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log(`║  Program ID:   ${PROGRAM_ID.toBase58()}`);
    console.log(`║  Config PDA:   ${configPDA.toBase58()}`);
    console.log(`║  Authority:    ${walletKp.publicKey.toBase58()}`);
    console.log(`║  Treasury:     ${treasuryPk.toBase58()}`);
    console.log(`║  Arbiter:      ${arbiterPk.toBase58()}`);
    console.log(`║  Fee:          ${FEE_BPS / 100}%`);
    console.log(`║  USDC Mint:    ${USDC_MINT.toBase58()}`);
    console.log(`║  Treasury ATA: ${treasuryATA.toBase58()}`);
    console.log("╚══════════════════════════════════════════════════════════╝");

    console.log(`\n🔍 Config: https://explorer.solana.com/address/${configPDA.toBase58()}?cluster=devnet`);
    console.log(`🔍 Tx:     https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  } catch (err: any) {
    console.error("\n❌ Error:", err.message);
    if (err.logs) {
      console.error("Program logs:");
      err.logs.forEach((l: string) => console.error("  ", l));
    }
    throw err;
  }

  return { configPDA, treasuryATA };
}

main()
  .then(() => {
    console.log("\n🎉 Inicialización completada!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n💥 Fatal:", err.message || err);
    process.exit(1);
  });