/**
 * AMANTRA - Money Value Object
 *
 * Immutable value object untuk representasi uang.
 * Menggunakan integer untuk menghindari floating point errors.
 * Semua amount dalam satuan terkecil (sen untuk IDR).
 */

export type Currency = 'IDR' | 'USD';

export interface MoneyProps {
  /** Amount dalam satuan terkecil (sen/cent) */
  amount: number;
  currency: Currency;
}

export class Money {
  private readonly _amount: number;
  private readonly _currency: Currency;

  private constructor(props: MoneyProps) {
    if (!Number.isInteger(props.amount)) {
      throw new Error('Money amount must be an integer (in smallest unit)');
    }
    if (props.amount < 0) {
      throw new Error('Money amount cannot be negative');
    }
    this._amount = props.amount;
    this._currency = props.currency;
  }

  // ============================================
  // Factory Methods
  // ============================================

  static create(props: MoneyProps): Money {
    return new Money(props);
  }

  /**
   * Membuat Money dari nilai rupiah (bukan sen)
   */
  static fromIDR(rupiahAmount: number): Money {
    // IDR tidak menggunakan sen dalam praktiknya,
    // tapi kita tetap menyimpan sebagai integer untuk konsistensi
    return new Money({
      amount: Math.round(rupiahAmount),
      currency: 'IDR',
    });
  }

  /**
   * Membuat Money dengan nilai nol
   */
  static zero(currency: Currency = 'IDR'): Money {
    return new Money({ amount: 0, currency });
  }

  // ============================================
  // Arithmetic Operations (menghasilkan Money baru)
  // ============================================

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money({
      amount: this._amount + other._amount,
      currency: this._currency,
    });
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const result = this._amount - other._amount;
    if (result < 0) {
      throw new Error('Subtraction would result in negative amount');
    }
    return new Money({
      amount: result,
      currency: this._currency,
    });
  }

  /**
   * Mengalikan dengan faktor (misal untuk menghitung persentase)
   */
  multiply(factor: number): Money {
    return new Money({
      amount: Math.round(this._amount * factor),
      currency: this._currency,
    });
  }

  /**
   * Menghitung persentase dari amount
   */
  percentage(percent: number): Money {
    return this.multiply(percent / 100);
  }

  // ============================================
  // Comparison Operations
  // ============================================

  equals(other: Money): boolean {
    return this._amount === other._amount && this._currency === other._currency;
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amount > other._amount;
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amount < other._amount;
  }

  greaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amount >= other._amount;
  }

  lessThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amount <= other._amount;
  }

  isZero(): boolean {
    return this._amount === 0;
  }

  // ============================================
  // Getters
  // ============================================

  get amount(): number {
    return this._amount;
  }

  get currency(): Currency {
    return this._currency;
  }

  // ============================================
  // Formatting
  // ============================================

  /**
   * Format sebagai string dengan simbol mata uang
   */
  toString(): string {
    const formatter = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: this._currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return formatter.format(this._amount);
  }

  /**
   * Format sebagai string sederhana tanpa simbol
   */
  toFormattedString(): string {
    const formatter = new Intl.NumberFormat('id-ID');
    return formatter.format(this._amount);
  }

  // ============================================
  // Serialization
  // ============================================

  toJSON(): MoneyProps {
    return {
      amount: this._amount,
      currency: this._currency,
    };
  }

  static fromJSON(json: MoneyProps): Money {
    return Money.create(json);
  }

  // ============================================
  // Private Helpers
  // ============================================

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Cannot operate on different currencies: ${this._currency} vs ${other._currency}`
      );
    }
  }
}
