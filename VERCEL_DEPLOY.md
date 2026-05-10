# Vigent Escrow — Deploy en Vercel

## Datos del programa desplegado (devnet)

| Campo | Valor |
|-------|-------|
| Program ID | `GJpDE682RqjTKT75Hjii3KqUaW5ddhwqLWy1afH4XR5u` |
| Authority | `3GjWHR8sPau4sXGvh6U9dPzqQWvZLWPmi9dEDgSYjLcJ` |
| Cluster | devnet |
| USDC Mock Mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Explorer | https://explorer.solana.com/address/GJpDE682RqjTKT75Hjii3KqUaW5ddhwqLWy1afH4XR5u?cluster=devnet |

## Pasos en Vercel

### 1. Importar el proyecto
- New Project → Import Git Repository → seleccionar `Contract-Vigent-e-scrow`
- **Root Directory**: `web/`
- **Framework Preset**: Next.js (auto-detectado)
- **Build Command**: `next build` (default)
- **Output Directory**: `.next` (default)

### 2. Variables de entorno

En **Settings → Environment Variables** pegar las siguientes (todas con scope `Production`, `Preview`, `Development`):

```
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_ESCROW_PROGRAM_ID=GJpDE682RqjTKT75Hjii3KqUaW5ddhwqLWy1afH4XR5u
NEXT_PUBLIC_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
NEXT_PUBLIC_TREASURY=3GjWHR8sPau4sXGvh6U9dPzqQWvZLWPmi9dEDgSYjLcJ
NEXT_PUBLIC_USE_MOCK=false
```

> **Tip:** Vercel acepta paste masivo del bloque de arriba en formato `KEY=VALUE`.

### 3. (Opcional) RPC dedicada

`api.devnet.solana.com` tiene rate-limit. Para la demo recomendamos:
- **Helius**: https://helius.dev (devnet plan gratis)
- **QuickNode**: https://quicknode.com

Reemplaza `NEXT_PUBLIC_SOLANA_RPC_URL` con el endpoint privado.

### 4. Deploy

- Click **Deploy**.
- Tras el primer build (~2 min) Vercel asignará la URL.

## Pruebas en la demo

Wallets necesarias:
1. **Phantom o Solflare** en modo devnet (Settings → Developer Settings → Devnet)
2. Pedir SOL devnet en https://faucet.solana.com
3. Pedir USDC del mock mint: el admin (`3GjWHR8s...`) puede transferir desde su balance de 1M

Flujos demo:
- Crear escrow: Alice deposita 10 USDC para Bob
- QR release: Alice y Bob escanean QR → confirman → finalize
- Fee: 0.25 USDC al treasury, 9.75 USDC a Bob
