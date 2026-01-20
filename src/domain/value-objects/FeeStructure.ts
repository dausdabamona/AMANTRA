/**
 * AMANTRA - Fee Structure Value Object
 *
 * Struktur biaya yang disepakati di awal kontrak.
 * Fee tidak boleh diubah sepihak setelah kontrak dibuat.
 * Dicatat di smart contract untuk transparansi.
 */

import { Money } from './Money';

export interface FeeBreakdown {
  /** Biaya platform AMANTRA */
  platformFee: Money;
  /** Biaya mediator (jika ada) */
  mediatorFee?: Money;
  /** Total biaya */
  totalFees: Money;
  /** Jumlah bersih yang diterima seller */
  netAmount: Money;
}

export interface FeeStructureProps {
  /** Persentase biaya platform (basis points, 100 = 1%) */
  platformFeeBps: number;
  /** Persentase biaya mediator (basis points) */
  mediatorFeeBps?: number;
  /** Biaya tetap platform (jika ada) */
  platformFixedFee?: Money;
  /** Biaya minimum platform */
  minimumPlatformFee?: Money;
  /** Biaya maksimum platform (cap) */
  maximumPlatformFee?: Money;
}

export class FeeStructure {
  private readonly props: FeeStructureProps;

  private constructor(props: FeeStructureProps) {
    this.validateFees(props);
    this.props = { ...props };
  }

  // ============================================
  // Factory Methods
  // ============================================

  static create(props: FeeStructureProps): FeeStructure {
    return new FeeStructure(props);
  }

  /**
   * Struktur fee default untuk transaksi standar
   */
  static defaultStructure(): FeeStructure {
    return new FeeStructure({
      platformFeeBps: 100, // 1%
      minimumPlatformFee: Money.fromIDR(5000), // Minimum Rp 5.000
      maximumPlatformFee: Money.fromIDR(500000), // Maximum Rp 500.000
    });
  }

  /**
   * Struktur fee untuk transaksi dengan mediator
   */
  static withMediator(mediatorFeeBps: number): FeeStructure {
    return new FeeStructure({
      platformFeeBps: 100, // 1%
      mediatorFeeBps,
      minimumPlatformFee: Money.fromIDR(5000),
      maximumPlatformFee: Money.fromIDR(500000),
    });
  }

  // ============================================
  // Fee Calculation
  // ============================================

  /**
   * Menghitung breakdown fee berdasarkan total amount
   */
  calculateFees(totalAmount: Money): FeeBreakdown {
    // Hitung platform fee berdasarkan persentase
    let platformFee = totalAmount.percentage(this.props.platformFeeBps / 100);

    // Tambahkan fixed fee jika ada
    if (this.props.platformFixedFee) {
      platformFee = platformFee.add(this.props.platformFixedFee);
    }

    // Terapkan minimum
    if (this.props.minimumPlatformFee && platformFee.lessThan(this.props.minimumPlatformFee)) {
      platformFee = this.props.minimumPlatformFee;
    }

    // Terapkan maximum (cap)
    if (this.props.maximumPlatformFee && platformFee.greaterThan(this.props.maximumPlatformFee)) {
      platformFee = this.props.maximumPlatformFee;
    }

    // Hitung mediator fee
    let mediatorFee: Money | undefined;
    if (this.props.mediatorFeeBps) {
      mediatorFee = totalAmount.percentage(this.props.mediatorFeeBps / 100);
    }

    // Hitung total fees
    let totalFees = platformFee;
    if (mediatorFee) {
      totalFees = totalFees.add(mediatorFee);
    }

    // Hitung net amount untuk seller
    const netAmount = totalAmount.subtract(totalFees);

    return {
      platformFee,
      mediatorFee,
      totalFees,
      netAmount,
    };
  }

  /**
   * Menghitung estimasi fee untuk preview sebelum kontrak dibuat
   */
  estimateFees(totalAmount: Money): {
    platformFeeEstimate: string;
    mediatorFeeEstimate?: string;
    netAmountEstimate: string;
  } {
    const breakdown = this.calculateFees(totalAmount);
    return {
      platformFeeEstimate: breakdown.platformFee.toString(),
      mediatorFeeEstimate: breakdown.mediatorFee?.toString(),
      netAmountEstimate: breakdown.netAmount.toString(),
    };
  }

  // ============================================
  // Getters
  // ============================================

  get platformFeeBps(): number {
    return this.props.platformFeeBps;
  }

  get mediatorFeeBps(): number | undefined {
    return this.props.mediatorFeeBps;
  }

  get platformFeePercentage(): number {
    return this.props.platformFeeBps / 100;
  }

  get mediatorFeePercentage(): number | undefined {
    return this.props.mediatorFeeBps ? this.props.mediatorFeeBps / 100 : undefined;
  }

  // ============================================
  // Validation
  // ============================================

  private validateFees(props: FeeStructureProps): void {
    if (props.platformFeeBps < 0 || props.platformFeeBps > 10000) {
      throw new Error('Platform fee must be between 0 and 10000 basis points (0-100%)');
    }

    if (props.mediatorFeeBps !== undefined) {
      if (props.mediatorFeeBps < 0 || props.mediatorFeeBps > 5000) {
        throw new Error('Mediator fee must be between 0 and 5000 basis points (0-50%)');
      }
    }

    const totalFeeBps = props.platformFeeBps + (props.mediatorFeeBps || 0);
    if (totalFeeBps > 10000) {
      throw new Error('Total fees cannot exceed 100% of transaction amount');
    }
  }

  // ============================================
  // Serialization
  // ============================================

  toJSON(): FeeStructureProps {
    return {
      ...this.props,
      platformFixedFee: this.props.platformFixedFee?.toJSON() as Money | undefined,
      minimumPlatformFee: this.props.minimumPlatformFee?.toJSON() as Money | undefined,
      maximumPlatformFee: this.props.maximumPlatformFee?.toJSON() as Money | undefined,
    };
  }

  static fromJSON(json: FeeStructureProps): FeeStructure {
    return new FeeStructure({
      ...json,
      platformFixedFee: json.platformFixedFee ? Money.fromJSON(json.platformFixedFee as unknown as { amount: number; currency: 'IDR' | 'USD' }) : undefined,
      minimumPlatformFee: json.minimumPlatformFee ? Money.fromJSON(json.minimumPlatformFee as unknown as { amount: number; currency: 'IDR' | 'USD' }) : undefined,
      maximumPlatformFee: json.maximumPlatformFee ? Money.fromJSON(json.maximumPlatformFee as unknown as { amount: number; currency: 'IDR' | 'USD' }) : undefined,
    });
  }

  /**
   * Format untuk pencatatan di smart contract
   * Menggunakan basis points untuk presisi
   */
  toSmartContractFormat(): {
    platformFeeBps: number;
    mediatorFeeBps: number;
    platformFixedFee: number;
    minimumPlatformFee: number;
    maximumPlatformFee: number;
  } {
    return {
      platformFeeBps: this.props.platformFeeBps,
      mediatorFeeBps: this.props.mediatorFeeBps || 0,
      platformFixedFee: this.props.platformFixedFee?.amount || 0,
      minimumPlatformFee: this.props.minimumPlatformFee?.amount || 0,
      maximumPlatformFee: this.props.maximumPlatformFee?.amount || 0,
    };
  }
}
