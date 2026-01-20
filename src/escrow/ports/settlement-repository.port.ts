/**
 * AMANTRA - Settlement Repository Port
 *
 * Defines the persistence contract for settlements and escrow accounts.
 * Supports transactional operations with optimistic locking.
 *
 * @module escrow/ports
 */

import { PoolClient } from 'pg';
import { EscrowAccount, EscrowAccountProps } from '../domain/escrow-account.entity';
import { Settlement, SettlementProps } from '../domain/settlement.entity';
import { SettlementStatus, EscrowAccountStatus } from '../domain/settlement-status.enum';

// ============================================
// Escrow Account Repository
// ============================================

/**
 * Search criteria for escrow accounts
 */
export interface EscrowAccountSearchCriteria {
  contractId?: string;
  bankCode?: string;
  status?: EscrowAccountStatus | EscrowAccountStatus[];
  minBalance?: number;
  maxBalance?: number;
  createdAfter?: Date;
  createdBefore?: Date;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Escrow Account Repository Interface
 */
export interface EscrowAccountRepository {
  /**
   * Saves an escrow account
   *
   * @param account - Escrow account to save
   * @param client - Optional DB client for transaction
   */
  save(account: EscrowAccount, client?: PoolClient): Promise<void>;

  /**
   * Finds escrow account by ID
   *
   * @param id - Escrow account ID
   * @returns Account or null if not found
   */
  findById(id: string): Promise<EscrowAccount | null>;

  /**
   * Finds escrow account by contract ID
   *
   * @param contractId - Contract ID
   * @returns Account or null if not found
   */
  findByContractId(contractId: string): Promise<EscrowAccount | null>;

  /**
   * Finds escrow account by bank account number
   *
   * @param accountNumber - Bank account number
   * @param bankCode - Bank code
   * @returns Account or null if not found
   */
  findByBankAccount(accountNumber: string, bankCode: string): Promise<EscrowAccount | null>;

  /**
   * Finds escrow account with row lock
   *
   * @param id - Escrow account ID
   * @param client - DB client (required for transaction)
   * @returns Locked account or null
   */
  findForUpdate(id: string, client: PoolClient): Promise<EscrowAccount | null>;

  /**
   * Searches escrow accounts by criteria
   *
   * @param criteria - Search criteria
   * @param pagination - Pagination options
   * @returns Paginated results
   */
  findByCriteria(
    criteria: EscrowAccountSearchCriteria,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<EscrowAccount>>;

  /**
   * Gets accounts with frozen funds (for monitoring)
   *
   * @param limit - Maximum records
   * @returns Accounts with frozen funds
   */
  findWithFrozenFunds(limit: number): Promise<EscrowAccount[]>;

  /**
   * Gets total balance across all escrow accounts
   *
   * @returns Total balance
   */
  getTotalEscrowBalance(): Promise<number>;

  /**
   * Updates account balance (for reconciliation)
   *
   * @param id - Account ID
   * @param newBalance - Verified balance
   * @param client - Optional DB client
   */
  updateBalance(id: string, newBalance: number, client?: PoolClient): Promise<void>;
}

// ============================================
// Settlement Repository
// ============================================

/**
 * Search criteria for settlements
 */
export interface SettlementSearchCriteria {
  contractId?: string;
  escrowAccountId?: string;
  status?: SettlementStatus | SettlementStatus[];
  initiatedBy?: string;
  initiatedAfter?: Date;
  initiatedBefore?: Date;
  completedAfter?: Date;
  completedBefore?: Date;
  hasBlockchainTx?: boolean;
  minAmount?: number;
  maxAmount?: number;
}

/**
 * Settlement statistics
 */
export interface SettlementStatistics {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  totalSettledAmount: number;
  totalPlatformFees: number;
  averageSettlementTimeMs: number;
  byStatus: Record<SettlementStatus, number>;
}

/**
 * Settlement Repository Interface
 */
export interface SettlementRepository {
  /**
   * Saves a settlement
   *
   * @param settlement - Settlement to save
   * @param client - Optional DB client for transaction
   */
  save(settlement: Settlement, client?: PoolClient): Promise<void>;

  /**
   * Finds settlement by ID
   *
   * @param id - Settlement ID
   * @returns Settlement or null if not found
   */
  findById(id: string): Promise<Settlement | null>;

  /**
   * Finds settlement by contract ID
   *
   * @param contractId - Contract ID
   * @returns Settlement or null if not found
   */
  findByContractId(contractId: string): Promise<Settlement | null>;

  /**
   * Finds settlement by reference ID
   *
   * @param referenceId - Bank reference ID
   * @returns Settlement or null if not found
   */
  findByReferenceId(referenceId: string): Promise<Settlement | null>;

  /**
   * Finds settlement by blockchain transaction hash
   *
   * @param txHash - Blockchain transaction hash
   * @returns Settlement or null if not found
   */
  findByBlockchainTxHash(txHash: string): Promise<Settlement | null>;

  /**
   * Finds settlement with row lock
   *
   * @param id - Settlement ID
   * @param client - DB client (required for transaction)
   * @returns Locked settlement or null
   */
  findForUpdate(id: string, client: PoolClient): Promise<Settlement | null>;

  /**
   * Searches settlements by criteria
   *
   * @param criteria - Search criteria
   * @param pagination - Pagination options
   * @returns Paginated results
   */
  findByCriteria(
    criteria: SettlementSearchCriteria,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<Settlement>>;

  /**
   * Finds settlements in specific statuses
   *
   * @param statuses - Statuses to find
   * @param limit - Maximum records
   * @returns Settlements in those statuses
   */
  findByStatuses(statuses: SettlementStatus[], limit: number): Promise<Settlement[]>;

  /**
   * Finds settlements pending bank callback
   *
   * Settlements in BANK_PENDING status for more than threshold minutes.
   *
   * @param thresholdMinutes - Minutes since bank transfer initiated
   * @param limit - Maximum records
   * @returns Stale pending settlements
   */
  findStaleBankPending(thresholdMinutes: number, limit: number): Promise<Settlement[]>;

  /**
   * Finds settlements pending blockchain confirmation
   *
   * Settlements in BLOCKCHAIN_PENDING status.
   *
   * @param limit - Maximum records
   * @returns Pending blockchain settlements
   */
  findPendingBlockchain(limit: number): Promise<Settlement[]>;

  /**
   * Finds failed settlements that can be retried
   *
   * @param maxRetries - Maximum retry count
   * @param limit - Maximum records
   * @returns Retryable settlements
   */
  findRetryable(maxRetries: number, limit: number): Promise<Settlement[]>;

  /**
   * Gets settlement statistics for a date range
   *
   * @param startDate - Start of period
   * @param endDate - End of period
   * @returns Settlement statistics
   */
  getStatistics(startDate: Date, endDate: Date): Promise<SettlementStatistics>;

  /**
   * Checks if a settlement exists for a contract
   *
   * @param contractId - Contract ID
   * @returns true if settlement exists
   */
  existsForContract(contractId: string): Promise<boolean>;

  /**
   * Gets settlements for reconciliation
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Settlements in the period
   */
  findForReconciliation(startDate: Date, endDate: Date): Promise<Settlement[]>;
}

// ============================================
// Injection Tokens
// ============================================

/**
 * Injection token for escrow account repository
 */
export const ESCROW_ACCOUNT_REPOSITORY = 'ESCROW_ACCOUNT_REPOSITORY';

/**
 * Injection token for settlement repository
 */
export const SETTLEMENT_REPOSITORY = 'SETTLEMENT_REPOSITORY';
