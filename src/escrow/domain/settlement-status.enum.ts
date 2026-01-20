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
 *                                                ↘ BLOCKED_BY_STATE_CHANGE (on-chain no longer VERIFIED)
 *       Any non-terminal → FROZEN_BY_DISPUTE (when DisputeOpened event received)
 *
 * SAFETY INVARIANT: Settlement can only complete if on-chain status is VERIFIED at execution time.
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

  /**
   * SAFETY STATUS: On-chain status changed (no longer VERIFIED) after bank success.
   * This prevents settlement when dispute or cancellation occurred during bank processing.
   * CRITICAL: Money is locked in escrow, requires manual review to resolve.
   * SOP: "Final money release must re-confirm that verification is still valid at execution time."
   */
  BLOCKED_BY_STATE_CHANGE = 'BLOCKED_BY_STATE_CHANGE',

  /**
   * SAFETY STATUS: Settlement frozen due to DisputeOpened event on blockchain.
   * Escrow funds are locked until dispute resolution.
   * CRITICAL: Automatic protection when contract enters dispute.
   * SOP: "When there is a dispute, money must be locked in a vault until justice is resolved."
   */
  FROZEN_BY_DISPUTE = 'FROZEN_BY_DISPUTE',
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
 *
 * SAFETY TRANSITIONS:
 * - BANK_SUCCESS can go to BLOCKED_BY_STATE_CHANGE if on-chain status changed
 * - Any non-terminal status can go to FROZEN_BY_DISPUTE when dispute detected
 */
export const SETTLEMENT_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  [SettlementStatus.INITIATED]: [
    SettlementStatus.ESCROW_LOCKED,
    SettlementStatus.CANCELLED,
    SettlementStatus.FROZEN_BY_DISPUTE, // SAFETY: Dispute can freeze at any time
  ],
  [SettlementStatus.ESCROW_LOCKED]: [
    SettlementStatus.BANK_PENDING,
    SettlementStatus.CANCELLED,
    SettlementStatus.FROZEN_BY_DISPUTE, // SAFETY: Dispute can freeze at any time
  ],
  [SettlementStatus.BANK_PENDING]: [
    SettlementStatus.BANK_SUCCESS,
    SettlementStatus.BANK_FAILED,
    SettlementStatus.FROZEN_BY_DISPUTE, // SAFETY: Dispute can freeze at any time
  ],
  [SettlementStatus.BANK_SUCCESS]: [
    SettlementStatus.BLOCKCHAIN_PENDING,
    SettlementStatus.BLOCKED_BY_STATE_CHANGE, // SAFETY: On-chain status changed
    SettlementStatus.FROZEN_BY_DISPUTE, // SAFETY: Dispute can freeze at any time
  ],
  [SettlementStatus.BANK_FAILED]: [
    SettlementStatus.ESCROW_LOCKED, // Retry after unlock
    SettlementStatus.MANUAL_REVIEW,
    SettlementStatus.FROZEN_BY_DISPUTE, // SAFETY: Dispute can freeze at any time
  ],
  [SettlementStatus.BLOCKCHAIN_PENDING]: [
    SettlementStatus.COMPLETED,
    SettlementStatus.BLOCKCHAIN_FAILED,
    SettlementStatus.FROZEN_BY_DISPUTE, // SAFETY: Dispute can freeze at any time
  ],
  [SettlementStatus.BLOCKCHAIN_FAILED]: [
    SettlementStatus.BLOCKCHAIN_PENDING, // Retry
    SettlementStatus.MANUAL_REVIEW,
    SettlementStatus.BLOCKED_BY_STATE_CHANGE, // SAFETY: Check on-chain before retry
    SettlementStatus.FROZEN_BY_DISPUTE, // SAFETY: Dispute can freeze at any time
  ],
  [SettlementStatus.COMPLETED]: [], // Terminal - no transitions allowed
  [SettlementStatus.CANCELLED]: [], // Terminal - no transitions allowed
  [SettlementStatus.MANUAL_REVIEW]: [
    SettlementStatus.ESCROW_LOCKED, // Resume after review
    SettlementStatus.CANCELLED,
    SettlementStatus.FROZEN_BY_DISPUTE, // SAFETY: Dispute can freeze at any time
  ],
  // SAFETY STATUSES - require manual resolution
  [SettlementStatus.BLOCKED_BY_STATE_CHANGE]: [
    SettlementStatus.MANUAL_REVIEW, // Escalate for investigation
    SettlementStatus.CANCELLED, // Cancel after investigation
  ],
  [SettlementStatus.FROZEN_BY_DISPUTE]: [
    SettlementStatus.ESCROW_LOCKED, // Resume after dispute resolved in favor of settlement
    SettlementStatus.CANCELLED, // Cancel after dispute resolved against settlement
    SettlementStatus.MANUAL_REVIEW, // Escalate for complex cases
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

/**
 * Checks if status is a safety-blocked status requiring special handling.
 * These statuses indicate the settlement was stopped for safety reasons.
 */
export function isSafetyBlockedStatus(status: SettlementStatus): boolean {
  return (
    status === SettlementStatus.BLOCKED_BY_STATE_CHANGE ||
    status === SettlementStatus.FROZEN_BY_DISPUTE
  );
}

/**
 * Checks if settlement can be interrupted by a dispute.
 * Completed and cancelled settlements cannot be frozen.
 */
export function canBeFrozenByDispute(status: SettlementStatus): boolean {
  return !isTerminalStatus(status) && status !== SettlementStatus.FROZEN_BY_DISPUTE;
}

/**
 * Checks if settlement is in a state where bank transfer might be in progress.
 * Used to determine if we need to handle partial transfer scenarios.
 */
export function isBankTransferInProgress(status: SettlementStatus): boolean {
  return (
    status === SettlementStatus.BANK_PENDING ||
    status === SettlementStatus.BANK_SUCCESS
  );
}

/**
 * Gets human-readable description of safety status for audit logs.
 */
export function getSafetyStatusDescription(status: SettlementStatus): string {
  switch (status) {
    case SettlementStatus.BLOCKED_BY_STATE_CHANGE:
      return 'Settlement blocked: On-chain contract status changed during processing. ' +
        'Verification is no longer valid. Funds locked pending investigation.';
    case SettlementStatus.FROZEN_BY_DISPUTE:
      return 'Settlement frozen: Contract entered dispute state on blockchain. ' +
        'All funds locked until dispute resolution.';
    default:
      return `Status: ${status}`;
  }
}
