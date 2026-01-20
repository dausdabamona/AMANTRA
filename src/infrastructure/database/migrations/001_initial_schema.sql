-- =============================================
-- AMANTRA Database Schema
-- Migration: 001_initial_schema
-- Description: Initial database setup with event sourcing
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ENUM Types
-- =============================================

CREATE TYPE contract_status AS ENUM (
    'CREATED',
    'FUNDED',
    'VERIFIED',
    'SETTLED',
    'DISPUTED',
    'CANCELLED'
);

CREATE TYPE party_role AS ENUM (
    'SELLER',
    'BUYER',
    'MEDIATOR'
);

CREATE TYPE user_role AS ENUM (
    'ADMIN',
    'OPERATOR',
    'USER',
    'MEDIATOR',
    'AUDITOR'
);

CREATE TYPE payment_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'PAID',
    'FAILED',
    'EXPIRED',
    'REFUNDED'
);

CREATE TYPE escrow_status AS ENUM (
    'ACTIVE',
    'RELEASED',
    'REFUNDED',
    'FROZEN'
);

-- =============================================
-- Users & Authentication
-- =============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'USER',
    wallet_address VARCHAR(42),
    bank_account_number VARCHAR(30),
    bank_name VARCHAR(100),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_wallet ON users(wallet_address) WHERE wallet_address IS NOT NULL;

-- =============================================
-- Contracts (Aggregate Root)
-- =============================================

CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_number VARCHAR(50) UNIQUE NOT NULL,
    status contract_status NOT NULL DEFAULT 'CREATED',
    version INTEGER NOT NULL DEFAULT 1,

    -- Parties
    seller_id UUID NOT NULL REFERENCES users(id),
    buyer_id UUID NOT NULL REFERENCES users(id),
    mediator_id UUID REFERENCES users(id),

    -- Terms
    description TEXT NOT NULL,
    goods_description TEXT NOT NULL,
    quantity DECIMAL(18, 4) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    unit_price_amount BIGINT NOT NULL,
    unit_price_currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
    total_amount BIGINT NOT NULL,
    delivery_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    quality_requirements JSONB DEFAULT '[]',
    dispute_resolution_days INTEGER NOT NULL DEFAULT 7,

    -- Fee Structure (immutable after creation)
    platform_fee_bps INTEGER NOT NULL,
    mediator_fee_bps INTEGER DEFAULT 0,
    platform_fixed_fee BIGINT DEFAULT 0,
    minimum_platform_fee BIGINT DEFAULT 0,
    maximum_platform_fee BIGINT DEFAULT 0,

    -- External References
    escrow_account_id VARCHAR(50),
    blockchain_tx_hash VARCHAR(66),
    blockchain_contract_id VARCHAR(66),
    qris_payment_code VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    funded_at TIMESTAMP WITH TIME ZONE,
    verified_at TIMESTAMP WITH TIME ZONE,
    settled_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    disputed_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT chk_different_parties CHECK (seller_id != buyer_id),
    CONSTRAINT chk_positive_amount CHECK (total_amount > 0),
    CONSTRAINT chk_valid_fee_bps CHECK (platform_fee_bps >= 0 AND platform_fee_bps <= 10000)
);

CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_seller ON contracts(seller_id);
CREATE INDEX idx_contracts_buyer ON contracts(buyer_id);
CREATE INDEX idx_contracts_number ON contracts(contract_number);
CREATE INDEX idx_contracts_created ON contracts(created_at DESC);
CREATE INDEX idx_contracts_active ON contracts(status) WHERE status IN ('CREATED', 'FUNDED', 'VERIFIED', 'DISPUTED');

-- =============================================
-- Event Store (Event Sourcing)
-- =============================================

CREATE TABLE domain_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    stored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT unique_aggregate_version UNIQUE (aggregate_id, version)
);

CREATE INDEX idx_events_aggregate ON domain_events(aggregate_id);
CREATE INDEX idx_events_type ON domain_events(event_type);
CREATE INDEX idx_events_occurred ON domain_events(occurred_at DESC);
CREATE INDEX idx_events_unpublished ON domain_events(stored_at) WHERE published_at IS NULL;

-- =============================================
-- Payments (QRIS)
-- =============================================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES contracts(id),

    -- QRIS Details
    qris_reference_id VARCHAR(100) UNIQUE,
    qris_payment_code VARCHAR(100),
    qris_merchant_id VARCHAR(50),

    -- Amount
    amount BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'IDR',

    -- Status
    status payment_status NOT NULL DEFAULT 'PENDING',

    -- External References
    bank_reference_id VARCHAR(100),
    settlement_reference_id VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE,
    expired_at TIMESTAMP WITH TIME ZONE,

    -- Idempotency
    idempotency_key VARCHAR(100) UNIQUE
);

CREATE INDEX idx_payments_contract ON payments(contract_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_qris_ref ON payments(qris_reference_id) WHERE qris_reference_id IS NOT NULL;
CREATE INDEX idx_payments_idempotency ON payments(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- =============================================
-- Escrow Accounts
-- =============================================

CREATE TABLE escrow_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES contracts(id),

    -- Bank Details
    bank_account_id VARCHAR(50) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,

    -- Balance
    balance BIGINT NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'IDR',

    -- Status
    status escrow_status NOT NULL DEFAULT 'ACTIVE',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    released_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT unique_contract_escrow UNIQUE (contract_id)
);

CREATE INDEX idx_escrow_contract ON escrow_accounts(contract_id);
CREATE INDEX idx_escrow_status ON escrow_accounts(status);

-- =============================================
-- Escrow Transactions
-- =============================================

CREATE TABLE escrow_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escrow_account_id UUID NOT NULL REFERENCES escrow_accounts(id),

    -- Transaction Details
    transaction_type VARCHAR(20) NOT NULL, -- CREDIT, DEBIT, FEE
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,

    -- Reference
    reference_type VARCHAR(50) NOT NULL, -- PAYMENT, SETTLEMENT, REFUND, FEE
    reference_id UUID NOT NULL,

    -- Description
    description TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_escrow_tx_account ON escrow_transactions(escrow_account_id);
CREATE INDEX idx_escrow_tx_created ON escrow_transactions(created_at DESC);

-- =============================================
-- Audit Log (Comprehensive)
-- =============================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,

    -- Who
    performed_by UUID REFERENCES users(id),
    performed_by_role user_role,

    -- Details
    old_values JSONB,
    new_values JSONB,
    changes JSONB,

    -- Context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    correlation_id VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_performer ON audit_logs(performed_by) WHERE performed_by IS NOT NULL;
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id) WHERE correlation_id IS NOT NULL;

-- =============================================
-- Blockchain Sync Status
-- =============================================

CREATE TABLE blockchain_sync (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES contracts(id),

    -- Chain Info
    chain_id INTEGER NOT NULL,
    contract_address VARCHAR(66),

    -- State
    last_synced_block BIGINT,
    on_chain_status VARCHAR(20),
    on_chain_data JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sync_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT unique_contract_chain UNIQUE (contract_id, chain_id)
);

CREATE INDEX idx_blockchain_contract ON blockchain_sync(contract_id);

-- =============================================
-- Reconciliation Records
-- =============================================

CREATE TABLE reconciliation_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Period
    reconciliation_date DATE NOT NULL,

    -- Totals
    total_contracts INTEGER NOT NULL DEFAULT 0,
    total_payments BIGINT NOT NULL DEFAULT 0,
    total_settlements BIGINT NOT NULL DEFAULT 0,
    total_fees_collected BIGINT NOT NULL DEFAULT 0,

    -- Discrepancies
    discrepancies JSONB DEFAULT '[]',
    discrepancy_count INTEGER NOT NULL DEFAULT 0,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, REQUIRES_REVIEW
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT unique_recon_date UNIQUE (reconciliation_date)
);

CREATE INDEX idx_recon_date ON reconciliation_records(reconciliation_date DESC);
CREATE INDEX idx_recon_status ON reconciliation_records(status);

-- =============================================
-- Outbox Pattern (for reliable event publishing)
-- =============================================

CREATE TABLE outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_outbox_unprocessed ON outbox(created_at) WHERE processed_at IS NULL;

-- =============================================
-- Functions & Triggers
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_contracts_updated_at
    BEFORE UPDATE ON contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_escrow_updated_at
    BEFORE UPDATE ON escrow_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to increment contract version (optimistic locking)
CREATE OR REPLACE FUNCTION increment_contract_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER increment_contract_version_trigger
    BEFORE UPDATE ON contracts
    FOR EACH ROW
    EXECUTE FUNCTION increment_contract_version();

-- =============================================
-- Initial Data
-- =============================================

-- Create system user for automated operations
INSERT INTO users (id, email, password_hash, full_name, role, is_verified, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'system@amantra.id',
    '$2b$10$placeholder',
    'AMANTRA System',
    'ADMIN',
    true,
    true
);

COMMENT ON TABLE contracts IS 'Core contract entity - aggregate root for transactions';
COMMENT ON TABLE domain_events IS 'Event store for event sourcing pattern';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for compliance';
COMMENT ON TABLE outbox IS 'Transactional outbox for reliable event publishing';
