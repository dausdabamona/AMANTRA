# AMANTRA - Arsitektur Hybrid Custodial Syariah

## Ringkasan Eksekutif

AMANTRA adalah platform escrow muamalah yang menggabungkan kemudahan pembayaran digital Indonesia (QRIS, transfer bank, e-wallet) dengan transparansi dan keamanan blockchain sebagai "Notaris & Hakim Digital".

**Target Pengguna:** Masyarakat umum Indonesia (tukang, kontraktor, UMKM, freelancer, pesantren, koperasi)

**Prinsip Utama:**
- User awam TIDAK perlu crypto wallet
- Login via email / nomor HP
- Pembayaran via QRIS, transfer bank, e-wallet
- Blockchain sebagai pencatat kebenaran (source of truth)

---

## Diagram Arsitektur

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AMANTRA ECOSYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         USER LAYER                                   │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │    │
│  │  │  Web App │  │   PWA    │  │ Android  │  │   iOS    │            │    │
│  │  │ (Next.js)│  │          │  │(Capacitor│  │(Capacitor│            │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘            │    │
│  │       └──────────────┴──────────────┴──────────────┘                │    │
│  │                              │                                       │    │
│  │                      [Auth: Email/HP/Google]                        │    │
│  └──────────────────────────────┼──────────────────────────────────────┘    │
│                                 │                                            │
│  ┌──────────────────────────────┼──────────────────────────────────────┐    │
│  │                       API GATEWAY                                    │    │
│  │                    (NestJS + GraphQL)                               │    │
│  │                              │                                       │    │
│  │  ┌───────────┬───────────┬───────────┬───────────┬───────────┐     │    │
│  │  │   Auth    │   Akad    │  Payment  │  Dispute  │  Notif    │     │    │
│  │  │  Service  │  Service  │  Service  │  Service  │  Service  │     │    │
│  │  └─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┘     │    │
│  └────────┼───────────┼───────────┼───────────┼───────────┼──────────┘    │
│           │           │           │           │           │                 │
│  ┌────────┼───────────┼───────────┼───────────┼───────────┼──────────┐    │
│  │        │     BUSINESS LOGIC LAYER          │           │          │    │
│  │        │           │           │           │           │          │    │
│  │  ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐   │    │
│  │  │  Supabase │ │ Redis │ │   QRIS    │ │ Bank  │ │ Blockchain│   │    │
│  │  │ PostgreSQL│ │ Cache │ │  Gateway  │ │  API  │ │  Anchor   │   │    │
│  │  └───────────┘ └───────┘ └───────────┘ └───────┘ └─────┬─────┘   │    │
│  └────────────────────────────────────────────────────────┼──────────┘    │
│                                                           │                 │
│  ┌────────────────────────────────────────────────────────┼──────────┐    │
│  │                    BLOCKCHAIN LAYER                     │          │    │
│  │                                                         │          │    │
│  │  ┌─────────────────────────────────────────────────────┴───────┐  │    │
│  │  │                   AmantraLedgerV5                           │  │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │    │
│  │  │  │  Akad    │ │Milestone │ │ Dispute  │ │ Hisbah   │       │  │    │
│  │  │  │ Registry │ │ Tracker  │ │ Handler  │ │  Veto    │       │  │    │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │  │    │
│  │  └─────────────────────────────────────────────────────────────┘  │    │
│  │                                                                    │    │
│  │              [Polygon / Base / Arbitrum - EVM Compatible]         │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Alur Dana (Money Flow)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ALUR DANA AMANTRA                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐        │
│  │  PEMBELI │ ───► │   QRIS   │ ───► │  ESCROW  │ ───► │ PENJUAL  │        │
│  │  (User)  │      │ Gateway  │      │  AMANTRA │      │  (User)  │        │
│  └──────────┘      └──────────┘      └──────────┘      └──────────┘        │
│       │                 │                 │                 ▲               │
│       │                 │                 │                 │               │
│       ▼                 ▼                 ▼                 │               │
│  ┌─────────────────────────────────────────────────────────┴──────────┐    │
│  │                                                                     │    │
│  │   1. User scan QRIS / Transfer Bank                                │    │
│  │   2. Dana masuk ke Rekening Escrow Amantra (PT)                   │    │
│  │   3. Backend generate hash: SHA256(akad + amount + timestamp)      │    │
│  │   4. Hash di-anchor ke blockchain                                  │    │
│  │   5. Smart contract catat: akadId, pihak, nilai, status           │    │
│  │                                                                     │    │
│  │   PENCAIRAN DANA (hanya jika):                                     │    │
│  │   ✓ Saksi lapangan menyetujui milestone                           │    │
│  │   ✓ Arbitrator tidak menolak                                       │    │
│  │   ✓ Hisbah tidak membekukan                                        │    │
│  │   ✓ Masa tunggu dispute (3 hari) terlewati                        │    │
│  │                                                                     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    BLOCKCHAIN RECORDS                               │    │
│  │  ┌─────────────┬─────────────┬─────────────┬─────────────┐        │    │
│  │  │ Hash Akad   │ Hash        │ Hash        │ Hash        │        │    │
│  │  │ (SHA256)    │ Milestone   │ Approval    │ Release     │        │    │
│  │  │             │ Status      │ Saksi       │ Escrow      │        │    │
│  │  └─────────────┴─────────────┴─────────────┴─────────────┘        │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Peran & Akses

| Peran | Akses | Wallet | Blockchain Interaction |
|-------|-------|--------|----------------------|
| **User Biasa** | Dashboard, Buat Akad, Bayar | ❌ Tidak perlu | ❌ Tidak langsung |
| **Saksi Lapangan** | Approve Milestone | ❌ Tidak perlu | ❌ Via Backend |
| **Pengawas Proyek** | Validate Progress | ❌ Tidak perlu | ❌ Via Backend |
| **Arbitrator (Majelis)** | Putuskan Sengketa | ✅ Optional | ✅ Multisig |
| **Hisbah** | Freeze/Veto | ✅ Optional | ✅ Multisig |
| **Operator Escrow** | Bank Interface | ✅ HSM/KMS | ✅ Direct |

---

## Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Mobile:** Capacitor (iOS & Android)
- **State:** Zustand
- **UI:** Tailwind CSS + Radix UI
- **Auth:** Supabase Auth (Email, Phone, Google)

### Backend
- **Framework:** NestJS
- **API:** GraphQL + REST
- **Queue:** Bull (Redis)
- **Cache:** Redis

### Database
- **Primary:** PostgreSQL (Supabase)
- **Search:** PostgreSQL Full-Text Search
- **Files:** Supabase Storage

### Blockchain
- **Network:** Polygon PoS (low gas, fast)
- **Contract:** Solidity (AmantraLedgerV5)
- **Library:** ethers.js v6

### Payment
- **QRIS:** Xendit / Midtrans
- **Bank Transfer:** Xendit
- **E-Wallet:** OVO, GoPay, DANA (via Xendit)

### Infrastructure
- **Hosting:** Vercel (Frontend) + Railway/Fly.io (Backend)
- **Database:** Supabase
- **Secrets:** HashiCorp Vault / AWS KMS

---

## Prinsip Syariah

### 1. Akad Jelas (Clarity of Contract)
- Semua syarat tertulis dan disetujui kedua pihak
- Hash akad disimpan di blockchain (immutable)
- Tidak ada klausul tersembunyi

### 2. Upah Jelas (Clear Compensation)
- Nilai pembayaran ditentukan di awal
- Milestone dan termin jelas
- Biaya platform transparan (2-3%)

### 3. Tidak Ada Potongan Tersembunyi
- Fee ditampilkan sebelum konfirmasi
- Tidak ada bunga (riba)
- Tidak ada denda keterlambatan berlebihan

### 4. Dana Dibekukan Saat Sengketa
- Otomatis freeze jika ada dispute
- Hisbah bisa veto pencairan
- Majelis arbitrase memutuskan

### 5. Tidak Ada Keputusan Sepihak
- Minimal 2 dari 3 arbiter setuju
- Hisbah sebagai pengawas independen
- User bisa banding

### 6. Ada Majelis dan Hisbah
- 3 arbiter terlatih untuk sengketa
- Dewan hisbah untuk oversight
- Keputusan tercatat di blockchain

---

## Status Akad

```
┌─────────────────────────────────────────────────────────────┐
│                    STATE MACHINE - AKAD                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   DRAFT ──► PENDING_PAYMENT ──► FUNDED ──► IN_PROGRESS      │
│                    │                           │             │
│                    │                           ▼             │
│                    │              MILESTONE_APPROVED         │
│                    │                           │             │
│                    │                           ▼             │
│                    │              PENDING_RELEASE            │
│                    │                    │      │             │
│                    │                    │      ▼             │
│                    │                    │   COMPLETED        │
│                    │                    │                    │
│                    ▼                    ▼                    │
│   ┌─────────── DISPUTED ◄────────────────┘                  │
│   │                │                                         │
│   │                ▼                                         │
│   │      ARBITRATION_IN_PROGRESS                            │
│   │                │                                         │
│   │       ┌───────┴───────┐                                 │
│   │       ▼               ▼                                 │
│   │   RESOLVED_BUYER  RESOLVED_SELLER                       │
│   │                                                          │
│   │                                                          │
│   └──► FROZEN_BY_HISBAH ──► UNDER_REVIEW ──► UNFROZEN      │
│                                    │                         │
│                                    ▼                         │
│                               CANCELLED                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Model

### 1. User Authentication
- Email/Phone OTP via Supabase Auth
- Social login (Google)
- Session-based dengan JWT refresh

### 2. API Security
- Rate limiting per user/IP
- Request signing untuk payment webhooks
- CORS strict policy

### 3. Payment Security
- Webhook signature verification (Xendit/Midtrans)
- Idempotency keys untuk prevent double payment
- Audit trail lengkap

### 4. Blockchain Security
- Operator wallet di HSM/KMS (tidak di server)
- Multisig untuk operasi kritis
- Time-lock untuk pencairan besar

### 5. Data Security
- Encryption at rest (Supabase)
- Encryption in transit (TLS 1.3)
- PII data hashing sebelum ke blockchain

---

## Roadmap MVP (3 Bulan)

### Bulan 1: Foundation
**Week 1-2:**
- Setup project structure
- Database schema implementation
- Supabase Auth integration

**Week 3-4:**
- Basic CRUD API (NestJS)
- User registration & login
- Dashboard skeleton

### Bulan 2: Core Features
**Week 5-6:**
- Akad creation flow
- QRIS payment integration (Xendit sandbox)
- Milestone tracking

**Week 7-8:**
- Blockchain anchoring service
- Smart contract deployment (testnet)
- Witness approval flow

### Bulan 3: Governance & Polish
**Week 9-10:**
- Dispute handling
- Arbitration panel
- Hisbah oversight

**Week 11-12:**
- Testing & bug fixes
- Security audit
- Soft launch (beta users)

---

## File Structure

```
AMANTRA/
├── frontend/                 # Next.js + Capacitor
│   ├── src/
│   │   ├── app/             # App Router pages
│   │   ├── components/      # Reusable components
│   │   ├── hooks/           # Custom hooks
│   │   ├── lib/             # Utilities
│   │   ├── store/           # Zustand stores
│   │   └── types/           # TypeScript types
│   ├── capacitor/           # Mobile config
│   └── public/
│
├── backend/                  # NestJS
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/        # Authentication
│   │   │   ├── akad/        # Contract management
│   │   │   ├── payment/     # QRIS, Bank, E-wallet
│   │   │   ├── milestone/   # Progress tracking
│   │   │   ├── dispute/     # Sengketa handling
│   │   │   ├── witness/     # Saksi approval
│   │   │   ├── arbitration/ # Majelis
│   │   │   ├── hisbah/      # Oversight
│   │   │   └── blockchain/  # Chain anchor
│   │   ├── common/          # Shared utilities
│   │   └── config/          # Configuration
│   └── prisma/              # Database schema
│
├── contracts/               # Solidity
│   ├── src/
│   │   └── AmantraLedgerV5.sol
│   ├── test/
│   └── scripts/
│
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DATABASE.md
│   └── SECURITY.md
│
└── infra/                   # Infrastructure
    ├── docker/
    └── k8s/
```
