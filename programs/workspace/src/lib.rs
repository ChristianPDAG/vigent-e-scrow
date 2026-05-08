use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("bzopvkvUsqbUCy47wWmkvR53U2GecG9ZJD7yQg3cDtp");

#[program]
pub mod workspace {
    use super::*;

    // fee_bps: u16, Platform fee in basis points, 250 = 2.5%
    // treasury: Pubkey, Fee collection wallet address, 9PJ8I...3555
    // arbiter: Pubkey, Dispute resolution authority wallet, 7xK2m...A1bC
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        fee_bps: u16,
        treasury: Pubkey,
        arbiter: Pubkey,
    ) -> Result<()> {
        require!(fee_bps <= 10000, ErrorCode::InvalidParameter);
        let config = &mut ctx.accounts.config;
        config.bump = ctx.bumps.config;
        config.authority = ctx.accounts.authority.key();
        config.is_active = true;
        config.is_paused = false;
        config.fee_bps = fee_bps;
        config.treasury = treasury;
        config.arbiter = arbiter;
        config.version = 1;
        config.escrow_count = 0;

        emit!(ConfigInitialized {
            authority: config.authority,
            fee_bps,
            treasury,
            arbiter,
        });

        Ok(())
    }

    // escrow_id: u64, Unique escrow identifier, 1
    // receiver: Pubkey, Wallet that will receive funds on release
    // amount: u64, Token amount to escrow, 1000000 = 1 USDC
    // expires_at: i64, Unix timestamp for escrow expiry, 1710000000
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        escrow_id: u64,
        receiver: Pubkey,
        amount: u64,
        expires_at: i64,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        let now = Clock::get()?.unix_timestamp;
        require!(expires_at > now, ErrorCode::InvalidParameter);

        let depositor_key = ctx.accounts.depositor.key();
        let mint_key = ctx.accounts.mint.key();
        let vault_key = ctx.accounts.vault.key();

        let escrow = &mut ctx.accounts.escrow;
        escrow.escrow_id = escrow_id;
        escrow.depositor = depositor_key;
        escrow.receiver = receiver;
        escrow.mint = mint_key;
        escrow.vault = vault_key;
        escrow.amount = amount;
        escrow.status = EscrowStatus::Created;
        escrow.created_at = now;
        escrow.expires_at = expires_at;
        escrow.depositor_released = false;
        escrow.receiver_released = false;
        escrow.release_session_hash = [0u8; 32];
        escrow.session_expires_at = 0;
        escrow.dispute_reason = 0;
        escrow.bump = ctx.bumps.escrow;
        escrow.vault_bump = ctx.bumps.vault;

        let config = &mut ctx.accounts.config;
        config.escrow_count = config.escrow_count
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;

        emit!(EscrowCreated {
            escrow_id,
            depositor: depositor_key,
            receiver,
            mint: mint_key,
            vault: vault_key,
            amount,
            expires_at,
            created_at: now,
        });

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Created, ErrorCode::InvalidStatus);
        let now = Clock::get()?.unix_timestamp;
        require!(now < escrow.expires_at, ErrorCode::EscrowExpired);
        let amount = escrow.amount;
        let escrow_id = escrow.escrow_id;
        let depositor_key = escrow.depositor;
        let vault_key = escrow.vault;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
        )?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Funded;

        emit!(FundsDeposited {
            escrow_id,
            depositor: depositor_key,
            vault: vault_key,
            amount,
            funded_at: now,
        });

        Ok(())
    }

    pub fn start_release_session(
        ctx: Context<StartReleaseSession>,
        session_hash: [u8; 32],
        session_expires_at: i64,
    ) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Funded
                || escrow.status == EscrowStatus::ReleaseStarted,
            ErrorCode::InvalidStatus
        );
        let now = Clock::get()?.unix_timestamp;
        require!(now < escrow.expires_at, ErrorCode::EscrowExpired);
        require!(session_expires_at > now, ErrorCode::InvalidParameter);
        require!(session_expires_at <= escrow.expires_at, ErrorCode::InvalidParameter);

        let caller_key = ctx.accounts.caller.key();
        require!(
            caller_key == escrow.depositor || caller_key == escrow.receiver,
            ErrorCode::Unauthorized
        );

        let escrow_id = escrow.escrow_id;

        let escrow = &mut ctx.accounts.escrow;
        escrow.release_session_hash = session_hash;
        escrow.session_expires_at = session_expires_at;
        escrow.depositor_released = false;
        escrow.receiver_released = false;
        escrow.status = EscrowStatus::ReleaseStarted;

        emit!(ReleaseSessionStarted {
            escrow_id,
            session_hash,
            session_expires_at,
            initiated_by: caller_key,
        });

        Ok(())
    }

    pub fn confirm_release_as_depositor(
        ctx: Context<ConfirmAsDepositor>,
        session_hash: [u8; 32],
    ) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::ReleaseStarted,
            ErrorCode::InvalidStatus
        );
        let now = Clock::get()?.unix_timestamp;
        require!(now < escrow.session_expires_at, ErrorCode::SessionExpired);
        require!(
            session_hash == escrow.release_session_hash,
            ErrorCode::InvalidSessionHash
        );
        require!(!escrow.depositor_released, ErrorCode::AlreadyConfirmed);

        let escrow_id = escrow.escrow_id;
        let depositor_key = escrow.depositor;

        let escrow = &mut ctx.accounts.escrow;
        escrow.depositor_released = true;

        emit!(ReleaseConfirmed {
            escrow_id,
            confirmer: depositor_key,
            is_depositor: true,
        });

        Ok(())
    }

    pub fn confirm_release_as_receiver(
        ctx: Context<ConfirmAsReceiver>,
        session_hash: [u8; 32],
    ) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::ReleaseStarted,
            ErrorCode::InvalidStatus
        );
        let now = Clock::get()?.unix_timestamp;
        require!(now < escrow.session_expires_at, ErrorCode::SessionExpired);
        require!(
            session_hash == escrow.release_session_hash,
            ErrorCode::InvalidSessionHash
        );
        require!(!escrow.receiver_released, ErrorCode::AlreadyConfirmed);

        let escrow_id = escrow.escrow_id;
        let receiver_key = escrow.receiver;

        let escrow = &mut ctx.accounts.escrow;
        escrow.receiver_released = true;

        emit!(ReleaseConfirmed {
            escrow_id,
            confirmer: receiver_key,
            is_depositor: false,
        });

        Ok(())
    }

    pub fn finalize_release(ctx: Context<FinalizeRelease>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::ReleaseStarted,
            ErrorCode::InvalidStatus
        );
        require!(escrow.depositor_released, ErrorCode::NotFullyConfirmed);
        require!(escrow.receiver_released, ErrorCode::NotFullyConfirmed);

        let depositor_key = escrow.depositor;
        let receiver_key = escrow.receiver;
        let escrow_id = escrow.escrow_id;
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let vault_bump = [escrow.vault_bump];
        let vault_seeds = &[
            b"vault",
            depositor_key.as_ref(),
            &escrow_id_bytes,
            &vault_bump,
        ];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

        let amount = ctx.accounts.vault.amount;
        let fee_bps = ctx.accounts.config.fee_bps;
        let fee = amount
            .checked_mul(fee_bps as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?;
        let net_amount = amount.checked_sub(fee).ok_or(ErrorCode::MathOverflow)?;

        if net_amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.receiver_token.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                net_amount,
            )?;
        }

        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.treasury_token.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                fee,
            )?;
        }

        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Released;

        emit!(EscrowFinalized {
            escrow_id,
            receiver: receiver_key,
            amount_net: net_amount,
            fee,
            released_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn cancel_before_funding(ctx: Context<CancelBeforeFunding>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Created, ErrorCode::InvalidStatus);

        let escrow_id = escrow.escrow_id;
        let depositor_key = escrow.depositor;

        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Cancelled;

        emit!(EscrowCancelled {
            escrow_id,
            cancelled_by: depositor_key,
            reason: 0,
        });

        Ok(())
    }

    pub fn refund_after_expiry(ctx: Context<RefundAfterExpiry>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= escrow.expires_at, ErrorCode::NotExpired);
        require!(
            escrow.status == EscrowStatus::Funded
                || escrow.status == EscrowStatus::ReleaseStarted,
            ErrorCode::InvalidStatus
        );

        let depositor_key = escrow.depositor;
        let escrow_id = escrow.escrow_id;
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let vault_bump = [escrow.vault_bump];
        let vault_seeds = &[
            b"vault",
            depositor_key.as_ref(),
            &escrow_id_bytes,
            &vault_bump,
        ];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

        let amount = ctx.accounts.vault.amount;
        if amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.depositor_token.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                amount,
            )?;
        }

        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Expired;

        emit!(EscrowRefunded {
            escrow_id,
            depositor: depositor_key,
            amount,
            refunded_at: now,
        });

        Ok(())
    }

    pub fn open_dispute(
        ctx: Context<OpenDispute>,
        reason: u8,
    ) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Funded
                || escrow.status == EscrowStatus::ReleaseStarted,
            ErrorCode::InvalidStatus
        );
        require!(reason > 0, ErrorCode::InvalidParameter);

        let caller_key = ctx.accounts.caller.key();
        require!(
            caller_key == escrow.depositor || caller_key == escrow.receiver,
            ErrorCode::Unauthorized
        );

        let escrow_id = escrow.escrow_id;

        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Disputed;
        escrow.dispute_reason = reason;

        emit!(DisputeOpened {
            escrow_id,
            opened_by: caller_key,
            reason,
        });

        Ok(())
    }

    // resolve_in_favor: bool, true = release to receiver, false = refund to depositor
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        resolve_in_favor_of_receiver: bool,
    ) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Disputed,
            ErrorCode::InvalidStatus
        );

        let depositor_key = escrow.depositor;
        let receiver_key = escrow.receiver;
        let escrow_id = escrow.escrow_id;
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let vault_bump = [escrow.vault_bump];
        let vault_seeds = &[
            b"vault",
            depositor_key.as_ref(),
            &escrow_id_bytes,
            &vault_bump,
        ];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

        let amount = ctx.accounts.vault.amount;
        let arbiter_key = ctx.accounts.arbiter.key();

        if resolve_in_favor_of_receiver {
            let fee_bps = ctx.accounts.config.fee_bps;
            let fee = amount
                .checked_mul(fee_bps as u64)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(10000)
                .ok_or(ErrorCode::MathOverflow)?;
            let net_amount = amount.checked_sub(fee).ok_or(ErrorCode::MathOverflow)?;

            if net_amount > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.receiver_token.to_account_info(),
                            authority: ctx.accounts.vault.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    net_amount,
                )?;
            }

            if fee > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.treasury_token.to_account_info(),
                            authority: ctx.accounts.vault.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    fee,
                )?;
            }

            let escrow = &mut ctx.accounts.escrow;
            escrow.status = EscrowStatus::Released;
        } else {
            if amount > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.depositor_token.to_account_info(),
                            authority: ctx.accounts.vault.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    amount,
                )?;
            }

            let escrow = &mut ctx.accounts.escrow;
            escrow.status = EscrowStatus::Cancelled;
        }

        emit!(DisputeResolved {
            escrow_id,
            resolved_by: arbiter_key,
            in_favor_of_receiver: resolve_in_favor_of_receiver,
            depositor: depositor_key,
            receiver: receiver_key,
            amount,
        });

        Ok(())
    }
}

// ============================================================
// ACCOUNTS CONTEXTS
// ============================================================

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        seeds = [b"config", authority.key().as_ref()],
        bump,
        payer = authority,
        space = 8 + Config::LEN
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// 7 accounts ✅
#[derive(Accounts)]
#[instruction(escrow_id: u64)]
pub struct InitializeEscrow<'info> {
    #[account(
        mut,
        seeds = [b"config", depositor.key().as_ref()],
        bump = config.bump,
        constraint = config.is_active && !config.is_paused @ ErrorCode::ConfigInactive,
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        seeds = [b"escrow", depositor.key().as_ref(), &escrow_id.to_le_bytes()],
        bump,
        payer = depositor,
        space = 8 + EscrowAccount::LEN
    )]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(
        init,
        seeds = [b"vault", depositor.key().as_ref(), &escrow_id.to_le_bytes()],
        bump,
        payer = depositor,
        token::mint = mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// 5 accounts ✅
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"escrow", depositor.key().as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
        constraint = escrow.depositor == depositor.key() @ ErrorCode::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(
        mut,
        seeds = [b"vault", depositor.key().as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = depositor_token.mint == escrow.mint @ ErrorCode::InvalidMint,
        constraint = depositor_token.owner == depositor.key() @ ErrorCode::Unauthorized,
    )]
    pub depositor_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// 2 accounts ✅
#[derive(Accounts)]
pub struct StartReleaseSession<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.depositor.as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub caller: Signer<'info>,
}

// 2 accounts ✅
#[derive(Accounts)]
pub struct ConfirmAsDepositor<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.depositor.as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
        constraint = escrow.depositor == depositor.key() @ ErrorCode::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowAccount>,
    pub depositor: Signer<'info>,
}

// 2 accounts ✅
#[derive(Accounts)]
pub struct ConfirmAsReceiver<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.depositor.as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
        constraint = escrow.receiver == receiver.key() @ ErrorCode::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowAccount>,
    pub receiver: Signer<'info>,
}

// 7 accounts ✅
#[derive(Accounts)]
pub struct FinalizeRelease<'info> {
    #[account(
        seeds = [b"config", escrow.depositor.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.depositor.as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(
        mut,
        seeds = [b"vault", escrow.depositor.as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = receiver_token.mint == escrow.mint @ ErrorCode::InvalidMint,
        constraint = receiver_token.owner == escrow.receiver @ ErrorCode::Unauthorized,
    )]
    pub receiver_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token: Account<'info, TokenAccount>,
    pub caller: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// 2 accounts ✅
#[derive(Accounts)]
pub struct OpenDispute<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.depositor.as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub caller: Signer<'info>,
}

// 8 accounts ✅
#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        seeds = [b"config", escrow.depositor.as_ref()],
        bump = config.bump,
        constraint = config.arbiter == arbiter.key() @ ErrorCode::Unauthorized,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.depositor.as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(
        mut,
        seeds = [b"vault", escrow.depositor.as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub receiver_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub depositor_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token: Account<'info, TokenAccount>,
    pub arbiter: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// 2 accounts ✅
#[derive(Accounts)]
pub struct CancelBeforeFunding<'info> {
    #[account(
        mut,
        seeds = [b"escrow", depositor.key().as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
        constraint = escrow.depositor == depositor.key() @ ErrorCode::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowAccount>,
    pub depositor: Signer<'info>,
}

// 5 accounts ✅
#[derive(Accounts)]
pub struct RefundAfterExpiry<'info> {
    #[account(
        mut,
        seeds = [b"escrow", depositor.key().as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
        constraint = escrow.depositor == depositor.key() @ ErrorCode::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(
        mut,
        seeds = [b"vault", depositor.key().as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = depositor_token.mint == escrow.mint @ ErrorCode::InvalidMint,
        constraint = depositor_token.owner == depositor.key() @ ErrorCode::Unauthorized,
    )]
    pub depositor_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ============================================================
// STATE
// ============================================================

#[account]
pub struct Config {
    pub bump: u8,
    pub authority: Pubkey,
    pub is_active: bool,
    pub is_paused: bool,
    pub fee_bps: u16,
    pub treasury: Pubkey,
    pub arbiter: Pubkey,
    pub version: u8,
    pub escrow_count: u64,
}

impl Config {
    pub const LEN: usize = 1 + 32 + 1 + 1 + 2 + 32 + 32 + 1 + 8;
}

#[account]
pub struct EscrowAccount {
    pub escrow_id: u64,
    pub depositor: Pubkey,
    pub receiver: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub status: EscrowStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub depositor_released: bool,
    pub receiver_released: bool,
    pub release_session_hash: [u8; 32],
    pub session_expires_at: i64,
    pub dispute_reason: u8,
    pub bump: u8,
    pub vault_bump: u8,
}

impl EscrowAccount {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 1 + 8 + 8 + 1 + 1 + 32 + 8 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Created,
    Funded,
    ReleaseStarted,
    Released,
    Cancelled,
    Disputed,
    Expired,
}

// ============================================================
// EVENTS
// ============================================================

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub fee_bps: u16,
    pub treasury: Pubkey,
    pub arbiter: Pubkey,
}

#[event]
pub struct EscrowCreated {
    pub escrow_id: u64,
    pub depositor: Pubkey,
    pub receiver: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub created_at: i64,
}

#[event]
pub struct FundsDeposited {
    pub escrow_id: u64,
    pub depositor: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub funded_at: i64,
}

#[event]
pub struct ReleaseSessionStarted {
    pub escrow_id: u64,
    pub session_hash: [u8; 32],
    pub session_expires_at: i64,
    pub initiated_by: Pubkey,
}

#[event]
pub struct ReleaseConfirmed {
    pub escrow_id: u64,
    pub confirmer: Pubkey,
    pub is_depositor: bool,
}

#[event]
pub struct EscrowFinalized {
    pub escrow_id: u64,
    pub receiver: Pubkey,
    pub amount_net: u64,
    pub fee: u64,
    pub released_at: i64,
}

#[event]
pub struct EscrowCancelled {
    pub escrow_id: u64,
    pub cancelled_by: Pubkey,
    pub reason: u8,
}

#[event]
pub struct EscrowRefunded {
    pub escrow_id: u64,
    pub depositor: Pubkey,
    pub amount: u64,
    pub refunded_at: i64,
}

#[event]
pub struct DisputeOpened {
    pub escrow_id: u64,
    pub opened_by: Pubkey,
    pub reason: u8,
}

#[event]
pub struct DisputeResolved {
    pub escrow_id: u64,
    pub resolved_by: Pubkey,
    pub in_favor_of_receiver: bool,
    pub depositor: Pubkey,
    pub receiver: Pubkey,
    pub amount: u64,
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow occurred")]
    MathOverflow,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Config is inactive or paused")]
    ConfigInactive,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid parameter")]
    InvalidParameter,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid escrow status for this operation")]
    InvalidStatus,
    #[msg("Escrow has expired")]
    EscrowExpired,
    #[msg("Escrow has not expired yet")]
    NotExpired,
    #[msg("Release session has expired")]
    SessionExpired,
    #[msg("Invalid session hash")]
    InvalidSessionHash,
    #[msg("Already confirmed release")]
    AlreadyConfirmed,
    #[msg("Both parties must confirm before finalize")]
    NotFullyConfirmed,
    #[msg("Escrow is not in disputed state")]
    NotDisputed,
}
