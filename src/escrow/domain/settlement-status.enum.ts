/**
 * AMANTRA - Settlement Status Enum
 *
 * Defines the lifecycle states of a settlement operation.
 * State machine is strictly enforced - no backward transitions.
 *
 * @module escrow/domain
 */

/**
 * Settlement Status
 *
 * Flow: INITIATED → ESCROW_LOCKED → BANK_PENDING → BANK_SUCCESS → BLOCKCHAIN_PENDING → COMPLETED
 *                                 ↘ BANK_FAILED → (retry or manual)
 *                                                ↘ BLOCKCHAIN_FAILED → (retry)
 */
export enum SettlementStatus {
  /**
   * Settlement intent created, not yet processed
   */
  INITIATED = 'INITIATED',

  /**
   * Escrow funds have been frozen/locked
   */
  ESCROW_LOCKED = 'ESCROW_LOCKED',

  /**
   * Bank transfer initiated, awaiting callback
   */
  BANK_PENDING = 'BANK_PENDING',

  /**
   * Bank confirmed both transfers successful
   */
  BANK_SUCCESS = 'BANK_SUCCESS',

  /**
   * Bank transfer failed (one or both legs)
   */
  BANK_FAILED = 'BANK_FAILED',

  /**
   * Blockchain markSettled called, awaiting confirmation
   */
  BLOCKCHAIN_PENDING = 'BLOCKCHAIN_PENDING',

  /**
   * Blockchain transaction failed
   */
  BLOCKCHAIN_FAILED = 'BLOCKCHAIN_FAILED',

  /**
   * Settlement fully completed (bank + blockchain)
   */
  COMPLETED = 'COMPLETED',

  /**
   * Settlement cancelled (before bank transfer)
   */
  CANCELLED = 'CANCELLED',

  /**
   * Requires manual intervention
   */
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

/**
 * Bank Transfer Status (from bank callback)
 */
export enum BankTransferStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Escrow Account Status
 */
export enum EscrowAccountStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
}

/**
 * Settlement allowed state transitions
 */
export const SETTLEMENT_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  [SettlementStatus.INITIATED]: [
    SettlementStatus.ESCROW_LOCKED,
    SettlementStatus.CANCELLED,
  ],
  [SettlementStatus.ESCROW_LOCKED]: [
    SettlementStatus.BANK_PENDING,
    SettlementStatus.CANCELLED,
  ],
  [SettlementStatus.BANK_PENDING]: [
    SettlementStatus.BANK_SUCCESS,
    SettlementStatus.BANK_FAILED,
  ],
  [SettlementStatus.BANK_SUCCESS]: [
    SettlementStatus.BLOCKCHAIN_PENDING,
  ],
  [SettlementStatus.BANK_FAILED]: [
    SettlementStatus.ESCROW_LOCKED, // Retry after unlock
    SettlementStatus.MANUAL_REVIEW,
  ],
  [SettlementStatus.BLOCKCHAIN_PENDING]: [
    SettlementStatus.COMPLETED,
    SettlementStatus.BLOCKCHAIN_FAILED,
  ],
  [SettlementStatus.BLOCKCHAIN_FAILED]: [
    SettlementStatus.BLOCKCHAIN_PENDING, // Retry
    SettlementStatus.MANUAL_REVIEW,
  ],
  [SettlementStatus.COMPLETED]: [], // Terminal
  [SettlementStatus.CANCELLED]: [], // Terminal
  [SettlementStatus.MANUAL_REVIEW]: [
    SettlementStatus.ESCROW_LOCKED, // Resume after review
    SettlementStatus.CANCELLED,
  ],
};

/**
 * Validates if a state transition is allowed
 */
export function isValidTransition(
  from: SettlementStatus,
  to: SettlementStatus
): boolean {
  return SETTLEMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Checks if status is terminal (no further transitions)
 */
export function isTerminalStatus(status: SettlementStatus): boolean {
  return (
    status === SettlementStatus.COMPLETED ||
    status === SettlementStatus.CANCELLED
  );
}

/**
 * Checks if status indicates failure requiring attention
 */
export function isFailureStatus(status: SettlementStatus): boolean {
  return (
    status === SettlementStatus.BANK_FAILED ||
    status === SettlementStatus.BLOCKCHAIN_FAILED ||
    status === SettlementStatus.MANUAL_REVIEW
  );
}
