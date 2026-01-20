/**
 * AMANTRA - Escrow Module
 *
 * NestJS module that bundles all escrow and settlement components.
 * Provides bank escrow management, settlement orchestration, and reconciliation.
 *
 * Components:
 * - EscrowAccountService: Manages escrow account lifecycle
 * - SettlementOrchestratorService: Orchestrates settlement flow
 * - LedgerSyncService: Blockchain integration
 * - SettlementReconciliationJob: Daily reconciliation
 *
 * Adapters:
 * - MockBankAdapter: For testing/sandbox
 * - BSIAdapter: Bank Syariah Indonesia (production stub)
 *
 * Configuration (Environment Variables):
 * - BANK_ADAPTER_TYPE: 'mock' | 'bsi' (default: 'mock')
 * - BLOCKCHAIN_RPC_URL: Ethereum RPC endpoint
 * - AMANTRA_LEDGER_ADDRESS: AmantraLedgerV2 contract address
 * - SETTLEMENT_ORACLE_PRIVATE_KEY: Private key for settlement transactions
 * - BSI_API_BASE_URL: BSI API base URL
 * - BSI_API_KEY: BSI API key
 * - BSI_API_SECRET: BSI API secret
 * - BSI_PARTNER_ID: BSI partner ID
 * - BSI_CALLBACK_PUBLIC_KEY_PATH: Path to BSI callback verification key
 *
 * @module escrow
 */

import { Module, OnModuleInit, Logger, DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Pool } from 'pg';

// Domain exports
export * from './domain/settlement-status.enum';
export * from './domain/split-payment.value';
export * from './domain/escrow-account.entity';
export * from './domain/settlement.entity';

// Port exports
export * from './ports/bank-escrow.port';
export * from './ports/settlement-repository.port';

// Service exports
export { EscrowAccountService } from './services/escrow-account.service';
export { SettlementOrchestratorService } from './services/settlement-orchestrator.service';
export { LedgerSyncService, OnChainStatus, PayoutInfo } from './blockchain/ledger-sync.service';
export { SettlementReconciliationJob } from './jobs/settlement-reconciliation.job';

// Adapter exports
export { MockBankAdapter } from './adapters/mock-bank.adapter';
export { BSIAdapter } from './adapters/bsi.adapter';

// DTO exports
export * from './dto/initiate-settlement.dto';
export * from './dto/bank-callback.dto';

// Internal imports
import { EscrowAccountService } from './services/escrow-account.service';
import { SettlementOrchestratorService } from './services/settlement-orchestrator.service';
import { LedgerSyncService } from './blockchain/ledger-sync.service';
import { SettlementReconciliationJob } from './jobs/settlement-reconciliation.job';
import { MockBankAdapter } from './adapters/mock-bank.adapter';
import { BSIAdapter } from './adapters/bsi.adapter';
import {
  ESCROW_ACCOUNT_REPOSITORY,
  SETTLEMENT_REPOSITORY,
} from './ports/settlement-repository.port';

// Database module (assumed to exist)
import { DatabaseModule } from '../infrastructure/database/database.module';

// ============================================
// Module Configuration
// ============================================

export interface EscrowModuleOptions {
  bankAdapterType?: 'mock' | 'bsi';
  enableReconciliation?: boolean;
  enableBlockchain?: boolean;
}

// ============================================
// Mock Repositories (for development)
// ============================================

/**
 * In-memory mock repository for escrow accounts.
 * Replace with PostgreSQL implementation in production.
 */
class MockEscrowAccountRepository {
  private accounts = new Map<string, any>();

  async save(account: any): Promise<void> {
    this.accounts.set(account.id, account.toPersistence());
  }

  async findById(id: string): Promise<any | null> {
    const data = this.accounts.get(id);
    if (!data) return null;
    const { EscrowAccount } = require('./domain/escrow-account.entity');
    return EscrowAccount.fromPersistence(data);
  }

  async findByContractId(contractId: string): Promise<any | null> {
    for (const data of this.accounts.values()) {
      if (data.contractId === contractId) {
        const { EscrowAccount } = require('./domain/escrow-account.entity');
        return EscrowAccount.fromPersistence(data);
      }
    }
    return null;
  }

  async findByBankAccount(accountNumber: string, bankCode: string): Promise<any | null> {
    for (const data of this.accounts.values()) {
      if (data.accountNumber === accountNumber && data.bankCode === bankCode) {
        const { EscrowAccount } = require('./domain/escrow-account.entity');
        return EscrowAccount.fromPersistence(data);
      }
    }
    return null;
  }

  async findForUpdate(id: string): Promise<any | null> {
    return this.findById(id);
  }

  async findByCriteria(criteria: any, pagination: any): Promise<any> {
    const results = Array.from(this.accounts.values()).filter((data) => {
      if (criteria.contractId && data.contractId !== criteria.contractId) return false;
      if (criteria.bankCode && data.bankCode !== criteria.bankCode) return false;
      if (criteria.minBalance && data.balance < criteria.minBalance) return false;
      return true;
    });

    const start = (pagination.page - 1) * pagination.limit;
    const end = start + pagination.limit;
    const { EscrowAccount } = require('./domain/escrow-account.entity');

    return {
      data: results.slice(start, end).map((d) => EscrowAccount.fromPersistence(d)),
      total: results.length,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(results.length / pagination.limit),
    };
  }

  async findWithFrozenFunds(limit: number): Promise<any[]> {
    const results = Array.from(this.accounts.values())
      .filter((d) => d.frozenAmount > 0)
      .slice(0, limit);
    const { EscrowAccount } = require('./domain/escrow-account.entity');
    return results.map((d) => EscrowAccount.fromPersistence(d));
  }

  async getTotalEscrowBalance(): Promise<number> {
    return Array.from(this.accounts.values()).reduce((sum, d) => sum + d.balance, 0);
  }

  async updateBalance(id: string, newBalance: number): Promise<void> {
    const data = this.accounts.get(id);
    if (data) {
      data.balance = newBalance;
      this.accounts.set(id, data);
    }
  }
}

/**
 * In-memory mock repository for settlements.
 * Replace with PostgreSQL implementation in production.
 */
class MockSettlementRepository {
  private settlements = new Map<string, any>();

  async save(settlement: any): Promise<void> {
    this.settlements.set(settlement.id, settlement.toPersistence());
  }

  async findById(id: string): Promise<any | null> {
    const data = this.settlements.get(id);
    if (!data) return null;
    const { Settlement } = require('./domain/settlement.entity');
    return Settlement.fromPersistence(data);
  }

  async findByContractId(contractId: string): Promise<any | null> {
    for (const data of this.settlements.values()) {
      if (data.contractId === contractId) {
        const { Settlement } = require('./domain/settlement.entity');
        return Settlement.fromPersistence(data);
      }
    }
    return null;
  }

  async findByReferenceId(referenceId: string): Promise<any | null> {
    for (const data of this.settlements.values()) {
      if (data.referenceId === referenceId) {
        const { Settlement } = require('./domain/settlement.entity');
        return Settlement.fromPersistence(data);
      }
    }
    return null;
  }

  async findByBlockchainTxHash(txHash: string): Promise<any | null> {
    for (const data of this.settlements.values()) {
      if (data.blockchainTxHash === txHash) {
        const { Settlement } = require('./domain/settlement.entity');
        return Settlement.fromPersistence(data);
      }
    }
    return null;
  }

  async findForUpdate(id: string): Promise<any | null> {
    return this.findById(id);
  }

  async findByCriteria(criteria: any, pagination: any): Promise<any> {
    let results = Array.from(this.settlements.values());

    if (criteria.contractId) {
      results = results.filter((d) => d.contractId === criteria.contractId);
    }
    if (criteria.status) {
      const statuses = Array.isArray(criteria.status) ? criteria.status : [criteria.status];
      results = results.filter((d) => statuses.includes(d.status));
    }

    const start = (pagination.page - 1) * pagination.limit;
    const end = start + pagination.limit;
    const { Settlement } = require('./domain/settlement.entity');

    return {
      data: results.slice(start, end).map((d) => Settlement.fromPersistence(d)),
      total: results.length,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(results.length / pagination.limit),
    };
  }

  async findByStatuses(statuses: string[], limit: number): Promise<any[]> {
    const results = Array.from(this.settlements.values())
      .filter((d) => statuses.includes(d.status))
      .slice(0, limit);
    const { Settlement } = require('./domain/settlement.entity');
    return results.map((d) => Settlement.fromPersistence(d));
  }

  async findStaleBankPending(thresholdMinutes: number, limit: number): Promise<any[]> {
    const threshold = Date.now() - thresholdMinutes * 60 * 1000;
    const results = Array.from(this.settlements.values())
      .filter((d) => d.status === 'BANK_PENDING' && new Date(d.updatedAt).getTime() < threshold)
      .slice(0, limit);
    const { Settlement } = require('./domain/settlement.entity');
    return results.map((d) => Settlement.fromPersistence(d));
  }

  async findPendingBlockchain(limit: number): Promise<any[]> {
    const results = Array.from(this.settlements.values())
      .filter((d) => d.status === 'BLOCKCHAIN_PENDING')
      .slice(0, limit);
    const { Settlement } = require('./domain/settlement.entity');
    return results.map((d) => Settlement.fromPersistence(d));
  }

  async findRetryable(maxRetries: number, limit: number): Promise<any[]> {
    const results = Array.from(this.settlements.values())
      .filter((d) => d.status === 'BANK_FAILED' && d.retryCount < maxRetries)
      .slice(0, limit);
    const { Settlement } = require('./domain/settlement.entity');
    return results.map((d) => Settlement.fromPersistence(d));
  }

  async getStatistics(startDate: Date, endDate: Date): Promise<any> {
    const results = Array.from(this.settlements.values()).filter(
      (d) => new Date(d.initiatedAt) >= startDate && new Date(d.initiatedAt) <= endDate
    );

    const byStatus: Record<string, number> = {};
    let totalSettledAmount = 0;
    let totalPlatformFees = 0;

    for (const d of results) {
      byStatus[d.status] = (byStatus[d.status] || 0) + 1;
      if (d.status === 'COMPLETED') {
        totalSettledAmount += d.splitPayment?.totalAmount || 0;
        totalPlatformFees += d.splitPayment?.platformFee || 0;
      }
    }

    return {
      totalCount: results.length,
      completedCount: byStatus['COMPLETED'] || 0,
      failedCount: byStatus['FAILED'] || 0,
      pendingCount: results.filter((d) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(d.status)).length,
      totalSettledAmount,
      totalPlatformFees,
      averageSettlementTimeMs: 0,
      byStatus,
    };
  }

  async existsForContract(contractId: string): Promise<boolean> {
    for (const data of this.settlements.values()) {
      if (data.contractId === contractId) return true;
    }
    return false;
  }

  async findForReconciliation(startDate: Date, endDate: Date): Promise<any[]> {
    const results = Array.from(this.settlements.values()).filter(
      (d) => new Date(d.initiatedAt) >= startDate && new Date(d.initiatedAt) <= endDate
    );
    const { Settlement } = require('./domain/settlement.entity');
    return results.map((d) => Settlement.fromPersistence(d));
  }
}

// ============================================
// Module Definition
// ============================================

@Module({})
export class EscrowModule implements OnModuleInit {
  private readonly logger = new Logger(EscrowModule.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Creates a configured escrow module.
   *
   * @param options - Module configuration options
   * @returns Configured dynamic module
   */
  static forRoot(options: EscrowModuleOptions = {}): DynamicModule {
    const providers: any[] = [
      // Services
      EscrowAccountService,
      SettlementOrchestratorService,
      LedgerSyncService,

      // Mock repositories (replace with real implementations)
      {
        provide: ESCROW_ACCOUNT_REPOSITORY,
        useClass: MockEscrowAccountRepository,
      },
      {
        provide: SETTLEMENT_REPOSITORY,
        useClass: MockSettlementRepository,
      },

      // Database pool
      {
        provide: 'DATABASE_POOL',
        useFactory: (configService: ConfigService) => {
          const connectionString = configService.get<string>('DATABASE_URL');
          if (!connectionString) {
            // Return mock pool for development
            return {
              connect: async () => ({
                query: async () => ({ rows: [] }),
                release: () => {},
              }),
              query: async () => ({ rows: [] }),
            };
          }
          return new Pool({ connectionString });
        },
        inject: [ConfigService],
      },

      // Bank adapter factory
      {
        provide: 'BANK_ADAPTER',
        useFactory: (configService: ConfigService, eventEmitter: any) => {
          const adapterType = options.bankAdapterType ||
            configService.get<string>('BANK_ADAPTER_TYPE', 'mock');

          if (adapterType === 'bsi') {
            return new BSIAdapter(configService);
          }

          return new MockBankAdapter(eventEmitter);
        },
        inject: [ConfigService, EventEmitterModule],
      },
    ];

    // Conditionally add reconciliation job
    if (options.enableReconciliation !== false) {
      providers.push(SettlementReconciliationJob);
    }

    return {
      module: EscrowModule,
      imports: [
        ConfigModule,
        EventEmitterModule.forRoot({
          wildcard: true,
          delimiter: '.',
          maxListeners: 20,
          verboseMemoryLeak: true,
        }),
        ScheduleModule.forRoot(),
      ],
      providers,
      exports: [
        EscrowAccountService,
        SettlementOrchestratorService,
        LedgerSyncService,
        'BANK_ADAPTER',
        ESCROW_ACCOUNT_REPOSITORY,
        SETTLEMENT_REPOSITORY,
      ],
    };
  }

  /**
   * Creates module for feature imports (uses existing root configuration).
   */
  static forFeature(): DynamicModule {
    return {
      module: EscrowModule,
      imports: [ConfigModule],
      providers: [],
      exports: [],
    };
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Escrow module initialized');

    const bankAdapter = this.configService.get<string>('BANK_ADAPTER_TYPE', 'mock');
    this.logger.log(`Bank adapter: ${bankAdapter}`);

    const hasBlockchain = !!this.configService.get<string>('BLOCKCHAIN_RPC_URL');
    this.logger.log(`Blockchain integration: ${hasBlockchain ? 'enabled' : 'disabled'}`);
  }
}
