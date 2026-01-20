-- ============================================
-- AMANTRA - Escrow & Settlement Tables
-- Migration: 003_escrow_settlement_tables
-- ============================================

-- Escrow Accounts table
-- Tracks bank escrow accounts for each contract
CREATE TABLE IF NOT EXISTS escrow_accounts (
    id UUID PRIMARY KEY,
    contract_id VARCHAR(255) NOT NULL UNIQUE,
    bank_account_id VARCHAR(255) NOT NULL,
    bank_code VARCHAR(50) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    balance DECIMAL(20, 2) NOT NULL DEFAULT 0,
    frozen_amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT chk_escrow_balance_positive CHECK (balance >= 0),
    CONSTRAINT chk_escrow_frozen_positive CHECK (frozen_amount >= 0),
    CONSTRAINT chk_escrow_frozen_lte_balance CHECK (frozen_amount <= balance),
    CONSTRAINT chk_escrow_status CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED'))
);

-- Indexes for escrow accounts
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_contract_id ON escrow_accounts(contract_id);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_bank_code ON escrow_accounts(bank_code);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_status ON escrow_accounts(status);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_balance ON escrow_accounts(balance) WHERE balance > 0;

-- Escrow Transactions table
-- Audit trail for all escrow account operations
CREATE TABLE IF NOT EXISTS escrow_transactions (
    id UUID PRIMARY KEY,
    escrow_account_id UUID NOT NULL REFERENCES escrow_accounts(id),
    type VARCHAR(20) NOT NULL,
    amount DECIMAL(20, 2) NOT NULL,
    balance_before DECIMAL(20, 2) NOT NULL,
    balance_after DECIMAL(20, 2) NOT NULL,
    reference VARCHAR(255) NOT NULL,
    description TEXT,
    bank_reference VARCHAR(255),
    performed_by VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_tx_type CHECK (type IN ('CREDIT', 'DEBIT', 'FREEZE', 'UNFREEZE')),
    CONSTRAINT chk_tx_amount_positive CHECK (amount > 0)
);

-- Indexes for escrow transactions
CREATE INDEX IF NOT EXISTS idx_escrow_tx_account_id ON escrow_transactions(escrow_account_id);
CREATE INDEX IF NOT EXISTS idx_escrow_tx_type ON escrow_transactions(type);
CREATE INDEX IF NOT EXISTS idx_escrow_tx_reference ON escrow_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_escrow_tx_timestamp ON escrow_transactions(timestamp);

-- Settlements table
-- Tracks settlement lifecycle from initiation to completion
CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY,
    contract_id VARCHAR(255) NOT NULL,
    escrow_account_id UUID NOT NULL REFERENCES escrow_accounts(id),
    reference_id VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'INITIATED',

    -- Split payment details (denormalized for performance)
    total_amount DECIMAL(20, 2) NOT NULL,
    seller_amount DECIMAL(20, 2) NOT NULL,
    platform_fee DECIMAL(20, 2) NOT NULL,
    mediator_fee DECIMAL(20, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'IDR',

    -- Bank transfer details
    bank_batch_reference VARCHAR(255),
    seller_transfer_status VARCHAR(50),
    seller_transfer_reference VARCHAR(255),
    platform_transfer_status VARCHAR(50),
    platform_transfer_reference VARCHAR(255),
    mediator_transfer_status VARCHAR(50),
    mediator_transfer_reference VARCHAR(255),

    -- Blockchain details
    blockchain_tx_hash VARCHAR(66),
    block_number BIGINT,
    blockchain_timestamp TIMESTAMP WITH TIME ZONE,

    -- Metadata
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    initiated_by VARCHAR(255) NOT NULL,
    initiated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT chk_settlement_status CHECK (status IN (
        'INITIATED', 'ESCROW_LOCKED', 'BANK_PENDING', 'BANK_SUCCESS',
        'BANK_FAILED', 'BLOCKCHAIN_PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'
    )),
    CONSTRAINT chk_settlement_amounts CHECK (
        seller_amount + platform_fee + mediator_fee = total_amount
    ),
    CONSTRAINT chk_settlement_amounts_positive CHECK (
        total_amount > 0 AND seller_amount >= 0 AND platform_fee >= 0 AND mediator_fee >= 0
    )
);

-- Indexes for settlements
CREATE INDEX IF NOT EXISTS idx_settlements_contract_id ON settlements(contract_id);
CREATE INDEX IF NOT EXISTS idx_settlements_escrow_account_id ON settlements(escrow_account_id);
CREATE INDEX IF NOT EXISTS idx_settlements_reference_id ON settlements(reference_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_initiated_at ON settlements(initiated_at);
CREATE INDEX IF NOT EXISTS idx_settlements_completed_at ON settlements(completed_at);
CREATE INDEX IF NOT EXISTS idx_settlements_blockchain_tx_hash ON settlements(blockchain_tx_hash);
CREATE INDEX IF NOT EXISTS idx_settlements_bank_pending ON settlements(status, updated_at)
    WHERE status = 'BANK_PENDING';
CREATE INDEX IF NOT EXISTS idx_settlements_blockchain_pending ON settlements(status)
    WHERE status = 'BLOCKCHAIN_PENDING';
CREATE INDEX IF NOT EXISTS idx_settlements_retryable ON settlements(status, retry_count)
    WHERE status = 'BANK_FAILED';

-- Settlement Events table
-- Event sourcing for settlement state changes
CREATE TABLE IF NOT EXISTS settlement_events (
    id UUID PRIMARY KEY,
    settlement_id UUID NOT NULL REFERENCES settlements(id),
    event_type VARCHAR(100) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_event_type CHECK (event_type IN (
        'INITIATED', 'ESCROW_LOCKED', 'BANK_TRANSFER_STARTED', 'BANK_TRANSFER_SUCCESS',
        'BANK_TRANSFER_FAILED', 'BLOCKCHAIN_TX_SUBMITTED', 'BLOCKCHAIN_TX_CONFIRMED',
        'COMPLETED', 'FAILED', 'CANCELLED', 'RETRY_ATTEMPTED'
    ))
);

-- Indexes for settlement events
CREATE INDEX IF NOT EXISTS idx_settlement_events_settlement_id ON settlement_events(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_events_event_type ON settlement_events(event_type);
CREATE INDEX IF NOT EXISTS idx_settlement_events_timestamp ON settlement_events(timestamp);

-- Bank Callbacks table
-- Audit trail for bank callback processing
CREATE TABLE IF NOT EXISTS bank_callbacks (
    id UUID PRIMARY KEY,
    settlement_id UUID REFERENCES settlements(id),
    bank_code VARCHAR(50) NOT NULL,
    reference_id VARCHAR(255) NOT NULL,
    callback_status VARCHAR(50) NOT NULL,
    processing_result VARCHAR(50) NOT NULL,
    raw_payload JSONB NOT NULL,
    signature VARCHAR(512),
    signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- Indexes for bank callbacks
CREATE INDEX IF NOT EXISTS idx_bank_callbacks_settlement_id ON bank_callbacks(settlement_id);
CREATE INDEX IF NOT EXISTS idx_bank_callbacks_reference_id ON bank_callbacks(reference_id);
CREATE INDEX IF NOT EXISTS idx_bank_callbacks_processing_result ON bank_callbacks(processing_result);
CREATE INDEX IF NOT EXISTS idx_bank_callbacks_received_at ON bank_callbacks(received_at);

-- Settlement Reconciliation Reports table
-- Extended from QRIS reconciliation reports
CREATE TABLE IF NOT EXISTS settlement_reconciliation_reports (
    id UUID PRIMARY KEY,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_settlements_checked INTEGER NOT NULL DEFAULT 0,
    total_escrow_accounts_checked INTEGER NOT NULL DEFAULT 0,
    db_settled_count INTEGER NOT NULL DEFAULT 0,
    bank_confirmed_count INTEGER NOT NULL DEFAULT 0,
    blockchain_settled_count INTEGER NOT NULL DEFAULT 0,
    discrepancy_count INTEGER NOT NULL DEFAULT 0,
    repair_attempt_count INTEGER NOT NULL DEFAULT 0,
    repair_success_count INTEGER NOT NULL DEFAULT 0,
    total_settled_amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
    total_platform_fees DECIMAL(20, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    report_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_recon_status CHECK (status IN ('COMPLETED', 'PARTIAL', 'FAILED'))
);

-- Index for reconciliation reports
CREATE INDEX IF NOT EXISTS idx_settlement_recon_generated_at ON settlement_reconciliation_reports(generated_at);
CREATE INDEX IF NOT EXISTS idx_settlement_recon_status ON settlement_reconciliation_reports(status);

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Note: update_updated_at_column function created in migration 002

CREATE TRIGGER update_escrow_accounts_updated_at
    BEFORE UPDATE ON escrow_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settlements_updated_at
    BEFORE UPDATE ON settlements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE escrow_accounts IS 'Bank escrow accounts holding funds for AMANTRA contracts';
COMMENT ON TABLE escrow_transactions IS 'Audit trail of all escrow account balance changes';
COMMENT ON TABLE settlements IS 'Settlement records tracking fund distribution lifecycle';
COMMENT ON TABLE settlement_events IS 'Event sourcing for settlement state transitions';
COMMENT ON TABLE bank_callbacks IS 'Audit trail of bank callback/webhook processing';
COMMENT ON TABLE settlement_reconciliation_reports IS 'Daily 3-way reconciliation reports (DB/Bank/Blockchain)';

COMMENT ON COLUMN escrow_accounts.frozen_amount IS 'Amount locked for pending settlement';
COMMENT ON COLUMN escrow_accounts.version IS 'Optimistic locking version number';

COMMENT ON COLUMN settlements.reference_id IS 'Unique idempotency key for settlement';
COMMENT ON COLUMN settlements.bank_batch_reference IS 'Bank batch/transaction reference for split transfer';
COMMENT ON COLUMN settlements.blockchain_tx_hash IS 'Ethereum transaction hash for markSettled call';
COMMENT ON COLUMN settlements.retry_count IS 'Number of retry attempts for failed settlements';

COMMENT ON COLUMN settlement_events.data IS 'Additional event-specific data as JSON';
