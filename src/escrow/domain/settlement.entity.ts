/**
 * AMANTRA - Settlement Entity
 *
 * Represents a settlement operation for a contract.
 * Tracks the complete lifecycle from initiation to completion.
 *
 * Key invariants:
 * - Status transitions follow strict state machine
 * - Blockchain update only after bank success
 * - Complete audit trail required
 *
 * @module escrow/domain
 */

import {
  SettlementStatus,
  BankTransferStatus,
  isValidTransition,
  isTerminalStatus,
} from './settlement-status.enum';
import { SplitPayment, TransferLeg } from './split-payment.value';
import { v4 as uuidv4 } from 'uuid';

/**
 * Settlement event for audit trail
 */
export interface SettlementEvent {
  id: string;
  timestamp: Date;
  status: SettlementStatus;
  action: string;
  details: Record<string, unknown>;
  performedBy: string;
  bankReference?: string;
  blockchainTxHash?: string;
}

/**
 * Bank transfer result
 */
export interface BankTransferResult {
  legIndex: number;
  recipientType: 'SELLER' | 'PLATFORM' | 'MEDIATOR';
  status: BankTransferStatus;
  bankReference?: string;
  bankTimestamp?: Date;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Settlement properties
 */
export interface SettlementProps {
  id: string;
  contractId: string;
  escrowAccountId: string;
  splitPayment: SplitPayment;
  status: SettlementStatus;
  referenceId: string;
  bankTransferResults: BankTransferResult[];
  blockchainTxHash?: string;
  blockNumber?: number;
  blockchainTimestamp?: Date;
  events: SettlementEvent[];
  initiatedBy: string;
  initiatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  version: number;
}

/**
 * Settlement Entity
 *
 * Domain aggregate for managing settlement lifecycle.
 */
export class Settlement {
  private _id: string;
  private _contractId: string;
  private _escrowAccountId: string;
  private _splitPayment: SplitPayment;
  private _status: SettlementStatus;
  private _referenceId: string;
  private _bankTransferResults: BankTransferResult[];
  private _blockchainTxHash?: string;
  private _blockNumber?: number;
  private _blockchainTimestamp?: Date;
  private _events: SettlementEvent[];
  private _initiatedBy: string;
  private _initiatedAt: Date;
  private _completedAt?: Date;
  private _errorMessage?: string;
  private _retryCount: number;
  private _version: number;

  private constructor(props: SettlementProps) {
    this._id = props.id;
    this._contractId = props.contractId;
    this._escrowAccountId = props.escrowAccountId;
    this._splitPayment = props.splitPayment;
    this._status = props.status;
    this._referenceId = props.referenceId;
    this._bankTransferResults = [...props.bankTransferResults];
    this._blockchainTxHash = props.blockchainTxHash;
    this._blockNumber = props.blockNumber;
    this._blockchainTimestamp = props.blockchainTimestamp;
    this._events = [...props.events];
    this._initiatedBy = props.initiatedBy;
    this._initiatedAt = props.initiatedAt;
    this._completedAt = props.completedAt;
    this._errorMessage = props.errorMessage;
    this._retryCount = props.retryCount;
    this._version = props.version;
  }

  // ============================================
  // Factory Methods
  // ============================================

  /**
   * Creates a new settlement
   */
  static create(
    contractId: string,
    escrowAccountId: string,
    splitPayment: SplitPayment,
    initiatedBy: string
  ): Settlement {
    const id = uuidv4();
    const now = new Date();

    const settlement = new Settlement({
      id,
      contractId,
      escrowAccountId,
      splitPayment,
      status: SettlementStatus.INITIATED,
      referenceId: splitPayment.generateBankReferenceId(),
      bankTransferResults: [],
      events: [],
      initiatedBy,
      initiatedAt: now,
      retryCount: 0,
      version: 1,
    });

    settlement.recordEvent({
      id: uuidv4(),
      timestamp: now,
      status: SettlementStatus.INITIATED,
      action: 'SETTLEMENT_INITIATED',
      details: {
        totalAmount: splitPayment.totalAmount,
        sellerAmount: splitPayment.sellerAmount,
        platformFee: splitPayment.platformFee,
        mediatorFee: splitPayment.mediatorFee,
        legCount: splitPayment.legCount,
      },
      performedBy: initiatedBy,
    });

    return settlement;
  }

  /**
   * Reconstitutes from persistence
   */
  static fromPersistence(props: SettlementProps): Settlement {
    return new Settlement(props);
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

  get escrowAccountId(): string {
    return this._escrowAccountId;
  }

  get splitPayment(): SplitPayment {
    return this._splitPayment;
  }

  get status(): SettlementStatus {
    return this._status;
  }

  get referenceId(): string {
    return this._referenceId;
  }

  get bankTransferResults(): ReadonlyArray<BankTransferResult> {
    return this._bankTransferResults;
  }

  get blockchainTxHash(): string | undefined {
    return this._blockchainTxHash;
  }

  get blockNumber(): number | undefined {
    return this._blockNumber;
  }

  get blockchainTimestamp(): Date | undefined {
    return this._blockchainTimestamp;
  }

  get events(): ReadonlyArray<SettlementEvent> {
    return this._events;
  }

  get initiatedBy(): string {
    return this._initiatedBy;
  }

  get initiatedAt(): Date {
    return this._initiatedAt;
  }

  get completedAt(): Date | undefined {
    return this._completedAt;
  }

  get errorMessage(): string | undefined {
    return this._errorMessage;
  }

  get retryCount(): number {
    return this._retryCount;
  }

  get version(): number {
    return this._version;
  }

  get isCompleted(): boolean {
    return this._status === SettlementStatus.COMPLETED;
  }

  get isFailed(): boolean {
    return (
      this._status === SettlementStatus.BANK_FAILED ||
      this._status === SettlementStatus.BLOCKCHAIN_FAILED
    );
  }

  get isTerminal(): boolean {
    return isTerminalStatus(this._status);
  }

  get canRetry(): boolean {
    return (
      this.isFailed &&
      this._retryCount < 3 &&
      this._status !== SettlementStatus.MANUAL_REVIEW
    );
  }

  // ============================================
  // State Transitions
  // ============================================

  /**
   * Marks escrow as locked
   */
  markEscrowLocked(performedBy: string): void {
    this.transition(SettlementStatus.ESCROW_LOCKED, performedBy, 'ESCROW_LOCKED', {});
  }

  /**
   * Marks bank transfer as initiated
   */
  markBankPending(performedBy: string, bankBatchReference?: string): void {
    this.transition(SettlementStatus.BANK_PENDING, performedBy, 'BANK_TRANSFER_INITIATED', {
      bankBatchReference,
    });
  }

  /**
   * Records bank transfer result for a leg
   */
  recordBankTransferResult(result: BankTransferResult, performedBy: string): void {
    // Find existing result for this leg or add new
    const existingIndex = this._bankTransferResults.findIndex(
      (r) => r.legIndex === result.legIndex
    );

    if (existingIndex >= 0) {
      this._bankTransferResults[existingIndex] = result;
    } else {
      this._bankTransferResults.push(result);
    }

    this.recordEvent({
      id: uuidv4(),
      timestamp: new Date(),
      status: this._status,
      action: 'BANK_LEG_RESULT',
      details: {
        legIndex: result.legIndex,
        recipientType: result.recipientType,
        status: result.status,
        bankReference: result.bankReference,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
      performedBy,
      bankReference: result.bankReference,
    });

    this._version++;
  }

  /**
   * Marks all bank transfers as successful
   */
  markBankSuccess(performedBy: string): void {
    // Verify all legs are successful
    const allSuccessful = this.areAllBankTransfersSuccessful();
    if (!allSuccessful) {
      throw new Error('Cannot mark bank success - not all transfers are successful');
    }

    this.transition(SettlementStatus.BANK_SUCCESS, performedBy, 'BANK_TRANSFER_SUCCESS', {
      results: this._bankTransferResults,
    });
  }

  /**
   * Marks bank transfer as failed
   */
  markBankFailed(performedBy: string, errorMessage: string): void {
    this._errorMessage = errorMessage;
    this.transition(SettlementStatus.BANK_FAILED, performedBy, 'BANK_TRANSFER_FAILED', {
      errorMessage,
      results: this._bankTransferResults,
    });
  }

  /**
   * Marks blockchain transaction as pending
   */
  markBlockchainPending(performedBy: string, txHash: string): void {
    this._blockchainTxHash = txHash;
    this.transition(SettlementStatus.BLOCKCHAIN_PENDING, performedBy, 'BLOCKCHAIN_TX_SUBMITTED', {
      txHash,
    });
  }

  /**
   * Marks settlement as completed
   */
  markCompleted(
    performedBy: string,
    blockNumber: number,
    blockchainTimestamp: Date
  ): void {
    this._blockNumber = blockNumber;
    this._blockchainTimestamp = blockchainTimestamp;
    this._completedAt = new Date();

    this.transition(SettlementStatus.COMPLETED, performedBy, 'SETTLEMENT_COMPLETED', {
      blockNumber,
      blockchainTimestamp: blockchainTimestamp.toISOString(),
      totalDurationMs: this._completedAt.getTime() - this._initiatedAt.getTime(),
    });
  }

  /**
   * Marks blockchain transaction as failed
   */
  markBlockchainFailed(performedBy: string, errorMessage: string): void {
    this._errorMessage = errorMessage;
    this.transition(SettlementStatus.BLOCKCHAIN_FAILED, performedBy, 'BLOCKCHAIN_TX_FAILED', {
      txHash: this._blockchainTxHash,
      errorMessage,
    });
  }

  /**
   * Marks for manual review
   */
  markForManualReview(performedBy: string, reason: string): void {
    this._errorMessage = reason;
    this.transition(SettlementStatus.MANUAL_REVIEW, performedBy, 'MANUAL_REVIEW_REQUIRED', {
      reason,
    });
  }

  /**
   * Cancels the settlement
   */
  cancel(performedBy: string, reason: string): void {
    if (this._status === SettlementStatus.BANK_SUCCESS) {
      throw new Error('Cannot cancel settlement after bank transfer success');
    }

    this._errorMessage = reason;
    this._completedAt = new Date();

    this.transition(SettlementStatus.CANCELLED, performedBy, 'SETTLEMENT_CANCELLED', {
      reason,
    });
  }

  /**
   * Prepares for retry
   */
  prepareForRetry(performedBy: string): void {
    if (!this.canRetry) {
      throw new Error(`Cannot retry settlement in status ${this._status}`);
    }

    this._retryCount++;
    this._errorMessage = undefined;

    // Reset to ESCROW_LOCKED for retry
    this._status = SettlementStatus.ESCROW_LOCKED;

    this.recordEvent({
      id: uuidv4(),
      timestamp: new Date(),
      status: this._status,
      action: 'RETRY_PREPARED',
      details: {
        retryCount: this._retryCount,
      },
      performedBy,
    });

    this._version++;
  }

  // ============================================
  // Queries
  // ============================================

  /**
   * Checks if all bank transfers are successful
   */
  areAllBankTransfersSuccessful(): boolean {
    const expectedLegs = this._splitPayment.legCount;
    const successfulLegs = this._bankTransferResults.filter(
      (r) => r.status === BankTransferStatus.SUCCESS
    ).length;

    return successfulLegs === expectedLegs;
  }

  /**
   * Gets failed bank transfers
   */
  getFailedBankTransfers(): BankTransferResult[] {
    return this._bankTransferResults.filter(
      (r) => r.status === BankTransferStatus.FAILED || r.status === BankTransferStatus.REJECTED
    );
  }

  /**
   * Generates settlement reference hash for blockchain
   */
  generateSettlementRefHash(): string {
    const data = [
      this._id,
      this._contractId,
      this._splitPayment.referenceHash,
      this._bankTransferResults.map((r) => r.bankReference).join(','),
    ].join('|');

    const crypto = require('crypto');
    return '0x' + crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Gets total time in current status
   */
  getTimeInCurrentStatus(): number {
    const lastEvent = this._events[this._events.length - 1];
    if (!lastEvent) return 0;

    return Date.now() - lastEvent.timestamp.getTime();
  }

  // ============================================
  // Serialization
  // ============================================

  /**
   * Converts to persistence format
   */
  toPersistence(): SettlementProps {
    return {
      id: this._id,
      contractId: this._contractId,
      escrowAccountId: this._escrowAccountId,
      splitPayment: this._splitPayment,
      status: this._status,
      referenceId: this._referenceId,
      bankTransferResults: [...this._bankTransferResults],
      blockchainTxHash: this._blockchainTxHash,
      blockNumber: this._blockNumber,
      blockchainTimestamp: this._blockchainTimestamp,
      events: [...this._events],
      initiatedBy: this._initiatedBy,
      initiatedAt: this._initiatedAt,
      completedAt: this._completedAt,
      errorMessage: this._errorMessage,
      retryCount: this._retryCount,
      version: this._version,
    };
  }

  /**
   * Creates audit report
   */
  toAuditReport(): string {
    const lines = [
      '='.repeat(60),
      'SETTLEMENT AUDIT REPORT',
      '='.repeat(60),
      `ID: ${this._id}`,
      `Contract: ${this._contractId}`,
      `Status: ${this._status}`,
      `Reference: ${this._referenceId}`,
      '',
      'SPLIT PAYMENT:',
      this._splitPayment.toAuditString(),
      '',
      'BANK TRANSFER RESULTS:',
    ];

    for (const result of this._bankTransferResults) {
      lines.push(
        `  ${result.recipientType}: ${result.status} ` +
        `(ref: ${result.bankReference || 'N/A'})`
      );
    }

    if (this._blockchainTxHash) {
      lines.push('');
      lines.push('BLOCKCHAIN:');
      lines.push(`  TxHash: ${this._blockchainTxHash}`);
      lines.push(`  Block: ${this._blockNumber || 'N/A'}`);
    }

    lines.push('');
    lines.push('EVENT TIMELINE:');
    for (const event of this._events) {
      lines.push(
        `  [${event.timestamp.toISOString()}] ${event.action} by ${event.performedBy}`
      );
    }

    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Performs state transition with validation
   */
  private transition(
    newStatus: SettlementStatus,
    performedBy: string,
    action: string,
    details: Record<string, unknown>
  ): void {
    if (!isValidTransition(this._status, newStatus)) {
      throw new Error(
        `Invalid settlement transition: ${this._status} → ${newStatus}`
      );
    }

    const oldStatus = this._status;
    this._status = newStatus;

    this.recordEvent({
      id: uuidv4(),
      timestamp: new Date(),
      status: newStatus,
      action,
      details: {
        ...details,
        previousStatus: oldStatus,
      },
      performedBy,
      blockchainTxHash: this._blockchainTxHash,
    });

    this._version++;
  }

  /**
   * Records an event
   */
  private recordEvent(event: SettlementEvent): void {
    this._events.push(event);
  }
}
