/**
 * AMANTRA - Split Payment Value Object
 *
 * Represents the immutable breakdown of a settlement payment.
 * Enforces business rules:
 * - sellerAmount + platformFee + mediatorFee = totalAmount
 * - All amounts must be positive
 * - Currency must match
 *
 * @module escrow/domain
 */

import * as crypto from 'crypto';

/**
 * Individual transfer leg in a split payment
 */
export interface TransferLeg {
  /**
   * Recipient identifier (bank account, wallet, etc.)
   */
  recipientId: string;

  /**
   * Recipient account number
   */
  accountNumber: string;

  /**
   * Bank code (e.g., 'BSI', 'MANDIRI', 'BCA')
   */
  bankCode: string;

  /**
   * Recipient name for verification
   */
  recipientName: string;

  /**
   * Transfer amount in smallest currency unit
   */
  amount: number;

  /**
   * Transfer description/memo
   */
  description: string;

  /**
   * Type of recipient
   */
  recipientType: 'SELLER' | 'PLATFORM' | 'MEDIATOR';
}

/**
 * Split Payment configuration
 */
export interface SplitPaymentProps {
  contractId: string;
  totalAmount: number;
  currency: string;
  sellerAmount: number;
  platformFee: number;
  mediatorFee: number;
  sellerAccount: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
  };
  platformAccount: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
  };
  mediatorAccount?: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
  };
}

/**
 * Split Payment Value Object
 *
 * Immutable representation of how a contract settlement
 * should be split between seller, platform, and optional mediator.
 */
export class SplitPayment {
  private readonly _contractId: string;
  private readonly _totalAmount: number;
  private readonly _currency: string;
  private readonly _sellerAmount: number;
  private readonly _platformFee: number;
  private readonly _mediatorFee: number;
  private readonly _legs: TransferLeg[];
  private readonly _referenceHash: string;
  private readonly _createdAt: Date;

  private constructor(props: SplitPaymentProps) {
    this._contractId = props.contractId;
    this._totalAmount = props.totalAmount;
    this._currency = props.currency;
    this._sellerAmount = props.sellerAmount;
    this._platformFee = props.platformFee;
    this._mediatorFee = props.mediatorFee;
    this._createdAt = new Date();

    // Build transfer legs
    this._legs = this.buildTransferLegs(props);

    // Generate deterministic reference hash for idempotency
    this._referenceHash = this.generateReferenceHash();

    // Freeze the object
    Object.freeze(this);
    Object.freeze(this._legs);
  }

  // ============================================
  // Factory Methods
  // ============================================

  /**
   * Creates a new SplitPayment with validation
   *
   * @throws Error if validation fails
   */
  static create(props: SplitPaymentProps): SplitPayment {
    // Validate amounts
    if (props.totalAmount <= 0) {
      throw new Error(`Total amount must be positive: ${props.totalAmount}`);
    }

    if (props.sellerAmount < 0) {
      throw new Error(`Seller amount cannot be negative: ${props.sellerAmount}`);
    }

    if (props.platformFee < 0) {
      throw new Error(`Platform fee cannot be negative: ${props.platformFee}`);
    }

    if (props.mediatorFee < 0) {
      throw new Error(`Mediator fee cannot be negative: ${props.mediatorFee}`);
    }

    // Validate sum
    const sum = props.sellerAmount + props.platformFee + props.mediatorFee;
    if (sum !== props.totalAmount) {
      throw new Error(
        `Split amounts (${sum}) do not match total (${props.totalAmount}): ` +
        `seller=${props.sellerAmount}, platform=${props.platformFee}, mediator=${props.mediatorFee}`
      );
    }

    // Validate accounts
    if (!props.sellerAccount?.accountNumber) {
      throw new Error('Seller account number is required');
    }

    if (!props.platformAccount?.accountNumber) {
      throw new Error('Platform account number is required');
    }

    if (props.mediatorFee > 0 && !props.mediatorAccount?.accountNumber) {
      throw new Error('Mediator account required when mediator fee > 0');
    }

    return new SplitPayment(props);
  }

  /**
   * Creates from contract payout info (from blockchain)
   */
  static fromPayoutInfo(
    contractId: string,
    payoutInfo: {
      totalAmount: bigint;
      sellerAmount: bigint;
      platformFee: bigint;
      mediatorFee: bigint;
    },
    accounts: {
      seller: { accountNumber: string; bankCode: string; accountName: string };
      platform: { accountNumber: string; bankCode: string; accountName: string };
      mediator?: { accountNumber: string; bankCode: string; accountName: string };
    }
  ): SplitPayment {
    return SplitPayment.create({
      contractId,
      totalAmount: Number(payoutInfo.totalAmount),
      currency: 'IDR',
      sellerAmount: Number(payoutInfo.sellerAmount),
      platformFee: Number(payoutInfo.platformFee),
      mediatorFee: Number(payoutInfo.mediatorFee),
      sellerAccount: accounts.seller,
      platformAccount: accounts.platform,
      mediatorAccount: accounts.mediator,
    });
  }

  // ============================================
  // Getters
  // ============================================

  get contractId(): string {
    return this._contractId;
  }

  get totalAmount(): number {
    return this._totalAmount;
  }

  get currency(): string {
    return this._currency;
  }

  get sellerAmount(): number {
    return this._sellerAmount;
  }

  get platformFee(): number {
    return this._platformFee;
  }

  get mediatorFee(): number {
    return this._mediatorFee;
  }

  get legs(): ReadonlyArray<TransferLeg> {
    return this._legs;
  }

  get referenceHash(): string {
    return this._referenceHash;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  /**
   * Number of transfer legs
   */
  get legCount(): number {
    return this._legs.length;
  }

  /**
   * Check if mediator is involved
   */
  get hasMediatorFee(): boolean {
    return this._mediatorFee > 0;
  }

  // ============================================
  // Methods
  // ============================================

  /**
   * Gets the seller transfer leg
   */
  getSellerLeg(): TransferLeg {
    const leg = this._legs.find((l) => l.recipientType === 'SELLER');
    if (!leg) {
      throw new Error('Seller leg not found');
    }
    return leg;
  }

  /**
   * Gets the platform transfer leg
   */
  getPlatformLeg(): TransferLeg {
    const leg = this._legs.find((l) => l.recipientType === 'PLATFORM');
    if (!leg) {
      throw new Error('Platform leg not found');
    }
    return leg;
  }

  /**
   * Gets the mediator transfer leg (if exists)
   */
  getMediatorLeg(): TransferLeg | null {
    return this._legs.find((l) => l.recipientType === 'MEDIATOR') || null;
  }

  /**
   * Generates unique reference ID for bank transfer
   */
  generateBankReferenceId(): string {
    return `SETTLE-${this._contractId.slice(0, 8)}-${this._referenceHash.slice(0, 8)}`;
  }

  /**
   * Validates that all legs have valid account information
   */
  validateAccounts(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const leg of this._legs) {
      if (!leg.accountNumber || leg.accountNumber.length < 10) {
        errors.push(`Invalid account number for ${leg.recipientType}: ${leg.accountNumber}`);
      }

      if (!leg.bankCode || leg.bankCode.length < 2) {
        errors.push(`Invalid bank code for ${leg.recipientType}: ${leg.bankCode}`);
      }

      if (leg.amount <= 0) {
        errors.push(`Invalid amount for ${leg.recipientType}: ${leg.amount}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Serializes for storage
   */
  toJSON(): Record<string, unknown> {
    return {
      contractId: this._contractId,
      totalAmount: this._totalAmount,
      currency: this._currency,
      sellerAmount: this._sellerAmount,
      platformFee: this._platformFee,
      mediatorFee: this._mediatorFee,
      legs: this._legs,
      referenceHash: this._referenceHash,
      createdAt: this._createdAt.toISOString(),
    };
  }

  /**
   * Creates formatted description for audit
   */
  toAuditString(): string {
    const lines = [
      `Contract: ${this._contractId}`,
      `Total: ${this.formatCurrency(this._totalAmount)}`,
      `Split:`,
      `  Seller: ${this.formatCurrency(this._sellerAmount)}`,
      `  Platform: ${this.formatCurrency(this._platformFee)}`,
    ];

    if (this._mediatorFee > 0) {
      lines.push(`  Mediator: ${this.formatCurrency(this._mediatorFee)}`);
    }

    lines.push(`Reference: ${this._referenceHash}`);

    return lines.join('\n');
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Builds the transfer legs from props
   */
  private buildTransferLegs(props: SplitPaymentProps): TransferLeg[] {
    const legs: TransferLeg[] = [];

    // Seller leg (always present)
    if (props.sellerAmount > 0) {
      legs.push({
        recipientId: `SELLER-${props.contractId}`,
        accountNumber: props.sellerAccount.accountNumber,
        bankCode: props.sellerAccount.bankCode,
        recipientName: props.sellerAccount.accountName,
        amount: props.sellerAmount,
        description: `Settlement for contract ${props.contractId.slice(0, 8)}`,
        recipientType: 'SELLER',
      });
    }

    // Platform leg (always present for fee > 0)
    if (props.platformFee > 0) {
      legs.push({
        recipientId: `PLATFORM-${props.contractId}`,
        accountNumber: props.platformAccount.accountNumber,
        bankCode: props.platformAccount.bankCode,
        recipientName: props.platformAccount.accountName,
        amount: props.platformFee,
        description: `Platform fee for contract ${props.contractId.slice(0, 8)}`,
        recipientType: 'PLATFORM',
      });
    }

    // Mediator leg (optional)
    if (props.mediatorFee > 0 && props.mediatorAccount) {
      legs.push({
        recipientId: `MEDIATOR-${props.contractId}`,
        accountNumber: props.mediatorAccount.accountNumber,
        bankCode: props.mediatorAccount.bankCode,
        recipientName: props.mediatorAccount.accountName,
        amount: props.mediatorFee,
        description: `Mediator fee for contract ${props.contractId.slice(0, 8)}`,
        recipientType: 'MEDIATOR',
      });
    }

    return legs;
  }

  /**
   * Generates deterministic hash for idempotency
   * hash(contractId + sellerAmount + platformFee + mediatorFee)
   */
  private generateReferenceHash(): string {
    const data = [
      this._contractId,
      this._sellerAmount.toString(),
      this._platformFee.toString(),
      this._mediatorFee.toString(),
      this._currency,
    ].join('|');

    return crypto
      .createHash('sha256')
      .update(data, 'utf8')
      .digest('hex')
      .slice(0, 32); // Truncate for readability
  }

  /**
   * Formats currency for display
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: this._currency,
      minimumFractionDigits: 0,
    }).format(amount);
  }
}
