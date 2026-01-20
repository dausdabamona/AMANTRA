/**
 * AMANTRA - Split Payment Value Object
 *
 * Represents the immutable breakdown of a settlement payment.
 * Enforces business rules:
 * - sellerAmount + platformFee + mediatorFee = totalAmount
 * - All amounts must be positive
 * - Currency must match
 * - Network fee bearer is declared and enforced
 *
 * AKAD PRINCIPLE: "Tidak boleh ada potongan tersembunyi"
 * All fees including network transfer fees must be declared at creation.
 *
 * @module escrow/domain
 */

import * as crypto from 'crypto';
import {
  NetworkFeeBearer,
  NetworkFeeConfig,
  NetworkFeeSettlementRecord,
  calculateSellerNetAfterFees,
  networkFeeBearerToString,
} from './network-fee.types';

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
  /**
   * Network fee configuration - REQUIRED for akad compliance
   */
  networkFeeConfig: NetworkFeeConfig;
  /**
   * Hash of the signed akad statement (must be set at contract creation)
   */
  akadStatementHash: string;
}

/**
 * Split Payment Value Object
 *
 * Immutable representation of how a contract settlement
 * should be split between seller, platform, and optional mediator.
 *
 * AKAD COMPLIANCE: Includes network fee handling with full transparency.
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

  // Network fee properties (AKAD compliance)
  private readonly _networkFeeBearer: NetworkFeeBearer;
  private readonly _estimatedNetworkFee: number;
  private readonly _akadStatementHash: string;
  private readonly _sellerNetAfterFees: number;

  // Settlement record (populated after settlement)
  private _settlementRecord: NetworkFeeSettlementRecord | null = null;

  private constructor(props: SplitPaymentProps) {
    this._contractId = props.contractId;
    this._totalAmount = props.totalAmount;
    this._currency = props.currency;
    this._sellerAmount = props.sellerAmount;
    this._platformFee = props.platformFee;
    this._mediatorFee = props.mediatorFee;
    this._createdAt = new Date();

    // Network fee configuration (immutable from akad)
    this._networkFeeBearer = props.networkFeeConfig.bearer;
    this._estimatedNetworkFee = props.networkFeeConfig.estimatedFee;
    this._akadStatementHash = props.akadStatementHash;

    // Calculate seller's net amount after network fees
    this._sellerNetAfterFees = calculateSellerNetAfterFees(
      props.sellerAmount,
      props.networkFeeConfig.estimatedFee,
      props.networkFeeConfig.bearer
    );

    // Build transfer legs (with network fee adjustments)
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
   * AKAD COMPLIANCE: Validates network fee configuration and ensures
   * fee bearer declaration is present.
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

    // AKAD COMPLIANCE: Validate network fee configuration
    if (!props.networkFeeConfig) {
      throw new Error('Network fee configuration is required (akad compliance)');
    }

    if (props.networkFeeConfig.estimatedFee < 0) {
      throw new Error('Estimated network fee cannot be negative');
    }

    // If platform bears fees, ensure platform fee is sufficient
    if (
      props.networkFeeConfig.bearer === NetworkFeeBearer.PLATFORM &&
      props.networkFeeConfig.estimatedFee > props.platformFee
    ) {
      throw new Error(
        `Platform fee (${props.platformFee}) must be >= estimated network fee ` +
        `(${props.networkFeeConfig.estimatedFee}) when PLATFORM bears network fees`
      );
    }

    // AKAD COMPLIANCE: Validate akad statement hash
    if (!props.akadStatementHash || props.akadStatementHash === '0x' + '0'.repeat(64)) {
      throw new Error('Akad statement hash is required (fee disclosure must be signed)');
    }

    return new SplitPayment(props);
  }

  /**
   * Creates from contract payout info (from blockchain)
   *
   * AKAD COMPLIANCE: Includes network fee configuration from blockchain
   */
  static fromPayoutInfo(
    contractId: string,
    payoutInfo: {
      totalAmount: bigint;
      sellerAmount: bigint;
      platformFee: bigint;
      mediatorFee: bigint;
      networkFeeBearer: number;
      estimatedNetworkFee: bigint;
      akadStatementHash: string;
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
      networkFeeConfig: {
        bearer: payoutInfo.networkFeeBearer as NetworkFeeBearer,
        estimatedFee: Number(payoutInfo.estimatedNetworkFee),
        currency: 'IDR',
      },
      akadStatementHash: payoutInfo.akadStatementHash,
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
  // Network Fee Getters (AKAD Compliance)
  // ============================================

  /**
   * Who bears the bank network transfer fees
   */
  get networkFeeBearer(): NetworkFeeBearer {
    return this._networkFeeBearer;
  }

  /**
   * Estimated network fee at time of akad
   */
  get estimatedNetworkFee(): number {
    return this._estimatedNetworkFee;
  }

  /**
   * Hash of the signed akad statement
   */
  get akadStatementHash(): string {
    return this._akadStatementHash;
  }

  /**
   * Seller's expected net amount after network fees
   * Based on declared fee bearer and estimated fees
   */
  get sellerNetAfterFees(): number {
    return this._sellerNetAfterFees;
  }

  /**
   * Settlement record (available after settlement)
   */
  get settlementRecord(): NetworkFeeSettlementRecord | null {
    return this._settlementRecord;
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
   * Calculates actual transfer amounts based on network fee bearer and actual fee
   *
   * AKAD COMPLIANCE: Enforces declared fee bearer policy
   *
   * @param actualNetworkFee - Actual fee charged by bank
   * @returns Adjusted amounts for each party
   */
  calculateActualAmounts(actualNetworkFee: number): {
    sellerNetReceived: number;
    platformNetReceived: number;
    mediatorNetReceived: number;
    networkFeeAbsorbedBy: 'PLATFORM' | 'SELLER' | 'BUYER';
    feeVariance: number;
  } {
    const feeVariance = actualNetworkFee - this._estimatedNetworkFee;

    switch (this._networkFeeBearer) {
      case NetworkFeeBearer.PLATFORM:
        // Platform bears all network fees
        return {
          sellerNetReceived: this._sellerAmount,
          platformNetReceived: this._platformFee - actualNetworkFee,
          mediatorNetReceived: this._mediatorFee,
          networkFeeAbsorbedBy: 'PLATFORM',
          feeVariance,
        };

      case NetworkFeeBearer.SELLER:
        // Seller bears network fees (deducted from seller amount)
        return {
          sellerNetReceived: this._sellerAmount - actualNetworkFee,
          platformNetReceived: this._platformFee,
          mediatorNetReceived: this._mediatorFee,
          networkFeeAbsorbedBy: 'SELLER',
          feeVariance,
        };

      case NetworkFeeBearer.BUYER:
        // Buyer already paid network fee at funding
        // All parties receive full amounts
        return {
          sellerNetReceived: this._sellerAmount,
          platformNetReceived: this._platformFee,
          mediatorNetReceived: this._mediatorFee,
          networkFeeAbsorbedBy: 'BUYER',
          feeVariance,
        };

      default:
        throw new Error(`Unknown network fee bearer: ${this._networkFeeBearer}`);
    }
  }

  /**
   * Records the settlement network fee details
   *
   * NOTE: This creates a new SplitPayment with settlement record
   * (maintains immutability)
   */
  withSettlementRecord(record: NetworkFeeSettlementRecord): SplitPayment {
    const newPayment = Object.create(SplitPayment.prototype);
    Object.assign(newPayment, this);
    (newPayment as any)._settlementRecord = record;
    return newPayment;
  }

  /**
   * Generates network fee disclosure text for display
   */
  getNetworkFeeDisclosure(): string {
    const bearerText = {
      [NetworkFeeBearer.PLATFORM]: 'PLATFORM (AMANTRA menanggung biaya)',
      [NetworkFeeBearer.SELLER]: 'PENJUAL (dipotong dari pembayaran)',
      [NetworkFeeBearer.BUYER]: 'PEMBELI (sudah dibayar terpisah)',
    }[this._networkFeeBearer];

    return (
      `Biaya transfer bank (jika ada) ditanggung oleh: ${bearerText}.\n` +
      `Estimasi biaya transfer: ${this.formatCurrency(this._estimatedNetworkFee)}.\n` +
      `Jumlah bersih yang diterima penjual setelah biaya bank: ${this.formatCurrency(this._sellerNetAfterFees)}.`
    );
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
      // Network fee fields (AKAD compliance)
      networkFeeBearer: networkFeeBearerToString(this._networkFeeBearer),
      estimatedNetworkFee: this._estimatedNetworkFee,
      akadStatementHash: this._akadStatementHash,
      sellerNetAfterFees: this._sellerNetAfterFees,
      settlementRecord: this._settlementRecord,
    };
  }

  /**
   * Creates formatted description for audit
   *
   * AKAD COMPLIANCE: Includes full network fee disclosure
   */
  toAuditString(): string {
    const bearerLabel = {
      [NetworkFeeBearer.PLATFORM]: 'PLATFORM',
      [NetworkFeeBearer.SELLER]: 'SELLER',
      [NetworkFeeBearer.BUYER]: 'BUYER',
    }[this._networkFeeBearer];

    const lines = [
      `Contract: ${this._contractId}`,
      `Total: ${this.formatCurrency(this._totalAmount)}`,
      ``,
      `Fee Split:`,
      `  Seller Amount: ${this.formatCurrency(this._sellerAmount)}`,
      `  Platform Fee: ${this.formatCurrency(this._platformFee)}`,
    ];

    if (this._mediatorFee > 0) {
      lines.push(`  Mediator Fee: ${this.formatCurrency(this._mediatorFee)}`);
    }

    lines.push(
      ``,
      `Network Fee Declaration (Akad):`,
      `  Fee Bearer: ${bearerLabel}`,
      `  Estimated Fee: ${this.formatCurrency(this._estimatedNetworkFee)}`,
      `  Seller Net After Fees: ${this.formatCurrency(this._sellerNetAfterFees)}`,
      `  Akad Statement Hash: ${this._akadStatementHash}`,
    );

    if (this._settlementRecord) {
      lines.push(
        ``,
        `Settlement Record:`,
        `  Actual Network Fee: ${this.formatCurrency(this._settlementRecord.actualFee)}`,
        `  Seller Net Received: ${this.formatCurrency(this._settlementRecord.sellerNetReceived)}`,
        `  Platform Net Received: ${this.formatCurrency(this._settlementRecord.platformNetReceived)}`,
        `  Bank Receipt Hash: ${this._settlementRecord.bankReceiptHash}`,
        `  Settled At: ${this._settlementRecord.settledAt.toISOString()}`,
      );
    }

    lines.push(``, `Reference: ${this._referenceHash}`);

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
   * Includes network fee configuration for akad compliance
   */
  private generateReferenceHash(): string {
    const data = [
      this._contractId,
      this._sellerAmount.toString(),
      this._platformFee.toString(),
      this._mediatorFee.toString(),
      this._currency,
      // Include network fee in hash for immutability
      this._networkFeeBearer.toString(),
      this._estimatedNetworkFee.toString(),
      this._akadStatementHash,
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
