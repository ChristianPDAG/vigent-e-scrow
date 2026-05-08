# Contract-Vigent-e-scrow

Escrow inteligente en Solana con flujo de release dual (QR), disputas y arbitraje.

## Arquitectura del Contrato

### Instrucciones

| Instrucción | Descripción | Rol |
|---|---|---|
| `initializeConfig` | Configura fee, treasury y arbiter | Admin (authority) |
| `initializeEscrow` | Crea un escrow entre depositor y receiver | Depositor |
| `deposit` | Fondea el vault del escrow | Depositor |
| `startReleaseSession` | Inicia sesión de release con hash | Depositor o Receiver |
| `confirmReleaseAsDepositor` | Depositor confirma release via QR | Depositor |
| `confirmReleaseAsReceiver` | Receiver confirma release via QR | Receiver |
| `finalizeRelease` | Ejecuta transferencia (vault → receiver - fee → treasury) | Cualquiera |
| `cancelBeforeFunding` | Cancela escrow no fondeado | Depositor |
| `refundAfterExpiry` | Devuelve fondos tras expiración | Depositor |
| `openDispute` | Abre disputa con código de razón | Depositor o Receiver |
| `resolveDispute` | Resuelve disputa (a favor de receiver o depositor) | Arbiter |

### Cuentas PDAs

- **Config**: `["config", authority.toBuffer()]`
- **EscrowAccount**: `["escrow", depositor.toBuffer(), escrowId.toBuffer()]`
- **Vault (Token Account)**: `["vault", depositor.toBuffer(), escrowId.toBuffer()]`

### Modelo de Fees

- **Fee por defecto**: 250 bps (2.5%)
- **Destino**: Treasury wallet (configurable por admin)
- **Arbitraje**: Arbiter dedicado (configurable por admin)

---

## Prerrequisitos

Instalar herramientas CLI:

```powershell
# Opción 1: Script automatizado
.\install_tools.ps1

# Opción 2: Manual
# 1. Instalar Solana CLI: https://docs.solanalabs.com/cli/install
# 2. Instalar Rust: https://rustup.rs
# 3. Instalar Anchor CLI:
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.31.1
avm use 0.31.1
```

---

## Despliegue

### 1. Localnet (desarrollo y tests)

```bash
anchor build
anchor test
```

### 2. Devnet Deploy

```bash
# Configurar Solana CLI a devnet
solana config set --url devnet

# Solicitar SOL para deployment
solana airdrop 5

# Build y deploy
anchor build
anchor deploy --provider.cluster devnet
```

### 3. Inicialización post-deploy (Devnet)

Después del deploy, ejecutar el script de inicialización:

```bash
npx ts-node scripts/init_devnet.ts
```

Este script:
1. Crea un **Mock USDC Mint** (6 decimales) en devnet
2. Minta **1,000,000 USDC** a la wallet admin
3. Inicializa el **Config** del contrato (2.5% fee, admin como treasury y arbiter)
4. Genera el archivo `.env` con todas las direcciones
5. Guarda `target/deploy_info.json` con el resumen del deployment

### 4. Mock USDC Manual (alternativa CLI)

```bash
# Crear token
spl-token create-token --decimals 6 --url devnet

# Crear cuenta
spl-token create-account <MINT_PUBKEY> --url devnet

# Mintear tokens
spl-token mint <MINT_PUBKEY> 1000000000 --url devnet
```

---

## Variables de Entorno (Frontend)

El script `init_devnet.ts` genera automáticamente el archivo `.env`:

```env
NEXT_PUBLIC_PROGRAM_ID=bzopvkvUsqbUCy47wWmkvR53U2GecG9ZJD7yQg3cDtp
NEXT_PUBLIC_USDC_MINT=<generado_por_script>
NEXT_PUBLIC_TREASURY_PUBKEY=<tu_wallet_admin>
NEXT_PUBLIC_ARBITER_PUBKEY=<tu_wallet_admin>
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_CLUSTER=devnet
```

### Para Mainnet (producción)

```env
NEXT_PUBLIC_PROGRAM_ID=<tu_program_id_mainnet>
NEXT_PUBLIC_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
NEXT_PUBLIC_TREASURY_PUBKEY=<tu_treasury_wallet>
NEXT_PUBLIC_ARBITER_PUBKEY=<tu_arbiter_wallet>
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_CLUSTER=mainnet-beta
```

---

## Archivos Clave

| Archivo | Propósito |
|---|---|
| `programs/workspace/src/lib.rs` | Contrato Anchor (Rust) |
| `tests/workspace.ts` | Tests completos (15+ test cases) |
| `scripts/init_devnet.ts` | Inicialización de devnet |
| `target/idl/workspace.json` | IDL generado (para frontend SDK) |
| `target/types/workspace.ts` | Tipos TypeScript generados |
| `target/deploy/workspace-keypair.json` | Keypair del programa (NO compartir) |
| `target/wallet/wallet.json` | Wallet admin local |
| `.env` | Variables de entorno (generado) |
| `target/deploy_info.json` | Resumen del deployment (generado) |

---

## Integración Frontend (Next.js)

```typescript
import { Program, AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/workspace.json";

const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);
const usdcMint = new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT!);

// Derivar Config PDA
const [configPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("config"), adminWallet.toBuffer()],
  programId
);

// Crear escrow
const escrowId = new BN(Date.now());
const [escrowPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), depositor.toBuffer(), escrowId.toArrayLike(Buffer, "le", 8)],
  programId
);
```

---

## Seguridad

- ⚠️ **NUNCA** compartas `target/wallet/wallet.json` ni `target/deploy/workspace-keypair.json`
- En producción, usa wallets hardware para treasury y arbiter
- El arbiter de devnet es la misma wallet admin; en producción usa wallets separadas
- `.env` está en `.gitignore` — no se sube al repositorio