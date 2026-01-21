# AMANTRA - Security Model

## Ringkasan

AMANTRA menggunakan arsitektur **Hybrid Custodial** yang memisahkan:
- **Off-chain:** Manajemen dana dan data sensitif pengguna
- **On-chain:** Pencatatan hash dan keputusan (notaris digital)

---

## 1. Arsitektur Keamanan

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │   USER LAYER     │     │   APP LAYER      │     │   DATA LAYER     │    │
│  │                  │     │                  │     │                  │    │
│  │  • Auth (OTP)    │────▶│  • API Gateway   │────▶│  • PostgreSQL    │    │
│  │  • Session JWT   │     │  • Rate Limiting │     │  • Redis Cache   │    │
│  │  • HTTPS Only    │     │  • Input Valid   │     │  • Encryption    │    │
│  └──────────────────┘     └──────────────────┘     └──────────────────┘    │
│           │                        │                        │               │
│           │                        │                        │               │
│           ▼                        ▼                        ▼               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        PAYMENT LAYER                                  │  │
│  │                                                                       │  │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │  │
│  │  │  QRIS/Bank   │───▶│  Escrow PT   │───▶│  Settlement  │           │  │
│  │  │  Gateway     │    │  Account     │    │  Engine      │           │  │
│  │  └──────────────┘    └──────────────┘    └──────────────┘           │  │
│  │         │                   │                    │                   │  │
│  │         └───────────────────┴────────────────────┘                   │  │
│  │                              │                                        │  │
│  │                    [Webhook Signature]                               │  │
│  │                    [Idempotency Keys]                                │  │
│  │                    [Audit Trail]                                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                 │                                           │
│                                 ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                       BLOCKCHAIN LAYER                                │  │
│  │                                                                       │  │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │  │
│  │  │  Operator    │───▶│  Smart       │───▶│  Event       │           │  │
│  │  │  Wallet      │    │  Contract    │    │  Indexer     │           │  │
│  │  │  (HSM/KMS)   │    │              │    │              │           │  │
│  │  └──────────────┘    └──────────────┘    └──────────────┘           │  │
│  │                                                                       │  │
│  │                    [Multisig for Critical]                           │  │
│  │                    [Time-lock Releases]                              │  │
│  │                    [Hash-only Anchoring]                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication & Authorization

### 2.1 User Authentication

| Method | Use Case | Security Level |
|--------|----------|----------------|
| Email + Password | Desktop users | Medium |
| Phone + OTP | Mobile users (Indonesia) | High |
| Google OAuth | Quick signup | Medium |
| Biometric | Mobile app (future) | High |

### 2.2 Session Management

```typescript
// JWT Token Structure
{
  "sub": "user_uuid",
  "email": "user@example.com",
  "role": "user",
  "iat": 1704067200,
  "exp": 1704070800, // 1 hour
  "jti": "unique_token_id"
}

// Refresh Token: 7 days, stored in httpOnly cookie
// Access Token: 1 hour, sent in Authorization header
```

### 2.3 Role-Based Access Control (RBAC)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROLE PERMISSIONS MATRIX                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Permission          │ User │ Witness │ Arbiter │ Hisbah │ Op  │
│  ────────────────────┼──────┼─────────┼─────────┼────────┼──── │
│  Create Akad         │  ✓   │    ✗    │    ✗    │   ✗    │  ✓  │
│  View Own Akad       │  ✓   │    ✓    │    ✓    │   ✓    │  ✓  │
│  View All Akad       │  ✗   │    ✗    │    ✗    │   ✓    │  ✓  │
│  Approve Milestone   │  ✓   │    ✓    │    ✗    │   ✗    │  ✗  │
│  Raise Dispute       │  ✓   │    ✗    │    ✗    │   ✗    │  ✗  │
│  Vote on Dispute     │  ✗   │    ✗    │    ✓    │   ✗    │  ✗  │
│  Freeze Akad         │  ✗   │    ✗    │    ✗    │   ✓    │  ✗  │
│  Release Escrow      │  ✗   │    ✗    │    ✗    │   ✗    │  ✓  │
│  Blockchain Write    │  ✗   │    ✗    │    ✗    │   ✗    │  ✓  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Payment Security

### 3.1 QRIS/Bank Transfer Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PAYMENT SECURITY FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CREATE INVOICE                                               │
│     ┌─────────────────────────────────────────────────────┐     │
│     │  • Generate unique external_id (UUID)               │     │
│     │  • Calculate amount + platform fee                   │     │
│     │  • Set expiry (1 hour)                              │     │
│     │  • Store in database with PENDING status            │     │
│     └─────────────────────────────────────────────────────┘     │
│                              │                                   │
│                              ▼                                   │
│  2. USER PAYS                                                    │
│     ┌─────────────────────────────────────────────────────┐     │
│     │  • Scan QRIS / Transfer to VA                       │     │
│     │  • Payment to Escrow Account (PT Amantra)           │     │
│     │  • Bank confirms to Xendit                          │     │
│     └─────────────────────────────────────────────────────┘     │
│                              │                                   │
│                              ▼                                   │
│  3. WEBHOOK RECEIVED                                             │
│     ┌─────────────────────────────────────────────────────┐     │
│     │  • Verify X-Callback-Token header                   │     │
│     │  • Verify webhook signature (HMAC-SHA256)           │     │
│     │  • Check idempotency (external_id not processed)    │     │
│     │  • Validate amount matches                          │     │
│     └─────────────────────────────────────────────────────┘     │
│                              │                                   │
│                              ▼                                   │
│  4. CONFIRM & ANCHOR                                             │
│     ┌─────────────────────────────────────────────────────┐     │
│     │  • Update payment status to PAID                    │     │
│     │  • Update akad status to FUNDED                     │     │
│     │  • Calculate hash: SHA256(akad + payment + time)    │     │
│     │  • Anchor hash to blockchain                        │     │
│     │  • Send confirmation notification                   │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Webhook Security

```typescript
// Webhook Verification
function verifyXenditWebhook(req: Request): boolean {
  const callbackToken = req.headers['x-callback-token'];
  const expectedToken = process.env.XENDIT_CALLBACK_TOKEN;

  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(callbackToken),
    Buffer.from(expectedToken)
  );
}

// Idempotency Check
async function isIdempotent(externalId: string): Promise<boolean> {
  const existing = await redis.get(`payment:processed:${externalId}`);
  if (existing) return false;

  // Set with 24h expiry
  await redis.set(`payment:processed:${externalId}`, '1', 'EX', 86400);
  return true;
}
```

### 3.3 Escrow Release Security

```
┌─────────────────────────────────────────────────────────────────┐
│                  ESCROW RELEASE REQUIREMENTS                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  MUST HAVE ALL:                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  ✓ Milestone status = BUYER_APPROVED                    │    │
│  │  ✓ No active dispute on milestone                       │    │
│  │  ✓ Akad not frozen by Hisbah                           │    │
│  │  ✓ 72-hour cooling period passed (dispute window)       │    │
│  │  ✓ Witness approval recorded (if required)              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ADDITIONAL FOR LARGE AMOUNTS (> 50 juta):                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  ✓ Manual review by operator                            │    │
│  │  ✓ Hisbah clearance (no objection in 24h)              │    │
│  │  ✓ Multisig approval (2 of 3 operators)                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Blockchain Security

### 4.1 Operator Wallet Security

```
┌─────────────────────────────────────────────────────────────────┐
│                 OPERATOR WALLET ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OPTION A: Cloud HSM (Recommended for Production)                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐            │    │
│  │  │ Backend │───▶│ AWS KMS │───▶│ Sign TX │            │    │
│  │  │ Service │    │ / GCP   │    │         │            │    │
│  │  └─────────┘    └─────────┘    └─────────┘            │    │
│  │                                                         │    │
│  │  • Private key never leaves HSM                        │    │
│  │  • Audit log for all signing operations               │    │
│  │  • IAM role-based access                              │    │
│  │  • Automatic key rotation support                     │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  OPTION B: Multisig Wallet (Critical Operations)                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐                  │    │
│  │  │ Signer1 │ │ Signer2 │ │ Signer3 │                  │    │
│  │  │ (HSM)   │ │ (HSM)   │ │ (HSM)   │                  │    │
│  │  └────┬────┘ └────┬────┘ └────┬────┘                  │    │
│  │       │           │           │                        │    │
│  │       └───────────┼───────────┘                        │    │
│  │                   │                                    │    │
│  │                   ▼                                    │    │
│  │           ┌─────────────┐                             │    │
│  │           │  Safe/Gnosis │  2-of-3 required          │    │
│  │           │  Multisig    │                            │    │
│  │           └─────────────┘                             │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Smart Contract Security

| Measure | Implementation |
|---------|----------------|
| Access Control | OpenZeppelin AccessControl with roles |
| Upgradeability | UUPS Proxy (controlled by multisig) |
| Pause | Emergency pause by admin |
| Rate Limiting | Max 100 akad registrations per block |
| Input Validation | Require statements for all parameters |
| Reentrancy | No ETH handling, hash-only operations |

### 4.3 Data Anchoring

```typescript
// What gets anchored to blockchain
interface BlockchainAnchor {
  // Identifiers (no PII)
  akadId: bytes32;      // UUID hashed
  buyerHash: bytes32;   // SHA256(userId + salt)
  sellerHash: bytes32;  // SHA256(userId + salt)

  // Data hashes
  akadHash: bytes32;    // SHA256(akad JSON)
  milestoneHash: bytes32;
  approvalHash: bytes32;

  // Status only
  status: uint8;
  timestamp: uint256;
}

// PII NEVER goes on-chain
// Only hashes and status
```

---

## 5. Data Security

### 5.1 Data Classification

| Classification | Examples | Storage | Encryption |
|---------------|----------|---------|------------|
| **Public** | Akad hash, TX hash | Blockchain | N/A |
| **Internal** | Akad status, amounts | PostgreSQL | At rest |
| **Confidential** | User email, phone | PostgreSQL | At rest + field |
| **Restricted** | NIK, KYC docs | PostgreSQL | At rest + field + access log |

### 5.2 Encryption

```typescript
// Field-level encryption for sensitive data
const encryptedNik = await encrypt(nik, {
  key: process.env.FIELD_ENCRYPTION_KEY,
  algorithm: 'aes-256-gcm',
  associatedData: userId // Binds to user
});

// Database encryption at rest (Supabase default)
// TLS 1.3 for all connections
```

### 5.3 Data Retention

| Data Type | Retention | After Retention |
|-----------|-----------|-----------------|
| Active Akad | Indefinite | - |
| Completed Akad | 7 years | Archive to cold storage |
| User Data | Account lifetime + 2 years | Anonymize |
| Audit Logs | 7 years | Archive |
| Payment Data | 7 years (regulatory) | Archive |
| Session Data | 30 days | Delete |

---

## 6. API Security

### 6.1 Rate Limiting

```typescript
// Per-endpoint rate limits
const rateLimits = {
  'POST /auth/login': { window: '15m', max: 5 },
  'POST /auth/otp/send': { window: '1h', max: 3 },
  'POST /akad': { window: '1h', max: 10 },
  'POST /payment/create': { window: '1h', max: 20 },
  'GET /akad': { window: '1m', max: 100 },
  'POST /webhook/*': { window: '1m', max: 1000 },
};
```

### 6.2 Input Validation

```typescript
// Using class-validator + class-transformer
@IsString()
@Length(10, 255)
title: string;

@IsNumber()
@Min(10000) // Minimum 10,000 IDR
@Max(10000000000) // Maximum 10 billion IDR
totalAmount: number;

@IsPhoneNumber('ID')
phone: string;

@IsEmail()
@IsOptional()
email?: string;
```

### 6.3 Security Headers

```typescript
// Helmet.js configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.xendit.co"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

---

## 7. Monitoring & Incident Response

### 7.1 Security Monitoring

| Event | Alert Level | Response |
|-------|-------------|----------|
| Failed login > 5x | Warning | Temporary lockout |
| Large withdrawal | High | Manual review queue |
| Hisbah freeze | High | Notify all parties |
| Smart contract pause | Critical | Incident response |
| Webhook signature fail | High | Block IP, investigate |

### 7.2 Audit Trail

```sql
-- All critical actions logged
INSERT INTO audit_trail (
  user_id,
  action,
  entity_type,
  entity_id,
  old_data,
  new_data,
  ip_address,
  user_agent,
  created_at
) VALUES (...);

-- Retention: 7 years
-- Access: Hisbah, Operator, Auditor roles only
```

### 7.3 Incident Response Plan

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCIDENT RESPONSE FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DETECT                                                       │
│     • Automated alerts (monitoring)                              │
│     • User reports                                               │
│     • External reports (bug bounty)                              │
│                                                                  │
│  2. ASSESS                                                       │
│     • Severity (Critical/High/Medium/Low)                        │
│     • Impact scope (users affected)                              │
│     • Data exposure risk                                         │
│                                                                  │
│  3. CONTAIN                                                      │
│     • Pause affected services                                    │
│     • Revoke compromised credentials                             │
│     • Freeze affected akad (Hisbah)                             │
│                                                                  │
│  4. REMEDIATE                                                    │
│     • Fix vulnerability                                          │
│     • Deploy patch                                               │
│     • Verify fix                                                 │
│                                                                  │
│  5. RECOVER                                                      │
│     • Restore services                                           │
│     • Unfreeze akad                                             │
│     • Notify affected users                                      │
│                                                                  │
│  6. POST-MORTEM                                                  │
│     • Root cause analysis                                        │
│     • Documentation                                              │
│     • Process improvement                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Compliance

### 8.1 Indonesia Regulations

| Regulation | Requirement | Implementation |
|------------|-------------|----------------|
| UU ITE | Data localization | Supabase SG/ID region |
| PDP | Consent & deletion | Consent flow, delete API |
| OJK Fintech | Escrow reporting | Monthly reports |
| BI Payment | QRIS compliance | Via Xendit (licensed) |

### 8.2 Sharia Compliance

| Principle | Implementation |
|-----------|----------------|
| No Riba | No interest on escrow |
| No Gharar | Clear akad terms |
| No Maysir | No speculative contracts |
| Transparency | All fees disclosed |
| Justice | Arbitration & Hisbah oversight |

---

## 9. Security Checklist

### Pre-Launch

- [ ] Penetration test completed
- [ ] Smart contract audit completed
- [ ] OWASP Top 10 mitigated
- [ ] Rate limiting configured
- [ ] WAF enabled
- [ ] SSL/TLS certificates
- [ ] Backup & recovery tested
- [ ] Incident response plan documented

### Ongoing

- [ ] Weekly dependency updates
- [ ] Monthly access review
- [ ] Quarterly security training
- [ ] Annual penetration test
- [ ] Continuous monitoring active
