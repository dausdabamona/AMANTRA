/**
 * AMANTRA - Reconciliation Job
 *
 * Job untuk rekonsiliasi data antara:
 * - Database PostgreSQL
 * - Bank Escrow API
 * - Blockchain Smart Contract
 *
 * Dijalankan secara berkala untuk memastikan konsistensi data.
 */

import { Pool } from 'pg';
import { BlockchainService, ContractStatusOnChain } from '../../application/services/BlockchainService';
import { EscrowService } from '../../application/services/EscrowService';
import { ContractStatus, ESCROW_ACTIVE_STATUSES } from '../../domain/value-objects/ContractStatus';
import { Logger } from '../../shared/Logger';

export interface ReconciliationResult {
  date: Date;
  totalContracts: number;
  checkedContracts: number;
  discrepancies: Discrepancy[];
  bankReconciliation: BankReconciliationResult;
  blockchainReconciliation: BlockchainReconciliationResult;
}

export interface Discrepancy {
  contractId: string;
  contractNumber: string;
  type: DiscrepancyType;
  description: string;
  dbValue: string;
  externalValue: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export type DiscrepancyType =
  | 'STATUS_MISMATCH'
  | 'BALANCE_MISMATCH'
  | 'MISSING_ON_CHAIN'
  | 'MISSING_ESCROW'
  | 'FEE_MISMATCH'
  | 'ORPHAN_ESCROW';

export interface BankReconciliationResult {
  totalEscrowAccounts: number;
  totalBalance: number;
  matchedAccounts: number;
  orphanAccounts: number;
}

export interface BlockchainReconciliationResult {
  totalOnChainContracts: number;
  statusMatches: number;
  statusMismatches: number;
  missingOnChain: number;
}

export class ReconciliationJob {
  constructor(
    private readonly pool: Pool,
    private readonly blockchainService: BlockchainService,
    private readonly escrowService: EscrowService,
    private readonly logger: Logger
  ) {}

  async run(): Promise<ReconciliationResult> {
    const startTime = Date.now();
    this.logger.info('Starting reconciliation job');

    const result: ReconciliationResult = {
      date: new Date(),
      totalContracts: 0,
      checkedContracts: 0,
      discrepancies: [],
      bankReconciliation: {
        totalEscrowAccounts: 0,
        totalBalance: 0,
        matchedAccounts: 0,
        orphanAccounts: 0,
      },
      blockchainReconciliation: {
        totalOnChainContracts: 0,
        statusMatches: 0,
        statusMismatches: 0,
        missingOnChain: 0,
      },
    };

    try {
      // 1. Get all active contracts from database
      const activeContracts = await this.getActiveContracts();
      result.totalContracts = activeContracts.length;

      this.logger.info(`Found ${activeContracts.length} active contracts to reconcile`);

      // 2. Reconcile each contract
      for (const contract of activeContracts) {
        result.checkedContracts++;

        // Check blockchain status
        const onChainStatus = await this.blockchainService.getContractStatus(contract.id);
        const blockchainDiscrepancy = this.checkBlockchainStatus(contract, onChainStatus);

        if (blockchainDiscrepancy) {
          result.discrepancies.push(blockchainDiscrepancy);
          result.blockchainReconciliation.statusMismatches++;
        } else if (onChainStatus === 'NOT_FOUND') {
          result.blockchainReconciliation.missingOnChain++;
          result.discrepancies.push({
            contractId: contract.id,
            contractNumber: contract.contract_number,
            type: 'MISSING_ON_CHAIN',
            description: 'Contract exists in database but not on blockchain',
            dbValue: contract.status,
            externalValue: 'NOT_FOUND',
            severity: 'HIGH',
          });
        } else {
          result.blockchainReconciliation.statusMatches++;
        }

        result.blockchainReconciliation.totalOnChainContracts++;

        // Check escrow balance (jika status memerlukan escrow)
        if (ESCROW_ACTIVE_STATUSES.includes(contract.status as ContractStatus) && contract.escrow_account_id) {
          const escrowDiscrepancy = await this.checkEscrowBalance(contract);
          if (escrowDiscrepancy) {
            result.discrepancies.push(escrowDiscrepancy);
          } else {
            result.bankReconciliation.matchedAccounts++;
          }
          result.bankReconciliation.totalEscrowAccounts++;
        }

        // Check fee structure hasn't been tampered
        const feeDiscrepancy = await this.checkFeeStructure(contract);
        if (feeDiscrepancy) {
          result.discrepancies.push(feeDiscrepancy);
        }
      }

      // 3. Store reconciliation record
      await this.storeReconciliationRecord(result);

      const duration = Date.now() - startTime;
      this.logger.info('Reconciliation job completed', {
        duration: `${duration}ms`,
        totalContracts: result.totalContracts,
        discrepancies: result.discrepancies.length,
      });

      // 4. Alert on critical discrepancies
      const criticalDiscrepancies = result.discrepancies.filter(
        (d) => d.severity === 'CRITICAL'
      );

      if (criticalDiscrepancies.length > 0) {
        this.logger.error('CRITICAL discrepancies found!', {
          count: criticalDiscrepancies.length,
          discrepancies: criticalDiscrepancies,
        });
        // Di production, kirim alert ke sistem monitoring
      }

      return result;
    } catch (error) {
      this.logger.error('Reconciliation job failed', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
  }

  private async getActiveContracts(): Promise<DbContract[]> {
    const query = `
      SELECT
        id,
        contract_number,
        status,
        escrow_account_id,
        total_amount,
        platform_fee_bps,
        mediator_fee_bps,
        seller_id,
        buyer_id
      FROM contracts
      WHERE status IN ('CREATED', 'FUNDED', 'VERIFIED', 'DISPUTED')
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  private checkBlockchainStatus(
    contract: DbContract,
    onChainStatus: ContractStatusOnChain
  ): Discrepancy | null {
    // Map database status to expected on-chain status
    const expectedOnChainStatus = contract.status as string;

    if (onChainStatus !== 'NOT_FOUND' && onChainStatus !== expectedOnChainStatus) {
      return {
        contractId: contract.id,
        contractNumber: contract.contract_number,
        type: 'STATUS_MISMATCH',
        description: `Database status doesn't match blockchain status`,
        dbValue: contract.status,
        externalValue: onChainStatus,
        severity: 'CRITICAL', // Status mismatch is always critical
      };
    }

    return null;
  }

  private async checkEscrowBalance(contract: DbContract): Promise<Discrepancy | null> {
    try {
      const escrowAccount = await this.escrowService.getEscrowAccount(
        contract.escrow_account_id!
      );

      if (!escrowAccount) {
        return {
          contractId: contract.id,
          contractNumber: contract.contract_number,
          type: 'MISSING_ESCROW',
          description: 'Escrow account not found in bank',
          dbValue: contract.escrow_account_id!,
          externalValue: 'NOT_FOUND',
          severity: 'CRITICAL',
        };
      }

      // Untuk status FUNDED/VERIFIED, balance harus = total_amount
      if (
        contract.status === 'FUNDED' ||
        contract.status === 'VERIFIED'
      ) {
        if (escrowAccount.balance !== parseInt(contract.total_amount)) {
          return {
            contractId: contract.id,
            contractNumber: contract.contract_number,
            type: 'BALANCE_MISMATCH',
            description: 'Escrow balance doesn\'t match expected amount',
            dbValue: contract.total_amount.toString(),
            externalValue: escrowAccount.balance.toString(),
            severity: 'CRITICAL',
          };
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to check escrow balance', {
        contractId: contract.id,
        error: (error as Error).message,
      });
      return null;
    }
  }

  private async checkFeeStructure(contract: DbContract): Promise<Discrepancy | null> {
    try {
      const onChainFees = await this.blockchainService.getContractFeeStructure(
        contract.id
      );

      if (
        onChainFees.platformFeeBps !== parseInt(contract.platform_fee_bps) ||
        onChainFees.mediatorFeeBps !== parseInt(contract.mediator_fee_bps || '0')
      ) {
        return {
          contractId: contract.id,
          contractNumber: contract.contract_number,
          type: 'FEE_MISMATCH',
          description: 'Fee structure in database doesn\'t match blockchain',
          dbValue: `platform: ${contract.platform_fee_bps}, mediator: ${contract.mediator_fee_bps || 0}`,
          externalValue: `platform: ${onChainFees.platformFeeBps}, mediator: ${onChainFees.mediatorFeeBps}`,
          severity: 'CRITICAL', // Fee tampering is critical
        };
      }

      return null;
    } catch {
      // Contract might not be on chain yet
      return null;
    }
  }

  private async storeReconciliationRecord(result: ReconciliationResult): Promise<void> {
    const query = `
      INSERT INTO reconciliation_records (
        reconciliation_date,
        total_contracts,
        total_payments,
        total_settlements,
        discrepancies,
        discrepancy_count,
        status,
        completed_at
      ) VALUES (
        $1::date, $2, $3, $4, $5, $6, $7, NOW()
      )
      ON CONFLICT (reconciliation_date)
      DO UPDATE SET
        total_contracts = $2,
        discrepancies = $5,
        discrepancy_count = $6,
        status = $7,
        completed_at = NOW()
    `;

    const status = result.discrepancies.some((d) => d.severity === 'CRITICAL')
      ? 'REQUIRES_REVIEW'
      : 'COMPLETED';

    await this.pool.query(query, [
      result.date.toISOString().split('T')[0],
      result.totalContracts,
      result.bankReconciliation.totalBalance,
      0, // settlements - would need to calculate
      JSON.stringify(result.discrepancies),
      result.discrepancies.length,
      status,
    ]);
  }
}

interface DbContract {
  id: string;
  contract_number: string;
  status: string;
  escrow_account_id?: string;
  total_amount: string;
  platform_fee_bps: string;
  mediator_fee_bps?: string;
  seller_id: string;
  buyer_id: string;
}
