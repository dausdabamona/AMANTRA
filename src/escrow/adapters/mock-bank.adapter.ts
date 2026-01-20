/**
 * AMANTRA - Mock Bank Adapter
 *
 * Sandbox adapter for testing and development.
 * Simulates bank behavior including:
 * - Escrow account management
 * - Split transfers with configurable delays
 * - Callbacks
 * - Error scenarios
 *
 * @module escrow/adapters
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  BankEscrowPort,
  CreateEscrowAccountRequest,
  CreateEscrowAccountResponse,
  FreezeFundsRequest,
  FreezeFundsResponse,
  UnfreezeFundsRequest,
  UnfreezeFundsResponse,
  SplitTransferRequest,
  SplitTransferAck,
  SplitTransferStatus,
  BalanceResponse,
  TransactionHistoryRequest,
  TransactionHistoryResponse,
  BankTransaction,
  BankCallbackPayload,
  TransferResult,
} from '../ports/bank-escrow.port';
import { BankTransferStatus } from '../domain/settlement-status.enum';

/**
 * Mock account data
 */
interface MockAccount {
  id: string;
  accountNumber: string;
  balance: number;
  frozenAmount: number;
  freezeRecords: Map<string, { amount: number; referenceId: string }>;
  transactions: BankTransaction[];
  createdAt: Date;
}

/**
 * Mock transfer batch
 */
interface MockTransferBatch {
  batchId: string;
  referenceId: string;
  status: BankTransferStatus;
  transfers: TransferResult[];
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Mock bank configuration
 */
export interface MockBankConfig {
  /**
   * Simulated processing delay in ms
   */
  processingDelayMs: number;

  /**
   * Failure rate (0-1)
   */
  failureRate: number;

  /**
   * Whether to auto-complete transfers (vs waiting for manual trigger)
   */
  autoComplete: boolean;

  /**
   * Delay before auto-completion in ms
   */
  autoCompleteDelayMs: number;

  /**
   * Secret for callback signatures
   */
  callbackSecret: string;
}

const DEFAULT_CONFIG: MockBankConfig = {
  processingDelayMs: 100,
  failureRate: 0,
  autoComplete: true,
  autoCompleteDelayMs: 2000,
  callbackSecret: 'mock-bank-secret-key-for-testing',
};

@Injectable()
export class MockBankAdapter implements BankEscrowPort {
  private readonly logger = new Logger(MockBankAdapter.name);
  private readonly accounts: Map<string, MockAccount> = new Map();
  private readonly transfers: Map<string, MockTransferBatch> = new Map();
  private readonly config: MockBankConfig;
  private readonly latencyRecords: number[] = [];

  readonly bankCode = 'MOCK';
  readonly bankName = 'Mock Bank (Sandbox)';
  readonly supportsAtomicSplit = true;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    config?: Partial<MockBankConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger.log('Mock Bank Adapter initialized');
  }

  // ============================================
  // Escrow Account Management
  // ============================================

  async createEscrowAccount(
    request: CreateEscrowAccountRequest
  ): Promise<CreateEscrowAccountResponse> {
    await this.simulateDelay();

    const accountNumber = `MOCK${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const id = uuidv4();

    const account: MockAccount = {
      id,
      accountNumber,
      balance: request.initialDeposit || 0,
      frozenAmount: 0,
      freezeRecords: new Map(),
      transactions: [],
      createdAt: new Date(),
    };

    if (request.initialDeposit && request.initialDeposit > 0) {
      account.transactions.push({
        transactionId: uuidv4(),
        type: 'CREDIT',
        amount: request.initialDeposit,
        balanceAfter: request.initialDeposit,
        referenceNumber: `INIT-${request.contractId}`,
        description: 'Initial deposit',
        timestamp: new Date(),
      });
    }

    this.accounts.set(id, account);

    this.logger.log(`Created mock escrow account ${accountNumber} for contract ${request.contractId}`);

    return {
      success: true,
      escrowAccountId: id,
      accountNumber,
      bankCode: this.bankCode,
      virtualAccountNumber: `VA${accountNumber}`,
      createdAt: account.createdAt,
    };
  }

  async getBalance(escrowAccountId: string): Promise<BalanceResponse> {
    await this.simulateDelay();

    const account = this.getAccount(escrowAccountId);

    return {
      accountNumber: account.accountNumber,
      availableBalance: account.balance - account.frozenAmount,
      currentBalance: account.balance,
      frozenBalance: account.frozenAmount,
      currency: 'IDR',
      asOf: new Date(),
    };
  }

  async getTransactionHistory(
    request: TransactionHistoryRequest
  ): Promise<TransactionHistoryResponse> {
    await this.simulateDelay();

    const account = this.getAccount(request.escrowAccountId);

    const filtered = account.transactions.filter(
      (t) => t.timestamp >= request.startDate && t.timestamp <= request.endDate
    );

    const offset = request.offset || 0;
    const limit = request.limit || 50;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      transactions: paginated,
      totalCount: filtered.length,
      hasMore: offset + limit < filtered.length,
    };
  }

  // ============================================
  // Fund Management
  // ============================================

  async freezeFunds(request: FreezeFundsRequest): Promise<FreezeFundsResponse> {
    await this.simulateDelay();

    const account = this.getAccount(request.escrowAccountId);

    const availableBalance = account.balance - account.frozenAmount;
    if (request.amount > availableBalance) {
      return {
        success: false,
        freezeId: '',
        frozenAmount: 0,
        bankReference: '',
        timestamp: new Date(),
        error: `Insufficient available balance: ${availableBalance}`,
      };
    }

    const freezeId = `FREEZE-${uuidv4().slice(0, 8)}`;
    account.frozenAmount += request.amount;
    account.freezeRecords.set(freezeId, {
      amount: request.amount,
      referenceId: request.referenceId,
    });

    this.logger.log(
      `Frozen ${request.amount} in account ${account.accountNumber}, freezeId: ${freezeId}`
    );

    return {
      success: true,
      freezeId,
      frozenAmount: request.amount,
      bankReference: `BANKREF-${freezeId}`,
      timestamp: new Date(),
    };
  }

  async unfreezeFunds(request: UnfreezeFundsRequest): Promise<UnfreezeFundsResponse> {
    await this.simulateDelay();

    const account = this.getAccount(request.escrowAccountId);

    const freezeRecord = account.freezeRecords.get(request.freezeId);
    if (!freezeRecord) {
      return {
        success: false,
        unfrozenAmount: 0,
        bankReference: '',
        timestamp: new Date(),
        error: `Freeze record not found: ${request.freezeId}`,
      };
    }

    account.frozenAmount -= freezeRecord.amount;
    account.freezeRecords.delete(request.freezeId);

    this.logger.log(
      `Unfrozen ${freezeRecord.amount} in account ${account.accountNumber}`
    );

    return {
      success: true,
      unfrozenAmount: freezeRecord.amount,
      bankReference: `UNFREEZE-${request.freezeId}`,
      timestamp: new Date(),
    };
  }

  // ============================================
  // Settlement Transfers
  // ============================================

  async executeSplitTransfer(request: SplitTransferRequest): Promise<SplitTransferAck> {
    await this.simulateDelay();

    // Check for duplicate
    const existing = this.findTransferByReferenceId(request.referenceId);
    if (existing) {
      this.logger.warn(`Duplicate transfer request: ${request.referenceId}`);
      return {
        success: true,
        batchId: existing.batchId,
        referenceId: request.referenceId,
        status: 'ACCEPTED',
        estimatedCompletionTime: existing.completedAt,
      };
    }

    const account = this.getAccount(request.escrowAccountId);

    // Validate balance
    if (request.totalAmount > account.balance) {
      return {
        success: false,
        batchId: '',
        referenceId: request.referenceId,
        status: 'REJECTED',
        error: `Insufficient balance: ${account.balance}`,
      };
    }

    // Create batch
    const batchId = `BATCH-${uuidv4().slice(0, 8)}`;
    const batch: MockTransferBatch = {
      batchId,
      referenceId: request.referenceId,
      status: BankTransferStatus.PENDING,
      transfers: request.transfers.map((t, index) => ({
        recipientType: t.recipientType,
        toAccountNumber: t.toAccount.accountNumber,
        amount: t.amount,
        status: BankTransferStatus.PENDING,
      })),
      createdAt: new Date(),
    };

    this.transfers.set(batchId, batch);

    this.logger.log(
      `Created transfer batch ${batchId} for ${request.transfers.length} legs, total: ${request.totalAmount}`
    );

    // Auto-complete if configured
    if (this.config.autoComplete) {
      this.scheduleAutoComplete(batchId, request, account);
    }

    return {
      success: true,
      batchId,
      referenceId: request.referenceId,
      status: 'ACCEPTED',
      estimatedCompletionTime: new Date(Date.now() + this.config.autoCompleteDelayMs),
    };
  }

  async queryTransferStatus(referenceId: string): Promise<SplitTransferStatus> {
    await this.simulateDelay();

    const batch = this.findTransferByReferenceId(referenceId);

    if (!batch) {
      throw new Error(`Transfer not found: ${referenceId}`);
    }

    const successCount = batch.transfers.filter(
      (t) => t.status === BankTransferStatus.SUCCESS
    ).length;

    const totalTransferred = batch.transfers
      .filter((t) => t.status === BankTransferStatus.SUCCESS)
      .reduce((sum, t) => sum + t.amount, 0);

    const failedCount = batch.transfers.filter(
      (t) => t.status === BankTransferStatus.FAILED
    ).length;

    return {
      batchId: batch.batchId,
      referenceId: batch.referenceId,
      overallStatus: batch.status,
      transferResults: batch.transfers,
      totalTransferred,
      totalFailed: failedCount,
      completedAt: batch.completedAt,
    };
  }

  // ============================================
  // Callback Handling
  // ============================================

  verifyCallbackSignature(payload: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', this.config.callbackSecret)
      .update(payload, 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  parseCallback(rawPayload: string, signature: string): BankCallbackPayload {
    if (!this.verifyCallbackSignature(rawPayload, signature)) {
      throw new Error('Invalid callback signature');
    }

    const data = JSON.parse(rawPayload);

    return {
      callbackType: data.callbackType,
      batchId: data.batchId,
      referenceId: data.referenceId,
      status: data.status,
      transferResults: data.transferResults,
      amount: data.amount,
      bankReference: data.bankReference,
      timestamp: new Date(data.timestamp),
      signature,
      rawPayload,
    };
  }

  // ============================================
  // Health & Diagnostics
  // ============================================

  async healthCheck(): Promise<boolean> {
    await this.simulateDelay();
    return true;
  }

  getLatencyStats(): {
    averageMs: number;
    p95Ms: number;
    p99Ms: number;
    sampleCount: number;
  } {
    if (this.latencyRecords.length === 0) {
      return { averageMs: 0, p95Ms: 0, p99Ms: 0, sampleCount: 0 };
    }

    const sorted = [...this.latencyRecords].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      averageMs: sum / sorted.length,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99Ms: sorted[Math.floor(sorted.length * 0.99)] || 0,
      sampleCount: sorted.length,
    };
  }

  // ============================================
  // Test Helpers
  // ============================================

  /**
   * Deposits funds into a mock account (for testing)
   */
  async depositFunds(escrowAccountId: string, amount: number, reference: string): Promise<void> {
    const account = this.getAccount(escrowAccountId);

    account.balance += amount;
    account.transactions.push({
      transactionId: uuidv4(),
      type: 'CREDIT',
      amount,
      balanceAfter: account.balance,
      referenceNumber: reference,
      description: `Test deposit: ${reference}`,
      timestamp: new Date(),
    });

    this.logger.log(`Deposited ${amount} to account ${account.accountNumber}`);
  }

  /**
   * Manually completes a pending transfer (for testing)
   */
  async manuallyCompleteTransfer(
    batchId: string,
    success: boolean = true
  ): Promise<void> {
    const batch = this.transfers.get(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    const status = success ? BankTransferStatus.SUCCESS : BankTransferStatus.FAILED;

    batch.status = status;
    batch.completedAt = new Date();

    for (const transfer of batch.transfers) {
      transfer.status = status;
      transfer.bankReference = `REF-${uuidv4().slice(0, 8)}`;
      transfer.bankTimestamp = new Date();

      if (!success) {
        transfer.errorCode = 'MOCK_FAILURE';
        transfer.errorMessage = 'Simulated transfer failure';
      }
    }

    // Emit callback event
    this.emitCallback(batch);
  }

  /**
   * Resets all mock data (for testing)
   */
  reset(): void {
    this.accounts.clear();
    this.transfers.clear();
    this.latencyRecords.length = 0;
    this.logger.log('Mock bank adapter reset');
  }

  // ============================================
  // Private Methods
  // ============================================

  private getAccount(escrowAccountId: string): MockAccount {
    const account = this.accounts.get(escrowAccountId);
    if (!account) {
      throw new Error(`Account not found: ${escrowAccountId}`);
    }
    return account;
  }

  private findTransferByReferenceId(referenceId: string): MockTransferBatch | undefined {
    for (const batch of this.transfers.values()) {
      if (batch.referenceId === referenceId) {
        return batch;
      }
    }
    return undefined;
  }

  private async simulateDelay(): Promise<void> {
    const start = Date.now();
    await new Promise((resolve) =>
      setTimeout(resolve, this.config.processingDelayMs)
    );
    this.latencyRecords.push(Date.now() - start);

    // Keep only last 1000 records
    if (this.latencyRecords.length > 1000) {
      this.latencyRecords.shift();
    }
  }

  private scheduleAutoComplete(
    batchId: string,
    request: SplitTransferRequest,
    account: MockAccount
  ): void {
    setTimeout(async () => {
      const batch = this.transfers.get(batchId);
      if (!batch || batch.status !== BankTransferStatus.PENDING) {
        return;
      }

      // Determine success based on failure rate
      const shouldFail = Math.random() < this.config.failureRate;
      const status = shouldFail ? BankTransferStatus.FAILED : BankTransferStatus.SUCCESS;

      batch.status = status;
      batch.completedAt = new Date();

      // Update each transfer leg
      for (let i = 0; i < batch.transfers.length; i++) {
        batch.transfers[i].status = status;
        batch.transfers[i].bankReference = `BANKREF-${uuidv4().slice(0, 8)}`;
        batch.transfers[i].bankTimestamp = new Date();

        if (shouldFail) {
          batch.transfers[i].errorCode = 'MOCK_RANDOM_FAILURE';
          batch.transfers[i].errorMessage = 'Simulated random failure';
        }
      }

      // If successful, debit the account
      if (!shouldFail) {
        account.balance -= request.totalAmount;
        account.frozenAmount = Math.max(0, account.frozenAmount - request.totalAmount);

        for (const transfer of request.transfers) {
          account.transactions.push({
            transactionId: uuidv4(),
            type: 'DEBIT',
            amount: transfer.amount,
            balanceAfter: account.balance,
            referenceNumber: request.referenceId,
            description: `Settlement to ${transfer.recipientType}`,
            counterpartyAccount: transfer.toAccount.accountNumber,
            counterpartyName: transfer.toAccount.accountName,
            timestamp: new Date(),
          });
        }
      }

      this.logger.log(
        `Auto-completed batch ${batchId}: ${status} (${shouldFail ? 'simulated failure' : 'success'})`
      );

      // Emit callback
      this.emitCallback(batch);
    }, this.config.autoCompleteDelayMs);
  }

  private emitCallback(batch: MockTransferBatch): void {
    const callbackPayload = {
      callbackType: 'TRANSFER_STATUS',
      batchId: batch.batchId,
      referenceId: batch.referenceId,
      status: batch.status,
      transferResults: batch.transfers,
      bankReference: `BATCH-${batch.batchId}`,
      timestamp: new Date().toISOString(),
    };

    const rawPayload = JSON.stringify(callbackPayload);
    const signature = crypto
      .createHmac('sha256', this.config.callbackSecret)
      .update(rawPayload, 'utf8')
      .digest('hex');

    this.eventEmitter.emit('bank.callback', {
      ...callbackPayload,
      signature,
      rawPayload,
    });

    this.logger.log(`Emitted callback for batch ${batch.batchId}`);
  }
}
