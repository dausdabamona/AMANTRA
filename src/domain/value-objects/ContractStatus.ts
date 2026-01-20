/**
 * AMANTRA - Contract Status Value Object
 *
 * State machine yang ketat untuk status kontrak.
 * Setiap transisi harus divalidasi sebelum dieksekusi.
 *
 * State Flow:
 *
 *   CREATED ──────────────┐
 *      │                  │
 *      ▼                  ▼
 *   FUNDED ────────► CANCELLED
 *      │                  ▲
 *      ▼                  │
 *   VERIFIED              │
 *      │                  │
 *      ├──────► DISPUTED ─┘
 *      │            │
 *      ▼            ▼
 *   SETTLED    (resolves to SETTLED or CANCELLED)
 */

export enum ContractStatus {
  /** Kontrak baru dibuat, menunggu pembayaran */
  CREATED = 'CREATED',

  /** Dana telah masuk ke escrow via QRIS */
  FUNDED = 'FUNDED',

  /** Barang telah diterima dan lulus QC */
  VERIFIED = 'VERIFIED',

  /** Dana telah dicairkan ke seller */
  SETTLED = 'SETTLED',

  /** Sengketa diajukan, menunggu resolusi */
  DISPUTED = 'DISPUTED',

  /** Kontrak dibatalkan (dengan atau tanpa refund) */
  CANCELLED = 'CANCELLED',
}

/**
 * Definisi transisi yang diizinkan dalam state machine
 */
const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  [ContractStatus.CREATED]: [
    ContractStatus.FUNDED,    // Pembayaran masuk
    ContractStatus.CANCELLED, // Dibatalkan sebelum pembayaran
  ],

  [ContractStatus.FUNDED]: [
    ContractStatus.VERIFIED,  // Barang diterima & lulus QC
    ContractStatus.DISPUTED,  // Sengketa diajukan
    ContractStatus.CANCELLED, // Dibatalkan (refund)
  ],

  [ContractStatus.VERIFIED]: [
    ContractStatus.SETTLED,   // Dana dicairkan
    ContractStatus.DISPUTED,  // Sengketa post-verifikasi
  ],

  [ContractStatus.SETTLED]: [], // Terminal state

  [ContractStatus.DISPUTED]: [
    ContractStatus.SETTLED,   // Sengketa selesai, dana dicairkan
    ContractStatus.CANCELLED, // Sengketa selesai, refund
  ],

  [ContractStatus.CANCELLED]: [], // Terminal state
};

/**
 * Status yang memerlukan tindakan (aktif)
 */
export const ACTIVE_STATUSES: ContractStatus[] = [
  ContractStatus.CREATED,
  ContractStatus.FUNDED,
  ContractStatus.VERIFIED,
  ContractStatus.DISPUTED,
];

/**
 * Status terminal (final)
 */
export const TERMINAL_STATUSES: ContractStatus[] = [
  ContractStatus.SETTLED,
  ContractStatus.CANCELLED,
];

/**
 * Status yang memiliki dana di escrow
 */
export const ESCROW_ACTIVE_STATUSES: ContractStatus[] = [
  ContractStatus.FUNDED,
  ContractStatus.VERIFIED,
  ContractStatus.DISPUTED,
];

export class ContractStatusTransition {
  /**
   * Validasi apakah transisi dari satu status ke status lain diizinkan
   */
  static canTransition(from: ContractStatus, to: ContractStatus): boolean {
    const allowedTargets = ALLOWED_TRANSITIONS[from];
    return allowedTargets.includes(to);
  }

  /**
   * Mendapatkan daftar status yang bisa dicapai dari status saat ini
   */
  static getNextPossibleStatuses(current: ContractStatus): ContractStatus[] {
    return [...ALLOWED_TRANSITIONS[current]];
  }

  /**
   * Cek apakah status adalah terminal (tidak bisa diubah lagi)
   */
  static isTerminal(status: ContractStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
  }

  /**
   * Cek apakah status memerlukan tindakan
   */
  static isActive(status: ContractStatus): boolean {
    return ACTIVE_STATUSES.includes(status);
  }

  /**
   * Cek apakah escrow masih aktif pada status ini
   */
  static hasActiveEscrow(status: ContractStatus): boolean {
    return ESCROW_ACTIVE_STATUSES.includes(status);
  }

  /**
   * Mendapatkan label yang ramah untuk status
   */
  static getLabel(status: ContractStatus): string {
    const labels: Record<ContractStatus, string> = {
      [ContractStatus.CREATED]: 'Menunggu Pembayaran',
      [ContractStatus.FUNDED]: 'Dana Diterima',
      [ContractStatus.VERIFIED]: 'Barang Diverifikasi',
      [ContractStatus.SETTLED]: 'Selesai',
      [ContractStatus.DISPUTED]: 'Dalam Sengketa',
      [ContractStatus.CANCELLED]: 'Dibatalkan',
    };
    return labels[status];
  }

  /**
   * Mendapatkan deskripsi detail untuk status
   */
  static getDescription(status: ContractStatus): string {
    const descriptions: Record<ContractStatus, string> = {
      [ContractStatus.CREATED]: 'Kontrak telah dibuat dan menunggu pembayaran dari pembeli melalui QRIS.',
      [ContractStatus.FUNDED]: 'Dana telah diterima dan disimpan di rekening escrow. Menunggu pengiriman dan verifikasi barang.',
      [ContractStatus.VERIFIED]: 'Barang telah diterima dan lulus pemeriksaan kualitas. Dana siap dicairkan ke penjual.',
      [ContractStatus.SETTLED]: 'Transaksi telah selesai. Dana telah dicairkan ke penjual setelah dipotong biaya.',
      [ContractStatus.DISPUTED]: 'Sengketa telah diajukan. Menunggu resolusi dari mediator atau sistem.',
      [ContractStatus.CANCELLED]: 'Kontrak telah dibatalkan. Dana dikembalikan ke pembeli jika sudah dibayar.',
    };
    return descriptions[status];
  }
}
