// @ts-nocheck
/**
 * init_devnet.ts — Inicializa el entorno de devnet:
 * 1. Crea un Mock USDC Mint (6 decimales)
 * 2. Minta 1,000,000 USDC a la wallet admin
 * 3. Inicializa el Config del contrato (250 bps, wallet como treasury y arbiter)
 *
 * Uso: npx ts-node scripts/init_devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAccount,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  Keypair,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// CONFIG
// ============================================================

const DEVNET_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("bzopvkvUsqbUCy47wWmkvR53U2GecG9ZJD7yQg3cDtp");
const FEE_BPS = 250; // 2.5%
const MINT_AMOUNT = 1_000_000_000_000; // 1,000,000 USDC (6 decimals)
const DECIMALS = 6;

// Rutas
const PROJECT_ROOT = path.resolve(__dirname, "..");
const WALLET_PATH = path.join(PROJECT_ROOT, "target", "wallet", "wallet.json");
const IDL_PATH = path.join(PROJECT_ROOT, "target", "idl", "workspace.json");
const ENV_OUTPUT_PATH = path.join(PROJECT_ROOT, ".env");

// ============================================================
// HELPERS
// ============================================================

function loadWalletKeypair(): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function loadIdl(): any {
  return JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
}

async function airdropIfNeeded(connection: Connection, pubkey: PublicKey) {
  const balance = await connection.getBalance(pubkey);
  if (balance < 2 * LAMPORTS_PER_SOL) {
    console.log("  💰 Solicitando airdrop de 5 SOL...");
    const sig = await connection.requestAirdrop(pubkey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("  ✅ Airdrop confirmado.");
  } else {
    console.log(`  💵 Balance SOL: ${(balance / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   Escrow Devnet Initialization Script        ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // --- Cargar wallet ---
  const adminKp = loadWalletKeypair();
  console.log(`👤 Admin Wallet: ${adminKp.publicKey.toBase58()}`);

  // --- Conexión a devnet ---
  const connection = new Connection(DEVNET_URL, "confirmed");
  console.log(`🌐 Conectado a: ${DEVNET_URL}\n`);

  // --- Airdrop si es necesario ---
  console.log("=== PASO 0: Verificar fondos SOL ===");
  await airdropIfNeeded(connection, adminKp.publicKey);

  // --- PASO 1: Crear Mock USDC Mint ---
  console.log("\n=== PASO 1: Crear Mock USDC Mint ===");
  const mintKp = Keypair.generate();
  const mintRent = await getMinimumBalanceForRentExemptMint(connection);

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: adminKp.publicKey,
      newAccountPubkey: mintKp.publicKey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mintKp.publicKey,
      DECIMALS,
      adminKp.publicKey,
      null
    )
  );

  const mintSig = await connection.sendTransaction(createMintTx, [adminKp, mintKp]);
  await connection.confirmTransaction(mintSig, "confirmed");
  console.log(`  🪙  Mock USDC Mint: ${mintKp.publicKey.toBase58()}`);
  console.log(`  📝 Tx: ${mintSig}`);

  // --- PASO 2: Crear ATA y mintear tokens ---
  console.log("\n=== PASO 2: Mintear 1,000,000 USDC a Admin ===");
  const adminAta = await getAssociatedTokenAddress(mintKp.publicKey, adminKp.publicKey);

  const createAtaTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      adminKp.publicKey,
      adminAta,
      adminKp.publicKey,
      mintKp.publicKey
    )
  );
  const ataSig = await connection.sendTransaction(createAtaTx, [adminKp]);
  await connection.confirmTransaction(ataSig, "confirmed");
  console.log(`  📂 Admin ATA: ${adminAta.toBase58()}`);

  const mintToTx = new Transaction().add(
    createMintToInstruction(
      mintKp.publicKey,
      adminAta,
      adminKp.publicKey,
      MINT_AMOUNT
    )
  );
  const mintToSig = await connection.sendTransaction(mintToTx, [adminKp]);
  await connection.confirmTransaction(mintToSig, "confirmed");

  const ataBalance = await getAccount(connection, adminAta);
  console.log(`  ✅ Minteados: ${Number(ataBalance.amount) / 1e6} USDC`);
  console.log(`  📝 Tx: ${mintToSig}`);

  // --- PASO 3: Inicializar Config del contrato ---
  console.log("\n=== PASO 3: Inicializar Config (Escrow Contract) ===");

  // Configurar provider Anchor (mismo patrón que tests/workspace.ts)
  const wallet = new Wallet(adminKp);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Cargar IDL y programa (sin tipo genérico para evitar error de resolución)
  const idl = loadIdl();
  const program = new Program(idl, PROGRAM_ID, provider);

  // Derivar Config PDA
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), adminKp.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log(`  📍 Config PDA: ${configPDA.toBase58()}`);

  // Verificar si config ya existe
  let configExists = false;
  try {
    await program.account.config.fetch(configPDA);
    configExists = true;
    console.log("  ⚠️  Config ya inicializado, saltando...");
  } catch {
    // No existe, procedemos a crearlo
  }

  if (!configExists) {
    const treasury = adminKp.publicKey; // Wallet admin como treasury
    const arbiter = adminKp.publicKey;  // Wallet admin como arbiter (devnet)

    const initConfigSig = await program.methods
      .initializeConfig(FEE_BPS, treasury, arbiter)
      .accounts({
        config: configPDA,
        authority: adminKp.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([adminKp])
      .rpc();

    console.log(`  ✅ Config inicializado!`);
    console.log(`     Fee: ${FEE_BPS / 100}% (${FEE_BPS} bps)`);
    console.log(`     Treasury: ${treasury.toBase58()}`);
    console.log(`     Arbiter: ${arbiter.toBase58()}`);
    console.log(`  📝 Tx: ${initConfigSig}`);

    // Verificar
    const config = await program.account.config.fetch(configPDA);
    console.log(`  🔍 isActive: ${(config as any).isActive}`);
    console.log(`  🔍 escrowCount: ${(config as any).escrowCount.toString()}`);
  }

  // --- PASO 4: Guardar .env ---
  console.log("\n=== PASO 4: Generando archivo .env ===");

  const envContent = [
    `# Auto-generado por init_devnet.ts — ${new Date().toISOString()}`,
    `NEXT_PUBLIC_PROGRAM_ID=${PROGRAM_ID.toBase58()}`,
    `NEXT_PUBLIC_USDC_MINT=${mintKp.publicKey.toBase58()}`,
    `NEXT_PUBLIC_TREASURY_PUBKEY=${adminKp.publicKey.toBase58()}`,
    `NEXT_PUBLIC_ARBITER_PUBKEY=${adminKp.publicKey.toBase58()}`,
    `NEXT_PUBLIC_SOLANA_RPC_URL=${DEVNET_URL}`,
    `NEXT_PUBLIC_CLUSTER=devnet`,
    "",
  ].join("\n");

  fs.writeFileSync(ENV_OUTPUT_PATH, envContent);
  console.log(`  📄 Archivo creado: ${ENV_OUTPUT_PATH}`);
  console.log(envContent);

  // --- Resumen Final ---
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   ✅ INICIALIZACIÓN COMPLETADA               ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  Program ID:  ${PROGRAM_ID.toBase58()}`);
  console.log(`║  USDC Mint:   ${mintKp.publicKey.toBase58()}`);
  console.log(`║  Admin/Treas: ${adminKp.publicKey.toBase58()}`);
  console.log(`║  Config PDA:  ${configPDA.toBase58()}`);
  console.log(`║  Admin ATA:   ${adminAta.toBase58()}`);
  console.log(`║  Balance:     ${Number(ataBalance.amount) / 1e6} USDC`);
  console.log("╚══════════════════════════════════════════════╝\n");

  // Guardar addresses para referencia
  const deployInfo = {
    network: "devnet",
    programId: PROGRAM_ID.toBase58(),
    usdcMint: mintKp.publicKey.toBase58(),
    adminWallet: adminKp.publicKey.toBase58(),
    configPDA: configPDA.toBase58(),
    adminAta: adminAta.toBase58(),
    feeBps: FEE_BPS,
    mintAmount: MINT_AMOUNT,
    initializedAt: new Date().toISOString(),
  };

  const deployInfoPath = path.join(PROJECT_ROOT, "target", "deploy_info.json");
  fs.writeFileSync(deployInfoPath, JSON.stringify(deployInfo, null, 2));
  console.log(`  📋 Deploy info guardado: ${deployInfoPath}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Error:", err.message);
    if (err.logs) {
      console.error("Logs:", err.logs);
    }
    process.exit(1);
  });