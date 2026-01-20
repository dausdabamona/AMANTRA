-- ============================================
-- AMANTRA - Majelis Arbitrase Digital Tables
-- Migration: 006_arbitration_council_tables
--
-- ETHICAL PRINCIPLE:
-- "Uang dikunci oleh teknologi, keputusan dikunci oleh amanah manusia,
--  dan keadilan tidak boleh berada di satu tangan."
-- ============================================

-- ============================================
-- Arbitration Council Configuration
-- ============================================

CREATE TABLE IF NOT EXISTS arbitration_council (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    multisig_address VARCHAR(42) NOT NULL,
    threshold INTEGER NOT NULL,
    member_count INTEGER NOT NULL,
    min_threshold INTEGER NOT NULL DEFAULT 2,
    min_members INTEGER NOT NULL DEFAULT 3,
    resolution_delay_seconds INTEGER NOT NULL DEFAULT 86400, -- 24 hours
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    validated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_threshold_valid CHECK (threshold >= min_threshold),
    CONSTRAINT chk_members_valid CHECK (member_count >= min_members),
    CONSTRAINT chk_delay_valid CHECK (resolution_delay_seconds >= 86400 AND resolution_delay_seconds <= 172800)
);

-- ============================================
-- Arbitration Council Members
-- ============================================

CREATE TABLE IF NOT EXISTS arbitration_council_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    council_id UUID NOT NULL REFERENCES arbitration_council(id),
    member_address VARCHAR(42) NOT NULL,
    member_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    expertise TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    conflict_of_interest_declaration TEXT,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_member_role CHECK (role IN ('LEAD', 'MEMBER', 'EXPERT')),
    CONSTRAINT uq_council_member UNIQUE (council_id, member_address)
);

-- ============================================
-- Disputes Table (Enhanced)
-- ============================================

CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(255) NOT NULL,
    contract_number VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',

    -- Raiser information
    raised_by VARCHAR(255) NOT NULL,
    raiser_type VARCHAR(20) NOT NULL,
    raiser_address VARCHAR(42) NOT NULL,

    -- Reason and evidence
    reason_hash VARCHAR(66) NOT NULL,
    reason_text TEXT,
    initial_evidence_hash VARCHAR(66) NOT NULL,

    -- Timeline
    raised_at TIMESTAMP WITH TIME ZONE NOT NULL,
    evidence_deadline TIMESTAMP WITH TIME ZONE,
    review_started_at TIMESTAMP WITH TIME ZONE,
    resolution_queued_at TIMESTAMP WITH TIME ZONE,
    resolution_executable_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,

    -- Resolution
    resolution_type VARCHAR(30),
    arbitration_hash VARCHAR(66),
    arbitration_document_url TEXT,
    final_status VARCHAR(20),

    -- Blockchain references
    raise_tx_hash VARCHAR(66) NOT NULL,
    raise_block_number BIGINT NOT NULL,
    queue_tx_hash VARCHAR(66),
    queue_block_number BIGINT,
    execute_tx_hash VARCHAR(66),
    execute_block_number BIGINT,

    -- Metadata
    buyer_address VARCHAR(42) NOT NULL,
    seller_address VARCHAR(42) NOT NULL,
    total_amount DECIMAL(20, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'IDR',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT chk_dispute_status CHECK (status IN (
        'SUBMITTED', 'EVIDENCE_COLLECTION', 'UNDER_REVIEW',
        'RESOLUTION_QUEUED', 'RESOLVED', 'CANCELLED'
    )),
    CONSTRAINT chk_raiser_type CHECK (raiser_type IN ('BUYER', 'SELLER', 'OPERATOR')),
    CONSTRAINT chk_resolution_type CHECK (resolution_type IS NULL OR resolution_type IN (
        'CONTINUE_SETTLEMENT', 'REFUND_BUYER', 'PAY_SELLER', 'CUSTOM_SPLIT'
    ))
);

-- Indexes for disputes
CREATE INDEX IF NOT EXISTS idx_disputes_contract_id ON disputes(contract_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_raised_at ON disputes(raised_at);
CREATE INDEX IF NOT EXISTS idx_disputes_resolution_executable_at ON disputes(resolution_executable_at)
    WHERE status = 'RESOLUTION_QUEUED';
CREATE INDEX IF NOT EXISTS idx_disputes_buyer_address ON disputes(buyer_address);
CREATE INDEX IF NOT EXISTS idx_disputes_seller_address ON disputes(seller_address);

-- ============================================
-- Dispute Evidence Table
-- ============================================

CREATE TABLE IF NOT EXISTS dispute_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(255) NOT NULL,
    dispute_id UUID NOT NULL REFERENCES disputes(id),
    ipfs_hash VARCHAR(66) NOT NULL,
    content_hash VARCHAR(66) NOT NULL,
    evidence_type VARCHAR(30) NOT NULL,
    description TEXT NOT NULL,
    submitted_by VARCHAR(255) NOT NULL,
    submitter_role VARCHAR(20) NOT NULL,
    filename VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(100),
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    tx_hash VARCHAR(66),
    block_number BIGINT,

    CONSTRAINT chk_evidence_type CHECK (evidence_type IN (
        'DOCUMENT', 'PHOTO', 'VIDEO', 'CHAT_LOG', 'RECEIPT',
        'DELIVERY_PROOF', 'QC_REPORT', 'OTHER'
    )),
    CONSTRAINT chk_submitter_role CHECK (submitter_role IN ('BUYER', 'SELLER', 'OPERATOR'))
);

-- Indexes for evidence
CREATE INDEX IF NOT EXISTS idx_evidence_dispute_id ON dispute_evidence(dispute_id);
CREATE INDEX IF NOT EXISTS idx_evidence_contract_id ON dispute_evidence(contract_id);
CREATE INDEX IF NOT EXISTS idx_evidence_ipfs_hash ON dispute_evidence(ipfs_hash);
CREATE INDEX IF NOT EXISTS idx_evidence_submitted_at ON dispute_evidence(submitted_at);

-- ============================================
-- Arbitration Decisions Table
-- ============================================

CREATE TABLE IF NOT EXISTS arbitration_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES disputes(id),
    contract_id VARCHAR(255) NOT NULL,

    -- Decision details
    resolution_type VARCHAR(30) NOT NULL,
    summary TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    evidence_considered TEXT[] NOT NULL,

    -- Custom split (if applicable)
    custom_buyer_amount DECIMAL(20, 2),
    custom_seller_amount DECIMAL(20, 2),
    custom_platform_amount DECIMAL(20, 2),

    -- Signers
    signers VARCHAR(42)[] NOT NULL,
    signature_count INTEGER NOT NULL,

    -- Document hashes
    document_hash VARCHAR(66) NOT NULL,
    ipfs_hash VARCHAR(66) NOT NULL,

    -- Timeline
    decided_at TIMESTAMP WITH TIME ZONE NOT NULL,
    queued_at TIMESTAMP WITH TIME ZONE,
    executable_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,

    -- Blockchain references
    queue_tx_hash VARCHAR(66),
    execute_tx_hash VARCHAR(66),

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_decision_resolution_type CHECK (resolution_type IN (
        'CONTINUE_SETTLEMENT', 'REFUND_BUYER', 'PAY_SELLER', 'CUSTOM_SPLIT'
    )),
    CONSTRAINT chk_custom_split CHECK (
        (resolution_type != 'CUSTOM_SPLIT') OR
        (custom_buyer_amount IS NOT NULL AND custom_seller_amount IS NOT NULL)
    )
);

-- Indexes for decisions
CREATE INDEX IF NOT EXISTS idx_decisions_dispute_id ON arbitration_decisions(dispute_id);
CREATE INDEX IF NOT EXISTS idx_decisions_contract_id ON arbitration_decisions(contract_id);
CREATE INDEX IF NOT EXISTS idx_decisions_executable_at ON arbitration_decisions(executable_at);

-- ============================================
-- Dispute Timeline Events Table
-- ============================================

CREATE TABLE IF NOT EXISTS dispute_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES disputes(id),
    event_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    data JSONB,
    tx_hash VARCHAR(66),
    block_number BIGINT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_event_type CHECK (event_type IN (
        'DISPUTE_RAISED', 'EVIDENCE_SUBMITTED', 'REVIEW_STARTED',
        'RESOLUTION_QUEUED', 'RESOLUTION_CANCELLED', 'RESOLUTION_EXECUTED',
        'STATUS_CHANGED', 'COMMENT_ADDED', 'DEADLINE_EXTENDED'
    ))
);

-- Indexes for timeline
CREATE INDEX IF NOT EXISTS idx_timeline_dispute_id ON dispute_timeline_events(dispute_id);
CREATE INDEX IF NOT EXISTS idx_timeline_event_type ON dispute_timeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON dispute_timeline_events(timestamp);

-- ============================================
-- Dispute Audit Log Table
-- ============================================

CREATE TABLE IF NOT EXISTS dispute_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID REFERENCES disputes(id),
    action VARCHAR(100) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    actor_role VARCHAR(30) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    tx_hash VARCHAR(66),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_dispute_id ON dispute_audit_log(dispute_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON dispute_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON dispute_audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON dispute_audit_log(created_at);

-- ============================================
-- Views for Reporting
-- ============================================

-- Active disputes view
CREATE OR REPLACE VIEW v_active_disputes AS
SELECT
    d.id,
    d.contract_id,
    d.contract_number,
    d.status,
    d.raiser_type,
    d.raised_at,
    d.resolution_executable_at,
    d.total_amount,
    d.currency,
    d.buyer_address,
    d.seller_address,
    COALESCE(ec.evidence_count, 0) AS evidence_count,
    CASE
        WHEN d.status = 'RESOLUTION_QUEUED' AND d.resolution_executable_at <= NOW()
        THEN TRUE
        ELSE FALSE
    END AS can_execute
FROM disputes d
LEFT JOIN (
    SELECT dispute_id, COUNT(*) AS evidence_count
    FROM dispute_evidence
    GROUP BY dispute_id
) ec ON d.id = ec.dispute_id
WHERE d.status NOT IN ('RESOLVED', 'CANCELLED');

-- Dispute statistics view
CREATE OR REPLACE VIEW v_dispute_statistics AS
SELECT
    COUNT(*) FILTER (WHERE status = 'SUBMITTED') AS pending_count,
    COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW') AS under_review_count,
    COUNT(*) FILTER (WHERE status = 'RESOLUTION_QUEUED') AS queued_count,
    COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved_count,
    COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_count,
    COUNT(*) AS total_count,
    AVG(EXTRACT(EPOCH FROM (resolved_at - raised_at)) / 3600)
        FILTER (WHERE status = 'RESOLVED') AS avg_resolution_hours,
    SUM(total_amount) FILTER (WHERE status NOT IN ('CANCELLED')) AS total_disputed_amount
FROM disputes;

-- Council activity view
CREATE OR REPLACE VIEW v_council_activity AS
SELECT
    d.decided_at::DATE AS decision_date,
    COUNT(*) AS decisions_count,
    COUNT(*) FILTER (WHERE d.resolution_type = 'CONTINUE_SETTLEMENT') AS continue_count,
    COUNT(*) FILTER (WHERE d.resolution_type = 'REFUND_BUYER') AS refund_count,
    COUNT(*) FILTER (WHERE d.resolution_type = 'PAY_SELLER') AS pay_seller_count,
    COUNT(*) FILTER (WHERE d.resolution_type = 'CUSTOM_SPLIT') AS custom_split_count
FROM arbitration_decisions d
GROUP BY d.decided_at::DATE
ORDER BY decision_date DESC;

-- ============================================
-- Triggers
-- ============================================

-- Update timestamp trigger for disputes
CREATE TRIGGER update_disputes_updated_at
    BEFORE UPDATE ON disputes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for council
CREATE TRIGGER update_arbitration_council_updated_at
    BEFORE UPDATE ON arbitration_council
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for members
CREATE TRIGGER update_council_members_updated_at
    BEFORE UPDATE ON arbitration_council_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Comments for Documentation
-- ============================================

COMMENT ON TABLE arbitration_council IS 'Configuration for the Majelis Arbitrase Digital (Digital Arbitration Council)';
COMMENT ON TABLE arbitration_council_members IS 'Members of the arbitration council with their roles and expertise';
COMMENT ON TABLE disputes IS 'Dispute records with full lifecycle tracking';
COMMENT ON TABLE dispute_evidence IS 'Evidence submitted for disputes, stored on IPFS';
COMMENT ON TABLE arbitration_decisions IS 'Arbitration decisions with signatures and document hashes';
COMMENT ON TABLE dispute_timeline_events IS 'Timeline of events for each dispute for audit purposes';
COMMENT ON TABLE dispute_audit_log IS 'Comprehensive audit log for all dispute-related actions';

COMMENT ON COLUMN disputes.resolution_executable_at IS 'Timestamp when resolution can be executed after timelock';
COMMENT ON COLUMN disputes.raise_tx_hash IS 'Blockchain transaction hash for dispute raising';
COMMENT ON COLUMN arbitration_decisions.signers IS 'Array of council member addresses who signed the decision';
COMMENT ON COLUMN arbitration_decisions.document_hash IS 'SHA-256 hash of the signed arbitration decision PDF';
