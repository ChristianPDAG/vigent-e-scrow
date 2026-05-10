# Vigent Escrow — Security Hardening Report

Hardening realizado sobre el contrato Anchor antes del deploy a devnet.
Programa desplegado: `GJpDE682RqjTKT75Hjii3KqUaW5ddhwqLWy1afH4XR5u`.

## Resumen ejecutivo

| Severidad | Cantidad | Estado |
|-----------|----------|--------|
| 🔴 Crítica | 4 | ✅ Mitigadas |
| 🟠 Alta | 2 | ✅ Mitigadas |
| 🟡 Media | 2 | ✅ Mitigadas |
| 🔵 Optimización | 1 | ✅ Implementada |

---

## Vulnerabilidades CRÍTICAS arregladas

### CRIT-1 — Robo de fees en `finalize_release`
**Vector:** Cualquier `caller` podía pasar su propio token account como `treasury_token` y robar el fee del 2.5%.
**Fix:** `programs/workspace/src/lib.rs` `FinalizeRelease`:
```rust
constraint = treasury_token.mint == escrow.mint @ ErrorCode::InvalidMint,
constraint = treasury_token.owner == config.treasury @ ErrorCode::Unauthorized,
```

### CRIT-2/3/4 — Token accounts sin validar en `resolve_dispute`
**Vector:** El árbitro (o transacción fabricada con su firma) podía redirigir `receiver_token`, `depositor_token` o `treasury_token` a wallets arbitrarias.
**Fix:** `ResolveDispute` ahora valida `mint == escrow.mint` y `owner` correcto en las 3 cuentas.

---

## Vulnerabilidades ALTAS arregladas

### HIGH-1 — Self-escrow attack
**Vector:** `receiver == depositor` permitía control unilateral del flujo (firmar ambas confirmaciones y liberar fondos al mismo wallet menos el fee).
**Fix:** `initialize_escrow` valida:
```rust
require!(receiver != Pubkey::default(), ErrorCode::InvalidParameter);
require!(receiver != depositor_key, ErrorCode::SelfEscrow);
```

### HIGH-2 — Treasury/Arbiter con clave nula
**Vector:** `Pubkey::default()` como treasury o arbiter dejaba el sistema en estado indefinido.
**Fix:** `initialize_config` valida no-default keys.

---

## Vulnerabilidades MEDIAS arregladas

### MED-1 — Anti-griefing en disputas
**Vector:** Tras ambas confirmaciones, una parte podía abrir disputa para bloquear el `finalize_release`.
**Fix:** `open_dispute` rechaza si ambas partes ya confirmaron:
```rust
require!(
    !(escrow.depositor_released && escrow.receiver_released),
    ErrorCode::AlreadyConfirmed
);
```

### MED-2 — Flash-escrow / mismo bloque
**Vector:** Crear, fondear y liberar en pocos segundos abría vectores de manipulación.
**Fix:** `MIN_ESCROW_DURATION = 60s` enforced on-chain.

---

## Optimizaciones (rent reclaim)

`cancel_before_funding`, `refund_after_expiry`, `finalize_release` y `resolve_dispute` ahora **cierran** el escrow account y la vault PDA via `token::close_account`, recuperando ~0.003 SOL de rent por escrow finalizado.

---

## Recomendaciones para producción (mainnet)

1. **Auditoría externa** antes de mainnet (OtterSec, Halborn, Neodyme).
2. **Config global único** (`seeds = [b"config"]`) en lugar de per-depositor — actualmente cualquier user puede crear su propia Config con fee=0 y treasury propio.
3. **RPC dedicada** (Helius/QuickNode) — `api.devnet.solana.com` tiene rate-limit severo.
4. **Indexador off-chain** (Supabase + Helius webhooks) para listar escrows sin scan secuencial.
5. **Multisig** en treasury y arbiter (Squads Protocol).
6. **Aumentar `MIN_ESCROW_DURATION`** a 1 hora (3600s) en mainnet.
7. **SIWS (Sign-In With Solana)** para auth en lugar de session cookies.
