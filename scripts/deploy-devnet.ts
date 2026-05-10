/**
 * Post-Deploy Setup — Vigent Escrow (Devnet)
 * 
 * Ejecutar DESPUÉS de: anchor deploy --provider.cluster devnet
 * 
 * Este script:
 *   1. Verifica balance admin
 *   2. Inicializa Config on-chain
 *   3. Crea Mock USDC Mint
 *   4. Crea ATA admin y mintea tokens
 *   5. Actualiza .env.local
 * 
 * Uso: npx ts-node scripts/deploy-devnet.ts
 */
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const DEVNET_URL = "https://api.devnet.solana.com";

// --- Config hardcoded (coincide con anchor.toml y workspace-keypair.json) ---
const PROGRAM_ID = new PublicKey("GJpDE682RqjTKT75Hjii3KqUaW5ddhwqLWy1afH4XR5u");
const ADMIN_PUBKEY = new PublicKey("3GjWHR8sPau4sXGvh6U9dPzqQWvZLWPmi9dEDgSYjLcJ");

function loadAdminKeypair(): Keypair {
  const idPath = path.join(
    process.env.USERPROFILE || process.env.HOME || "/root",
    ".config", "solana", "id.json"
  );
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(idPath, "utf-8"))));
}

async function main() {
  console.log("🚀 Vigent Escrow — Post-Deploy Setup (Devnet)\n");

  const admin = loadAdminKeypair();
  const conn = new Connection(DEVNET_URL, "confirmed");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });

  console.log(`Admin:   ${admin.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);

  // Verify program is deployed
  const programInfo = await conn.getAccountInfo(PROGRAM_ID);
  if (!programInfo) {
    console.error("❌ Programa NO desplegado. Ejecuta primero:");
    console.error("   anchor deploy --provider.cluster devnet");
    process.exit(1);
  }
  console.log("✅ Programa verificado en devnet\n");

  // --- Step 1: Balance ---
  console.log("--- Step 1: Verificar balance ---");
  const balance = await conn.getBalance(admin.publicKey);
  console.log(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.error("❌ SALDO INSUFICIENTE. Obtén SOL en https://faucet.solana.com");
    process.exit(1);
  }

  // --- Step 2: Initialize Config ---
  console.log("\n--- Step 2: Inicializar Config ---");
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), admin.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log(`Config PDA: ${configPda.toBase58()}`);

  const configInfo = await conn.getAccountInfo(configPda);
  if (configInfo) {
    console.log("✅ Config ya inicializado (saltando)");
  } else {
    // Build raw transaction to bypass Anchor client checks
    // initialize_config discriminator: [208, 127, 21, 1, 194, 190, 196, 70]
    const discriminator = Buffer.from([208, 127, 21, 1, 194, 190, 196, 70]);
    const feeBps = 50; // 0.5%
    const feeBpsBuf = Buffer.alloc(2);
    feeBpsBuf.writeUInt16LE(feeBps);
    const data = Buffer.concat([
      discriminator,
      feeBpsBuf,
      admin.publicKey.toBuffer(), // treasury
      admin.publicKey.toBuffer(), // arbiter
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(conn, tx, [admin]);
    console.log(`✅ Config inicializado! TX: ${sig}`);
  }

  // --- Step 3: Mock USDC ---
  console.log("\n--- Step 3: Crear Mock USDC Mint ---");
  const usdcMint = await createMint(
    conn, admin,
    admin.publicKey, // mint authority
    admin.publicKey, // freeze authority
    6
  );
  console.log(`✅ USDC Mint: ${usdcMint.toBase58()}`);

  // ATA for admin
  const adminAta = await createAssociatedTokenAccount(conn, admin, usdcMint, admin.publicKey);
  console.log(`Admin ATA: ${adminAta.toBase58()}`);

  // Mint 1M USDC
  await mintTo(conn, admin, usdcMint, adminAta, admin, 1_000_000_000_000);
  console.log("✅ Minteado 1,000,000 USDC a admin");

  // --- Step 4: Update .env.local ---
  console.log("\n--- Step 4: Actualizar .env.local ---");
  const envPath = path.join(__dirname, "..", "web", ".env.local");
  let envContent = fs.readFileSync(envPath, "utf-8");
  envContent = envContent.replace(/NEXT_PUBLIC_USDC_MINT=.*/, `NEXT_PUBLIC_USDC_MINT=${usdcMint.toBase58()}`);
  fs.writeFileSync(envPath, envContent);
  console.log("✅ .env.local actualizado");

  // --- Summary ---
  console.log("\n🎉 ==========================================");
  console.log("SETUP COMPLETADO — Guarde estos valores:");
  console.log("==========================================");
  console.log(`Program ID:  ${PROGRAM_ID.toBase58()}`);
  console.log(`Config PDA:  ${configPda.toBase58()}`);
  console.log(`Admin:       ${admin.publicKey.toBase58()}`);
  console.log(`USDC Mint:   ${usdcMint.toBase58()}`);
  console.log(`Admin ATA:   ${adminAta.toBase58()}`);
  console.log(`Treasury:    ${admin.publicKey.toBase58()}`);
  console.log("==========================================");
  console.log("\nAhora puedes levantar el frontend:");
  console.log("  cd web && pnpm dev");
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});