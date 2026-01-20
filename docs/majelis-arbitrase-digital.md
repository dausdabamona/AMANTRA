# MAJELIS ARBITRASE DIGITAL AMANTRA

## Piagam dan Tata Kelola Dewan Arbitrase

**Versi:** 1.0.0
**Tanggal Efektif:** 2026-01-20
**Status:** AKTIF

---

## PRINSIP ETIKA UTAMA

> **"Uang dikunci oleh teknologi, keputusan dikunci oleh amanah manusia, dan keadilan tidak boleh berada di satu tangan."**

> **"Dana titipan adalah amanah, bukan milik sistem, dan tidak boleh dimanfaatkan."**

---

## DAFTAR ISI

1. [Filosofi dan Dasar Hukum](#1-filosofi-dan-dasar-hukum)
2. [Struktur Organisasi](#2-struktur-organisasi)
3. [Alur Sengketa (Dispute Lifecycle)](#3-alur-sengketa-dispute-lifecycle)
4. [Kewenangan dan Batasan](#4-kewenangan-dan-batasan)
5. [Tata Tertib Sidang](#5-tata-tertib-sidang)
6. [Konflik Kepentingan](#6-konflik-kepentingan)
7. [Transparansi dan Akuntabilitas](#7-transparansi-dan-akuntabilitas)
8. [Kode Etik Arbiter](#8-kode-etik-arbiter)
9. [Mekanisme Teknis](#9-mekanisme-teknis)
10. [Lampiran](#10-lampiran)

---

## 1. FILOSOFI DAN DASAR HUKUM

### 1.1 Landasan Filosofis

Majelis Arbitrase Digital AMANTRA didirikan berdasarkan prinsip-prinsip:

1. **Keadilan (Al-'Adl)**: Setiap keputusan harus adil dan tidak memihak
2. **Amanah**: Dana escrow adalah titipan yang harus dijaga
3. **Transparansi**: Semua proses harus dapat diaudit
4. **Pemisahan Kekuasaan**: Tidak ada satu pihak yang memegang kendali penuh

### 1.2 Dasar Hukum

- UU No. 30 Tahun 1999 tentang Arbitrase dan Alternatif Penyelesaian Sengketa
- Prinsip Syariah dalam Transaksi Keuangan (DSN-MUI)
- Smart Contract Law dan Digital Evidence Standards

### 1.3 Yurisdiksi

Majelis memiliki yurisdiksi atas:
- Sengketa transaksi yang terdaftar di platform AMANTRA
- Nilai sengketa tidak terbatas
- Wilayah hukum Republik Indonesia

---

## 2. STRUKTUR ORGANISASI

### 2.1 Komposisi Majelis

```
┌─────────────────────────────────────────────────────────────┐
│                  MAJELIS ARBITRASE DIGITAL                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│   │   KETUA     │   │   ANGGOTA   │   │   ANGGOTA   │       │
│   │   MAJELIS   │   │   MAJELIS   │   │   MAJELIS   │       │
│   │    (1)      │   │    (1+)     │   │    (1+)     │       │
│   └─────────────┘   └─────────────┘   └─────────────┘       │
│                                                              │
│   Minimum: 3 Anggota                                         │
│   Threshold: 2-of-3 (atau lebih)                            │
│   Implementasi: Gnosis Safe Multisig                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Kualifikasi Anggota

| Kriteria | Ketua Majelis | Anggota Majelis |
|----------|---------------|-----------------|
| Pendidikan | S2 Hukum/Ekonomi Syariah | S1 Hukum/Ekonomi |
| Pengalaman | 10+ tahun | 5+ tahun |
| Sertifikasi | Arbiter Bersertifikat | Diutamakan |
| Bebas Konflik | Wajib | Wajib |

### 2.3 Pemisahan Kekuasaan

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    OPERATOR     │   │   ARBITRATOR    │   │   ESCROW BANK   │
│    (Platform)   │   │   (Majelis)     │   │    (BSI/dll)    │
├─────────────────┤   ├─────────────────┤   ├─────────────────┤
│ - Buat kontrak  │   │ - Review bukti  │   │ - Simpan dana   │
│ - Verifikasi    │   │ - Putus sengketa│   │ - Transfer dana │
│ - Ajukan dispute│   │ - Queue resolusi│   │ - Freeze/unfreeze│
│ - TIDAK BOLEH   │   │ - Execute resolusi│ │ - TIDAK BOLEH   │
│   memutus       │   │ - TIDAK BOLEH   │   │   memutus       │
│   sengketa      │   │   operasi bisnis│   │   sengketa      │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

**ATURAN EMAS:**
- `OPERATOR_ROLE` ≠ `ARBITRATOR_ROLE`
- Alamat multisig Operator HARUS berbeda dengan alamat multisig Arbiter
- Smart contract MENOLAK jika alamat sama

---

## 3. ALUR SENGKETA (DISPUTE LIFECYCLE)

### 3.1 Diagram Alur

```
                           ┌───────────────────┐
                           │    KONTRAK        │
                           │    BERJALAN       │
                           │  (FUNDED/VERIFIED)│
                           └─────────┬─────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │      SENGKETA DIAJUKAN          │
                    │  (oleh Buyer/Seller/Operator)   │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │      STATUS: SUBMITTED          │
                    │  • Dana otomatis DIBEKUKAN      │
                    │  • Settlement DIBLOKIR          │
                    │  • Bukti awal dicatat on-chain  │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │   STATUS: EVIDENCE_COLLECTION   │
                    │  • Kedua pihak submit bukti     │
                    │  • Deadline: 7 hari             │
                    │  • Hash bukti dicatat on-chain  │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │     STATUS: UNDER_REVIEW        │
                    │  • Majelis review bukti         │
                    │  • Analisis off-chain           │
                    │  • Deliberasi internal          │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │   STATUS: RESOLUTION_QUEUED     │
                    │  • Keputusan dibuat             │
                    │  • Hash keputusan on-chain      │
                    │  • TIMELOCK: 24-48 JAM          │
                    │  • Pihak dapat review/banding   │
                    └────────────────┬───────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
            TIMELOCK SELESAI                   BANDING DITERIMA
                    │                                 │
                    ▼                                 ▼
     ┌──────────────────────────┐    ┌──────────────────────────┐
     │   STATUS: RESOLVED        │    │   KEMBALI KE REVIEW      │
     │  • Eksekusi otomatis      │    │  • Timelock dibatalkan   │
     │  • Dana ditransfer        │    │  • Review ulang          │
     │  • Kontrak final          │    └──────────────────────────┘
     │  • TIDAK DAPAT DIUBAH     │
     └──────────────────────────┘
```

### 3.2 Timeline Standar

| Tahap | Durasi Maksimal | Keterangan |
|-------|-----------------|------------|
| Pengajuan → Evidence Collection | Instan | Otomatis setelah sengketa diajukan |
| Evidence Collection | 7 hari | Dapat diperpanjang 1x (3 hari) |
| Under Review | 14 hari | Termasuk deliberasi majelis |
| Resolution Queued (Timelock) | 24-48 jam | Tidak dapat dipersingkat |
| **Total Maksimal** | **24 hari** | Dapat lebih cepat |

### 3.3 Jenis Keputusan

```
┌─────────────────────────────────────────────────────────────────┐
│                    JENIS RESOLUSI                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CONTINUE_SETTLEMENT                                          │
│     └─ Transaksi dilanjutkan, dana ke penjual                   │
│     └─ Status: DISPUTED → VERIFIED → SETTLED                     │
│                                                                  │
│  2. REFUND_BUYER                                                 │
│     └─ Pembatalan penuh, dana kembali ke pembeli                │
│     └─ Status: DISPUTED → CANCELLED                              │
│                                                                  │
│  3. PAY_SELLER                                                   │
│     └─ Pembayaran penuh ke penjual                              │
│     └─ Status: DISPUTED → VERIFIED → SETTLED                     │
│                                                                  │
│  4. CUSTOM_SPLIT                                                 │
│     └─ Pembagian khusus sesuai keputusan majelis                │
│     └─ Contoh: 70% seller, 30% buyer                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. KEWENANGAN DAN BATASAN

### 4.1 Kewenangan Majelis

✅ **BOLEH:**
- Memeriksa bukti dari kedua pihak
- Meminta bukti tambahan
- Membuat keputusan final
- Menentukan pembagian dana
- Memperpanjang deadline evidence collection
- Membatalkan resolusi yang sudah di-queue (sebelum timelock habis)

❌ **TIDAK BOLEH:**
- Memaksa transfer tanpa persetujuan mayoritas (threshold)
- Mengubah keputusan yang sudah dieksekusi
- Mengakses dana escrow secara langsung
- Menjalankan operasi bisnis platform
- Membuat kontrak baru

### 4.2 Batasan Teknis (On-Chain Enforcement)

```solidity
// Smart contract memastikan:
modifier onlyArbitrationCouncil() {
    if (msg.sender != arbitrationCouncil) {
        revert AccessControlUnauthorizedAccount(msg.sender, ARBITRATOR_ROLE);
    }
    _;
}

// Arbiter TIDAK BISA menjadi Operator
if (_oracleMultisig == _arbitrationCouncil) {
    revert ArbitratorCannotBeOperator(_arbitrationCouncil);
}

// Timelock WAJIB (minimal 24 jam)
uint64 public constant MIN_RESOLUTION_DELAY = 24 hours;
```

---

## 5. TATA TERTIB SIDANG

### 5.1 Prosedur Pemeriksaan

1. **Pembukaan**
   - Ketua majelis membuka sidang
   - Verifikasi identitas pihak
   - Verifikasi hash bukti on-chain

2. **Pemeriksaan Bukti**
   - Review bukti dari pemohon (disputing party)
   - Review bukti dari termohon (responding party)
   - Cross-check dengan data blockchain

3. **Deliberasi**
   - Diskusi internal majelis
   - Voting dengan threshold (min 2-of-3)
   - Dokumentasi alasan keputusan

4. **Pengumuman**
   - Upload keputusan ke IPFS
   - Hash keputusan di-record on-chain
   - Mulai timelock period

### 5.2 Quorum

| Jumlah Anggota | Quorum Minimum | Threshold Keputusan |
|----------------|----------------|---------------------|
| 3 | 3 | 2-of-3 |
| 5 | 4 | 3-of-5 |
| 7 | 5 | 4-of-7 |

---

## 6. KONFLIK KEPENTINGAN

### 6.1 Deklarasi Wajib

Setiap anggota majelis WAJIB mendeklarasikan:
- Hubungan bisnis dengan pihak bersengketa
- Hubungan keluarga dengan pihak bersengketa
- Kepemilikan saham di perusahaan terkait
- Sejarah transaksi dengan pihak terkait

### 6.2 Pengunduran Diri (Recusal)

Anggota WAJIB mengundurkan diri dari sidang jika:
- Memiliki konflik kepentingan langsung
- Pernah bertransaksi dengan salah satu pihak
- Diminta oleh mayoritas anggota lain

### 6.3 Sanksi Pelanggaran

| Pelanggaran | Sanksi |
|-------------|--------|
| Tidak mendeklarasikan konflik | Peringatan keras |
| Partisipasi dengan konflik | Pembatalan suara |
| Pengulangan | Pemberhentian dari majelis |

---

## 7. TRANSPARANSI DAN AKUNTABILITAS

### 7.1 Data Publik (On-Chain)

Semua data berikut dapat diverifikasi di blockchain:
- Hash bukti yang disubmit
- Hash keputusan arbitrase
- Timestamp setiap tahap
- Alamat pihak yang melakukan aksi
- Hasil akhir (status kontrak)

### 7.2 Data Privat (Off-Chain)

Disimpan terenkripsi dan hanya dapat diakses oleh:
- Pihak bersengketa
- Anggota majelis yang ditunjuk
- Auditor yang ditunjuk pengadilan

### 7.3 Laporan Berkala

Majelis menerbitkan laporan publik setiap kuartal:
- Jumlah sengketa yang ditangani
- Waktu rata-rata penyelesaian
- Distribusi jenis keputusan
- Tanpa mengungkap identitas pihak

---

## 8. KODE ETIK ARBITER

### 8.1 Prinsip Dasar

1. **Integritas**: Bertindak jujur dan adil
2. **Independensi**: Bebas dari pengaruh eksternal
3. **Imparsialitas**: Tidak memihak salah satu pihak
4. **Kompetensi**: Memiliki keahlian yang diperlukan
5. **Kerahasiaan**: Menjaga privasi pihak bersengketa

### 8.2 Larangan

❌ Menerima hadiah/suap dari pihak bersengketa
❌ Berkomunikasi ex-parte dengan salah satu pihak
❌ Membocorkan informasi sidang
❌ Menggunakan informasi untuk keuntungan pribadi
❌ Memanipulasi hasil keputusan

### 8.3 Sumpah Jabatan

```
"Saya berjanji dengan penuh kesadaran dan tanggung jawab,
akan menjalankan tugas sebagai arbiter dengan adil, jujur,
dan tidak memihak, demi keadilan dan kemaslahatan bersama.
Saya akan menjaga amanah dana titipan dan tidak akan
menyalahgunakannya untuk kepentingan pribadi atau pihak manapun."
```

---

## 9. MEKANISME TEKNIS

### 9.1 Smart Contract Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   AmantraLedgerV3.sol                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ROLES:                                                      │
│  ├─ OPERATOR_ROLE     → Platform operations                 │
│  ├─ ARBITRATOR_ROLE   → Dispute resolution (Majelis)        │
│  ├─ ORACLE_ROLE       → Settlement execution                │
│  └─ EMERGENCY_ROLE    → Circuit breaker                     │
│                                                              │
│  MULTISIG VALIDATION:                                        │
│  ├─ Oracle Multisig    → Threshold ≥ 2                      │
│  └─ Arbiter Multisig   → Threshold ≥ 2, Members ≥ 3         │
│                                                              │
│  TIMELOCK:                                                   │
│  ├─ MIN_RESOLUTION_DELAY = 24 hours                         │
│  └─ MAX_RESOLUTION_DELAY = 48 hours                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Dispute Flow (Technical)

```typescript
// 1. Raise Dispute (Buyer/Seller/Operator)
await contract.raiseDispute(
  contractId,
  reasonHash,      // SHA-256 of reason document
  evidenceHash,    // IPFS hash of evidence bundle
  transactionRef   // Idempotency key
);

// 2. Submit Evidence
await contract.submitEvidence(
  contractId,
  evidenceHash,    // IPFS hash
  evidenceType     // "DOCUMENT" | "PHOTO" | etc.
);

// 3. Queue Resolution (Arbitration Council)
await contract.queueResolution(
  contractId,
  arbitrationHash,   // SHA-256 of signed decision PDF
  resolutionType     // 0=CONTINUE, 1=REFUND, 2=PAY_SELLER, 3=CUSTOM
);

// 4. Execute Resolution (After Timelock)
await contract.executeResolution(
  contractId,
  arbitrationHash,
  transactionRef
);
```

### 9.3 Evidence Storage

```
┌─────────────────────────────────────────────────────────────┐
│                    EVIDENCE STORAGE                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User uploads file                                        │
│     └─ File → SHA-256 Hash → IPFS Upload                    │
│                                                              │
│  2. Backend records metadata                                 │
│     └─ PostgreSQL: filename, size, type, uploader           │
│                                                              │
│  3. Hash anchored on-chain                                   │
│     └─ Event: EvidenceSubmitted(contractId, ipfsHash, ...)  │
│                                                              │
│  4. Verification                                             │
│     └─ Download from IPFS → Recompute hash → Compare        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. LAMPIRAN

### 10.1 Glossary

| Istilah | Definisi |
|---------|----------|
| **Majelis** | Dewan arbiter yang memutus sengketa |
| **Multisig** | Dompet yang memerlukan banyak tanda tangan |
| **Timelock** | Periode tunggu sebelum keputusan dieksekusi |
| **Hash** | Sidik jari digital dari dokumen |
| **IPFS** | Sistem penyimpanan terdesentralisasi |
| **On-chain** | Data yang tercatat di blockchain |
| **Off-chain** | Data yang disimpan di luar blockchain |

### 10.2 Template Dokumen

#### Template Keputusan Arbitrase

```
═══════════════════════════════════════════════════════════════
               KEPUTUSAN MAJELIS ARBITRASE DIGITAL
                          AMANTRA
═══════════════════════════════════════════════════════════════

Nomor Perkara    : [CONTRACT_ID]
Tanggal Keputusan: [DATE]
Hash Keputusan   : [SHA-256 HASH]

───────────────────────────────────────────────────────────────
PIHAK-PIHAK

Pemohon  : [BUYER/SELLER]
           Alamat: [WALLET_ADDRESS]

Termohon : [SELLER/BUYER]
           Alamat: [WALLET_ADDRESS]

───────────────────────────────────────────────────────────────
DUDUK PERKARA

[Uraian singkat kronologi sengketa]

───────────────────────────────────────────────────────────────
BUKTI YANG DIPERTIMBANGKAN

1. [Evidence #1 - IPFS Hash]
2. [Evidence #2 - IPFS Hash]
3. [...]

───────────────────────────────────────────────────────────────
PERTIMBANGAN HUKUM

[Analisis bukti dan dasar hukum]

───────────────────────────────────────────────────────────────
AMAR PUTUSAN

Majelis Arbitrase Digital AMANTRA memutuskan:

1. [Keputusan utama - CONTINUE/REFUND/PAY_SELLER/CUSTOM_SPLIT]
2. [Pembagian dana jika CUSTOM_SPLIT]
3. [Ketentuan tambahan jika ada]

───────────────────────────────────────────────────────────────
PENUTUP

Keputusan ini bersifat FINAL dan akan dieksekusi otomatis
setelah periode timelock berakhir ([TIMELOCK_END_DATE]).

                                    [CITY], [DATE]

                              MAJELIS ARBITRASE DIGITAL
                                     AMANTRA

        [SIGNATURE 1]        [SIGNATURE 2]        [SIGNATURE 3]
        [ARBITER 1]          [ARBITER 2]          [ARBITER 3]

═══════════════════════════════════════════════════════════════
Transaction Hash: [TX_HASH]
Block Number    : [BLOCK_NUMBER]
Timestamp       : [TIMESTAMP]
═══════════════════════════════════════════════════════════════
```

### 10.3 Kontak

**Sekretariat Majelis Arbitrase Digital AMANTRA**
- Email: arbitrase@amantra.id
- Hotline: [TBD]
- Alamat On-chain: [ARBITRATION_COUNCIL_ADDRESS]

---

**Dokumen ini bersifat mengikat bagi seluruh pihak yang menggunakan platform AMANTRA.**

*Terakhir diperbarui: 2026-01-20*
