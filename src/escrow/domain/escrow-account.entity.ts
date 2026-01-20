/**
 * AMANTRA - Escrow Account Entity
 *
 * Represents a bank escrow account holding funds for a contract.
 * Funds are held OFF-CHAIN in a real bank account.
 *
 * Key invariants:
 * - Balance can never go negative
 * - Frozen funds cannot be transferred
 * - All balance changes are recorded in audit trail
 *
 * @module escrow/domain
 */

import { EscrowAccountStatus } from './settlement-status.enum';
import { v4 as uuidv4 } from 'uuid';

/**
 * Escrow transaction record
 */
export interface EscrowTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT' | 'FREEZE' | 'UNFREEZE';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  description: string;
  bankReference?: string;
  timestamp: Date;
  performedBy: string;
}

/**
 * Escrow Account Properties
 */
export interface EscrowAccountProps {
  id: string;
  contractId: string;
  bankAccountId: string;
  bankCode: string;
  accountNumber: string;
  balance: number;
  frozenAmount: number;
  currency: string;
  status: EscrowAccountStatus;
  transactions: EscrowTransaction[];
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

/**
 * Escrow Account Entity
 *
 * Domain entity representing a bank escrow account.
 * Manages balance, freezing, and transaction history.
 */
export class EscrowAccount {
  private _id: string;
  private _contractId: string;
  private _bankAccountId: string;
  private _bankCode: string;
  private _accountNumber: string;
  private _balance: number;
  private _frozenAmount: number;
  private _currency: string;
  private _status: EscrowAccountStatus;
  private _transactions: EscrowTransaction[];
  private _createdAt: Date;
  private _updatedAt: Date;
  private _version: number;

  private constructor(props: EscrowAccountProps) {
    this._id = props.id;
    this._contractId = props.contractId;
    this._bankAccountId = props.bankAccountId;
    this._bankCode = props.bankCode;
    this._accountNumber = props.accountNumber;
    this._balance = props.balance;
    this._frozenAmount = props.frozenAmount;
    this._currency = props.currency;
    this._status = props.status;
    this._transactions = [...props.transactions];
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
    this._version = props.version;
  }

  // ============================================
  // Factory Methods
  // ============================================

  /**
   * Creates a new escrow account
   */
  static create(
    contractId: string,
    bankAccountId: string,
    bankCode: string,
    accountNumber: string,
    currency: string = 'IDR'
  ): EscrowAccount {
    return new EscrowAccount({
      id: uuidv4(),
      contractId,
      bankAccountId,
      bankCode,
      accountNumber,
      balance: 0,
      frozenAmount: 0,
      currency,
      status: EscrowAccountStatus.ACTIVE,
      transactions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    });
  }

  /**
   * Reconstitutes from persistence
   */
  static fromPersistence(props: EscrowAccountProps): EscrowAccount {
    return new EscrowAccount(props);
  }

  // ============================================
  // Getters
  // ============================================

  get id(): string {
    return this._id;
  }

  get contractId(): string {
    return this._contractId;
  }

  get bankAccountId(): string {
    return this._bankAccountId;
  }

  get bankCode(): string {
    return this._bankCode;
  }

  get accountNumber(): string {
    return this._accountNumber;
  }

  get balance(): number {
    return this._balance;
  }

  get frozenAmount(): number {
    return this._frozenAmount;
  }

  get availableBalance(): number {
    return this._balance - this._frozenAmount;
  }

  get currency(): string {
    return this._currency;
  }

  get status(): EscrowAccountStatus {
    return this._status;
  }

  get transactions(): ReadonlyArray<EscrowTransaction> {
    return this._transactions;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get version(): number {
    return this._version;
  }

  get isActive(): boolean {
    return this._status === EscrowAccountStatus.ACTIVE;
  }

  get isFrozen(): boolean {
    return this._status === EscrowAccountStatus.FROZEN;
  }

  // ============================================
  // Commands
  // ============================================

  /**
   * Credits funds to the escrow account
   *
   * @param amount Amount to credit
   * @param reference Payment reference (e.g., QRIS invoice ID)
   * @param description Transaction description
   * @param bankReference Bank's reference number
   * @param performedBy User/system that performed the action
   */
  credit(
    amount: number,
    reference: string,
    description: string,
    bankReference: string,
    performedBy: string
  ): void {
    if (amount <= 0) {
      throw new Error(`Credit amount must be positive: ${amount}`);
    }

    if (this._status === EscrowAccountStatus.CLOSED) {
      throw new Error('Cannot credit closed escrow account');
    }

    const balanceBefore = this._balance;
    this._balance += amount;

    this.recordTransaction({
      id: uuidv4(),
      type: 'CREDIT',
      amount,
      balanceBefore,
      balanceAfter: this._balance,
      reference,
      description,
      bankReference,
      timestamp: new Date(),
      performedBy,
    });

    this._updatedAt = new Date();
    this._version++;
  }

  /**
   * Debits funds from the escrow account
   *
   * @throws Error if insufficient available balance
   */
  debit(
    amount: number,
    reference: string,
    description: string,
    bankReference: string,
    performedBy: string
  ): void {
    if (amount <= 0) {
      throw new Error(`Debit amount must be positive: ${amount}`);
    }

    if (this._status === EscrowAccountStatus.CLOSED) {
      throw new Error('Cannot debit closed escrow account');
    }

    if (amount > this.availableBalance) {
      throw new Error(
        `Insufficient available balance: requested ${amount}, available ${this.availableBalance}`
      );
    }

    const balanceBefore = this._balance;
    this._balance -= amount;

    // If debiting frozen amount, reduce frozen as well
    if (this._frozenAmount > 0) {
      const frozenDebit = Math.min(amount, this._frozenAmount);
      this._frozenAmount -= frozenDebit;
    }

    this.recordTransaction({
      id: uuidv4(),
      type: 'DEBIT',
      amount,
      balanceBefore,
      balanceAfter: this._balance,
      reference,
      description,
      bankReference,
      timestamp: new Date(),
      performedBy,
    });

    this._updatedAt = new Date();
    this._version++;
  }

  /**
   * Freezes funds for pending settlement
   *
   * @param amount Amount to freeze
   * @param reference Settlement reference
   * @param performedBy User/system
   */
  freezeFunds(amount: number, reference: string, performedBy: string): void {
    if (amount <= 0) {
      throw new Error(`Freeze amount must be positive: ${amount}`);
    }

    if (amount > this.availableBalance) {
      throw new Error(
        `Insufficient available balance to freeze: requested ${amount}, available ${this.availableBalance}`
      );
    }

    const balanceBefore = this._balance;
    this._frozenAmount += amount;

    // Update status if all funds are frozen
    if (this._frozenAmount >= this._balance) {
      this._status = EscrowAccountStatus.FROZEN;
    }

    this.recordTransaction({
      id: uuidv4(),
      type: 'FREEZE',
      amount,
      balanceBefore,
      balanceAfter: this._balance, // Balance doesn't change, just frozen portion
      reference,
      description: `Funds frozen for settlement: ${reference}`,
      timestamp: new Date(),
      performedBy,
    });

    this._updatedAt = new Date();
    this._version++;
  }

  /**
   * Unfreezes funds (e.g., if settlement fails)
   *
   * @param amount Amount to unfreeze
   * @param reference Settlement reference
   * @param performedBy User/system
   */
  unfreezeFunds(amount: number, reference: string, performedBy: string): void {
    if (amount <= 0) {
      throw new Error(`Unfreeze amount must be positive: ${amount}`);
    }

    if (amount > this._frozenAmount) {
      throw new Error(
        `Cannot unfreeze more than frozen amount: requested ${amount}, frozen ${this._frozenAmount}`
      );
    }

    const balanceBefore = this._balance;
    this._frozenAmount -= amount;

    // Restore status if funds are unfrozen
    if (this._frozenAmount < this._balance && this._status === EscrowAccountStatus.FROZEN) {
      this._status = EscrowAccountStatus.ACTIVE;
    }

    this.recordTransaction({
      id: uuidv4(),
      type: 'UNFREEZE',
      amount,
      balanceBefore,
      balanceAfter: this._balance,
      reference,
      description: `Funds unfrozen: ${reference}`,
      timestamp: new Date(),
      performedBy,
    });

    this._updatedAt = new Date();
    this._version++;
  }

  /**
   * Closes the escrow account
   *
   * @throws Error if balance > 0
   */
  close(performedBy: string): void {
    if (this._balance > 0) {
      throw new Error(`Cannot close escrow account with balance: ${this._balance}`);
    }

    if (this._status === EscrowAccountStatus.CLOSED) {
      throw new Error('Escrow account already closed');
    }

    this._status = EscrowAccountStatus.CLOSED;
    this._updatedAt = new Date();
    this._version++;
  }

  // ============================================
  // Queries
  // ============================================

  /**
   * Gets transactions by type
   */
  getTransactionsByType(type: EscrowTransaction['type']): EscrowTransaction[] {
    return this._transactions.filter((t) => t.type === type);
  }

  /**
   * Gets transactions in date range
   */
  getTransactionsInRange(startDate: Date, endDate: Date): EscrowTransaction[] {
    return this._transactions.filter(
      (t) => t.timestamp >= startDate && t.timestamp <= endDate
    );
  }

  /**
   * Gets the last transaction
   */
  getLastTransaction(): EscrowTransaction | null {
    return this._transactions[this._transactions.length - 1] || null;
  }

  /**
   * Calculates total credits
   */
  getTotalCredits(): number {
    return this._transactions
      .filter((t) => t.type === 'CREDIT')
      .reduce((sum, t) => sum + t.amount, 0);
  }

  /**
   * Calculates total debits
   */
  getTotalDebits(): number {
    return this._transactions
      .filter((t) => t.type === 'DEBIT')
      .reduce((sum, t) => sum + t.amount, 0);
  }

  /**
   * Verifies balance integrity
   */
  verifyBalance(): { valid: boolean; calculatedBalance: number; error?: string } {
    const credits = this.getTotalCredits();
    const debits = this.getTotalDebits();
    const calculatedBalance = credits - debits;

    if (calculatedBalance !== this._balance) {
      return {
        valid: false,
        calculatedBalance,
        error: `Balance mismatch: stored=${this._balance}, calculated=${calculatedBalance}`,
      };
    }

    return { valid: true, calculatedBalance };
  }

  // ============================================
  // Serialization
  // ============================================

  /**
   * Converts to persistence format
   */
  toPersistence(): EscrowAccountProps {
    return {
      id: this._id,
      contractId: this._contractId,
      bankAccountId: this._bankAccountId,
      bankCode: this._bankCode,
      accountNumber: this._accountNumber,
      balance: this._balance,
      frozenAmount: this._frozenAmount,
      currency: this._currency,
      status: this._status,
      transactions: [...this._transactions],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      version: this._version,
    };
  }

  /**
   * Creates audit summary
   */
  toAuditSummary(): string {
    return [
      `Escrow Account: ${this._id}`,
      `Contract: ${this._contractId}`,
      `Bank: ${this._bankCode} - ${this._accountNumber}`,
      `Balance: ${this._balance} ${this._currency}`,
      `Frozen: ${this._frozenAmount} ${this._currency}`,
      `Available: ${this.availableBalance} ${this._currency}`,
      `Status: ${this._status}`,
      `Transactions: ${this._transactions.length}`,
      `Version: ${this._version}`,
    ].join('\n');
  }

  // ============================================
  // Private Methods
  // ============================================

  private recordTransaction(tx: EscrowTransaction): void {
    this._transactions.push(tx);
  }
}
