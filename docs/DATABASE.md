# AMANTRA - Database Schema

## Overview

Database menggunakan PostgreSQL via Supabase dengan Row Level Security (RLS) untuk isolasi data per user.

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AMANTRA DATABASE SCHEMA                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│  │    users     │────────►│    akad      │◄────────│   payment    │        │
│  │              │         │              │         │              │        │
│  │ id           │         │ id           │         │ id           │        │
│  │ email        │         │ contract_no  │         │ akad_id      │        │
│  │ phone        │         │ buyer_id     │         │ amount       │        │
│  │ name         │         │ seller_id    │         │ method       │        │
│  │ role         │         │ title        │         │ status       │        │
│  │ kyc_status   │         │ description  │         │ xendit_id    │        │
│  └──────────────┘         │ amount       │         │ paid_at      │        │
│         │                 │ status       │         └──────────────┘        │
│         │                 │ akad_type    │                                  │
│         │                 │ blockchain_* │                                  │
│         │                 └──────┬───────┘                                  │
│         │                        │                                          │
│         │         ┌──────────────┼──────────────┐                          │
│         │         │              │              │                          │
│         │         ▼              ▼              ▼                          │
│         │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│         │  │  milestone   │ │   witness    │ │   dispute    │             │
│         │  │              │ │              │ │              │             │
│         │  │ id           │ │ id           │ │ id           │             │
│         │  │ akad_id      │ │ akad_id      │ │ akad_id      │             │
│         │  │ sequence     │ │ user_id      │ │ raised_by    │             │
│         │  │ title        │ │ role         │ │ reason       │             │
│         │  │ percentage   │ │ approved_at  │ │ status       │             │
│         │  │ status       │ │ signature    │ │ evidence_url │             │
│         │  └──────────────┘ └──────────────┘ └──────┬───────┘             │
│         │                                           │                      │
│         │                                           ▼                      │
│         │                                    ┌──────────────┐             │
│         │                                    │  arbitration │             │
│         │                                    │              │             │
│         │                                    │ id           │             │
│         │                                    │ dispute_id   │             │
│         │                                    │ arbitrator_* │             │
│         │                                    │ decision     │             │
│         │                                    │ voted_at     │             │
│         │                                    └──────────────┘             │
│         │                                                                  │
│         ▼                                                                  │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐       │
│  │  audit_trail │         │   hisbah_    │         │  blockchain_ │       │
│  │              │         │   action     │         │  anchor      │       │
│  │ id           │         │              │         │              │       │
│  │ user_id      │         │ id           │         │ id           │       │
│  │ action       │         │ akad_id      │         │ entity_type  │       │
│  │ entity_type  │         │ action       │         │ entity_id    │       │
│  │ entity_id    │         │ reason       │         │ tx_hash      │       │
│  │ metadata     │         │ performed_by │         │ block_number │       │
│  │ ip_address   │         │ created_at   │         │ data_hash    │       │
│  └──────────────┘         └──────────────┘         └──────────────┘       │
│                                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Table Definitions

### 1. users

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Auth (managed by Supabase Auth)
    auth_id UUID UNIQUE REFERENCES auth.users(id),

    -- Profile
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,

    -- KYC
    nik VARCHAR(16),
    kyc_status VARCHAR(20) DEFAULT 'pending', -- pending, verified, rejected
    kyc_verified_at TIMESTAMPTZ,

    -- Role
    role VARCHAR(20) DEFAULT 'user', -- user, witness, arbitrator, hisbah, operator

    -- Settings
    notification_preferences JSONB DEFAULT '{"email": true, "sms": true, "push": true}',

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
```

### 2. akad (Contracts)

```sql
CREATE TYPE akad_status AS ENUM (
    'draft',
    'pending_payment',
    'funded',
    'in_progress',
    'milestone_approved',
    'pending_release',
    'completed',
    'disputed',
    'arbitration_in_progress',
    'resolved_buyer',
    'resolved_seller',
    'frozen_by_hisbah',
    'under_review',
    'cancelled'
);

CREATE TYPE akad_type AS ENUM (
    'jual_beli',      -- Sale/Purchase
    'istisna',        -- Manufacturing/Construction
    'ijarah',         -- Service/Lease
    'salam',          -- Forward Sale
    'murabahah',      -- Cost-Plus Sale
    'musyarakah'      -- Partnership
);

CREATE TABLE akad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Contract Identity
    contract_number VARCHAR(50) UNIQUE NOT NULL,

    -- Parties
    buyer_id UUID NOT NULL REFERENCES users(id),
    seller_id UUID NOT NULL REFERENCES users(id),

    -- Contract Details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    akad_type akad_type NOT NULL,

    -- Financial
    total_amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'IDR',
    platform_fee_percent DECIMAL(5, 2) DEFAULT 2.50,

    -- Terms
    terms_and_conditions TEXT,
    delivery_address TEXT,
    delivery_deadline TIMESTAMPTZ,

    -- Status
    status akad_status DEFAULT 'draft',

    -- Blockchain
    blockchain_network VARCHAR(20), -- polygon, base, arbitrum
    blockchain_tx_hash VARCHAR(66),
    blockchain_block_number BIGINT,
    blockchain_akad_hash VARCHAR(66), -- SHA256 hash of akad data

    -- Documents
    document_urls JSONB DEFAULT '[]',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    funded_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT different_parties CHECK (buyer_id != seller_id),
    CONSTRAINT positive_amount CHECK (total_amount > 0)
);

-- Indexes
CREATE INDEX idx_akad_buyer ON akad(buyer_id);
CREATE INDEX idx_akad_seller ON akad(seller_id);
CREATE INDEX idx_akad_status ON akad(status);
CREATE INDEX idx_akad_created ON akad(created_at DESC);
CREATE INDEX idx_akad_contract_number ON akad(contract_number);
```

### 3. milestone

```sql
CREATE TYPE milestone_status AS ENUM (
    'pending',
    'in_progress',
    'submitted',
    'witness_approved',
    'buyer_approved',
    'disputed',
    'released',
    'cancelled'
);

CREATE TABLE milestone (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference
    akad_id UUID NOT NULL REFERENCES akad(id) ON DELETE CASCADE,

    -- Milestone Details
    sequence_number INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Financial
    percentage DECIMAL(5, 2) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,

    -- Deadline
    due_date TIMESTAMPTZ,

    -- Status
    status milestone_status DEFAULT 'pending',

    -- Evidence
    evidence_urls JSONB DEFAULT '[]',
    evidence_description TEXT,
    submitted_at TIMESTAMPTZ,

    -- Approvals
    witness_approved_at TIMESTAMPTZ,
    witness_approved_by UUID REFERENCES users(id),
    buyer_approved_at TIMESTAMPTZ,

    -- Blockchain
    blockchain_tx_hash VARCHAR(66),
    blockchain_status_hash VARCHAR(66),

    -- Release
    released_at TIMESTAMPTZ,
    release_tx_hash VARCHAR(66),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_percentage CHECK (percentage > 0 AND percentage <= 100),
    CONSTRAINT unique_sequence UNIQUE (akad_id, sequence_number)
);

-- Indexes
CREATE INDEX idx_milestone_akad ON milestone(akad_id);
CREATE INDEX idx_milestone_status ON milestone(status);
```

### 4. witness (Saksi)

```sql
CREATE TYPE witness_role AS ENUM (
    'saksi_lapangan',    -- Field witness
    'pengawas_proyek',   -- Project supervisor
    'saksi_akad'         -- Contract witness
);

CREATE TABLE witness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference
    akad_id UUID NOT NULL REFERENCES akad(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),

    -- Role
    role witness_role NOT NULL,

    -- Assignment
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),

    -- Approval
    approved_at TIMESTAMPTZ,
    approval_note TEXT,
    approval_signature TEXT, -- Digital signature hash

    -- Rejection
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Location (for field witness)
    approval_location JSONB, -- {lat, lng, accuracy, address}

    -- Blockchain
    blockchain_tx_hash VARCHAR(66),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_witness UNIQUE (akad_id, user_id, role)
);

-- Indexes
CREATE INDEX idx_witness_akad ON witness(akad_id);
CREATE INDEX idx_witness_user ON witness(user_id);
```

### 5. payment

```sql
CREATE TYPE payment_method AS ENUM (
    'qris',
    'bank_transfer',
    'virtual_account',
    'ewallet_ovo',
    'ewallet_gopay',
    'ewallet_dana'
);

CREATE TYPE payment_status AS ENUM (
    'pending',
    'processing',
    'paid',
    'failed',
    'expired',
    'refunded'
);

CREATE TABLE payment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference
    akad_id UUID NOT NULL REFERENCES akad(id),
    milestone_id UUID REFERENCES milestone(id),

    -- Payment Details
    amount DECIMAL(15, 2) NOT NULL,
    platform_fee DECIMAL(15, 2) NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,

    -- Method
    method payment_method NOT NULL,

    -- Status
    status payment_status DEFAULT 'pending',

    -- External Reference
    xendit_invoice_id VARCHAR(100),
    xendit_external_id VARCHAR(100) UNIQUE,
    xendit_payment_url TEXT,
    xendit_qr_code_url TEXT,

    -- Bank Details (for VA)
    bank_code VARCHAR(10),
    virtual_account_number VARCHAR(30),

    -- Payer Info
    payer_email VARCHAR(255),
    payer_phone VARCHAR(20),

    -- Timing
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,

    -- Webhook Data
    webhook_received_at TIMESTAMPTZ,
    webhook_payload JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT positive_amounts CHECK (amount > 0 AND total_amount > 0)
);

-- Indexes
CREATE INDEX idx_payment_akad ON payment(akad_id);
CREATE INDEX idx_payment_status ON payment(status);
CREATE INDEX idx_payment_xendit ON payment(xendit_external_id);
```

### 6. dispute (Sengketa)

```sql
CREATE TYPE dispute_status AS ENUM (
    'raised',
    'under_review',
    'arbitration_assigned',
    'voting_in_progress',
    'resolved_buyer',
    'resolved_seller',
    'resolved_split',
    'withdrawn',
    'escalated_to_hisbah'
);

CREATE TYPE dispute_category AS ENUM (
    'quality_issue',        -- Masalah kualitas
    'delivery_delay',       -- Keterlambatan pengiriman
    'non_delivery',         -- Tidak dikirim
    'payment_dispute',      -- Sengketa pembayaran
    'contract_breach',      -- Pelanggaran kontrak
    'fraud_suspected',      -- Dugaan penipuan
    'other'
);

CREATE TABLE dispute (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference
    akad_id UUID NOT NULL REFERENCES akad(id),
    milestone_id UUID REFERENCES milestone(id),

    -- Dispute Details
    raised_by UUID NOT NULL REFERENCES users(id),
    category dispute_category NOT NULL,
    reason TEXT NOT NULL,

    -- Evidence
    evidence_urls JSONB DEFAULT '[]',
    evidence_description TEXT,

    -- Status
    status dispute_status DEFAULT 'raised',

    -- Response
    respondent_id UUID REFERENCES users(id),
    response TEXT,
    response_evidence_urls JSONB DEFAULT '[]',
    responded_at TIMESTAMPTZ,

    -- Resolution
    resolution_type VARCHAR(50), -- refund_full, refund_partial, pay_seller, split
    resolution_amount_buyer DECIMAL(15, 2),
    resolution_amount_seller DECIMAL(15, 2),
    resolution_note TEXT,
    resolved_at TIMESTAMPTZ,

    -- Blockchain
    blockchain_tx_hash VARCHAR(66),
    resolution_tx_hash VARCHAR(66),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Deadline
    response_deadline TIMESTAMPTZ,
    resolution_deadline TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_dispute_akad ON dispute(akad_id);
CREATE INDEX idx_dispute_status ON dispute(status);
CREATE INDEX idx_dispute_raised_by ON dispute(raised_by);
```

### 7. arbitration

```sql
CREATE TYPE arbitration_vote AS ENUM (
    'pending',
    'favor_buyer',
    'favor_seller',
    'split',
    'abstain'
);

CREATE TABLE arbitration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference
    dispute_id UUID NOT NULL REFERENCES dispute(id),

    -- Arbitrators (3 required)
    arbitrator_1_id UUID REFERENCES users(id),
    arbitrator_2_id UUID REFERENCES users(id),
    arbitrator_3_id UUID REFERENCES users(id),

    -- Votes
    vote_1 arbitration_vote DEFAULT 'pending',
    vote_1_reason TEXT,
    vote_1_at TIMESTAMPTZ,

    vote_2 arbitration_vote DEFAULT 'pending',
    vote_2_reason TEXT,
    vote_2_at TIMESTAMPTZ,

    vote_3 arbitration_vote DEFAULT 'pending',
    vote_3_reason TEXT,
    vote_3_at TIMESTAMPTZ,

    -- Result
    final_decision arbitration_vote,
    decision_reasoning TEXT,
    split_percentage_buyer DECIMAL(5, 2),
    split_percentage_seller DECIMAL(5, 2),

    -- Blockchain
    blockchain_tx_hash VARCHAR(66),

    -- Timestamps
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    voting_deadline TIMESTAMPTZ,
    decided_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT different_arbitrators CHECK (
        arbitrator_1_id != arbitrator_2_id AND
        arbitrator_2_id != arbitrator_3_id AND
        arbitrator_1_id != arbitrator_3_id
    )
);

-- Indexes
CREATE INDEX idx_arbitration_dispute ON arbitration(dispute_id);
```

### 8. hisbah_action

```sql
CREATE TYPE hisbah_action_type AS ENUM (
    'freeze',           -- Bekukan akad
    'unfreeze',         -- Buka bekuan
    'veto_release',     -- Veto pencairan
    'escalate',         -- Eskalasi ke pihak berwenang
    'warning',          -- Peringatan
    'suspend_user'      -- Suspend user
);

CREATE TABLE hisbah_action (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference
    akad_id UUID REFERENCES akad(id),
    dispute_id UUID REFERENCES dispute(id),
    target_user_id UUID REFERENCES users(id),

    -- Action
    action_type hisbah_action_type NOT NULL,
    reason TEXT NOT NULL,
    evidence_urls JSONB DEFAULT '[]',

    -- Performed By
    performed_by UUID NOT NULL REFERENCES users(id),

    -- Approval (for critical actions)
    requires_approval BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,

    -- Reversal
    reversed_at TIMESTAMPTZ,
    reversed_by UUID REFERENCES users(id),
    reversal_reason TEXT,

    -- Blockchain
    blockchain_tx_hash VARCHAR(66),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_hisbah_akad ON hisbah_action(akad_id);
CREATE INDEX idx_hisbah_type ON hisbah_action(action_type);
```

### 9. blockchain_anchor

```sql
CREATE TYPE anchor_entity_type AS ENUM (
    'akad',
    'milestone',
    'witness_approval',
    'dispute',
    'arbitration_decision',
    'hisbah_action',
    'payment_release'
);

CREATE TABLE blockchain_anchor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Entity Reference
    entity_type anchor_entity_type NOT NULL,
    entity_id UUID NOT NULL,

    -- Blockchain Data
    network VARCHAR(20) NOT NULL, -- polygon, base, arbitrum
    tx_hash VARCHAR(66) NOT NULL UNIQUE,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ,

    -- Data Hash
    data_hash VARCHAR(66) NOT NULL, -- SHA256 of anchored data
    data_snapshot JSONB, -- Snapshot of data at anchor time

    -- Gas
    gas_used BIGINT,
    gas_price_gwei DECIMAL(20, 9),

    -- Status
    confirmed BOOLEAN DEFAULT false,
    confirmations INT DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_anchor_entity ON blockchain_anchor(entity_type, entity_id);
CREATE INDEX idx_anchor_tx ON blockchain_anchor(tx_hash);
CREATE INDEX idx_anchor_block ON blockchain_anchor(block_number);
```

### 10. audit_trail

```sql
CREATE TABLE audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Actor
    user_id UUID REFERENCES users(id),
    user_role VARCHAR(20),

    -- Action
    action VARCHAR(100) NOT NULL,

    -- Entity
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,

    -- Data
    old_data JSONB,
    new_data JSONB,
    metadata JSONB,

    -- Request Info
    ip_address INET,
    user_agent TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_user ON audit_trail(user_id);
CREATE INDEX idx_audit_entity ON audit_trail(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_trail(action);
CREATE INDEX idx_audit_created ON audit_trail(created_at DESC);

-- Partitioning for large audit tables
-- Consider partitioning by month for production
```

---

## Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE akad ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone ENABLE ROW LEVEL SECURITY;
ALTER TABLE witness ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute ENABLE ROW LEVEL SECURITY;

-- Users can only see their own profile
CREATE POLICY users_select ON users
    FOR SELECT USING (auth.uid() = auth_id);

-- Users can see akad where they are buyer or seller
CREATE POLICY akad_select ON akad
    FOR SELECT USING (
        buyer_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
        OR seller_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- Users can see milestones for their akad
CREATE POLICY milestone_select ON milestone
    FOR SELECT USING (
        akad_id IN (
            SELECT id FROM akad
            WHERE buyer_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
            OR seller_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
        )
    );

-- Arbitrators and Hisbah have broader access (handled by service role)
```

---

## Triggers

```sql
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER akad_updated_at BEFORE UPDATE ON akad
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Generate contract number
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.contract_number = 'AMT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                          LPAD(CAST(nextval('contract_number_seq') AS TEXT), 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE contract_number_seq START 1;

CREATE TRIGGER akad_contract_number BEFORE INSERT ON akad
    FOR EACH ROW EXECUTE FUNCTION generate_contract_number();

-- Auto-calculate milestone amount
CREATE OR REPLACE FUNCTION calculate_milestone_amount()
RETURNS TRIGGER AS $$
BEGIN
    NEW.amount = (SELECT total_amount FROM akad WHERE id = NEW.akad_id) * NEW.percentage / 100;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER milestone_amount BEFORE INSERT OR UPDATE ON milestone
    FOR EACH ROW EXECUTE FUNCTION calculate_milestone_amount();
```

---

## Indexes Summary

| Table | Column(s) | Type | Purpose |
|-------|-----------|------|---------|
| users | email | B-tree | Login lookup |
| users | phone | B-tree | Login lookup |
| akad | buyer_id | B-tree | User's contracts |
| akad | seller_id | B-tree | User's contracts |
| akad | status | B-tree | Status filtering |
| payment | xendit_external_id | B-tree | Webhook lookup |
| blockchain_anchor | tx_hash | B-tree | TX verification |
| audit_trail | created_at | B-tree DESC | Recent audit |
