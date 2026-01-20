# AMANTRA Network Fee Handling (Akad-Compliant)

## Ethical Foundation

**Principle:** *"Tidak boleh ada potongan tersembunyi."*
(No hidden deductions allowed)

**SOP:** *"Upah harus jelas sejak akad, tidak boleh berubah sepihak, dan harus dibagi secara adil serta otomatis."*
(Fees must be clear from contract, cannot change unilaterally, and must be distributed fairly and automatically.)

---

## Overview

Bank network transfer fees (BI-FAST, RTGS, interbank fees) are real costs that must be explicitly declared and handled. This document describes how AMANTRA handles these fees in an akad-compliant manner.

### Key Guarantees

After this implementation, AMANTRA guarantees:

> **"No party will ever receive less than the amount agreed in the contract without explicit, pre-declared, and immutable consent."**

---

## Network Fee Bearer Options

### 1. PLATFORM (Value: 0)

**Description:** AMANTRA absorbs all bank transfer fees from its platform fee.

**Settlement Logic:**
- Seller receives **full** `sellerAmount`
- Platform receives `platformFee - actualNetworkFee`
- Bank fees are deducted from AMANTRA's revenue

**Use Case:** Premium experience where sellers receive exactly what they expect.

**Constraint:** `platformFee >= estimatedNetworkFee` (enforced at contract creation)

```
Example:
Total Amount:     Rp 10,000,000
Seller Amount:    Rp  9,500,000
Platform Fee:     Rp    500,000
Est. Network Fee: Rp      6,500

Seller Receives:  Rp  9,500,000 (full amount)
Platform Receives: Rp   493,500 (platform fee - network fee)
```

### 2. SELLER (Value: 1)

**Description:** Seller bears bank transfer fees, deducted from their payment.

**Settlement Logic:**
- Seller receives `sellerAmount - actualNetworkFee`
- Platform receives **full** `platformFee`
- Fee deduction is shown clearly in settlement breakdown

**Use Case:** Cost-conscious transactions where seller accepts fee responsibility.

**Disclosure:** Seller is shown exact net amount at contract creation.

```
Example:
Total Amount:     Rp 10,000,000
Seller Amount:    Rp  9,500,000
Platform Fee:     Rp    500,000
Est. Network Fee: Rp      6,500

Seller Receives:  Rp  9,493,500 (seller amount - network fee)
Platform Receives: Rp   500,000 (full platform fee)
```

### 3. BUYER (Value: 2)

**Description:** Buyer pays network fee as an additional charge at funding.

**Settlement Logic:**
- Buyer pays `totalAmount + estimatedNetworkFee` to escrow
- Seller receives **full** `sellerAmount`
- Platform receives **full** `platformFee`
- Network fee is paid separately from escrow

**Use Case:** Buyer-funded transactions where buyer covers all costs.

```
Example:
Total Amount:     Rp 10,000,000
Est. Network Fee: Rp      6,500
Buyer Pays:       Rp 10,006,500 (total + network fee)

Seller Receives:  Rp  9,500,000 (full amount)
Platform Receives: Rp   500,000 (full platform fee)
```

---

## Implementation Components

### Smart Contract (AmantraLedgerV2.sol)

#### FeeInfo Struct
```solidity
struct FeeInfo {
    uint16 bps;                      // Fee rate in basis points
    uint256 platformFee;             // Platform fee amount
    uint256 sellerAmount;            // Seller's gross amount
    uint256 mediatorFee;             // Optional mediator fee
    NetworkFeeBearer networkFeeBearer; // NEW: Who bears network fees
    uint256 estimatedNetworkFee;     // NEW: Estimated fee at akad
    bytes32 akadStatementHash;       // NEW: Hash of signed disclosure
}
```

#### Events
```solidity
// Emitted at contract creation
event FeeDisclosure(
    bytes32 indexed contractId,
    NetworkFeeBearer networkFeeBearer,
    uint256 estimatedNetworkFee,
    bytes32 akadStatementHash,
    uint256 mediatorFee,
    uint64 timestamp
);

// Emitted at settlement
event SettlementNetworkFeeRecord(
    bytes32 indexed contractId,
    bytes32 indexed settlementRef,
    NetworkFeeBearer declaredBearer,
    uint256 actualNetworkFee,
    uint256 sellerNetReceived,
    uint256 platformNetReceived,
    bytes32 bankReceiptHash,
    uint64 timestamp
);
```

#### Validation
```solidity
// Akad statement required
if (akadStatementHash == bytes32(0)) {
    revert AkadStatementRequired();
}

// Platform fee must cover network fee if PLATFORM bears it
if (networkFeeBearer == NetworkFeeBearer.PLATFORM &&
    platformFee < estimatedNetworkFee) {
    revert InsufficientPlatformFeeForNetworkCost(platformFee, estimatedNetworkFee);
}
```

### Backend (TypeScript)

#### Network Fee Types
```typescript
enum NetworkFeeBearer {
    PLATFORM = 0,  // AMANTRA pays all bank transfer fees
    SELLER = 1,    // Seller bears bank transfer fees
    BUYER = 2,     // Buyer pays additional network fee
}

interface NetworkFeeConfig {
    bearer: NetworkFeeBearer;
    estimatedFee: number;
    currency: string;
}
```

#### SplitPayment Value Object
- Includes `networkFeeBearer`, `estimatedNetworkFee`, `akadStatementHash`
- `calculateActualAmounts(actualNetworkFee)` method for settlement
- `getNetworkFeeDisclosure()` for UI display
- `toAuditString()` includes complete network fee details

### Database Schema

#### akad_statements Table
```sql
CREATE TABLE akad_statements (
    id UUID PRIMARY KEY,
    contract_id VARCHAR(255) NOT NULL UNIQUE,
    network_fee_bearer network_fee_bearer NOT NULL,
    estimated_network_fee DECIMAL(20, 2) NOT NULL,
    seller_net_after_fees DECIMAL(20, 2) NOT NULL,
    disclosure_text TEXT NOT NULL,
    statement_hash VARCHAR(66) NOT NULL,
    -- Signatures stored as JSON
    buyer_signature JSONB,
    seller_signature JSONB
);
```

#### settlements Table (Extended)
```sql
ALTER TABLE settlements ADD COLUMN
    network_fee_bearer network_fee_bearer,
    estimated_network_fee DECIMAL(20, 2),
    actual_network_fee DECIMAL(20, 2),
    seller_net_received DECIMAL(20, 2),
    platform_net_received DECIMAL(20, 2),
    bank_receipt_hash VARCHAR(66);
```

---

## Akad Disclosure Statement

At contract creation, the system generates and records this statement:

```
============================================================
AKAD KETENTUAN BIAYA TRANSAKSI
(Fee Terms Agreement)
============================================================

Nomor Kontrak: [CONTRACT_ID]
Tanggal: [DATE]

RINCIAN BIAYA:
- Total Transaksi: Rp 10,000,000
- Biaya Platform: Rp 500,000
- Jumlah untuk Penjual: Rp 9,500,000

BIAYA TRANSFER BANK:
- Penanggung Biaya: [PLATFORM/PENJUAL/PEMBELI]
- Estimasi Biaya Transfer: Rp 6,500

JUMLAH BERSIH YANG AKAN DITERIMA PENJUAL:
Rp [SELLER_NET_AFTER_FEES]

============================================================
PERNYATAAN AKAD:
============================================================

"Biaya transfer bank (jika ada) ditanggung oleh: [BEARER].
Jumlah bersih yang diterima penjual setelah biaya bank: Rp XXXXX.
Tidak ada potongan lain selain yang disepakati di akad."

============================================================
Dengan menandatangani kontrak ini, kedua pihak menyetujui
ketentuan biaya yang tercantum di atas.
============================================================
```

This statement is:
1. **Stored in database** - `akad_statements` table
2. **Hashed to blockchain** - `akadStatementHash` in FeeInfo
3. **Included in digital contract PDF** - For both parties
4. **Signed by both parties** - Signatures stored as JSON

---

## Settlement Flow

### 1. Bank Transfer Execution

```typescript
// Calculate amounts based on declared bearer
const amounts = splitPayment.calculateActualAmounts(actualNetworkFee);

// Validate against akad policy
if (amounts.sellerNetReceived < expectedMinimum) {
    throw new NetworkFeePolicyViolation();
}
```

### 2. Blockchain Recording

```solidity
function markSettled(
    bytes32 contractId,
    bytes32 settlementRef,
    bytes32 transactionRef,
    uint256 actualNetworkFee,
    uint256 sellerNetReceived,
    uint256 platformNetReceived,
    bytes32 bankReceiptHash
) external;
```

### 3. Audit Trail

```sql
INSERT INTO network_fee_audit_log (
    settlement_id,
    contract_id,
    declared_bearer,
    estimated_fee,
    actual_fee,
    fee_variance,
    seller_amount_declared,
    seller_net_received,
    policy_compliant
) VALUES (...);
```

---

## Compliance Verification

### Smart Contract Level

```solidity
function _validateNetworkFeePolicy(
    FeeInfo memory feeInfo,
    uint256 actualNetworkFee,
    uint256 sellerNetReceived,
    uint256 platformNetReceived
) internal pure {
    if (feeInfo.networkFeeBearer == NetworkFeeBearer.PLATFORM) {
        // Seller must receive full amount
        if (sellerNetReceived < feeInfo.sellerAmount) {
            revert NetworkFeePolicyViolation(...);
        }
    }
    // ... other bearer validations
}
```

### Database View

```sql
CREATE VIEW v_network_fee_compliance AS
SELECT
    settlement_id,
    contract_id,
    network_fee_bearer,
    actual_network_fee,
    seller_net_received,
    CASE
        WHEN network_fee_bearer = 'PLATFORM'
            AND seller_net_received >= seller_amount THEN TRUE
        WHEN network_fee_bearer = 'SELLER'
            AND seller_net_received >= (seller_amount - actual_network_fee) THEN TRUE
        WHEN network_fee_bearer = 'BUYER'
            AND seller_net_received >= seller_amount THEN TRUE
        ELSE FALSE
    END AS akad_compliant
FROM settlements;
```

---

## Testing

Unit tests cover all 3 scenarios in `network-fee-scenarios.spec.ts`:

1. **PLATFORM scenario**
   - Platform fee must cover network fee
   - Seller receives full amount
   - Platform absorbs fee variance

2. **SELLER scenario**
   - Seller net is pre-calculated at akad
   - Deduction shown in disclosure
   - Actual fee applied at settlement

3. **BUYER scenario**
   - Buyer pays additional amount at funding
   - Seller and platform receive full amounts

---

## Migration Guide

### Step 1: Deploy Smart Contract Update

Update `AmantraLedgerV2` with new FeeInfo struct and events.

### Step 2: Run Database Migration

```bash
psql -d amantra -f migrations/005_network_fee_akad_tables.sql
```

### Step 3: Update Backend

Deploy updated `SplitPayment` and `LedgerSyncService`.

### Step 4: Update UI

Add network fee bearer selection and disclosure display.

---

## FAQ

### Q: What if actual network fee differs from estimated?

**A:** The variance is handled according to the declared bearer:
- **PLATFORM:** Platform absorbs the difference
- **SELLER:** Seller receives less/more than estimated
- **BUYER:** Buyer already paid estimated; variance handled by platform

### Q: Can the network fee bearer change after contract creation?

**A:** No. The `networkFeeBearer` is immutable once set at contract creation. This follows the akad principle that fees cannot be changed unilaterally.

### Q: What happens during disputes?

**A:** Network fee configuration is preserved through the dispute process. Resolution follows the original akad terms.

### Q: How are multi-party transfers handled?

**A:** If mediator is involved, network fees are only applied to seller and platform legs. Mediator receives full declared amount.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-20 | Initial implementation with 3 bearer scenarios |
