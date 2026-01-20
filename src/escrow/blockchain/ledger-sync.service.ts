/**
 * AMANTRA - Ledger Sync Service
 *
 * Service that interfaces with the AmantraLedgerV2 smart contract.
 * Handles reading contract state and marking settlements on-chain.
 *
 * Sacred Principle: Only call markSettled AFTER bank confirms transfer success.
 * The blockchain is the notary - we record FACTS, not intents.
 *
 * @module escrow/blockchain
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ethers, Contract, Wallet, JsonRpcProvider, TransactionReceipt } from 'ethers';

// Domain imports
import { SettlementStatus } from '../domain/settlement-status.enum';

// ============================================
// ABI Definitions
// ============================================

/**
 * Minimal ABI for AmantraLedgerV2 contract.
 * Only includes functions needed by settlement module.
 */
const AMANTRA_LEDGER_V2_ABI = [
  // View functions
  'function getContract(bytes32 contractId) external view returns (tuple(bytes32 id, bytes32 contractNumber, bytes32 seller, bytes32 buyer, uint256 totalAmount, uint8 status, tuple(uint16 bps, uint256 platformFee, uint256 sellerAmount, uint256 mediatorFee) feeInfo, bytes32 escrowReference, uint64 createdAt, uint64 updatedAt, uint32 version))',
  'function getContractStatus(bytes32 contractId) external view returns (uint8)',
  'function getFeeInfo(bytes32 contractId) external view returns (tuple(uint16 bps, uint256 platformFee, uint256 sellerAmount, uint256 mediatorFee))',
  'function isTransactionProcessed(bytes32 transactionRef) external view returns (bool)',
  'function getContractVersion(bytes32 contractId) external view returns (uint32)',

  // State-changing functions
  'function markSettled(bytes32 contractId, bytes32 settlementRef, bytes32 transactionRef) external',

  // Events
  'event SettlementMarked(bytes32 indexed contractId, bytes32 indexed settlementRef, uint256 sellerAmount, uint256 platformFee, uint256 mediatorFee, address settledBy, uint64 timestamp)',
  'event StatusTransition(bytes32 indexed contractId, uint8 indexed oldStatus, uint8 indexed newStatus, address triggeredBy, bytes32 transactionRef, uint64 timestamp, uint32 newVersion)',
];

// ============================================
// Type Definitions
// ============================================

/**
 * On-chain contract status enum (mirrors Solidity enum)
 */
export enum OnChainStatus {
  CREATED = 0,
  FUNDED = 1,
  VERIFIED = 2,
  SETTLED = 3,
  DISPUTED = 4,
  CANCELLED = 5,
}

/**
 * Fee information from smart contract
 */
export interface OnChainFeeInfo {
  bps: number;
  platformFee: bigint;
  sellerAmount: bigint;
  mediatorFee: bigint;
}

/**
 * Complete contract data from smart contract
 */
export interface OnChainContract {
  id: string;
  contractNumber: string;
  seller: string;
  buyer: string;
  totalAmount: bigint;
  status: OnChainStatus;
  feeInfo: OnChainFeeInfo;
  escrowReference: string;
  createdAt: bigint;
  updatedAt: bigint;
  version: number;
}

/**
 * Payout information extracted for settlement
 */
export interface PayoutInfo {
  contractId: string;
  totalAmount: bigint;
  sellerAmount: bigint;
  platformFee: bigint;
  mediatorFee: bigint;
  feeBps: number;
  escrowReference: string;
  version: number;
}

/**
 * Result of markSettled transaction
 */
export interface MarkSettledResult {
  success: boolean;
  txHash: string;
  blockNumber: number;
  blockTimestamp: number;
  gasUsed: bigint;
  error?: string;
}

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// ============================================
// Events
// ============================================

export interface LedgerSyncEvent {
  type: 'settlement_marked' | 'status_checked' | 'payout_fetched' | 'error';
  contractId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

// ============================================
// Service Implementation
// ============================================

@Injectable()
export class LedgerSyncService implements OnModuleInit {
  private readonly logger = new Logger(LedgerSyncService.name);

  private provider: JsonRpcProvider | null = null;
  private signer: Wallet | null = null;
  private contract: Contract | null = null;
  private contractAddress: string | null = null;

  private readonly retryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  };

  // Cache for gas estimation
  private lastGasPrice: bigint = BigInt(0);
  private gasPriceUpdatedAt: number = 0;
  private readonly gasPriceCacheTtlMs = 30000; // 30 seconds

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeBlockchainConnection();
  }

  /**
   * Initializes connection to blockchain and contract.
   */
  private async initializeBlockchainConnection(): Promise<void> {
    const rpcUrl = this.configService.get<string>('BLOCKCHAIN_RPC_URL');
    this.contractAddress = this.configService.get<string>('AMANTRA_LEDGER_ADDRESS') || null;
    const privateKey = this.configService.get<string>('SETTLEMENT_ORACLE_PRIVATE_KEY');

    if (!rpcUrl) {
      this.logger.warn('BLOCKCHAIN_RPC_URL not configured - running in mock mode');
      return;
    }

    if (!this.contractAddress) {
      this.logger.warn('AMANTRA_LEDGER_ADDRESS not configured - running in mock mode');
      return;
    }

    try {
      // Create provider
      this.provider = new JsonRpcProvider(rpcUrl);

      // Verify connection
      const network = await this.provider.getNetwork();
      this.logger.log(`Connected to blockchain: chainId=${network.chainId}`);

      // Create signer if private key available
      if (privateKey) {
        this.signer = new Wallet(privateKey, this.provider);
        const signerAddress = await this.signer.getAddress();
        this.logger.log(`Settlement oracle initialized: ${signerAddress}`);

        // Create contract with signer
        this.contract = new Contract(
          this.contractAddress,
          AMANTRA_LEDGER_V2_ABI,
          this.signer
        );
      } else {
        this.logger.warn('SETTLEMENT_ORACLE_PRIVATE_KEY not set - read-only mode');

        // Create read-only contract
        this.contract = new Contract(
          this.contractAddress,
          AMANTRA_LEDGER_V2_ABI,
          this.provider
        );
      }

      // Verify contract is deployed
      const code = await this.provider.getCode(this.contractAddress);
      if (code === '0x') {
        throw new Error(`No contract deployed at ${this.contractAddress}`);
      }

      this.logger.log(`AmantraLedgerV2 contract connected at ${this.contractAddress}`);
    } catch (error) {
      this.logger.error(`Failed to initialize blockchain connection: ${error}`);
      // Don't throw - allow service to start in degraded mode
    }
  }

  /**
   * Checks if blockchain connection is available.
   */
  isConnected(): boolean {
    return this.contract !== null && this.provider !== null;
  }

  /**
   * Checks if service can write to blockchain (has signer).
   */
  canWrite(): boolean {
    return this.signer !== null;
  }

  // ============================================
  // Read Operations
  // ============================================

  /**
   * Gets the current status of a contract on-chain.
   *
   * @param contractId - Contract identifier (UUID string, will be hashed)
   * @returns On-chain status
   * @throws Error if contract not found or blockchain unavailable
   */
  async getContractStatus(contractId: string): Promise<OnChainStatus> {
    this.ensureConnected();

    const contractIdBytes = this.toBytes32(contractId);

    try {
      const status = await this.contract!.getContractStatus(contractIdBytes);

      this.emitEvent('status_checked', contractId, { status: Number(status) });

      return Number(status) as OnChainStatus;
    } catch (error) {
      this.logger.error(`Failed to get contract status for ${contractId}: ${error}`);
      throw new Error(`Failed to get contract status: ${error}`);
    }
  }

  /**
   * Gets payout information for settlement.
   *
   * @param contractId - Contract identifier
   * @returns Payout info with amounts and escrow reference
   * @throws Error if contract not found
   */
  async getPayoutInfo(contractId: string): Promise<PayoutInfo> {
    this.ensureConnected();

    const contractIdBytes = this.toBytes32(contractId);

    try {
      const contractData = await this.contract!.getContract(contractIdBytes);

      const payoutInfo: PayoutInfo = {
        contractId,
        totalAmount: contractData.totalAmount,
        sellerAmount: contractData.feeInfo.sellerAmount,
        platformFee: contractData.feeInfo.platformFee,
        mediatorFee: contractData.feeInfo.mediatorFee,
        feeBps: Number(contractData.feeInfo.bps),
        escrowReference: this.fromBytes32(contractData.escrowReference),
        version: Number(contractData.version),
      };

      this.emitEvent('payout_fetched', contractId, {
        totalAmount: payoutInfo.totalAmount.toString(),
        sellerAmount: payoutInfo.sellerAmount.toString(),
        platformFee: payoutInfo.platformFee.toString(),
        mediatorFee: payoutInfo.mediatorFee.toString(),
      });

      return payoutInfo;
    } catch (error) {
      this.logger.error(`Failed to get payout info for ${contractId}: ${error}`);
      throw new Error(`Failed to get payout info: ${error}`);
    }
  }

  /**
   * Gets full contract data from blockchain.
   *
   * @param contractId - Contract identifier
   * @returns Full on-chain contract data
   */
  async getContract(contractId: string): Promise<OnChainContract> {
    this.ensureConnected();

    const contractIdBytes = this.toBytes32(contractId);

    try {
      const data = await this.contract!.getContract(contractIdBytes);

      return {
        id: this.fromBytes32(data.id),
        contractNumber: this.fromBytes32(data.contractNumber),
        seller: this.fromBytes32(data.seller),
        buyer: this.fromBytes32(data.buyer),
        totalAmount: data.totalAmount,
        status: Number(data.status) as OnChainStatus,
        feeInfo: {
          bps: Number(data.feeInfo.bps),
          platformFee: data.feeInfo.platformFee,
          sellerAmount: data.feeInfo.sellerAmount,
          mediatorFee: data.feeInfo.mediatorFee,
        },
        escrowReference: this.fromBytes32(data.escrowReference),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        version: Number(data.version),
      };
    } catch (error) {
      this.logger.error(`Failed to get contract ${contractId}: ${error}`);
      throw new Error(`Failed to get contract: ${error}`);
    }
  }

  /**
   * Checks if a transaction reference has already been processed.
   *
   * @param transactionRef - Transaction reference
   * @returns true if already processed
   */
  async isTransactionProcessed(transactionRef: string): Promise<boolean> {
    this.ensureConnected();

    const refBytes = this.toBytes32(transactionRef);

    try {
      return await this.contract!.isTransactionProcessed(refBytes);
    } catch (error) {
      this.logger.error(`Failed to check transaction processed: ${error}`);
      throw new Error(`Failed to check transaction processed: ${error}`);
    }
  }

  /**
   * Gets the current version of a contract (for optimistic locking).
   *
   * @param contractId - Contract identifier
   * @returns Version number
   */
  async getContractVersion(contractId: string): Promise<number> {
    this.ensureConnected();

    const contractIdBytes = this.toBytes32(contractId);

    try {
      const version = await this.contract!.getContractVersion(contractIdBytes);
      return Number(version);
    } catch (error) {
      this.logger.error(`Failed to get contract version: ${error}`);
      throw new Error(`Failed to get contract version: ${error}`);
    }
  }

  // ============================================
  // Write Operations
  // ============================================

  /**
   * Marks a contract as settled on the blockchain.
   *
   * SACRED RULE: Only call this AFTER bank confirms transfer success.
   * This creates an immutable on-chain record of the settlement.
   *
   * @param contractId - Contract identifier
   * @param settlementRefHash - Hash of settlement reference (for audit)
   * @param transactionRef - Unique transaction reference (idempotency key)
   * @returns Transaction result with hash and block info
   * @throws Error if transaction fails or signer unavailable
   */
  async markSettled(
    contractId: string,
    settlementRefHash: string,
    transactionRef: string,
  ): Promise<MarkSettledResult> {
    this.ensureConnected();
    this.ensureCanWrite();

    const contractIdBytes = this.toBytes32(contractId);
    const settlementRefBytes = this.toBytes32(settlementRefHash);
    const transactionRefBytes = this.toBytes32(transactionRef);

    this.logger.log(`Marking contract ${contractId} as settled on-chain`);
    this.logger.log(`  Settlement ref: ${settlementRefHash}`);
    this.logger.log(`  Transaction ref: ${transactionRef}`);

    // Check if already processed (idempotency)
    const alreadyProcessed = await this.isTransactionProcessed(transactionRef);
    if (alreadyProcessed) {
      this.logger.warn(`Transaction ${transactionRef} already processed - skipping`);
      return {
        success: true,
        txHash: '0x0', // Already processed, no new tx
        blockNumber: 0,
        blockTimestamp: 0,
        gasUsed: BigInt(0),
      };
    }

    // Execute with retry
    return await this.executeWithRetry(
      async () => this.executeMarkSettled(
        contractIdBytes,
        settlementRefBytes,
        transactionRefBytes,
      ),
      `markSettled for ${contractId}`,
    );
  }

  /**
   * Executes the markSettled transaction.
   */
  private async executeMarkSettled(
    contractIdBytes: string,
    settlementRefBytes: string,
    transactionRefBytes: string,
  ): Promise<MarkSettledResult> {
    try {
      // Estimate gas
      const gasEstimate = await this.contract!.markSettled.estimateGas(
        contractIdBytes,
        settlementRefBytes,
        transactionRefBytes,
      );

      // Get current gas price with cache
      const gasPrice = await this.getGasPrice();

      // Add 20% buffer to gas estimate
      const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);

      this.logger.log(`Gas estimate: ${gasEstimate}, using limit: ${gasLimit}`);

      // Execute transaction
      const tx = await this.contract!.markSettled(
        contractIdBytes,
        settlementRefBytes,
        transactionRefBytes,
        {
          gasLimit,
          gasPrice,
        }
      );

      this.logger.log(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt: TransactionReceipt = await tx.wait(1); // 1 confirmation

      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction reverted');
      }

      // Get block timestamp
      const block = await this.provider!.getBlock(receipt.blockNumber);
      const blockTimestamp = block ? Number(block.timestamp) : Math.floor(Date.now() / 1000);

      this.logger.log(`Transaction confirmed in block ${receipt.blockNumber}`);

      // Emit success event
      this.emitEvent('settlement_marked', this.fromBytes32(contractIdBytes), {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      });

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        blockTimestamp,
        gasUsed: receipt.gasUsed,
      };
    } catch (error: any) {
      // Parse revert reason if available
      let errorMessage = error.message || 'Unknown error';

      if (error.reason) {
        errorMessage = error.reason;
      } else if (error.data) {
        // Try to decode error
        try {
          const iface = new ethers.Interface(AMANTRA_LEDGER_V2_ABI);
          const decoded = iface.parseError(error.data);
          if (decoded) {
            errorMessage = `${decoded.name}: ${decoded.args}`;
          }
        } catch {
          // Ignore decode errors
        }
      }

      this.logger.error(`markSettled failed: ${errorMessage}`);

      this.emitEvent('error', this.fromBytes32(contractIdBytes), {
        operation: 'markSettled',
        error: errorMessage,
      });

      throw new Error(`markSettled failed: ${errorMessage}`);
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Converts a string to bytes32 format.
   * If already 66 chars (0x + 64 hex), returns as-is.
   * Otherwise, hashes the string.
   */
  private toBytes32(value: string): string {
    if (value.startsWith('0x') && value.length === 66) {
      return value;
    }

    // Hash the string to get bytes32
    return ethers.id(value);
  }

  /**
   * Converts bytes32 back to string (attempts UTF-8 decode).
   * If the bytes32 is a hash, returns the hex string.
   */
  private fromBytes32(value: string): string {
    if (!value || value === ethers.ZeroHash) {
      return '';
    }

    // Try to decode as UTF-8 (for human-readable strings stored as bytes32)
    try {
      // Remove trailing zeros
      const trimmed = value.replace(/0+$/, '');
      if (trimmed.length > 2) {
        const decoded = ethers.toUtf8String(trimmed + '0'.repeat(66 - trimmed.length));
        if (decoded && decoded.trim()) {
          return decoded.trim();
        }
      }
    } catch {
      // Not a valid UTF-8 string, return hex
    }

    return value;
  }

  /**
   * Gets cached gas price or fetches new one.
   */
  private async getGasPrice(): Promise<bigint> {
    const now = Date.now();

    if (this.lastGasPrice > 0 && (now - this.gasPriceUpdatedAt) < this.gasPriceCacheTtlMs) {
      return this.lastGasPrice;
    }

    try {
      const feeData = await this.provider!.getFeeData();
      this.lastGasPrice = feeData.gasPrice || BigInt(20_000_000_000); // 20 gwei default
      this.gasPriceUpdatedAt = now;
      return this.lastGasPrice;
    } catch (error) {
      this.logger.warn(`Failed to get gas price, using default: ${error}`);
      return BigInt(20_000_000_000); // 20 gwei
    }
  }

  /**
   * Executes an operation with exponential backoff retry.
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.retryConfig.baseDelayMs;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry if it's a known non-retryable error
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt < this.retryConfig.maxAttempts) {
          this.logger.warn(
            `${operationName} failed (attempt ${attempt}/${this.retryConfig.maxAttempts}): ${error.message}. Retrying in ${delay}ms...`
          );

          await this.sleep(delay);
          delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelayMs);
        }
      }
    }

    throw lastError || new Error(`${operationName} failed after ${this.retryConfig.maxAttempts} attempts`);
  }

  /**
   * Checks if an error should not be retried.
   */
  private isNonRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';

    // Don't retry business logic errors
    if (message.includes('invalid state transition')) return true;
    if (message.includes('already processed')) return true;
    if (message.includes('contract not found')) return true;
    if (message.includes('unauthorized')) return true;
    if (message.includes('access control')) return true;

    return false;
  }

  /**
   * Ensures blockchain connection is available.
   */
  private ensureConnected(): void {
    if (!this.contract || !this.provider) {
      throw new Error('Blockchain connection not initialized');
    }
  }

  /**
   * Ensures signer is available for write operations.
   */
  private ensureCanWrite(): void {
    if (!this.signer) {
      throw new Error('Signer not available - cannot execute write operations');
    }
  }

  /**
   * Emits an event for monitoring/logging.
   */
  private emitEvent(
    type: LedgerSyncEvent['type'],
    contractId: string,
    data: Record<string, unknown>,
  ): void {
    const event: LedgerSyncEvent = {
      type,
      contractId,
      data,
      timestamp: new Date(),
    };

    this.eventEmitter.emit(`ledger.${type}`, event);
  }

  /**
   * Sleep helper for retry delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================
  // Status Mapping Helpers
  // ============================================

  /**
   * Maps on-chain status to settlement status expectation.
   */
  static mapOnChainToSettlementExpectation(
    onChainStatus: OnChainStatus,
  ): { canSettle: boolean; reason?: string } {
    switch (onChainStatus) {
      case OnChainStatus.VERIFIED:
        return { canSettle: true };
      case OnChainStatus.SETTLED:
        return { canSettle: false, reason: 'Contract already settled' };
      case OnChainStatus.CREATED:
        return { canSettle: false, reason: 'Contract not yet funded' };
      case OnChainStatus.FUNDED:
        return { canSettle: false, reason: 'Contract not yet verified' };
      case OnChainStatus.DISPUTED:
        return { canSettle: false, reason: 'Contract under dispute' };
      case OnChainStatus.CANCELLED:
        return { canSettle: false, reason: 'Contract cancelled' };
      default:
        return { canSettle: false, reason: 'Unknown status' };
    }
  }

  /**
   * Converts on-chain status to string for logging.
   */
  static statusToString(status: OnChainStatus): string {
    switch (status) {
      case OnChainStatus.CREATED:
        return 'CREATED';
      case OnChainStatus.FUNDED:
        return 'FUNDED';
      case OnChainStatus.VERIFIED:
        return 'VERIFIED';
      case OnChainStatus.SETTLED:
        return 'SETTLED';
      case OnChainStatus.DISPUTED:
        return 'DISPUTED';
      case OnChainStatus.CANCELLED:
        return 'CANCELLED';
      default:
        return `UNKNOWN(${status})`;
    }
  }
}
