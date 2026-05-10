# Contract-Vigent-e-scrow

Escrow inteligente en Solana con flujo de release dual (QR), disputas y arbitraje.

---

##  Pitch Deck — Submission

### Project website
```
https://vigente-project-ipxt.vercel.app
```


---

### What are you building, and who is it for?

Vigent es un escrow descentralizado en Solana donde dos partes (depositor y receiver) bloquean USDC en un smart contract y los fondos solo se liberan cuando **ambos confirman físicamente** escaneando el mismo código QR. Para casos de conflicto, un árbitro independiente puede liberar al receiver o reembolsar al depositor.

Está diseñado para tres segmentos:
1. **Marketplaces P2P** (compraventa de bienes usados, freelancers, alquileres cortos) que hoy dependen de PayPal/Stripe con fees del 3-5% y holds de 7-30 días.
2. **Pagos contra entrega** en Latam — el comprador escanea el QR del vendedor cuando recibe el producto y los fondos se liberan al instante.
3. **Servicios profesionales** que cobran por hito (deposit upfront → release al entregar).

El diferenciador es la **doble confirmación física via QR**: ninguna parte puede liberar fondos sola, y no requiere árbitro centralizado para el camino feliz. Todo el código del contrato es open source y auditable on-chain.

---

### Why did you decide to build this, and why build it now?

El comercio P2P en Latam mueve >$15B/año pero sigue atado a transferencias bancarias inseguras (estafas comunes en Marketplace, OLX, Mercado Libre informal). Las soluciones Web2 (PayPal, Stripe) cobran 3-5% y bloquean fondos hasta 30 días "por riesgo de chargeback".

Solana resolvió en 2024 dos problemas que antes lo hacían inviable:
- **Fees** de fracciones de centavo (vs $0.50 USDC en Ethereum)
- **Finality** sub-segundo (vs 15s en BTC, 12s en ETH)

Con USDC nativo en Solana y wallets como Phantom/Solflare con UX comparable a apps Web2, el momento es ahora: la fricción técnica para usuarios finales es la más baja de la historia. Construir el escrow como infraestructura abierta significa que cualquier marketplace puede integrarlo en horas en vez de construir su propio sistema de custodia con todos los riesgos legales y de compliance que eso implica.

---

### What technologies are you using or integrating with to build your product?

**Smart Contract**
- Rust + Anchor 0.31.1 (programa Solana)
- SPL Token program (USDC)
- PDAs con seeds determinísticas para escrows y vaults

**Frontend**
- Next.js 15 (App Router) + React 19
- Tailwind CSS + shadcn/ui
- Solana Wallet Adapter (Phantom, Solflare, Backpack)
- @coral-xyz/anchor (cliente TypeScript)
- html5-qrcode + react-qr-code (flujo de release dual)
- Zustand (state) + Zod (validación)

**Backend / Infra**
- Supabase (Postgres + Auth para indexar escrows off-chain)
- Vercel (hosting + edge functions)
- Helius / QuickNode RPC (recomendado para producción)

**Dev tools**
- Anchor CLI 0.31.1, cargo-build-sbf, ts-mocha
- Suite de 25+ tests unitarios + 4 flujos E2E en devnet

**AI tools**
- Claude (Anthropic) para refactor del contrato y auditoría de seguridad pre-commit
- GitHub Copilot para boilerplate del frontend
- v0.dev para prototipos UI iniciales

---

### What category best describes your product?

**Payments / DeFi Infrastructure**

Específicamente: **Smart contract de custodia P2P** con UX consumer-grade. Cae en la intersección de:
- Payments (alternativa a PayPal/Stripe en Latam)
- Consumer Web3 (wallet UX moderna)
- DeFi infrastructure (programa open source que otros apps pueden integrar)

---

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

Configurar en `web/.env.local`:

```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_ESCROW_PROGRAM_ID=GJpDE682RqjTKT75Hjii3KqUaW5ddhwqLWy1afH4XR5u
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_USDC_MINT=<generado_por_script_o_mock>
NEXT_PUBLIC_CONFIG_PDA=<derived_PDA>
NEXT_PUBLIC_TREASURY=<tu_wallet_admin>
```

### Para Mainnet (producción)

```env
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_ESCROW_PROGRAM_ID=<tu_program_id_mainnet>
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
NEXT_PUBLIC_CONFIG_PDA=<derived_PDA_mainnet>
NEXT_PUBLIC_TREASURY=<tu_treasury_wallet>
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
| `web/.env.local` | Variables de entorno frontend |
| `target/deploy_info.json` | Resumen del deployment (generado) |

---

## Integración Frontend (Next.js)

```typescript
import { Program, AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/workspace.json";

const programId = new PublicKey(process.env.NEXT_PUBLIC_ESCROW_PROGRAM_ID!);
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