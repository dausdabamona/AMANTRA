# AMANTRA - API Specification

## Base URL

```
Production: https://api.amantra.id/v1
Staging:    https://api-staging.amantra.id/v1
Local:      http://localhost:3001/v1
```

## Authentication

### Headers
```
Authorization: Bearer <jwt_token>
X-Request-ID: <uuid>
```

### Rate Limits
- Anonymous: 100 req/min
- Authenticated: 1000 req/min
- Payment webhooks: 10000 req/min

---

## Endpoints

### 1. Authentication

#### POST /auth/register
Register new user with email/phone.

**Request:**
```json
{
  "email": "user@example.com",
  "phone": "+6281234567890",
  "name": "John Doe",
  "password": "SecurePass123!"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "phone": "+6281234567890",
      "name": "John Doe",
      "role": "user",
      "kyc_status": "pending"
    },
    "session": {
      "access_token": "jwt...",
      "refresh_token": "jwt...",
      "expires_at": "2024-01-01T00:00:00Z"
    }
  }
}
```

#### POST /auth/login
Login with email/phone + password or OTP.

**Request (Password):**
```json
{
  "identifier": "user@example.com",
  "password": "SecurePass123!"
}
```

**Request (OTP):**
```json
{
  "identifier": "+6281234567890",
  "otp": "123456"
}
```

#### POST /auth/otp/send
Send OTP to phone/email.

**Request:**
```json
{
  "identifier": "+6281234567890",
  "type": "sms"
}
```

#### POST /auth/refresh
Refresh access token.

**Request:**
```json
{
  "refresh_token": "jwt..."
}
```

#### POST /auth/logout
Logout and invalidate tokens.

---

### 2. Akad (Contracts)

#### GET /akad
List user's contracts.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| status | string | Filter by status |
| role | string | 'buyer' or 'seller' |
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "contract_number": "AMT-20240101-000001",
        "title": "Renovasi Rumah",
        "buyer": {
          "id": "uuid",
          "name": "Budi"
        },
        "seller": {
          "id": "uuid",
          "name": "CV Jaya Makmur"
        },
        "total_amount": 50000000,
        "status": "in_progress",
        "akad_type": "istisna",
        "created_at": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "total_pages": 5
    }
  }
}
```

#### POST /akad
Create new akad (contract).

**Request:**
```json
{
  "title": "Renovasi Rumah",
  "description": "Renovasi rumah lengkap termasuk cat, keramik, dan plafon",
  "akad_type": "istisna",
  "seller_identifier": "+6281234567890",
  "total_amount": 50000000,
  "milestones": [
    {
      "title": "DP (Down Payment)",
      "percentage": 30,
      "description": "Pembayaran uang muka"
    },
    {
      "title": "Progress 50%",
      "percentage": 40,
      "description": "Pekerjaan mencapai 50%"
    },
    {
      "title": "Serah Terima",
      "percentage": 30,
      "description": "Pekerjaan selesai dan diterima"
    }
  ],
  "witnesses": [
    {
      "identifier": "+6289876543210",
      "role": "saksi_lapangan"
    }
  ],
  "terms_and_conditions": "1. Garansi 6 bulan\n2. Material sesuai spesifikasi",
  "delivery_deadline": "2024-03-01T00:00:00Z",
  "delivery_address": "Jl. Contoh No. 123, Jakarta"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "contract_number": "AMT-20240101-000001",
    "status": "draft",
    "payment_url": null,
    "blockchain_status": "pending"
  }
}
```

#### GET /akad/:id
Get akad details.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "contract_number": "AMT-20240101-000001",
    "title": "Renovasi Rumah",
    "description": "...",
    "akad_type": "istisna",
    "buyer": {
      "id": "uuid",
      "name": "Budi",
      "phone": "+62812****7890"
    },
    "seller": {
      "id": "uuid",
      "name": "CV Jaya Makmur",
      "phone": "+62813****4567"
    },
    "total_amount": 50000000,
    "platform_fee": 1250000,
    "status": "in_progress",
    "milestones": [
      {
        "id": "uuid",
        "sequence_number": 1,
        "title": "DP",
        "percentage": 30,
        "amount": 15000000,
        "status": "released"
      }
    ],
    "witnesses": [
      {
        "id": "uuid",
        "name": "Pak RT",
        "role": "saksi_lapangan",
        "approved_at": "2024-01-02T00:00:00Z"
      }
    ],
    "blockchain": {
      "network": "polygon",
      "akad_hash": "0x...",
      "tx_hash": "0x...",
      "explorer_url": "https://polygonscan.com/tx/0x..."
    },
    "created_at": "2024-01-01T00:00:00Z",
    "funded_at": "2024-01-01T12:00:00Z"
  }
}
```

#### PUT /akad/:id
Update akad (only in draft status).

#### POST /akad/:id/submit
Submit akad for counterparty approval.

#### POST /akad/:id/approve
Approve akad (counterparty).

#### POST /akad/:id/reject
Reject akad with reason.

---

### 3. Payment

#### POST /payment/create
Create payment for akad.

**Request:**
```json
{
  "akad_id": "uuid",
  "method": "qris",
  "payer_email": "user@example.com",
  "payer_phone": "+6281234567890"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "amount": 51250000,
    "breakdown": {
      "akad_amount": 50000000,
      "platform_fee": 1250000
    },
    "method": "qris",
    "qr_code_url": "https://...",
    "payment_url": "https://...",
    "expires_at": "2024-01-01T01:00:00Z"
  }
}
```

#### GET /payment/:id
Get payment status.

#### POST /payment/webhook/xendit
Xendit webhook receiver.

**Headers:**
```
X-Callback-Token: <xendit_callback_token>
```

**Request:**
```json
{
  "id": "invoice_id",
  "external_id": "payment_uuid",
  "status": "PAID",
  "paid_amount": 51250000,
  "paid_at": "2024-01-01T00:30:00Z",
  "payment_method": "QR_CODE",
  "payment_channel": "QRIS"
}
```

---

### 4. Milestone

#### GET /milestone/:id
Get milestone details.

#### POST /milestone/:id/submit
Submit milestone for approval (seller).

**Request:**
```json
{
  "evidence_urls": [
    "https://storage.amantra.id/evidence/photo1.jpg",
    "https://storage.amantra.id/evidence/photo2.jpg"
  ],
  "description": "Pekerjaan cat sudah selesai 100%"
}
```

#### POST /milestone/:id/approve
Approve milestone (buyer).

**Request:**
```json
{
  "note": "Pekerjaan sesuai, approved"
}
```

#### POST /milestone/:id/reject
Reject milestone (buyer).

**Request:**
```json
{
  "reason": "Cat masih belum rata di bagian sudut",
  "evidence_urls": [
    "https://storage.amantra.id/evidence/reject1.jpg"
  ]
}
```

---

### 5. Witness

#### GET /witness/assignments
Get witness assignments.

#### POST /witness/:id/approve
Approve as witness.

**Request:**
```json
{
  "note": "Pekerjaan sudah sesuai milestone",
  "location": {
    "lat": -6.2088,
    "lng": 106.8456,
    "accuracy": 10,
    "address": "Jl. Contoh, Jakarta"
  }
}
```

---

### 6. Dispute

#### POST /dispute/raise
Raise a dispute.

**Request:**
```json
{
  "akad_id": "uuid",
  "milestone_id": "uuid",
  "category": "quality_issue",
  "reason": "Kualitas cat tidak sesuai spesifikasi",
  "evidence_urls": [
    "https://storage.amantra.id/evidence/dispute1.jpg"
  ]
}
```

#### POST /dispute/:id/respond
Respond to dispute (respondent).

**Request:**
```json
{
  "response": "Cat sudah sesuai, mungkin ada kesalahpahaman",
  "evidence_urls": [
    "https://storage.amantra.id/evidence/response1.jpg"
  ]
}
```

#### GET /dispute/:id
Get dispute details.

---

### 7. Arbitration (Majelis)

#### GET /arbitration/cases
Get assigned arbitration cases.

#### POST /arbitration/:id/vote
Cast arbitration vote.

**Request:**
```json
{
  "vote": "favor_buyer",
  "reason": "Bukti menunjukkan kualitas tidak sesuai kontrak"
}
```

---

### 8. Hisbah

#### GET /hisbah/alerts
Get active alerts requiring attention.

#### POST /hisbah/freeze
Freeze an akad.

**Request:**
```json
{
  "akad_id": "uuid",
  "reason": "Indikasi penipuan terdeteksi",
  "evidence_urls": ["..."]
}
```

#### POST /hisbah/unfreeze
Unfreeze an akad.

#### POST /hisbah/veto
Veto a release.

**Request:**
```json
{
  "akad_id": "uuid",
  "milestone_id": "uuid",
  "reason": "Tidak cukup bukti pekerjaan selesai"
}
```

---

### 9. Upload

#### POST /upload
Upload file to storage.

**Request:** multipart/form-data
```
file: <binary>
type: evidence | document | avatar
akad_id: uuid (optional)
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "url": "https://storage.amantra.id/evidence/uuid.jpg",
    "filename": "uuid.jpg",
    "size": 123456,
    "mime_type": "image/jpeg"
  }
}
```

---

### 10. Notifications

#### GET /notifications
Get user notifications.

#### PUT /notifications/:id/read
Mark notification as read.

#### PUT /notifications/read-all
Mark all notifications as read.

---

## Error Responses

### Standard Error Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| AUTH_REQUIRED | 401 | Authentication required |
| AUTH_INVALID | 401 | Invalid credentials |
| AUTH_EXPIRED | 401 | Token expired |
| FORBIDDEN | 403 | Access denied |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Validation failed |
| CONFLICT | 409 | Resource conflict |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |
| PAYMENT_FAILED | 400 | Payment processing failed |
| AKAD_LOCKED | 400 | Akad is locked/frozen |
| DISPUTE_EXISTS | 400 | Active dispute exists |

---

## Webhook Events

### Payment Events
```json
{
  "event": "payment.paid",
  "data": {
    "payment_id": "uuid",
    "akad_id": "uuid",
    "amount": 51250000,
    "paid_at": "2024-01-01T00:00:00Z"
  }
}
```

### Akad Events
```json
{
  "event": "akad.status_changed",
  "data": {
    "akad_id": "uuid",
    "old_status": "funded",
    "new_status": "in_progress"
  }
}
```

### Dispute Events
```json
{
  "event": "dispute.raised",
  "data": {
    "dispute_id": "uuid",
    "akad_id": "uuid",
    "raised_by": "uuid",
    "category": "quality_issue"
  }
}
```
