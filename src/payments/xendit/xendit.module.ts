/**
 * AMANTRA - Xendit QRIS Module
 *
 * NestJS module that bundles all Xendit QRIS integration components.
 * Provides QRIS payment functionality for AMANTRA contracts.
 *
 * Components:
 * - XenditService: Core service for creating QRIS and processing payments
 * - XenditWebhookController: Handles Xendit webhooks
 * - XenditSignatureService: Webhook signature verification
 * - XenditIdempotencyGuard: Prevents duplicate processing
 * - XenditMapper: Data transformation and DB operations
 * - XenditReconciliationJob: Daily reconciliation
 *
 * Configuration (Environment Variables):
 * - XENDIT_API_KEY: Xendit API key
 * - XENDIT_WEBHOOK_TOKEN: Webhook verification token
 * - XENDIT_BASE_URL: API base URL (default: https://api.xendit.co)
 * - XENDIT_CALLBACK_URL: Webhook callback URL
 * - XENDIT_SUCCESS_URL: Payment success redirect URL
 * - XENDIT_FAILURE_URL: Payment failure redirect URL
 * - XENDIT_INVOICE_DURATION_SECONDS: Invoice validity (default: 86400)
 * - XENDIT_TIMESTAMP_TOLERANCE_SECONDS: Webhook timestamp tolerance (default: 300)
 * - XENDIT_QRIS_ONLY: Enable only QRIS payment method (default: true)
 * - XENDIT_SANDBOX: Enable sandbox mode (default: false)
 *
 * @module payments/xendit
 */

import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { ethers } from 'ethers';

// Module components
import { XenditService } from './xendit.service';
import { XenditWebhookController, XenditWebhookGuard } from './xendit.webhook.controller';
import { XenditSignatureService } from './xendit.signature';
import { XenditIdempotencyGuard } from './xendit.idempotency';
import { XenditMapper } from './xendit.mapper';
import { XenditReconciliationJob } from './xendit.reconciliation.job';

// Database module (assumed to exist)
import { DatabaseModule } from '../../infrastructure/database/database.module';

// AmantraLedgerV2 ABI (minimal interface for this module)
const AMANTRA_LEDGER_V2_ABI = [
  'function markFunded(bytes32 contractId, bytes32 qrisReference, bytes32 escrowReference, bytes32 transactionRef) external',
  'function getContractStatus(bytes32 contractId) external view returns (uint8)',
  'function getContract(bytes32 contractId) external view returns (tuple(bytes32 id, bytes32 contractNumber, bytes32 seller, bytes32 buyer, uint256 totalAmount, uint8 status, tuple(uint16 bps, uint256 platformFee, uint256 sellerAmount, uint256 mediatorFee) feeInfo, bytes32 escrowReference, uint64 createdAt, uint64 updatedAt, uint32 version))',
  'event PaymentMarked(bytes32 indexed contractId, bytes32 indexed qrisReference, uint256 amount, bytes32 escrowReference, address markedBy, uint64 timestamp)',
  'event StatusTransition(bytes32 indexed contractId, uint8 indexed oldStatus, uint8 indexed newStatus, address triggeredBy, bytes32 transactionRef, uint64 timestamp, uint32 newVersion)',
];

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
  ],
  controllers: [XenditWebhookController],
  providers: [
    XenditService,
    XenditSignatureService,
    XenditIdempotencyGuard,
    XenditMapper,
    XenditReconciliationJob,
    XenditWebhookGuard,
  ],
  exports: [XenditService, XenditMapper],
})
export class XenditModule implements OnModuleInit {
  private readonly logger = new Logger(XenditModule.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly xenditService: XenditService
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Xendit module...');

    // Initialize blockchain connection
    await this.initializeBlockchainConnection();

    this.logger.log('Xendit module initialized successfully');
  }

  /**
   * Initializes the connection to AmantraLedgerV2 contract.
   */
  private async initializeBlockchainConnection(): Promise<void> {
    const rpcUrl = this.configService.get<string>('BLOCKCHAIN_RPC_URL');
    const contractAddress = this.configService.get<string>('AMANTRA_LEDGER_ADDRESS');
    const privateKey = this.configService.get<string>('ORACLE_PRIVATE_KEY');

    if (!rpcUrl || !contractAddress) {
      this.logger.warn(
        'Blockchain configuration missing - running in database-only mode'
      );
      return;
    }

    try {
      // Create provider
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // Verify connection
      const network = await provider.getNetwork();
      this.logger.log(`Connected to blockchain: ${network.name} (chainId: ${network.chainId})`);

      // Create signer if private key available
      let signer: ethers.Signer | null = null;
      if (privateKey) {
        signer = new ethers.Wallet(privateKey, provider);
        const signerAddress = await signer.getAddress();
        this.logger.log(`Oracle signer initialized: ${signerAddress}`);
      } else {
        this.logger.warn('ORACLE_PRIVATE_KEY not set - read-only mode');
      }

      // Create contract instance
      const contract = new ethers.Contract(
        contractAddress,
        AMANTRA_LEDGER_V2_ABI,
        signer || provider
      );

      // Verify contract
      try {
        // Try to call a view function to verify contract is deployed
        await contract.getContractStatus(ethers.ZeroHash);
        this.logger.log(`AmantraLedgerV2 contract verified at ${contractAddress}`);
      } catch (error) {
        // Contract might be valid, just no contract at that ID
        this.logger.log(`AmantraLedgerV2 contract connected at ${contractAddress}`);
      }

      // Set contract on XenditService
      this.xenditService.setLedgerContract(contract as unknown as Parameters<typeof this.xenditService.setLedgerContract>[0]);
    } catch (error) {
      this.logger.error(`Failed to initialize blockchain connection: ${error}`);
      throw error;
    }
  }
}

// ============================================
// Re-exports for convenience
// ============================================

export { XenditService } from './xendit.service';
export { XenditSignatureService } from './xendit.signature';
export { XenditIdempotencyGuard } from './xendit.idempotency';
export { XenditMapper } from './xendit.mapper';
export { XenditReconciliationJob } from './xendit.reconciliation.job';
export { XenditWebhookController, XenditWebhookGuard } from './xendit.webhook.controller';
export * from './xendit.types';
