/**
 * AMANTRA - Escrow Account Service
 *
 * Service layer for escrow account management.
 * Handles account lifecycle, balance operations, and bank interactions.
 *
 * Key responsibilities:
 * - Create escrow accounts via bank adapter
 * - Credit funds after QRIS payment
 * - Freeze funds for pending settlement
 * - Unfreeze funds on settlement failure
 * - Debit funds after successful settlement
 * - Close accounts after settlement completion
 *
 * @module escrow/services
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Pool, PoolClient } from 'pg';

// Domain imports
import { EscrowAccount, EscrowAccountProps } from '../domain/escrow-account.entity';
import { EscrowAccountStatus } from '../domain/settlement-status.enum';

// Port imports
import {
  EscrowAccountRepository,
  EscrowAccountSearchCriteria,
  PaginationOptions,
  PaginatedResult,
  ESCROW_ACCOUNT_REPOSITORY,
} from '../ports/settlement-repository.port';
import { BankEscrowPort, BalanceResponse } from '../ports/bank-escrow.port';

// ============================================
// Types
// ============================================

export interface CreateEscrowAccountRequest {
  contractId: string;
  currency: string;
  performedBy: string;
}

export interface CreateEscrowAccountResponse {
  account: EscrowAccount;
  bankAccountId: string;
  accountNumber: string;
}

export interface CreditEscrowRequest {
  escrowAccountId: string;
  amount: number;
  reference: string;
  description: string;
  bankReference: string;
  performedBy: string;
}

export interface DebitEscrowRequest {
  escrowAccountId: string;
  amount: number;
  reference: string;
  description: string;
  bankReference: string;
  performedBy: string;
}

export interface FreezeRequest {
  escrowAccountId: string;
  amount: number;
  reference: string;
  performedBy: string;
}

export interface UnfreezeRequest {
  escrowAccountId: string;
  amount: number;
  reference: string;
  performedBy: string;
}

export interface BalanceVerificationResult {
  accountId: string;
  storedBalance: number;
  bankBalance: number;
  match: boolean;
  discrepancy: number;
  verifiedAt: Date;
}

export interface EscrowAccountEvent {
  type: 'created' | 'credited' | 'debited' | 'frozen' | 'unfrozen' | 'closed' | 'balance_verified';
  accountId: string;
  contractId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

// ============================================
// Service Implementation
// ============================================

@Injectable()
export class EscrowAccountService {
  private readonly logger = new Logger(EscrowAccountService.name);

  constructor(
    @Inject(ESCROW_ACCOUNT_REPOSITORY)
    private readonly escrowAccountRepository: EscrowAccountRepository,
    @Inject('BANK_ADAPTER')
    private readonly bankAdapter: BankEscrowPort,
    @Inject('DATABASE_POOL')
    private readonly pool: Pool,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ============================================
  // Account Lifecycle
  // ============================================

  /**
   * Creates a new escrow account via bank adapter.
   *
   * @param request - Account creation request
   * @returns Created account with bank details
   */
  async createAccount(request: CreateEscrowAccountRequest): Promise<CreateEscrowAccountResponse> {
    this.logger.log(`Creating escrow account for contract ${request.contractId}`);

    // Check if account already exists for this contract
    const existing = await this.escrowAccountRepository.findByContractId(request.contractId);
    if (existing) {
      this.logger.warn(`Escrow account already exists for contract ${request.contractId}`);
      return {
        account: existing,
        bankAccountId: existing.bankAccountId,
        accountNumber: existing.accountNumber,
      };
    }

    // Create account via bank adapter
    const bankResponse = await this.bankAdapter.createEscrowAccount({
      contractId: request.contractId,
      currency: request.currency,
    });

    if (!bankResponse.success) {
      throw new Error(`Failed to create bank escrow account: ${bankResponse.error}`);
    }

    // Create domain entity
    const account = EscrowAccount.create(
      request.contractId,
      bankResponse.bankAccountId,
      this.bankAdapter.bankCode,
      bankResponse.accountNumber,
      request.currency,
    );

    // Persist
    await this.escrowAccountRepository.save(account);

    // Emit event
    this.emitEvent('created', account.id, account.contractId, {
      bankAccountId: bankResponse.bankAccountId,
      accountNumber: bankResponse.accountNumber,
      currency: request.currency,
      performedBy: request.performedBy,
    });

    this.logger.log(`Escrow account created: ${account.id}`);

    return {
      account,
      bankAccountId: bankResponse.bankAccountId,
      accountNumber: bankResponse.accountNumber,
    };
  }

  /**
   * Gets an escrow account by ID.
   *
   * @param accountId - Account ID
   * @returns Account or null
   */
  async getAccount(accountId: string): Promise<EscrowAccount | null> {
    return this.escrowAccountRepository.findById(accountId);
  }

  /**
   * Gets an escrow account by contract ID.
   *
   * @param contractId - Contract ID
   * @returns Account or null
   */
  async getAccountByContract(contractId: string): Promise<EscrowAccount | null> {
    return this.escrowAccountRepository.findByContractId(contractId);
  }

  /**
   * Searches escrow accounts.
   *
   * @param criteria - Search criteria
   * @param pagination - Pagination options
   * @returns Paginated results
   */
  async searchAccounts(
    criteria: EscrowAccountSearchCriteria,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<EscrowAccount>> {
    return this.escrowAccountRepository.findByCriteria(criteria, pagination);
  }

  // ============================================
  // Balance Operations
  // ============================================

  /**
   * Credits funds to an escrow account.
   * Called after QRIS payment confirmation.
   *
   * @param request - Credit request
   * @returns Updated account
   */
  async creditFunds(request: CreditEscrowRequest): Promise<EscrowAccount> {
    this.logger.log(`Crediting ${request.amount} to escrow ${request.escrowAccountId}`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Lock account row
      const account = await this.escrowAccountRepository.findForUpdate(
        request.escrowAccountId,
        client,
      );

      if (!account) {
        throw new Error(`Escrow account not found: ${request.escrowAccountId}`);
      }

      // Credit funds
      account.credit(
        request.amount,
        request.reference,
        request.description,
        request.bankReference,
        request.performedBy,
      );

      // Save
      await this.escrowAccountRepository.save(account, client);

      await client.query('COMMIT');

      // Emit event
      this.emitEvent('credited', account.id, account.contractId, {
        amount: request.amount,
        reference: request.reference,
        bankReference: request.bankReference,
        newBalance: account.balance,
        performedBy: request.performedBy,
      });

      this.logger.log(`Credited ${request.amount} to escrow ${account.id}, new balance: ${account.balance}`);

      return account;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Debits funds from an escrow account.
   * Called after successful bank transfer.
   *
   * @param request - Debit request
   * @returns Updated account
   */
  async debitFunds(request: DebitEscrowRequest): Promise<EscrowAccount> {
    this.logger.log(`Debiting ${request.amount} from escrow ${request.escrowAccountId}`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Lock account row
      const account = await this.escrowAccountRepository.findForUpdate(
        request.escrowAccountId,
        client,
      );

      if (!account) {
        throw new Error(`Escrow account not found: ${request.escrowAccountId}`);
      }

      // Debit funds
      account.debit(
        request.amount,
        request.reference,
        request.description,
        request.bankReference,
        request.performedBy,
      );

      // Save
      await this.escrowAccountRepository.save(account, client);

      await client.query('COMMIT');

      // Emit event
      this.emitEvent('debited', account.id, account.contractId, {
        amount: request.amount,
        reference: request.reference,
        bankReference: request.bankReference,
        newBalance: account.balance,
        performedBy: request.performedBy,
      });

      this.logger.log(`Debited ${request.amount} from escrow ${account.id}, new balance: ${account.balance}`);

      return account;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Freezes funds for pending settlement.
   *
   * @param request - Freeze request
   * @returns Updated account
   */
  async freezeFunds(request: FreezeRequest): Promise<EscrowAccount> {
    this.logger.log(`Freezing ${request.amount} in escrow ${request.escrowAccountId}`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Lock account row
      const account = await this.escrowAccountRepository.findForUpdate(
        request.escrowAccountId,
        client,
      );

      if (!account) {
        throw new Error(`Escrow account not found: ${request.escrowAccountId}`);
      }

      // Also freeze on bank side
      const bankResult = await this.bankAdapter.freezeFunds({
        escrowAccountId: account.bankAccountId,
        amount: request.amount,
        referenceId: request.reference,
      });

      if (!bankResult.success) {
        throw new Error(`Bank freeze failed: ${bankResult.error}`);
      }

      // Freeze in domain
      account.freezeFunds(request.amount, request.reference, request.performedBy);

      // Save
      await this.escrowAccountRepository.save(account, client);

      await client.query('COMMIT');

      // Emit event
      this.emitEvent('frozen', account.id, account.contractId, {
        amount: request.amount,
        reference: request.reference,
        frozenAmount: account.frozenAmount,
        availableBalance: account.availableBalance,
        performedBy: request.performedBy,
      });

      this.logger.log(`Frozen ${request.amount} in escrow ${account.id}`);

      return account;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Unfreezes funds (e.g., on settlement failure).
   *
   * @param request - Unfreeze request
   * @returns Updated account
   */
  async unfreezeFunds(request: UnfreezeRequest): Promise<EscrowAccount> {
    this.logger.log(`Unfreezing ${request.amount} in escrow ${request.escrowAccountId}`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Lock account row
      const account = await this.escrowAccountRepository.findForUpdate(
        request.escrowAccountId,
        client,
      );

      if (!account) {
        throw new Error(`Escrow account not found: ${request.escrowAccountId}`);
      }

      // Also unfreeze on bank side
      const bankResult = await this.bankAdapter.unfreezeFunds({
        escrowAccountId: account.bankAccountId,
        amount: request.amount,
        referenceId: request.reference,
      });

      if (!bankResult.success) {
        this.logger.warn(`Bank unfreeze failed: ${bankResult.error} - continuing with DB unfreeze`);
        // Don't throw - DB state should still be unfrozen
      }

      // Unfreeze in domain
      account.unfreezeFunds(request.amount, request.reference, request.performedBy);

      // Save
      await this.escrowAccountRepository.save(account, client);

      await client.query('COMMIT');

      // Emit event
      this.emitEvent('unfrozen', account.id, account.contractId, {
        amount: request.amount,
        reference: request.reference,
        frozenAmount: account.frozenAmount,
        availableBalance: account.availableBalance,
        performedBy: request.performedBy,
      });

      this.logger.log(`Unfrozen ${request.amount} in escrow ${account.id}`);

      return account;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Closes an escrow account after settlement completion.
   *
   * @param accountId - Account ID
   * @param performedBy - User/system
   * @returns Updated account
   */
  async closeAccount(accountId: string, performedBy: string): Promise<EscrowAccount> {
    this.logger.log(`Closing escrow account ${accountId}`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Lock account row
      const account = await this.escrowAccountRepository.findForUpdate(accountId, client);

      if (!account) {
        throw new Error(`Escrow account not found: ${accountId}`);
      }

      // Close account
      account.close(performedBy);

      // Save
      await this.escrowAccountRepository.save(account, client);

      await client.query('COMMIT');

      // Emit event
      this.emitEvent('closed', account.id, account.contractId, {
        performedBy,
      });

      this.logger.log(`Escrow account ${accountId} closed`);

      return account;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // Verification & Reconciliation
  // ============================================

  /**
   * Verifies escrow account balance against bank.
   *
   * @param accountId - Account ID
   * @returns Verification result
   */
  async verifyBalance(accountId: string): Promise<BalanceVerificationResult> {
    this.logger.log(`Verifying balance for escrow ${accountId}`);

    const account = await this.escrowAccountRepository.findById(accountId);
    if (!account) {
      throw new Error(`Escrow account not found: ${accountId}`);
    }

    // Get balance from bank
    const bankBalance: BalanceResponse = await this.bankAdapter.getBalance(account.bankAccountId);

    if (!bankBalance.success) {
      throw new Error(`Failed to get bank balance: ${bankBalance.error}`);
    }

    const result: BalanceVerificationResult = {
      accountId,
      storedBalance: account.balance,
      bankBalance: bankBalance.balance,
      match: account.balance === bankBalance.balance,
      discrepancy: bankBalance.balance - account.balance,
      verifiedAt: new Date(),
    };

    // Emit event
    this.emitEvent('balance_verified', account.id, account.contractId, {
      storedBalance: result.storedBalance,
      bankBalance: result.bankBalance,
      match: result.match,
      discrepancy: result.discrepancy,
    });

    if (!result.match) {
      this.logger.warn(
        `Balance discrepancy for escrow ${accountId}: stored=${result.storedBalance}, bank=${result.bankBalance}, diff=${result.discrepancy}`
      );
    }

    return result;
  }

  /**
   * Gets accounts with frozen funds (for monitoring).
   *
   * @param limit - Maximum records
   * @returns Accounts with frozen funds
   */
  async getAccountsWithFrozenFunds(limit: number = 100): Promise<EscrowAccount[]> {
    return this.escrowAccountRepository.findWithFrozenFunds(limit);
  }

  /**
   * Gets total escrow balance across all accounts.
   *
   * @returns Total balance
   */
  async getTotalEscrowBalance(): Promise<number> {
    return this.escrowAccountRepository.getTotalEscrowBalance();
  }

  // ============================================
  // Internal Transaction Support
  // ============================================

  /**
   * Gets an account with row lock (for use within a transaction).
   *
   * @param accountId - Account ID
   * @param client - DB client
   * @returns Locked account
   */
  async getAccountForUpdate(accountId: string, client: PoolClient): Promise<EscrowAccount | null> {
    return this.escrowAccountRepository.findForUpdate(accountId, client);
  }

  /**
   * Saves an account within a transaction.
   *
   * @param account - Account to save
   * @param client - DB client
   */
  async saveAccount(account: EscrowAccount, client: PoolClient): Promise<void> {
    await this.escrowAccountRepository.save(account, client);
  }

  // ============================================
  // Event Emitter
  // ============================================

  private emitEvent(
    type: EscrowAccountEvent['type'],
    accountId: string,
    contractId: string,
    data: Record<string, unknown>,
  ): void {
    const event: EscrowAccountEvent = {
      type,
      accountId,
      contractId,
      data,
      timestamp: new Date(),
    };

    this.eventEmitter.emit(`escrow.${type}`, event);
  }
}
