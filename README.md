# AMANTRA

**Aman Transaksi, Aman Dana, Aman Kontrak**

Sistem Kontrak Digital, Rekening Penitipan (Escrow), dan Penyelesaian Otomatis berbasis QRIS, Bank API, dan Smart Contract Ledger.

## Tujuan Sistem

Menyediakan infrastruktur kepercayaan untuk transaksi perdagangan (petani, koperasi, swalayan, distributor, proyek) dengan prinsip:

- **Dana di Bank**: Uang tetap rupiah dan berada di rekening escrow bank (bukan blockchain)
- **QRIS Legal**: Pembayaran masuk melalui QRIS (GPN, legal Indonesia)
- **Smart Contract sebagai Notaris**: Blockchain hanya menyimpan kontrak digital, state machine, dan fee structure
- **Otomatis & Adil**: Settlement otomatis berdasarkan aturan yang disepakati sejak awal

## Arsitektur

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Oracle Backend  │────▶│  PostgreSQL     │
│   (Web/Mobile)  │     │  (Node.js)       │     │  (Event Sourced)│
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
            ┌───────────┐ ┌───────────┐ ┌───────────────┐
            │ QRIS      │ │ Bank      │ │ Smart Contract│
            │ Gateway   │ │ Escrow API│ │ (L2 Blockchain)│
            └───────────┘ └───────────┘ └───────────────┘
```

## State Machine

```
   CREATED ──────────────┐
      │                  │
      ▼                  ▼
   FUNDED ────────► CANCELLED
      │                  ▲
      ▼                  │
   VERIFIED              │
      │                  │
      ├──────► DISPUTED ─┘
      │            │
      ▼            ▼
   SETTLED    (resolves to SETTLED or CANCELLED)
```

## Prinsip Desain

### Keamanan
- Private key tidak pernah ada di frontend
- Gunakan KMS/HSM untuk signing
- Semua aksi bertanda tangan & bisa diaudit
- Role-based access control

### Integritas
- State machine yang ketat
- Validasi transisi sebelum perubahan
- Idempotent operations (tidak bisa dobel proses)
- Reconciliation ready

### Etika & Akad
- Fee disepakati di awal, dicatat di smart contract
- Tidak ada biaya tersembunyi
- Tidak ada perubahan sepihak setelah akad
- Keadilan melalui aturan otomatis

## Struktur Proyek

```
AMANTRA/
├── contracts/                  # Smart Contracts (Solidity)
│   └── AmantraContract.sol
├── src/
│   ├── domain/                # Domain Layer (Entities, Value Objects)
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── events/
│   │   └── repositories/
│   ├── application/           # Application Layer (Use Cases, Services)
│   │   ├── use-cases/
│   │   └── services/
│   ├── infrastructure/        # Infrastructure Layer
│   │   ├── database/
│   │   ├── blockchain/
│   │   ├── escrow/
│   │   └── jobs/
│   ├── interfaces/            # Interface Layer (HTTP, Webhooks)
│   │   └── http/
│   └── shared/                # Shared Utilities
├── package.json
├── tsconfig.json
└── hardhat.config.ts
```

## Quick Start

### Prerequisites
- Node.js >= 18
- PostgreSQL >= 14
- Redis (untuk caching & job queue)

### Installation

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run database migrations
npm run migrate

# Compile smart contracts
npm run compile:contracts

# Start development server
npm run dev
```

### Environment Variables

Lihat `.env.example` untuk daftar lengkap konfigurasi yang diperlukan.

## Syarat Settlement

Dana hanya boleh dicairkan otomatis jika **SEMUA** kondisi terpenuhi:

1. ✅ QRIS Payment = `PAID`
2. ✅ Verifikasi barang/jasa = `APPROVED`
3. ✅ Status on-chain = `VERIFIED`
4. ✅ Escrow balance mencukupi

## API Endpoints

### Contracts
- `POST /api/v1/contracts` - Buat kontrak baru
- `GET /api/v1/contracts/:id` - Detail kontrak
- `POST /api/v1/contracts/:id/verify` - Verifikasi barang
- `POST /api/v1/contracts/:id/dispute` - Ajukan sengketa

### Webhooks
- `POST /webhooks/qris/payment` - QRIS payment notification
- `POST /webhooks/bank/transfer` - Bank transfer notification

## Security Considerations

- ⚠️ Jangan simpan private key di environment variables untuk production
- ⚠️ Gunakan KMS (AWS KMS, GCP KMS, atau HSM) untuk signing
- ⚠️ Validasi semua webhook signatures
- ⚠️ Rate limit semua endpoints
- ⚠️ Audit log semua operasi sensitif

## License

UNLICENSED - Private & Confidential
