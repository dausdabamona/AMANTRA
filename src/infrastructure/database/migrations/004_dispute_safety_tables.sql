-- ============================================
-- AMANTRA - Dispute Safety Tables
-- Migration: 004_dispute_safety_tables
--
-- SAFETY FIX: Tables to support dispute detection and handling.
-- ============================================

-- Processed disputes table
-- Tracks disputes that have been processed by the DisputeListenerService
-- Ensures idempotent processing across service restarts
CREATE TABLE IF NOT EXISTS processed_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(255) NOT NULL,
    reason_hash VARCHAR(66) NOT NULL,
    raised_by VARCHAR(42) NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL UNIQUE,
    escrow_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    settlements_frozen INTEGER NOT NULL DEFAULT 0,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for processed disputes
CREATE INDEX IF NOT EXISTS idx_processed_disputes_contract_id ON processed_disputes(contract_id);
CREATE INDEX IF NOT EXISTS idx_processed_disputes_block_number ON processed_disputes(block_number);
CREATE INDEX IF NOT EXISTS idx_processed_disputes_processed_at ON processed_disputes(processed_at);

-- Dispute resolutions table
-- Tracks how disputes were resolved
CREATE TABLE IF NOT EXISTS dispute_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(255) NOT NULL,
    resolution_type INTEGER NOT NULL, -- 0=CANCEL, 1=REFUND_BUYER, 2=PAY_SELLER, 3=CUSTOM_SPLIT
    resolution_hash VARCHAR(66) NOT NULL,
    resolved_by VARCHAR(42) NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL UNIQUE,
    settlement_id UUID REFERENCES settlements(id),
    escrow_account_id UUID REFERENCES escrow_accounts(id),
    action_taken VARCHAR(100),
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for dispute resolutions
CREATE INDEX IF NOT EXISTS idx_dispute_resolutions_contract_id ON dispute_resolutions(contract_id);
CREATE INDEX IF NOT EXISTS idx_dispute_resolutions_settlement_id ON dispute_resolutions(settlement_id);

-- Alter settlements table to add safety columns
ALTER TABLE settlements
ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS blocked_on_chain_status INTEGER,
ADD COLUMN IF NOT EXISTS dispute_reason_hash VARCHAR(66),
ADD COLUMN IF NOT EXISTS dispute_raised_by VARCHAR(42),
ADD COLUMN IF NOT EXISTS dispute_block_number BIGINT;

-- Index for safety-blocked settlements
CREATE INDEX IF NOT EXISTS idx_settlements_blocked ON settlements(status)
    WHERE status IN ('BLOCKED_BY_STATE_CHANGE', 'FROZEN_BY_DISPUTE');

-- Alter escrow_accounts table to add dispute tracking
ALTER TABLE escrow_accounts
ADD COLUMN IF NOT EXISTS dispute_freeze_reference VARCHAR(255),
ADD COLUMN IF NOT EXISTS dispute_frozen_at TIMESTAMP WITH TIME ZONE;

-- Safety audit log
-- Tracks all safety-related events for compliance
CREATE TABLE IF NOT EXISTS safety_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    contract_id VARCHAR(255),
    settlement_id UUID,
    escrow_account_id UUID,
    event_data JSONB NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO', -- INFO, WARNING, CRITICAL
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for safety audit log
CREATE INDEX IF NOT EXISTS idx_safety_audit_log_event_type ON safety_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_safety_audit_log_contract_id ON safety_audit_log(contract_id);
CREATE INDEX IF NOT EXISTS idx_safety_audit_log_settlement_id ON safety_audit_log(settlement_id);
CREATE INDEX IF NOT EXISTS idx_safety_audit_log_severity ON safety_audit_log(severity);
CREATE INDEX IF NOT EXISTS idx_safety_audit_log_created_at ON safety_audit_log(created_at);

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE processed_disputes IS 'Tracks disputes processed by DisputeListenerService for idempotency';
COMMENT ON TABLE dispute_resolutions IS 'Records how disputes were resolved and their outcomes';
COMMENT ON TABLE safety_audit_log IS 'Audit trail for all safety-related events (blocked settlements, frozen escrow)';

COMMENT ON COLUMN settlements.blocked_reason IS 'Human-readable reason why settlement was blocked';
COMMENT ON COLUMN settlements.blocked_at IS 'Timestamp when settlement was blocked by safety mechanism';
COMMENT ON COLUMN settlements.blocked_on_chain_status IS 'On-chain status that caused the block (if BLOCKED_BY_STATE_CHANGE)';
COMMENT ON COLUMN settlements.dispute_reason_hash IS 'Hash of dispute reason (if FROZEN_BY_DISPUTE)';
COMMENT ON COLUMN settlements.dispute_raised_by IS 'Address that raised the dispute (if FROZEN_BY_DISPUTE)';
COMMENT ON COLUMN settlements.dispute_block_number IS 'Block number where dispute was opened';

COMMENT ON COLUMN escrow_accounts.dispute_freeze_reference IS 'Reference ID for dispute-related freeze';
COMMENT ON COLUMN escrow_accounts.dispute_frozen_at IS 'Timestamp when escrow was frozen due to dispute';
