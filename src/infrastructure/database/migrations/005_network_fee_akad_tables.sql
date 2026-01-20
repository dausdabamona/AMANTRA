-- ============================================
-- AMANTRA - Network Fee & Akad Tables
-- Migration: 005_network_fee_akad_tables
--
-- ETHICAL PRINCIPLE: "Tidak boleh ada potongan tersembunyi"
-- (No hidden deductions allowed)
--
-- This migration adds:
-- 1. Network fee bearer tracking
-- 2. Akad statement storage
-- 3. Settlement network fee audit records
-- ============================================

-- ============================================
-- 1. Network Fee Bearer Enum Type
-- ============================================

-- Create enum type for network fee bearer
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'network_fee_bearer') THEN
        CREATE TYPE network_fee_bearer AS ENUM ('PLATFORM', 'SELLER', 'BUYER');
    END IF;
END$$;

COMMENT ON TYPE network_fee_bearer IS 'Who bears bank network transfer fees (BI-FAST/RTGS/interbank)';

-- ============================================
-- 2. Akad Statements Table
-- ============================================

-- Stores signed akad statements with fee disclosures
CREATE TABLE IF NOT EXISTS akad_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(255) NOT NULL UNIQUE,

    -- Fee structure (immutable from akad)
    total_amount DECIMAL(20, 2) NOT NULL,
    platform_fee DECIMAL(20, 2) NOT NULL,
    seller_amount DECIMAL(20, 2) NOT NULL,
    mediator_fee DECIMAL(20, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'IDR',

    -- Network fee configuration (immutable)
    network_fee_bearer network_fee_bearer NOT NULL,
    estimated_network_fee DECIMAL(20, 2) NOT NULL DEFAULT 0,
    seller_net_after_fees DECIMAL(20, 2) NOT NULL,

    -- Disclosure text and hash
    disclosure_text TEXT NOT NULL,
    statement_hash VARCHAR(66) NOT NULL,

    -- Blockchain record
    blockchain_tx_hash VARCHAR(66),
    block_number BIGINT,

    -- Signatures (stored as JSON for flexibility)
    buyer_signature JSONB,
    seller_signature JSONB,
    platform_signature JSONB,

    -- Metadata
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    signed_at TIMESTAMP WITH TIME ZONE,
    blockchain_recorded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_akad_amounts_positive CHECK (
        total_amount > 0 AND
        platform_fee >= 0 AND
        seller_amount >= 0 AND
        mediator_fee >= 0
    ),
    CONSTRAINT chk_akad_amounts_sum CHECK (
        platform_fee + seller_amount + mediator_fee = total_amount
    ),
    CONSTRAINT chk_akad_network_fee_positive CHECK (
        estimated_network_fee >= 0
    )
);

-- Indexes for akad statements
CREATE INDEX IF NOT EXISTS idx_akad_statements_contract_id ON akad_statements(contract_id);
CREATE INDEX IF NOT EXISTS idx_akad_statements_statement_hash ON akad_statements(statement_hash);
CREATE INDEX IF NOT EXISTS idx_akad_statements_network_fee_bearer ON akad_statements(network_fee_bearer);
CREATE INDEX IF NOT EXISTS idx_akad_statements_blockchain_tx ON akad_statements(blockchain_tx_hash);

-- ============================================
-- 3. Alter settlements table for network fees
-- ============================================

-- Add network fee columns to settlements table
ALTER TABLE settlements
ADD COLUMN IF NOT EXISTS network_fee_bearer network_fee_bearer,
ADD COLUMN IF NOT EXISTS estimated_network_fee DECIMAL(20, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_network_fee DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS seller_net_received DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS platform_net_received DECIMAL(20, 2),
ADD COLUMN IF NOT EXISTS network_fee_absorbed_by VARCHAR(20),
ADD COLUMN IF NOT EXISTS bank_receipt_hash VARCHAR(66),
ADD COLUMN IF NOT EXISTS akad_statement_id UUID REFERENCES akad_statements(id),
ADD COLUMN IF NOT EXISTS akad_statement_hash VARCHAR(66);

-- Index for network fee queries
CREATE INDEX IF NOT EXISTS idx_settlements_network_fee_bearer
    ON settlements(network_fee_bearer);
CREATE INDEX IF NOT EXISTS idx_settlements_akad_statement_id
    ON settlements(akad_statement_id);

-- ============================================
-- 4. Network Fee Audit Log Table
-- ============================================

-- Detailed audit trail for network fee handling
CREATE TABLE IF NOT EXISTS network_fee_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    settlement_id UUID NOT NULL REFERENCES settlements(id),
    contract_id VARCHAR(255) NOT NULL,
    akad_statement_id UUID REFERENCES akad_statements(id),

    -- Declared at akad
    declared_bearer network_fee_bearer NOT NULL,
    estimated_fee DECIMAL(20, 2) NOT NULL,

    -- Actual at settlement
    actual_fee DECIMAL(20, 2) NOT NULL,
    fee_variance DECIMAL(20, 2) NOT NULL,

    -- Net amounts
    seller_amount_declared DECIMAL(20, 2) NOT NULL,
    seller_net_received DECIMAL(20, 2) NOT NULL,
    platform_fee_declared DECIMAL(20, 2) NOT NULL,
    platform_net_received DECIMAL(20, 2) NOT NULL,
    mediator_fee_declared DECIMAL(20, 2) NOT NULL DEFAULT 0,
    mediator_net_received DECIMAL(20, 2) NOT NULL DEFAULT 0,

    -- Bank details
    bank_transfer_reference VARCHAR(255),
    bank_receipt_hash VARCHAR(66),
    bank_fee_breakdown JSONB,

    -- Compliance verification
    policy_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    variance_explanation TEXT,

    -- Metadata
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    recorded_by VARCHAR(255) NOT NULL,

    CONSTRAINT chk_network_audit_variance CHECK (
        fee_variance = actual_fee - estimated_fee
    )
);

-- Indexes for network fee audit log
CREATE INDEX IF NOT EXISTS idx_network_fee_audit_settlement_id
    ON network_fee_audit_log(settlement_id);
CREATE INDEX IF NOT EXISTS idx_network_fee_audit_contract_id
    ON network_fee_audit_log(contract_id);
CREATE INDEX IF NOT EXISTS idx_network_fee_audit_declared_bearer
    ON network_fee_audit_log(declared_bearer);
CREATE INDEX IF NOT EXISTS idx_network_fee_audit_policy_compliant
    ON network_fee_audit_log(policy_compliant);
CREATE INDEX IF NOT EXISTS idx_network_fee_audit_recorded_at
    ON network_fee_audit_log(recorded_at);

-- ============================================
-- 5. Contracts table update for network fees
-- ============================================

-- Add network fee columns to contracts table (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contracts') THEN
        ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS network_fee_bearer network_fee_bearer,
        ADD COLUMN IF NOT EXISTS estimated_network_fee DECIMAL(20, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS akad_statement_hash VARCHAR(66),
        ADD COLUMN IF NOT EXISTS akad_signed_at TIMESTAMP WITH TIME ZONE;
    END IF;
END$$;

-- ============================================
-- 6. Triggers
-- ============================================

-- Trigger to update akad_statements updated_at
CREATE TRIGGER update_akad_statements_updated_at
    BEFORE UPDATE ON akad_statements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. Views for Reporting
-- ============================================

-- View: Network fee compliance report
CREATE OR REPLACE VIEW v_network_fee_compliance AS
SELECT
    s.id AS settlement_id,
    s.contract_id,
    s.network_fee_bearer,
    s.estimated_network_fee,
    s.actual_network_fee,
    s.actual_network_fee - s.estimated_network_fee AS fee_variance,
    s.seller_amount AS seller_amount_declared,
    s.seller_net_received,
    s.platform_fee AS platform_fee_declared,
    s.platform_net_received,
    CASE
        WHEN s.network_fee_bearer = 'PLATFORM' AND s.seller_net_received >= s.seller_amount THEN TRUE
        WHEN s.network_fee_bearer = 'SELLER' AND s.seller_net_received >= (s.seller_amount - s.actual_network_fee) THEN TRUE
        WHEN s.network_fee_bearer = 'BUYER' AND s.seller_net_received >= s.seller_amount THEN TRUE
        ELSE FALSE
    END AS akad_compliant,
    s.completed_at AS settlement_date
FROM settlements s
WHERE s.status = 'COMPLETED'
  AND s.network_fee_bearer IS NOT NULL;

COMMENT ON VIEW v_network_fee_compliance IS 'Network fee compliance report for akad verification';

-- View: Daily network fee summary
CREATE OR REPLACE VIEW v_daily_network_fee_summary AS
SELECT
    DATE(s.completed_at) AS settlement_date,
    s.network_fee_bearer,
    COUNT(*) AS settlement_count,
    SUM(s.total_amount) AS total_settled,
    SUM(s.actual_network_fee) AS total_network_fees,
    SUM(s.actual_network_fee - s.estimated_network_fee) AS total_variance,
    AVG(s.actual_network_fee) AS avg_network_fee,
    COUNT(*) FILTER (
        WHERE (s.network_fee_bearer = 'PLATFORM' AND s.seller_net_received >= s.seller_amount)
           OR (s.network_fee_bearer = 'SELLER' AND s.seller_net_received >= (s.seller_amount - s.actual_network_fee))
           OR (s.network_fee_bearer = 'BUYER' AND s.seller_net_received >= s.seller_amount)
    ) AS compliant_count
FROM settlements s
WHERE s.status = 'COMPLETED'
  AND s.network_fee_bearer IS NOT NULL
  AND s.completed_at IS NOT NULL
GROUP BY DATE(s.completed_at), s.network_fee_bearer
ORDER BY settlement_date DESC, network_fee_bearer;

COMMENT ON VIEW v_daily_network_fee_summary IS 'Daily summary of network fees by bearer type';

-- ============================================
-- 8. Comments for Documentation
-- ============================================

COMMENT ON TABLE akad_statements IS
    'Stores signed akad statements with immutable fee disclosures - follows principle: Tidak boleh ada potongan tersembunyi';

COMMENT ON TABLE network_fee_audit_log IS
    'Detailed audit trail for network fee handling at settlement time';

COMMENT ON COLUMN akad_statements.network_fee_bearer IS
    'Who bears bank network transfer fees: PLATFORM, SELLER, or BUYER';

COMMENT ON COLUMN akad_statements.estimated_network_fee IS
    'Estimated bank network fee at time of akad (for disclosure)';

COMMENT ON COLUMN akad_statements.seller_net_after_fees IS
    'Calculated net amount seller will receive after network fees';

COMMENT ON COLUMN akad_statements.disclosure_text IS
    'Full disclosure text shown to all parties at contract creation';

COMMENT ON COLUMN akad_statements.statement_hash IS
    'SHA256 hash of akad statement - stored on blockchain for immutability';

COMMENT ON COLUMN settlements.network_fee_bearer IS
    'Declared network fee bearer from akad (immutable)';

COMMENT ON COLUMN settlements.actual_network_fee IS
    'Actual bank network fee charged at settlement';

COMMENT ON COLUMN settlements.seller_net_received IS
    'Net amount seller actually received after bank fees';

COMMENT ON COLUMN settlements.platform_net_received IS
    'Net amount platform actually received after bank fees';

COMMENT ON COLUMN network_fee_audit_log.policy_compliant IS
    'TRUE if settlement followed declared network fee policy';

COMMENT ON COLUMN network_fee_audit_log.variance_explanation IS
    'Explanation if actual fee differs significantly from estimate';

-- ============================================
-- Migration Complete
-- ============================================
