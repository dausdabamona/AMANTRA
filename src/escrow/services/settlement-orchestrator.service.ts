/**
 * AMANTRA - Settlement Orchestrator Service
 *
 * Orchestrates the complete settlement flow:
 * 1. Validate on-chain status (must be VERIFIED)
 * 2. Create settlement intent
 * 3. Lock escrow funds
 * 4. Execute bank split transfer
 * 5. Wait for bank callback
 * 6. On success: call markSettled on blockchain
 * 7. On failure: unlock escrow
 *
 * CRITICAL: Blockchain state SETTLED is only reached AFTER bank confirms.
 *
 * @module escrow/services
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Pool, PoolClient } from 'pg';
import { InjectPool } from '../../infrastructure/database/database.module';
import {
  BANK_ESCROW_PORT,
  BankEscrowPort,
  SplitTransferRequest,
  BankCallbackPayload,
} from '../ports/bank-escrow.port';
import {
  SETTLEMENT_REPOSITORY,
  SettlementRepository,
  ESCROW_ACCOUNT_REPOSITORY,
  EscrowAccountRepository,
} from '../ports/settlement-repository.port';
import { Settlement } from '../domain/settlement.entity';
import { EscrowAccount } from '../domain/escrow-account.entity';
import { SplitPayment } from '../domain/split-payment.value';
import {
  SettlementStatus,
  BankTransferStatus,
  isTerminalStatus,
} from '../domain/settlement-status.enum';
import { LedgerSyncService } from '../blockchain/ledger-sync.service';

/**
 * Settlement initiation request
 */
export interface InitiateSettlementRequest {
  contractId: string;
  initiatedBy: string;
}

/**
 * Settlement result
 */
export interface SettlementResult {
  success: boolean;
  settlementId?: string;
  status: SettlementStatus;
  blockchainTxHash?: string;
  error?: string;
}

/**
 * Domain events
 */
export interface SettlementInitiatedEvent {
  type: 'SETTLEMENT_INITIATED';
  settlementId: string;
  contractId: string;
  totalAmount: number;
  timestamp: Date;
}

export interface SettlementCompletedEvent {
  type: 'SETTLEMENT_COMPLETED';
  settlementId: string;
  contractId: string;
  blockchainTxHash: string;
  totalSettled: number;
  platformFee: number;
  timestamp: Date;
}

export interface SettlementFailedEvent {
  type: 'SETTLEMENT_FAILED';
  settlementId: string;
  contractId: string;
  reason: string;
  status: SettlementStatus;
  timestamp: Date;
}

@Injectable()
export class SettlementOrchestratorService {
  private readonly logger = new Logger(SettlementOrchestratorService.name);

  constructor(
    @InjectPool() private readonly pool: Pool,
    @Inject(BANK_ESCROW_PORT) private readonly bankAdapter: BankEscrowPort,
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlementRepo: SettlementRepository,
    @Inject(ESCROW_ACCOUNT_REPOSITORY) private readonly escrowRepo: EscrowAccountRepository,
    private readonly ledgerSync: LedgerSyncService,
    private readonly eventEmitter: EventEmitter2
  ) {
    this.logger.log('Settlement Orchestrator initialized');
  }

  /**
   * Initiates a settlement for a verified contract.
   *
   * This is the main entry point for settlement.
   * Called when contract status transitions to VERIFIED.
   *
   * SACRED SEQUENCE:
   * 1. Validate on-chain status == VERIFIED
   * 2. Get payout info from blockchain
   * 3. Create settlement intent (DB)
   * 4. Lock escrow funds
   * 5. Execute bank split transfer
   * 6. Return immediately (bank callback will complete the flow)
   *
   * @param request - Settlement initiation request
   * @returns Settlement result with pending status
   */
  async initiateSettlement(request: InitiateSettlementRequest): Promise<SettlementResult> {
    this.logger.log(`Initiating settlement for contract ${request.contractId}`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Step 1: Validate on-chain status
      const onChainStatus = await this.ledgerSync.getContractStatus(request.contractId);
      if (onChainStatus !== 2) { // 2 = VERIFIED
        this.logger.warn(
          `Cannot settle contract ${request.contractId}: on-chain status is ${onChainStatus}, expected VERIFIED (2)`
        );
        await client.query('ROLLBACK');
        return {
          success: false,
          status: SettlementStatus.CANCELLED,
          error: `Invalid on-chain status: ${onChainStatus} (expected VERIFIED)`,
        };
      }

      // Check for existing settlement
      const existingSettlement = await this.settlementRepo.findByContractId(request.contractId);
      if (existingSettlement) {
        if (existingSettlement.isCompleted) {
          this.logger.warn(`Contract ${request.contractId} already settled`);
          await client.query('ROLLBACK');
          return {
            success: true,
            settlementId: existingSettlement.id,
            status: existingSettlement.status,
            blockchainTxHash: existingSettlement.blockchainTxHash,
          };
        }

        if (!isTerminalStatus(existingSettlement.status)) {
          this.logger.warn(`Settlement already in progress for contract ${request.contractId}`);
          await client.query('ROLLBACK');
          return {
            success: false,
            settlementId: existingSettlement.id,
            status: existingSettlement.status,
            error: 'Settlement already in progress',
          };
        }
      }

      // Step 2: Get payout info from blockchain
      const payoutInfo = await this.ledgerSync.getPayoutInfo(request.contractId);

      // Step 3: Get escrow account
      const escrowAccount = await this.escrowRepo.findByContractId(request.contractId);
      if (!escrowAccount) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: SettlementStatus.CANCELLED,
          error: `Escrow account not found for contract ${request.contractId}`,
        };
      }

      // Lock escrow account row
      const lockedEscrow = await this.escrowRepo.findForUpdate(escrowAccount.id, client);
      if (!lockedEscrow) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: SettlementStatus.CANCELLED,
          error: 'Failed to lock escrow account',
        };
      }

      // Validate balance
      if (lockedEscrow.availableBalance < Number(payoutInfo.totalAmount)) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: SettlementStatus.CANCELLED,
          error: `Insufficient escrow balance: ${lockedEscrow.availableBalance} < ${payoutInfo.totalAmount}`,
        };
      }

      // Get account information for transfers
      const accounts = await this.getTransferAccounts(request.contractId);

      // Create split payment value object
      const splitPayment = SplitPayment.fromPayoutInfo(
        request.contractId,
        payoutInfo,
        accounts
      );

      // Validate split payment
      const validation = splitPayment.validateAccounts();
      if (!validation.valid) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: SettlementStatus.CANCELLED,
          error: `Invalid account information: ${validation.errors.join(', ')}`,
        };
      }

      // Step 4: Create settlement entity
      const settlement = Settlement.create(
        request.contractId,
        escrowAccount.id,
        splitPayment,
        request.initiatedBy
      );

      // Step 5: Lock escrow funds
      lockedEscrow.freezeFunds(
        splitPayment.totalAmount,
        settlement.referenceId,
        request.initiatedBy
      );

      settlement.markEscrowLocked(request.initiatedBy);

      // Save both
      await this.escrowRepo.save(lockedEscrow, client);
      await this.settlementRepo.save(settlement, client);

      await client.query('COMMIT');

      // Emit event
      const initiatedEvent: SettlementInitiatedEvent = {
        type: 'SETTLEMENT_INITIATED',
        settlementId: settlement.id,
        contractId: request.contractId,
        totalAmount: splitPayment.totalAmount,
        timestamp: new Date(),
      };
      this.eventEmitter.emit('settlement.initiated', initiatedEvent);

      // Step 6: Execute bank transfer (async - don't wait for completion)
      this.executeBankTransfer(settlement.id).catch((error) => {
        this.logger.error(`Bank transfer failed for settlement ${settlement.id}: ${error}`);
      });

      this.logger.log(
        `Settlement ${settlement.id} initiated for contract ${request.contractId}, ` +
        `total: ${splitPayment.totalAmount}, legs: ${splitPayment.legCount}`
      );

      return {
        success: true,
        settlementId: settlement.id,
        status: SettlementStatus.ESCROW_LOCKED,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Settlement initiation failed: ${errorMsg}`);

      return {
        success: false,
        status: SettlementStatus.CANCELLED,
        error: errorMsg,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Executes the bank split transfer for a settlement.
   *
   * Called after escrow is locked. Updates settlement status.
   *
   * @param settlementId - Settlement ID
   */
  async executeBankTransfer(settlementId: string): Promise<void> {
    this.logger.log(`Executing bank transfer for settlement ${settlementId}`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const settlement = await this.settlementRepo.findForUpdate(settlementId, client);
      if (!settlement) {
        throw new Error(`Settlement not found: ${settlementId}`);
      }

      if (settlement.status !== SettlementStatus.ESCROW_LOCKED) {
        this.logger.warn(
          `Settlement ${settlementId} in unexpected status: ${settlement.status}`
        );
        await client.query('ROLLBACK');
        return;
      }

      // Build bank transfer request
      const transferRequest: SplitTransferRequest = {
        escrowAccountId: settlement.escrowAccountId,
        referenceId: settlement.referenceId,
        totalAmount: settlement.splitPayment.totalAmount,
        transfers: settlement.splitPayment.legs.map((leg) => ({
          toAccount: {
            accountNumber: leg.accountNumber,
            bankCode: leg.bankCode,
            accountName: leg.recipientName,
          },
          amount: leg.amount,
          description: leg.description,
          recipientType: leg.recipientType,
        })),
        metadata: {
          settlementId: settlement.id,
          contractId: settlement.contractId,
        },
      };

      // Execute transfer
      const ack = await this.bankAdapter.executeSplitTransfer(transferRequest);

      if (!ack.success) {
        settlement.markBankFailed('SYSTEM', ack.error || 'Bank rejected transfer');
        await this.settlementRepo.save(settlement, client);
        await client.query('COMMIT');

        // Unlock escrow
        await this.unlockEscrow(settlement.escrowAccountId, settlement.referenceId, 'SYSTEM');

        throw new Error(`Bank transfer rejected: ${ack.error}`);
      }

      // Mark as pending
      settlement.markBankPending('SYSTEM', ack.batchId);
      await this.settlementRepo.save(settlement, client);
      await client.query('COMMIT');

      this.logger.log(
        `Bank transfer initiated for settlement ${settlementId}, batch: ${ack.batchId}`
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handles bank callback for settlement completion.
   *
   * Called by webhook controller when bank sends callback.
   *
   * @param callback - Bank callback payload
   */
  async handleBankCallback(callback: BankCallbackPayload): Promise<void> {
    this.logger.log(
      `Processing bank callback for reference ${callback.referenceId}, status: ${callback.status}`
    );

    const settlement = await this.settlementRepo.findByReferenceId(callback.referenceId);
    if (!settlement) {
      this.logger.warn(`Settlement not found for reference: ${callback.referenceId}`);
      return;
    }

    if (settlement.status !== SettlementStatus.BANK_PENDING) {
      this.logger.warn(
        `Settlement ${settlement.id} not in BANK_PENDING status: ${settlement.status}`
      );
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const lockedSettlement = await this.settlementRepo.findForUpdate(settlement.id, client);
      if (!lockedSettlement) {
        throw new Error(`Failed to lock settlement ${settlement.id}`);
      }

      // Record transfer results
      if (callback.transferResults) {
        for (let i = 0; i < callback.transferResults.length; i++) {
          const result = callback.transferResults[i];
          lockedSettlement.recordBankTransferResult(
            {
              legIndex: i,
              recipientType: result.recipientType,
              status: result.status,
              bankReference: result.bankReference,
              bankTimestamp: result.bankTimestamp,
              errorCode: result.errorCode,
              errorMessage: result.errorMessage,
            },
            'BANK_CALLBACK'
          );
        }
      }

      if (callback.status === BankTransferStatus.SUCCESS) {
        // All transfers successful
        lockedSettlement.markBankSuccess('BANK_CALLBACK');
        await this.settlementRepo.save(lockedSettlement, client);
        await client.query('COMMIT');

        // Proceed to blockchain update
        await this.completeSettlementOnChain(lockedSettlement.id);
      } else if (
        callback.status === BankTransferStatus.FAILED ||
        callback.status === BankTransferStatus.REJECTED
      ) {
        // Transfer failed
        const errorMessage = callback.transferResults
          ?.filter((r) => r.errorMessage)
          .map((r) => `${r.recipientType}: ${r.errorMessage}`)
          .join('; ') || 'Unknown bank error';

        lockedSettlement.markBankFailed('BANK_CALLBACK', errorMessage);
        await this.settlementRepo.save(lockedSettlement, client);
        await client.query('COMMIT');

        // Unlock escrow
        await this.unlockEscrow(
          lockedSettlement.escrowAccountId,
          lockedSettlement.referenceId,
          'BANK_CALLBACK'
        );

        // Emit failure event
        const failedEvent: SettlementFailedEvent = {
          type: 'SETTLEMENT_FAILED',
          settlementId: lockedSettlement.id,
          contractId: lockedSettlement.contractId,
          reason: errorMessage,
          status: SettlementStatus.BANK_FAILED,
          timestamp: new Date(),
        };
        this.eventEmitter.emit('settlement.failed', failedEvent);
      } else {
        // Still processing
        await this.settlementRepo.save(lockedSettlement, client);
        await client.query('COMMIT');
      }

      this.logger.log(
        `Bank callback processed for settlement ${settlement.id}: ${callback.status}`
      );
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Failed to process bank callback: ${error}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Completes settlement by calling markSettled on blockchain.
   *
   * ONLY called after bank transfer success.
   *
   * @param settlementId - Settlement ID
   */
  async completeSettlementOnChain(settlementId: string): Promise<void> {
    this.logger.log(`Completing settlement ${settlementId} on blockchain`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const settlement = await this.settlementRepo.findForUpdate(settlementId, client);
      if (!settlement) {
        throw new Error(`Settlement not found: ${settlementId}`);
      }

      if (settlement.status !== SettlementStatus.BANK_SUCCESS) {
        this.logger.warn(
          `Settlement ${settlementId} not in BANK_SUCCESS status: ${settlement.status}`
        );
        await client.query('ROLLBACK');
        return;
      }

      // Generate settlement reference hash for blockchain
      const settlementRefHash = settlement.generateSettlementRefHash();

      // Call blockchain
      try {
        const txResult = await this.ledgerSync.markSettled(
          settlement.contractId,
          settlementRefHash,
          settlement.referenceId
        );

        settlement.markBlockchainPending('SYSTEM', txResult.txHash);
        await this.settlementRepo.save(settlement, client);

        // Wait for confirmation
        const receipt = await txResult.waitForConfirmation();

        if (receipt.success) {
          settlement.markCompleted(
            'SYSTEM',
            receipt.blockNumber,
            receipt.blockTimestamp
          );
          await this.settlementRepo.save(settlement, client);

          // Debit the escrow account
          const escrowAccount = await this.escrowRepo.findForUpdate(
            settlement.escrowAccountId,
            client
          );

          if (escrowAccount) {
            escrowAccount.debit(
              settlement.splitPayment.totalAmount,
              settlement.referenceId,
              `Settlement for contract ${settlement.contractId}`,
              txResult.txHash,
              'SYSTEM'
            );
            await this.escrowRepo.save(escrowAccount, client);
          }

          await client.query('COMMIT');

          // Emit completion event
          const completedEvent: SettlementCompletedEvent = {
            type: 'SETTLEMENT_COMPLETED',
            settlementId: settlement.id,
            contractId: settlement.contractId,
            blockchainTxHash: txResult.txHash,
            totalSettled: settlement.splitPayment.totalAmount,
            platformFee: settlement.splitPayment.platformFee,
            timestamp: new Date(),
          };
          this.eventEmitter.emit('settlement.completed', completedEvent);

          this.logger.log(
            `Settlement ${settlementId} completed, tx: ${txResult.txHash}`
          );
        } else {
          settlement.markBlockchainFailed('SYSTEM', receipt.error || 'Transaction failed');
          await this.settlementRepo.save(settlement, client);
          await client.query('COMMIT');

          this.logger.error(
            `Blockchain transaction failed for settlement ${settlementId}: ${receipt.error}`
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        settlement.markBlockchainFailed('SYSTEM', errorMsg);
        await this.settlementRepo.save(settlement, client);
        await client.query('COMMIT');

        this.logger.error(
          `Blockchain call failed for settlement ${settlementId}: ${errorMsg}`
        );
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retries a failed settlement.
   *
   * @param settlementId - Settlement ID
   * @param performedBy - User/system performing retry
   */
  async retrySettlement(settlementId: string, performedBy: string): Promise<SettlementResult> {
    this.logger.log(`Retrying settlement ${settlementId}`);

    const settlement = await this.settlementRepo.findById(settlementId);
    if (!settlement) {
      return {
        success: false,
        status: SettlementStatus.CANCELLED,
        error: `Settlement not found: ${settlementId}`,
      };
    }

    if (!settlement.canRetry) {
      return {
        success: false,
        settlementId,
        status: settlement.status,
        error: `Settlement cannot be retried in status ${settlement.status}`,
      };
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const lockedSettlement = await this.settlementRepo.findForUpdate(settlementId, client);
      if (!lockedSettlement) {
        throw new Error(`Failed to lock settlement ${settlementId}`);
      }

      lockedSettlement.prepareForRetry(performedBy);
      await this.settlementRepo.save(lockedSettlement, client);
      await client.query('COMMIT');

      // Re-execute based on where it failed
      if (
        settlement.status === SettlementStatus.BANK_FAILED
      ) {
        await this.executeBankTransfer(settlementId);
      } else if (settlement.status === SettlementStatus.BLOCKCHAIN_FAILED) {
        await this.completeSettlementOnChain(settlementId);
      }

      return {
        success: true,
        settlementId,
        status: lockedSettlement.status,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        settlementId,
        status: settlement.status,
        error: errorMsg,
      };
    } finally {
      client.release();
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Gets transfer account information for a contract
   */
  private async getTransferAccounts(contractId: string): Promise<{
    seller: { accountNumber: string; bankCode: string; accountName: string };
    platform: { accountNumber: string; bankCode: string; accountName: string };
    mediator?: { accountNumber: string; bankCode: string; accountName: string };
  }> {
    // In production, this would query the database for account information
    // based on the contract parties

    const result = await this.pool.query(
      `SELECT
        c.seller_id, c.buyer_id, c.mediator_id,
        s.bank_account_number as seller_account, s.bank_code as seller_bank, s.full_name as seller_name,
        m.bank_account_number as mediator_account, m.bank_code as mediator_bank, m.full_name as mediator_name
      FROM contracts c
      JOIN users s ON c.seller_id = s.id
      LEFT JOIN users m ON c.mediator_id = m.id
      WHERE c.id = $1`,
      [contractId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Contract not found: ${contractId}`);
    }

    const row = result.rows[0];

    // Platform account from config
    const platformAccount = {
      accountNumber: process.env.PLATFORM_ACCOUNT_NUMBER || '',
      bankCode: process.env.PLATFORM_BANK_CODE || 'BSI',
      accountName: process.env.PLATFORM_ACCOUNT_NAME || 'AMANTRA Revenue',
    };

    return {
      seller: {
        accountNumber: row.seller_account,
        bankCode: row.seller_bank,
        accountName: row.seller_name,
      },
      platform: platformAccount,
      mediator: row.mediator_account
        ? {
            accountNumber: row.mediator_account,
            bankCode: row.mediator_bank,
            accountName: row.mediator_name,
          }
        : undefined,
    };
  }

  /**
   * Unlocks escrow funds after failed settlement
   */
  private async unlockEscrow(
    escrowAccountId: string,
    referenceId: string,
    performedBy: string
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const escrowAccount = await this.escrowRepo.findForUpdate(escrowAccountId, client);
      if (!escrowAccount) {
        throw new Error(`Escrow account not found: ${escrowAccountId}`);
      }

      // Get freeze record for this reference
      // Note: In production, we'd track freeze IDs
      const freezeAmount = escrowAccount.frozenAmount;
      if (freezeAmount > 0) {
        // Unfreeze via bank adapter
        await this.bankAdapter.unfreezeFunds({
          escrowAccountId,
          freezeId: referenceId, // Using referenceId as freezeId
          referenceId: `UNFREEZE-${referenceId}`,
          reason: 'Settlement failed',
        });

        // Update local record
        escrowAccount.unfreezeFunds(freezeAmount, referenceId, performedBy);
        await this.escrowRepo.save(escrowAccount, client);
      }

      await client.query('COMMIT');
      this.logger.log(`Unlocked escrow for reference ${referenceId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Failed to unlock escrow: ${error}`);
      // Don't throw - this is cleanup
    } finally {
      client.release();
    }
  }
}
