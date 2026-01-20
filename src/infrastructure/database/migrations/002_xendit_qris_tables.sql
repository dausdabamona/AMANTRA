-- ============================================
-- AMANTRA - Xendit QRIS Integration Tables
-- Migration: 002_xendit_qris_tables
-- ============================================

-- QRIS Invoices table
-- Stores all QRIS invoices created for contracts
CREATE TABLE IF NOT EXISTS qris_invoices (
    id UUID PRIMARY KEY,
    contract_id VARCHAR(255) NOT NULL,
    xendit_invoice_id VARCHAR(255) NOT NULL UNIQUE,
    external_id VARCHAR(255) NOT NULL UNIQUE,
    amount DECIMAL(20, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
    status VARCHAR(50) NOT NULL DEFAULT 'CREATED',
    invoice_url TEXT NOT NULL,
    qr_string TEXT,
    expiry_time TIMESTAMP WITH TIME ZONE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    paid_amount DECIMAL(20, 2),
    payment_method VARCHAR(100),
    payment_channel VARCHAR(100),
    blockchain_tx_hash VARCHAR(66),
    block_number BIGINT,
    onchain_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT fk_contract FOREIGN KEY (contract_id) REFERENCES contracts(id),
    CONSTRAINT chk_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_status CHECK (status IN ('CREATED', 'PENDING', 'PAID', 'PROCESSING', 'FUNDED', 'EXPIRED', 'FAILED', 'CANCELLED'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_qris_invoices_contract_id ON qris_invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_qris_invoices_xendit_invoice_id ON qris_invoices(xendit_invoice_id);
CREATE INDEX IF NOT EXISTS idx_qris_invoices_external_id ON qris_invoices(external_id);
CREATE INDEX IF NOT EXISTS idx_qris_invoices_status ON qris_invoices(status);
CREATE INDEX IF NOT EXISTS idx_qris_invoices_created_at ON qris_invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_qris_invoices_paid_at ON qris_invoices(paid_at);

-- Idempotency table for webhook processing
-- Ensures each payment is processed exactly once
CREATE TABLE IF NOT EXISTS xendit_idempotency (
    id VARCHAR(255) PRIMARY KEY,
    invoice_id VARCHAR(255) NOT NULL,
    contract_id VARCHAR(255) NOT NULL,
    webhook_id VARCHAR(255) NOT NULL,
    processing_result VARCHAR(50) NOT NULL,
    blockchain_tx_hash VARCHAR(66),
    raw_payload_hash VARCHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uk_invoice_processing UNIQUE (invoice_id)
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_xendit_idempotency_invoice_id ON xendit_idempotency(invoice_id);
CREATE INDEX IF NOT EXISTS idx_xendit_idempotency_contract_id ON xendit_idempotency(contract_id);
CREATE INDEX IF NOT EXISTS idx_xendit_idempotency_processing_result ON xendit_idempotency(processing_result);

-- Webhook audit log
-- Stores all webhook processing attempts for audit trail
CREATE TABLE IF NOT EXISTS xendit_webhook_audit (
    id VARCHAR(255) PRIMARY KEY,
    webhook_id VARCHAR(255) NOT NULL,
    invoice_id VARCHAR(255) NOT NULL,
    contract_id VARCHAR(255),
    amount DECIMAL(20, 2),
    paid_amount DECIMAL(20, 2),
    paid_at TIMESTAMP WITH TIME ZONE,
    payment_method VARCHAR(100),
    payment_channel VARCHAR(100),
    raw_payload TEXT NOT NULL,
    signature VARCHAR(255),
    signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp_validated BOOLEAN NOT NULL DEFAULT FALSE,
    idempotency_checked BOOLEAN NOT NULL DEFAULT FALSE,
    processing_result VARCHAR(50) NOT NULL,
    error_message TEXT,
    blockchain_tx_hash VARCHAR(66),
    block_number BIGINT,
    processing_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_webhook_audit_invoice_id ON xendit_webhook_audit(invoice_id);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_contract_id ON xendit_webhook_audit(contract_id);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_processing_result ON xendit_webhook_audit(processing_result);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_created_at ON xendit_webhook_audit(created_at);

-- Reconciliation reports
CREATE TABLE IF NOT EXISTS reconciliation_reports (
    id UUID PRIMARY KEY,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_invoices_checked INTEGER NOT NULL DEFAULT 0,
    total_xendit_paid INTEGER NOT NULL DEFAULT 0,
    total_db_funded INTEGER NOT NULL DEFAULT 0,
    total_onchain_funded INTEGER NOT NULL DEFAULT 0,
    discrepancy_count INTEGER NOT NULL DEFAULT 0,
    repair_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    report_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_report_status CHECK (status IN ('COMPLETED', 'PARTIAL', 'FAILED'))
);

-- Index for report queries
CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_generated_at ON reconciliation_reports(generated_at);
CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_status ON reconciliation_reports(status);

-- Reconciliation retry attempts
CREATE TABLE IF NOT EXISTS reconciliation_retry_attempts (
    id UUID PRIMARY KEY,
    invoice_id VARCHAR(255) NOT NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for retry tracking
CREATE INDEX IF NOT EXISTS idx_reconciliation_retry_invoice_id ON reconciliation_retry_attempts(invoice_id);

-- ============================================
-- Triggers for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_qris_invoices_updated_at
    BEFORE UPDATE ON qris_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE qris_invoices IS 'QRIS invoices created for AMANTRA contracts via Xendit';
COMMENT ON TABLE xendit_idempotency IS 'Idempotency tracking for webhook processing - ensures exactly-once processing';
COMMENT ON TABLE xendit_webhook_audit IS 'Complete audit trail of all webhook processing attempts';
COMMENT ON TABLE reconciliation_reports IS 'Daily reconciliation reports comparing Xendit, DB, and blockchain';
COMMENT ON TABLE reconciliation_retry_attempts IS 'Tracking of automatic repair attempts during reconciliation';

COMMENT ON COLUMN qris_invoices.xendit_invoice_id IS 'Xendit invoice ID - primary key from Xendit';
COMMENT ON COLUMN qris_invoices.external_id IS 'External ID format: AMANTRA-{contractId}';
COMMENT ON COLUMN qris_invoices.blockchain_tx_hash IS 'Transaction hash from markFunded call';
COMMENT ON COLUMN qris_invoices.version IS 'Optimistic locking version number';

COMMENT ON COLUMN xendit_idempotency.processing_result IS 'Result of processing: SUCCESS, DUPLICATE, INVALID_SIGNATURE, etc.';
COMMENT ON COLUMN xendit_idempotency.raw_payload_hash IS 'SHA-256 hash of raw webhook payload for verification';

COMMENT ON COLUMN xendit_webhook_audit.signature_verified IS 'Whether x-callback-token was verified successfully';
COMMENT ON COLUMN xendit_webhook_audit.timestamp_validated IS 'Whether paid_at timestamp was within tolerance';
COMMENT ON COLUMN xendit_webhook_audit.idempotency_checked IS 'Whether idempotency check was performed';
