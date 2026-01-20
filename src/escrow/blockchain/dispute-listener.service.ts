/**
 * AMANTRA - Dispute Listener Service
 *
 * Blockchain event listener for DisputeOpened events.
 * Automatically freezes escrow and halts settlements when disputes are detected.
 *
 * CRITICAL SAFETY FIX: Ensures money is locked when disputes occur.
 * SOP: "When there is a dispute, money must be locked in a vault until justice is resolved."
 *
 * @module escrow/blockchain
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Pool, PoolClient } from 'pg';
import { ethers, Contract, JsonRpcProvider, WebSocketProvider } from 'ethers';

// Domain imports
import {
  SettlementStatus,
  canBeFrozenByDispute,
  isBankTransferInProgress,
} from '../domain/settlement-status.enum';
import { Settlement } from '../domain/settlement.entity';
import { EscrowAccount } from '../domain/escrow-account.entity';

// Port imports
import {
  SETTLEMENT_REPOSITORY,
  SettlementRepository,
  ESCROW_ACCOUNT_REPOSITORY,
  EscrowAccountRepository,
} from '../ports/settlement-repository.port';
import { BankEscrowPort, BANK_ESCROW_PORT } from '../ports/bank-escrow.port';

// Event types
import {
  SettlementFrozenByDisputeEvent,
  EscrowFrozenDueToDisputeEvent,
} from '../services/settlement-orchestrator.service';

// ============================================
// ABI for DisputeOpened Event
// ============================================

const DISPUTE_EVENT_ABI = [
  'event DisputeOpened(bytes32 indexed contractId, bytes32 indexed reasonHash, address raisedBy, uint64 timestamp)',
  'event DisputeResolved(bytes32 indexed contractId, uint8 resolution, bytes32 resolutionHash, address resolvedBy, uint64 timestamp)',
];

// ============================================
// Types
// ============================================

export interface DisputeOpenedEvent {
  contractId: string;
  reasonHash: string;
  raisedBy: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
}

export interface DisputeResolvedEvent {
  contractId: string;
  resolution: number; // 0 = CANCEL, 1 = REFUND_BUYER, 2 = PAY_SELLER, 3 = CUSTOM_SPLIT
  resolutionHash: string;
  resolvedBy: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
}

export interface DisputeListenerConfig {
  enabled: boolean;
  pollingIntervalMs: number;
  maxBlocksPerPoll: number;
  confirmationsRequired: number;
  retryDelayMs: number;
  maxRetries: number;
}

export interface ProcessedDisputeResult {
  success: boolean;
  contractId: string;
  escrowFrozen: boolean;
  settlementsFrozen: number;
  error?: string;
}

// ============================================
// Service Implementation
// ============================================

@Injectable()
export class DisputeListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DisputeListenerService.name);

  private provider: JsonRpcProvider | WebSocketProvider | null = null;
  private contract: Contract | null = null;
  private contractAddress: string | null = null;
  private isListening = false;
  private lastProcessedBlock = 0;
  private pollingInterval: NodeJS.Timeout | null = null;

  // Track processed disputes to ensure idempotency
  private processedDisputes = new Set<string>();

  private readonly config: DisputeListenerConfig = {
    enabled: true,
    pollingIntervalMs: 15000, // 15 seconds
    maxBlocksPerPoll: 100,
    confirmationsRequired: 1,
    retryDelayMs: 5000,
    maxRetries: 3,
  };

  constructor(
    private readonly configService: ConfigService,
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlementRepo: SettlementRepository,
    @Inject(ESCROW_ACCOUNT_REPOSITORY) private readonly escrowRepo: EscrowAccountRepository,
    @Inject(BANK_ESCROW_PORT) private readonly bankAdapter: BankEscrowPort,
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.configService.get<boolean>('DISPUTE_LISTENER_ENABLED', true);
    if (!enabled) {
      this.logger.warn('Dispute listener is disabled');
      return;
    }

    await this.initializeListener();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopListening();
  }

  // ============================================
  // Initialization
  // ============================================

  /**
   * Initializes the blockchain event listener.
   */
  private async initializeListener(): Promise<void> {
    const rpcUrl = this.configService.get<string>('BLOCKCHAIN_RPC_URL');
    const wsUrl = this.configService.get<string>('BLOCKCHAIN_WS_URL');
    this.contractAddress = this.configService.get<string>('AMANTRA_LEDGER_ADDRESS') || null;

    if (!this.contractAddress) {
      this.logger.warn('AMANTRA_LEDGER_ADDRESS not configured - dispute listener disabled');
      return;
    }

    try {
      // Prefer WebSocket for real-time events, fall back to polling
      if (wsUrl) {
        this.provider = new WebSocketProvider(wsUrl);
        this.logger.log(`Connected to blockchain via WebSocket: ${wsUrl}`);
      } else if (rpcUrl) {
        this.provider = new JsonRpcProvider(rpcUrl);
        this.logger.log(`Connected to blockchain via HTTP (polling mode): ${rpcUrl}`);
      } else {
        this.logger.warn('No blockchain URL configured - dispute listener disabled');
        return;
      }

      // Create contract instance for event listening
      this.contract = new Contract(this.contractAddress, DISPUTE_EVENT_ABI, this.provider);

      // Get current block for starting point
      this.lastProcessedBlock = await this.provider.getBlockNumber();
      this.logger.log(`Starting dispute listener from block ${this.lastProcessedBlock}`);

      // Start listening
      await this.startListening();
    } catch (error) {
      this.logger.error(`Failed to initialize dispute listener: ${error}`);
    }
  }

  /**
   * Starts listening for dispute events.
   */
  private async startListening(): Promise<void> {
    if (!this.contract || !this.provider) {
      return;
    }

    this.isListening = true;

    // If WebSocket, use event subscription
    if (this.provider instanceof WebSocketProvider) {
      this.contract.on('DisputeOpened', this.handleDisputeOpenedEvent.bind(this));
      this.contract.on('DisputeResolved', this.handleDisputeResolvedEvent.bind(this));
      this.logger.log('Subscribed to DisputeOpened and DisputeResolved events');
    } else {
      // HTTP provider - use polling
      this.startPolling();
    }
  }

  /**
   * Starts polling for events (HTTP provider fallback).
   */
  private startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      await this.pollForEvents();
    }, this.config.pollingIntervalMs);

    this.logger.log(`Started polling for dispute events every ${this.config.pollingIntervalMs}ms`);
  }

  /**
   * Polls for new dispute events.
   */
  private async pollForEvents(): Promise<void> {
    if (!this.contract || !this.provider || !this.isListening) {
      return;
    }

    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = this.lastProcessedBlock + 1;
      const toBlock = Math.min(currentBlock, fromBlock + this.config.maxBlocksPerPoll);

      if (fromBlock > toBlock) {
        return; // No new blocks
      }

      // Query DisputeOpened events
      const disputeFilter = this.contract.filters.DisputeOpened();
      const disputeEvents = await this.contract.queryFilter(disputeFilter, fromBlock, toBlock);

      for (const event of disputeEvents) {
        await this.processDisputeOpenedLog(event);
      }

      // Query DisputeResolved events
      const resolvedFilter = this.contract.filters.DisputeResolved();
      const resolvedEvents = await this.contract.queryFilter(resolvedFilter, fromBlock, toBlock);

      for (const event of resolvedEvents) {
        await this.processDisputeResolvedLog(event);
      }

      this.lastProcessedBlock = toBlock;
    } catch (error) {
      this.logger.error(`Error polling for events: ${error}`);
    }
  }

  /**
   * Stops listening for events.
   */
  async stopListening(): Promise<void> {
    this.isListening = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.contract) {
      this.contract.removeAllListeners();
    }

    this.logger.log('Dispute listener stopped');
  }

  // ============================================
  // Event Handlers
  // ============================================

  /**
   * Handles DisputeOpened event from WebSocket subscription.
   */
  private async handleDisputeOpenedEvent(
    contractId: string,
    reasonHash: string,
    raisedBy: string,
    timestamp: bigint,
    event: ethers.EventLog
  ): Promise<void> {
    const disputeEvent: DisputeOpenedEvent = {
      contractId: this.fromBytes32(contractId),
      reasonHash: reasonHash,
      raisedBy: raisedBy,
      timestamp: Number(timestamp),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
    };

    await this.processDisputeOpened(disputeEvent);
  }

  /**
   * Handles DisputeResolved event from WebSocket subscription.
   */
  private async handleDisputeResolvedEvent(
    contractId: string,
    resolution: bigint,
    resolutionHash: string,
    resolvedBy: string,
    timestamp: bigint,
    event: ethers.EventLog
  ): Promise<void> {
    const resolvedEvent: DisputeResolvedEvent = {
      contractId: this.fromBytes32(contractId),
      resolution: Number(resolution),
      resolutionHash: resolutionHash,
      resolvedBy: resolvedBy,
      timestamp: Number(timestamp),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
    };

    await this.processDisputeResolved(resolvedEvent);
  }

  /**
   * Processes a DisputeOpened event log from polling.
   */
  private async processDisputeOpenedLog(event: ethers.EventLog | ethers.Log): Promise<void> {
    const log = event as ethers.EventLog;
    if (!log.args) return;

    const disputeEvent: DisputeOpenedEvent = {
      contractId: this.fromBytes32(log.args[0]),
      reasonHash: log.args[1],
      raisedBy: log.args[2],
      timestamp: Number(log.args[3]),
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    };

    await this.processDisputeOpened(disputeEvent);
  }

  /**
   * Processes a DisputeResolved event log from polling.
   */
  private async processDisputeResolvedLog(event: ethers.EventLog | ethers.Log): Promise<void> {
    const log = event as ethers.EventLog;
    if (!log.args) return;

    const resolvedEvent: DisputeResolvedEvent = {
      contractId: this.fromBytes32(log.args[0]),
      resolution: Number(log.args[1]),
      resolutionHash: log.args[2],
      resolvedBy: log.args[3],
      timestamp: Number(log.args[4]),
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    };

    await this.processDisputeResolved(resolvedEvent);
  }

  // ============================================
  // Core Processing Logic
  // ============================================

  /**
   * Processes a DisputeOpened event.
   *
   * CRITICAL SAFETY FUNCTION: Freezes escrow and halts settlements.
   *
   * @param event - Dispute opened event data
   * @returns Processing result
   */
  async processDisputeOpened(event: DisputeOpenedEvent): Promise<ProcessedDisputeResult> {
    const disputeKey = `${event.contractId}-${event.blockNumber}-${event.transactionHash}`;

    // Idempotency check
    if (this.processedDisputes.has(disputeKey)) {
      this.logger.debug(`Dispute already processed: ${disputeKey}`);
      return {
        success: true,
        contractId: event.contractId,
        escrowFrozen: false,
        settlementsFrozen: 0,
      };
    }

    this.logger.warn(
      `DISPUTE DETECTED for contract ${event.contractId}. ` +
      `Reason: ${event.reasonHash}, Raised by: ${event.raisedBy}, Block: ${event.blockNumber}`
    );

    const client = await this.pool.connect();
    let escrowFrozen = false;
    let settlementsFrozen = 0;

    try {
      await client.query('BEGIN');

      // 1. Find and freeze escrow account
      const escrowAccount = await this.escrowRepo.findByContractId(event.contractId);
      if (escrowAccount) {
        const lockedEscrow = await this.escrowRepo.findForUpdate(escrowAccount.id, client);
        if (lockedEscrow && lockedEscrow.availableBalance > 0) {
          // Freeze all available funds
          const freezeAmount = lockedEscrow.availableBalance;

          try {
            // Freeze on bank side first
            await this.bankAdapter.freezeFunds({
              escrowAccountId: lockedEscrow.bankAccountId,
              amount: freezeAmount,
              referenceId: `DISPUTE-${event.contractId}-${event.blockNumber}`,
              reason: `Contract dispute: ${event.reasonHash}`,
            });

            // Freeze in local records
            lockedEscrow.freezeFunds(
              freezeAmount,
              `DISPUTE-${event.blockNumber}`,
              'DISPUTE_LISTENER'
            );

            await this.escrowRepo.save(lockedEscrow, client);
            escrowFrozen = true;

            this.logger.warn(
              `Escrow frozen for contract ${event.contractId}: ` +
              `${freezeAmount} ${lockedEscrow.currency}`
            );

            // Emit escrow frozen event
            const escrowFrozenEvent: EscrowFrozenDueToDisputeEvent = {
              type: 'ESCROW_FROZEN_DUE_TO_DISPUTE',
              escrowAccountId: lockedEscrow.id,
              contractId: event.contractId,
              frozenAmount: freezeAmount,
              disputeReasonHash: event.reasonHash,
              disputeRaisedBy: event.raisedBy,
              blockNumber: event.blockNumber,
              timestamp: new Date(),
            };
            this.eventEmitter.emit('escrow.frozen_by_dispute', escrowFrozenEvent);
          } catch (freezeError) {
            this.logger.error(`Failed to freeze escrow: ${freezeError}`);
            // Continue to freeze settlements even if bank freeze fails
          }
        }
      }

      // 2. Find and freeze any active settlements for this contract
      const settlement = await this.settlementRepo.findByContractId(event.contractId);
      if (settlement && canBeFrozenByDispute(settlement.status)) {
        const lockedSettlement = await this.settlementRepo.findForUpdate(settlement.id, client);
        if (lockedSettlement && lockedSettlement.canBeFrozen) {
          const previousStatus = lockedSettlement.status;

          // Freeze the settlement
          lockedSettlement.markFrozenByDispute(
            'DISPUTE_LISTENER',
            event.reasonHash,
            event.raisedBy,
            event.blockNumber
          );

          await this.settlementRepo.save(lockedSettlement, client);
          settlementsFrozen++;

          this.logger.warn(
            `Settlement ${lockedSettlement.id} frozen due to dispute. ` +
            `Previous status: ${previousStatus}. ` +
            `Bank transfer status: ${isBankTransferInProgress(previousStatus) ? 'IN_PROGRESS' : 'NOT_STARTED'}`
          );

          // Emit settlement frozen event
          const frozenEvent: SettlementFrozenByDisputeEvent = {
            type: 'SETTLEMENT_FROZEN_BY_DISPUTE',
            settlementId: lockedSettlement.id,
            contractId: event.contractId,
            disputeReasonHash: event.reasonHash,
            disputeRaisedBy: event.raisedBy,
            blockNumber: event.blockNumber,
            previousSettlementStatus: previousStatus,
            escrowFundsLocked: escrowFrozen,
            timestamp: new Date(),
          };
          this.eventEmitter.emit('settlement.frozen_by_dispute', frozenEvent);

          // If bank transfer was in progress, log critical warning
          if (isBankTransferInProgress(previousStatus)) {
            this.logger.error(
              `CRITICAL: Settlement ${lockedSettlement.id} was frozen while bank transfer ` +
              `was ${previousStatus}. Manual review required to reconcile bank state.`
            );
          }
        }
      }

      await client.query('COMMIT');

      // Mark as processed
      this.processedDisputes.add(disputeKey);

      // Store in database for persistence across restarts
      await this.recordProcessedDispute(event, escrowFrozen, settlementsFrozen);

      this.logger.warn(
        `Dispute processing complete for ${event.contractId}. ` +
        `Escrow frozen: ${escrowFrozen}, Settlements frozen: ${settlementsFrozen}`
      );

      return {
        success: true,
        contractId: event.contractId,
        escrowFrozen,
        settlementsFrozen,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logger.error(`Failed to process dispute for ${event.contractId}: ${errorMsg}`);

      return {
        success: false,
        contractId: event.contractId,
        escrowFrozen: false,
        settlementsFrozen: 0,
        error: errorMsg,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Processes a DisputeResolved event.
   *
   * @param event - Dispute resolved event data
   */
  async processDisputeResolved(event: DisputeResolvedEvent): Promise<void> {
    this.logger.log(
      `Dispute resolved for contract ${event.contractId}. ` +
      `Resolution: ${event.resolution}, Block: ${event.blockNumber}`
    );

    // Resolution handling would depend on the resolution type
    // For now, just log and emit event - manual intervention may still be required
    this.eventEmitter.emit('dispute.resolved', {
      contractId: event.contractId,
      resolution: event.resolution,
      resolutionHash: event.resolutionHash,
      resolvedBy: event.resolvedBy,
      blockNumber: event.blockNumber,
      timestamp: new Date(),
    });
  }

  // ============================================
  // Persistence
  // ============================================

  /**
   * Records a processed dispute in the database for persistence.
   */
  private async recordProcessedDispute(
    event: DisputeOpenedEvent,
    escrowFrozen: boolean,
    settlementsFrozen: number
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO processed_disputes
         (contract_id, reason_hash, raised_by, block_number, transaction_hash,
          escrow_frozen, settlements_frozen, processed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (transaction_hash) DO NOTHING`,
        [
          event.contractId,
          event.reasonHash,
          event.raisedBy,
          event.blockNumber,
          event.transactionHash,
          escrowFrozen,
          settlementsFrozen,
          new Date(),
        ]
      );
    } catch (error) {
      this.logger.error(`Failed to record processed dispute: ${error}`);
      // Don't throw - this is just for persistence
    }
  }

  /**
   * Loads previously processed disputes from database on startup.
   */
  private async loadProcessedDisputes(): Promise<void> {
    try {
      const result = await this.pool.query(
        `SELECT transaction_hash FROM processed_disputes
         WHERE processed_at > NOW() - INTERVAL '7 days'`
      );

      for (const row of result.rows) {
        this.processedDisputes.add(row.transaction_hash);
      }

      this.logger.log(`Loaded ${result.rows.length} previously processed disputes`);
    } catch (error) {
      this.logger.warn(`Failed to load processed disputes: ${error}`);
      // Don't throw - we can still process new events
    }
  }

  // ============================================
  // Helpers
  // ============================================

  /**
   * Converts bytes32 to string.
   */
  private fromBytes32(value: string): string {
    if (!value || value === ethers.ZeroHash) {
      return '';
    }

    try {
      const trimmed = value.replace(/0+$/, '');
      if (trimmed.length > 2) {
        const decoded = ethers.toUtf8String(trimmed + '0'.repeat(66 - trimmed.length));
        if (decoded && decoded.trim()) {
          return decoded.trim();
        }
      }
    } catch {
      // Not UTF-8, return hex
    }

    return value;
  }

  // ============================================
  // Public Methods for Testing/Manual Trigger
  // ============================================

  /**
   * Manually processes a dispute (for testing or recovery).
   */
  async manuallyProcessDispute(
    contractId: string,
    reasonHash: string,
    raisedBy: string,
    blockNumber: number,
    transactionHash: string
  ): Promise<ProcessedDisputeResult> {
    const event: DisputeOpenedEvent = {
      contractId,
      reasonHash,
      raisedBy,
      timestamp: Math.floor(Date.now() / 1000),
      blockNumber,
      transactionHash,
    };

    return this.processDisputeOpened(event);
  }

  /**
   * Gets the listener status.
   */
  getStatus(): {
    isListening: boolean;
    lastProcessedBlock: number;
    processedDisputesCount: number;
    config: DisputeListenerConfig;
  } {
    return {
      isListening: this.isListening,
      lastProcessedBlock: this.lastProcessedBlock,
      processedDisputesCount: this.processedDisputes.size,
      config: { ...this.config },
    };
  }

  /**
   * Checks if a dispute has been processed.
   */
  isDisputeProcessed(transactionHash: string): boolean {
    return this.processedDisputes.has(transactionHash);
  }
}
