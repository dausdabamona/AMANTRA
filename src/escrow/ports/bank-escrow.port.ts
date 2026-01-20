/**
 * AMANTRA - Bank Escrow Port Interface
 *
 * Defines the contract for bank escrow operations.
 * Adapters implement this interface for specific banks (BSI, Mandiri, BCA, etc.)
 *
 * Key principles:
 * - All operations must be idempotent using referenceId
 * - Split transfers must be atomic (all or nothing)
 * - All operations must support callback-based confirmation
 *
 * @module escrow/ports
 */

import { BankTransferStatus } from '../domain/settlement-status.enum';
import { TransferLeg } from '../domain/split-payment.value';

// ============================================
// Types
// ============================================

/**
 * Bank account information
 */
export interface BankAccount {
  accountNumber: string;
  bankCode: string;
  accountName: string;
  accountType?: 'SAVINGS' | 'CHECKING' | 'ESCROW';
}

/**
 * Escrow account creation request
 */
export interface CreateEscrowAccountRequest {
  contractId: string;
  initialDeposit?: number;
  currency: string;
  metadata?: Record<string, string>;
}

/**
 * Escrow account creation response
 */
export interface CreateEscrowAccountResponse {
  success: boolean;
  escrowAccountId: string;
  accountNumber: string;
  bankCode: string;
  virtualAccountNumber?: string;
  createdAt: Date;
  error?: string;
}

/**
 * Fund freeze request
 */
export interface FreezeFundsRequest {
  escrowAccountId: string;
  amount: number;
  referenceId: string;
  reason: string;
  expiresAt?: Date;
}

/**
 * Fund freeze response
 */
export interface FreezeFundsResponse {
  success: boolean;
  freezeId: string;
  frozenAmount: number;
  bankReference: string;
  timestamp: Date;
  error?: string;
}

/**
 * Fund unfreeze request
 */
export interface UnfreezeFundsRequest {
  escrowAccountId: string;
  freezeId: string;
  referenceId: string;
  reason: string;
}

/**
 * Fund unfreeze response
 */
export interface UnfreezeFundsResponse {
  success: boolean;
  unfrozenAmount: number;
  bankReference: string;
  timestamp: Date;
  error?: string;
}

/**
 * Single transfer in a split payment
 */
export interface TransferRequest {
  toAccount: BankAccount;
  amount: number;
  description: string;
  recipientType: 'SELLER' | 'PLATFORM' | 'MEDIATOR';
}

/**
 * Split transfer request
 */
export interface SplitTransferRequest {
  escrowAccountId: string;
  transfers: TransferRequest[];
  referenceId: string;
  totalAmount: number;
  metadata?: Record<string, string>;
}

/**
 * Individual transfer result in a split payment
 */
export interface TransferResult {
  recipientType: 'SELLER' | 'PLATFORM' | 'MEDIATOR';
  toAccountNumber: string;
  amount: number;
  status: BankTransferStatus;
  bankReference?: string;
  bankTimestamp?: Date;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Split transfer acknowledgment (immediate response)
 */
export interface SplitTransferAck {
  success: boolean;
  batchId: string;
  referenceId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING_VALIDATION';
  estimatedCompletionTime?: Date;
  error?: string;
}

/**
 * Split transfer final status (from callback or query)
 */
export interface SplitTransferStatus {
  batchId: string;
  referenceId: string;
  overallStatus: BankTransferStatus;
  transferResults: TransferResult[];
  totalTransferred: number;
  totalFailed: number;
  completedAt?: Date;
  bankStatement?: string;
}

/**
 * Balance inquiry response
 */
export interface BalanceResponse {
  accountNumber: string;
  availableBalance: number;
  currentBalance: number;
  frozenBalance: number;
  currency: string;
  asOf: Date;
}

/**
 * Transaction history request
 */
export interface TransactionHistoryRequest {
  escrowAccountId: string;
  startDate: Date;
  endDate: Date;
  limit?: number;
  offset?: number;
}

/**
 * Bank transaction record
 */
export interface BankTransaction {
  transactionId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  balanceAfter: number;
  referenceNumber: string;
  description: string;
  counterpartyAccount?: string;
  counterpartyName?: string;
  timestamp: Date;
}

/**
 * Transaction history response
 */
export interface TransactionHistoryResponse {
  transactions: BankTransaction[];
  totalCount: number;
  hasMore: boolean;
}

/**
 * Bank callback payload
 */
export interface BankCallbackPayload {
  callbackType: 'TRANSFER_STATUS' | 'DEPOSIT_RECEIVED' | 'BALANCE_CHANGE';
  batchId?: string;
  referenceId: string;
  status: BankTransferStatus;
  transferResults?: TransferResult[];
  amount?: number;
  bankReference: string;
  timestamp: Date;
  signature: string;
  rawPayload: string;
}

// ============================================
// Port Interface
// ============================================

/**
 * Bank Escrow Port
 *
 * Interface that all bank adapters must implement.
 * Provides escrow account management and split transfer capabilities.
 */
export interface BankEscrowPort {
  /**
   * Bank identifier
   */
  readonly bankCode: string;

  /**
   * Bank display name
   */
  readonly bankName: string;

  /**
   * Whether the adapter supports atomic split transfers
   */
  readonly supportsAtomicSplit: boolean;

  // ============================================
  // Escrow Account Management
  // ============================================

  /**
   * Creates a new escrow account for a contract
   *
   * @param request - Account creation request
   * @returns Created account details
   */
  createEscrowAccount(request: CreateEscrowAccountRequest): Promise<CreateEscrowAccountResponse>;

  /**
   * Gets current balance of an escrow account
   *
   * @param escrowAccountId - Internal escrow account ID
   * @returns Balance details
   */
  getBalance(escrowAccountId: string): Promise<BalanceResponse>;

  /**
   * Gets transaction history for an escrow account
   *
   * @param request - History request with filters
   * @returns List of transactions
   */
  getTransactionHistory(request: TransactionHistoryRequest): Promise<TransactionHistoryResponse>;

  // ============================================
  // Fund Management
  // ============================================

  /**
   * Freezes funds in escrow for pending settlement
   *
   * This prevents the funds from being used for other purposes
   * while settlement is in progress.
   *
   * @param request - Freeze request
   * @returns Freeze confirmation
   */
  freezeFunds(request: FreezeFundsRequest): Promise<FreezeFundsResponse>;

  /**
   * Unfreezes previously frozen funds
   *
   * Called when settlement fails and funds need to be released.
   *
   * @param request - Unfreeze request
   * @returns Unfreeze confirmation
   */
  unfreezeFunds(request: UnfreezeFundsRequest): Promise<UnfreezeFundsResponse>;

  // ============================================
  // Settlement Transfers
  // ============================================

  /**
   * Executes a split transfer from escrow to multiple recipients
   *
   * This is the core settlement operation. It must be:
   * - Atomic: Either all transfers succeed or all fail
   * - Idempotent: Same referenceId returns same result
   *
   * The method returns immediately with an ACK. Final status
   * comes via callback or queryTransferStatus().
   *
   * @param request - Split transfer request
   * @returns Immediate acknowledgment
   */
  executeSplitTransfer(request: SplitTransferRequest): Promise<SplitTransferAck>;

  /**
   * Queries the status of a previous split transfer
   *
   * Used for:
   * - Polling when callbacks are delayed
   * - Reconciliation
   * - Retry logic
   *
   * @param referenceId - Original transfer reference ID
   * @returns Current transfer status
   */
  queryTransferStatus(referenceId: string): Promise<SplitTransferStatus>;

  // ============================================
  // Callback Handling
  // ============================================

  /**
   * Verifies callback signature from bank
   *
   * @param payload - Raw callback payload
   * @param signature - Signature from bank
   * @returns true if signature is valid
   */
  verifyCallbackSignature(payload: string, signature: string): boolean;

  /**
   * Parses and validates callback payload
   *
   * @param rawPayload - Raw callback body
   * @param signature - Signature header
   * @returns Parsed and validated callback
   */
  parseCallback(rawPayload: string, signature: string): BankCallbackPayload;

  // ============================================
  // Health & Diagnostics
  // ============================================

  /**
   * Checks if the bank API is available
   *
   * @returns true if API is healthy
   */
  healthCheck(): Promise<boolean>;

  /**
   * Gets API latency statistics
   *
   * @returns Latency metrics
   */
  getLatencyStats(): {
    averageMs: number;
    p95Ms: number;
    p99Ms: number;
    sampleCount: number;
  };
}

// ============================================
// Injection Token
// ============================================

/**
 * Injection token for the bank escrow port
 */
export const BANK_ESCROW_PORT = 'BANK_ESCROW_PORT';
