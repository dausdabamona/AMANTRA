/**
 * AMANTRA - Xendit Reconciliation Job
 *
 * Daily job that reconciles payment data across three sources:
 * 1. Xendit API (source of truth for payments)
 * 2. PostgreSQL database (local state)
 * 3. AmantraLedgerV2 blockchain (immutable ledger)
 *
 * Detects and auto-repairs discrepancies:
 * - PAID in Xendit but not FUNDED on-chain → Retry markFunded
 * - FUNDED on-chain but DB not updated → Fix DB status
 * - Amount mismatches → Flag for manual review
 *
 * Schedule: Daily at 2:00 AM (configurable)
 *
 * @module payments/xendit
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Pool } from 'pg';
import { ethers } from 'ethers';
import { InjectPool } from '../../infrastructure/database/database.module';
import { XenditService } from './xendit.service';
import { XenditMapper } from './xendit.mapper';
import {
  ReconciliationReport,
  ReconciliationDiscrepancy,
  ReconciliationRepairAttempt,
  QrisInvoice,
  QrisInvoiceStatus,
  XenditInvoiceResponse,
} from './xendit.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Contract status enum matching AmantraLedgerV2
 */
enum OnChainStatus {
  CREATED = 0,
  FUNDED = 1,
  VERIFIED = 2,
  SETTLED = 3,
  DISPUTED = 4,
  CANCELLED = 5,
}

/**
 * Reconciliation configuration
 */
interface ReconciliationConfig {
  enabled: boolean;
  lookbackDays: number;
  maxRetryAttempts: number;
  autoRepairEnabled: boolean;
  alertThreshold: number; // Number of discrepancies to trigger alert
}

@Injectable()
export class XenditReconciliationJob {
  private readonly logger = new Logger(XenditReconciliationJob.name);
  private readonly config: ReconciliationConfig;
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly xenditService: XenditService,
    private readonly mapper: XenditMapper,
    private readonly eventEmitter: EventEmitter2,
    @InjectPool() private readonly pool: Pool
  ) {
    this.config = {
      enabled: this.configService.get<boolean>('RECONCILIATION_ENABLED', true),
      lookbackDays: this.configService.get<number>('RECONCILIATION_LOOKBACK_DAYS', 7),
      maxRetryAttempts: this.configService.get<number>('RECONCILIATION_MAX_RETRIES', 3),
      autoRepairEnabled: this.configService.get<boolean>('RECONCILIATION_AUTO_REPAIR', true),
      alertThreshold: this.configService.get<number>('RECONCILIATION_ALERT_THRESHOLD', 10),
    };

    this.logger.log(`Reconciliation job initialized (enabled: ${this.config.enabled})`);
  }

  /**
   * Main reconciliation job - runs daily at 2:00 AM.
   *
   * Can also be triggered manually via API endpoint.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDailyReconciliation(): Promise<ReconciliationReport> {
    if (!this.config.enabled) {
      this.logger.log('Reconciliation job disabled, skipping');
      return this.createEmptyReport();
    }

    if (this.isRunning) {
      this.logger.warn('Reconciliation job already running, skipping');
      return this.createEmptyReport();
    }

    this.isRunning = true;
    const startTime = Date.now();

    this.logger.log('Starting daily reconciliation job');

    try {
      const report = await this.performReconciliation();

      const duration = Date.now() - startTime;
      this.logger.log(
        `Reconciliation completed in ${duration}ms: ` +
        `checked=${report.totalInvoicesChecked}, ` +
        `discrepancies=${report.discrepancies.length}, ` +
        `repairs=${report.autoRepairAttempts.length}`
      );

      // Emit completion event
      this.eventEmitter.emit('reconciliation.completed', report);

      // Alert if too many discrepancies
      if (report.discrepancies.length >= this.config.alertThreshold) {
        this.eventEmitter.emit('reconciliation.alert', {
          type: 'HIGH_DISCREPANCY_COUNT',
          count: report.discrepancies.length,
          threshold: this.config.alertThreshold,
          report,
        });
      }

      // Save report to database
      await this.saveReport(report);

      return report;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reconciliation failed: ${errorMsg}`);

      this.eventEmitter.emit('reconciliation.failed', {
        error: errorMsg,
        timestamp: new Date(),
      });

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manual trigger for reconciliation (for specific date range).
   */
  async runManualReconciliation(
    startDate: Date,
    endDate: Date
  ): Promise<ReconciliationReport> {
    if (this.isRunning) {
      throw new Error('Reconciliation job already running');
    }

    this.isRunning = true;

    try {
      return await this.performReconciliation(startDate, endDate);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Core reconciliation logic.
   */
  private async performReconciliation(
    startDate?: Date,
    endDate?: Date
  ): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      reportId: uuidv4(),
      generatedAt: new Date(),
      periodStart: startDate || this.getDefaultStartDate(),
      periodEnd: endDate || new Date(),
      totalInvoicesChecked: 0,
      totalXenditPaid: 0,
      totalDbFunded: 0,
      totalOnChainFunded: 0,
      discrepancies: [],
      autoRepairAttempts: [],
      status: 'COMPLETED',
    };

    try {
      // Step 1: Fetch PAID invoices from Xendit
      this.logger.log(`Fetching Xendit invoices from ${report.periodStart} to ${report.periodEnd}`);

      const xenditInvoices = await this.xenditService.listPaidInvoices(
        report.periodStart,
        report.periodEnd
      );

      report.totalXenditPaid = xenditInvoices.length;
      report.totalInvoicesChecked = xenditInvoices.length;

      this.logger.log(`Found ${xenditInvoices.length} PAID invoices in Xendit`);

      // Step 2: Fetch local DB invoices for the period
      const dbInvoices = await this.mapper.findForReconciliation(
        report.periodStart,
        report.periodEnd
      );

      report.totalDbFunded = dbInvoices.filter(
        (inv) => inv.status === QrisInvoiceStatus.FUNDED
      ).length;

      // Step 3: Check each Xendit PAID invoice against DB and blockchain
      for (const xenditInvoice of xenditInvoices) {
        await this.reconcileInvoice(xenditInvoice, dbInvoices, report);
      }

      // Step 4: Check for DB invoices that might be missing from Xendit response
      await this.checkOrphanedDbInvoices(dbInvoices, xenditInvoices, report);

      // Step 5: Count on-chain FUNDED contracts
      report.totalOnChainFunded = await this.countOnChainFunded(
        dbInvoices.map((inv) => inv.contractId)
      );

      // Determine final status
      if (report.discrepancies.some((d) => !d.resolved)) {
        report.status = 'PARTIAL';
      }

      return report;
    } catch (error) {
      report.status = 'FAILED';
      throw error;
    }
  }

  /**
   * Reconciles a single Xendit invoice against DB and blockchain.
   */
  private async reconcileInvoice(
    xenditInvoice: XenditInvoiceResponse,
    dbInvoices: QrisInvoice[],
    report: ReconciliationReport
  ): Promise<void> {
    const contractId = this.mapper.extractContractId(xenditInvoice.external_id);

    if (!contractId) {
      this.logger.warn(`Cannot extract contractId from ${xenditInvoice.external_id}`);
      return;
    }

    // Find matching DB invoice
    const dbInvoice = dbInvoices.find(
      (inv) => inv.xenditInvoiceId === xenditInvoice.id
    );

    // Check 1: Xendit PAID but no DB record
    if (!dbInvoice) {
      this.logger.warn(
        `Discrepancy: Xendit PAID but no DB record for ${xenditInvoice.id}`
      );

      report.discrepancies.push({
        invoiceId: xenditInvoice.id,
        contractId,
        type: 'XENDIT_PAID_DB_NOT_FUNDED',
        xenditStatus: 'PAID',
        dbStatus: 'NOT_FOUND',
        xenditAmount: xenditInvoice.amount,
        detectedAt: new Date(),
        resolved: false,
      });

      // Try to auto-repair by creating DB record
      if (this.config.autoRepairEnabled) {
        await this.repairMissingDbRecord(xenditInvoice, contractId, report);
      }

      return;
    }

    // Check 2: Amount mismatch
    if (dbInvoice.amount !== xenditInvoice.amount) {
      this.logger.warn(
        `Discrepancy: Amount mismatch for ${xenditInvoice.id}: ` +
        `Xendit=${xenditInvoice.amount}, DB=${dbInvoice.amount}`
      );

      report.discrepancies.push({
        invoiceId: xenditInvoice.id,
        contractId,
        type: 'AMOUNT_MISMATCH',
        xenditStatus: 'PAID',
        dbStatus: dbInvoice.status,
        xenditAmount: xenditInvoice.amount,
        dbAmount: dbInvoice.amount,
        detectedAt: new Date(),
        resolved: false,
      });

      // Amount mismatches require manual review
      return;
    }

    // Check 3: DB PAID but not on-chain FUNDED
    if (
      dbInvoice.status === QrisInvoiceStatus.PAID ||
      dbInvoice.status === QrisInvoiceStatus.PROCESSING
    ) {
      // Check on-chain status
      const onChainStatus = await this.getOnChainStatus(contractId);

      if (onChainStatus !== OnChainStatus.FUNDED) {
        this.logger.warn(
          `Discrepancy: DB PAID but on-chain not FUNDED for ${xenditInvoice.id}`
        );

        report.discrepancies.push({
          invoiceId: xenditInvoice.id,
          contractId,
          type: 'XENDIT_PAID_CHAIN_NOT_FUNDED',
          xenditStatus: 'PAID',
          dbStatus: dbInvoice.status,
          onChainStatus: OnChainStatus[onChainStatus],
          xenditAmount: xenditInvoice.amount,
          dbAmount: dbInvoice.amount,
          detectedAt: new Date(),
          resolved: false,
        });

        // Try auto-repair
        if (this.config.autoRepairEnabled && onChainStatus === OnChainStatus.CREATED) {
          await this.repairNotFunded(dbInvoice, contractId, report);
        }
      }
    }

    // Check 4: On-chain FUNDED but DB not updated
    if (
      dbInvoice.status !== QrisInvoiceStatus.FUNDED &&
      dbInvoice.blockchainTxHash
    ) {
      const onChainStatus = await this.getOnChainStatus(contractId);

      if (onChainStatus === OnChainStatus.FUNDED) {
        this.logger.warn(
          `Discrepancy: On-chain FUNDED but DB status is ${dbInvoice.status}`
        );

        report.discrepancies.push({
          invoiceId: xenditInvoice.id,
          contractId,
          type: 'STATUS_MISMATCH',
          xenditStatus: 'PAID',
          dbStatus: dbInvoice.status,
          onChainStatus: 'FUNDED',
          detectedAt: new Date(),
          resolved: false,
        });

        // Auto-repair DB status
        if (this.config.autoRepairEnabled) {
          await this.repairDbStatus(dbInvoice, report);
        }
      }
    }
  }

  /**
   * Checks for DB invoices that are PAID/PROCESSING but might be stuck.
   */
  private async checkOrphanedDbInvoices(
    dbInvoices: QrisInvoice[],
    xenditInvoices: XenditInvoiceResponse[],
    report: ReconciliationReport
  ): Promise<void> {
    const xenditInvoiceIds = new Set(xenditInvoices.map((inv) => inv.id));

    for (const dbInvoice of dbInvoices) {
      // Skip if we already checked this one
      if (xenditInvoiceIds.has(dbInvoice.xenditInvoiceId)) {
        continue;
      }

      // Check invoices that claim to be PAID/PROCESSING but weren't in Xendit response
      if (
        dbInvoice.status === QrisInvoiceStatus.PAID ||
        dbInvoice.status === QrisInvoiceStatus.PROCESSING
      ) {
        // Verify with Xendit API directly
        const xenditStatus = await this.xenditService.getXenditInvoice(
          dbInvoice.xenditInvoiceId
        );

        if (!xenditStatus || xenditStatus.status !== 'PAID') {
          this.logger.warn(
            `Discrepancy: DB shows PAID but Xendit shows ${xenditStatus?.status || 'NOT_FOUND'}`
          );

          report.discrepancies.push({
            invoiceId: dbInvoice.xenditInvoiceId,
            contractId: dbInvoice.contractId,
            type: 'STATUS_MISMATCH',
            xenditStatus: xenditStatus?.status || 'NOT_FOUND',
            dbStatus: dbInvoice.status,
            detectedAt: new Date(),
            resolved: false,
          });
        }
      }
    }
  }

  // ============================================
  // Auto-Repair Functions
  // ============================================

  /**
   * Repairs missing DB record by creating one from Xendit data.
   */
  private async repairMissingDbRecord(
    xenditInvoice: XenditInvoiceResponse,
    contractId: string,
    report: ReconciliationReport
  ): Promise<void> {
    const attempt: ReconciliationRepairAttempt = {
      discrepancyId: `${xenditInvoice.id}-missing-db`,
      invoiceId: xenditInvoice.id,
      contractId,
      repairType: 'UPDATE_DB_STATUS',
      attemptedAt: new Date(),
      success: false,
    };

    try {
      // Create invoice record
      const invoice = this.mapper.mapXenditResponseToInvoice(xenditInvoice, contractId);
      invoice.status = QrisInvoiceStatus.PAID;
      invoice.paidAt = xenditInvoice.paid_at ? new Date(xenditInvoice.paid_at) : new Date();
      invoice.paidAmount = xenditInvoice.paid_amount;

      await this.mapper.saveInvoice(invoice);

      attempt.success = true;

      // Mark discrepancy as resolved
      const discrepancy = report.discrepancies.find(
        (d) => d.invoiceId === xenditInvoice.id && d.type === 'XENDIT_PAID_DB_NOT_FUNDED'
      );
      if (discrepancy) {
        discrepancy.resolved = true;
        discrepancy.resolvedAt = new Date();
        discrepancy.resolution = 'Created missing DB record';
      }

      this.logger.log(`Repaired missing DB record for ${xenditInvoice.id}`);
    } catch (error) {
      attempt.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to repair missing DB record: ${attempt.error}`);
    }

    report.autoRepairAttempts.push(attempt);
  }

  /**
   * Repairs not-funded invoice by retrying markFunded on blockchain.
   */
  private async repairNotFunded(
    dbInvoice: QrisInvoice,
    contractId: string,
    report: ReconciliationReport
  ): Promise<void> {
    const attempt: ReconciliationRepairAttempt = {
      discrepancyId: `${dbInvoice.xenditInvoiceId}-not-funded`,
      invoiceId: dbInvoice.xenditInvoiceId,
      contractId,
      repairType: 'RETRY_MARK_FUNDED',
      attemptedAt: new Date(),
      success: false,
    };

    // Check retry count
    const retryCount = await this.getRetryCount(dbInvoice.xenditInvoiceId);

    if (retryCount >= this.config.maxRetryAttempts) {
      this.logger.warn(
        `Max retry attempts (${this.config.maxRetryAttempts}) reached for ${dbInvoice.xenditInvoiceId}`
      );
      attempt.error = 'Max retry attempts reached';
      report.autoRepairAttempts.push(attempt);
      return;
    }

    try {
      const txHash = await this.xenditService.retryMarkFunded(contractId, dbInvoice);

      if (txHash) {
        attempt.success = true;
        attempt.txHash = txHash;

        // Mark discrepancy as resolved
        const discrepancy = report.discrepancies.find(
          (d) =>
            d.invoiceId === dbInvoice.xenditInvoiceId &&
            d.type === 'XENDIT_PAID_CHAIN_NOT_FUNDED'
        );
        if (discrepancy) {
          discrepancy.resolved = true;
          discrepancy.resolvedAt = new Date();
          discrepancy.resolution = `Retried markFunded: ${txHash}`;
        }

        this.logger.log(
          `Repaired not-funded invoice ${dbInvoice.xenditInvoiceId}, tx: ${txHash}`
        );
      } else {
        attempt.error = 'Transaction returned null';
      }
    } catch (error) {
      attempt.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to repair not-funded: ${attempt.error}`);
    }

    report.autoRepairAttempts.push(attempt);

    // Record retry attempt
    await this.recordRetryAttempt(dbInvoice.xenditInvoiceId, attempt.success, attempt.error);
  }

  /**
   * Repairs DB status when on-chain is correct but DB is wrong.
   */
  private async repairDbStatus(
    dbInvoice: QrisInvoice,
    report: ReconciliationReport
  ): Promise<void> {
    const attempt: ReconciliationRepairAttempt = {
      discrepancyId: `${dbInvoice.xenditInvoiceId}-status-mismatch`,
      invoiceId: dbInvoice.xenditInvoiceId,
      contractId: dbInvoice.contractId,
      repairType: 'UPDATE_DB_STATUS',
      attemptedAt: new Date(),
      success: false,
    };

    try {
      await this.mapper.updateInvoice(
        dbInvoice.id,
        { status: QrisInvoiceStatus.FUNDED },
        dbInvoice.version
      );

      attempt.success = true;

      // Mark discrepancy as resolved
      const discrepancy = report.discrepancies.find(
        (d) =>
          d.invoiceId === dbInvoice.xenditInvoiceId && d.type === 'STATUS_MISMATCH'
      );
      if (discrepancy) {
        discrepancy.resolved = true;
        discrepancy.resolvedAt = new Date();
        discrepancy.resolution = 'Updated DB status to FUNDED';
      }

      this.logger.log(`Repaired DB status for ${dbInvoice.xenditInvoiceId}`);
    } catch (error) {
      attempt.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to repair DB status: ${attempt.error}`);
    }

    report.autoRepairAttempts.push(attempt);
  }

  // ============================================
  // Helper Functions
  // ============================================

  /**
   * Gets on-chain contract status.
   */
  private async getOnChainStatus(contractId: string): Promise<OnChainStatus> {
    // This would be implemented through blockchain adapter
    // For now, return placeholder
    try {
      const result = await this.pool.query(
        `SELECT blockchain_status FROM contracts WHERE id = $1`,
        [contractId]
      );

      if (result.rows.length === 0) {
        return OnChainStatus.CREATED;
      }

      // Map string status to enum
      const statusMap: Record<string, OnChainStatus> = {
        CREATED: OnChainStatus.CREATED,
        FUNDED: OnChainStatus.FUNDED,
        VERIFIED: OnChainStatus.VERIFIED,
        SETTLED: OnChainStatus.SETTLED,
        DISPUTED: OnChainStatus.DISPUTED,
        CANCELLED: OnChainStatus.CANCELLED,
      };

      return statusMap[result.rows[0].blockchain_status] || OnChainStatus.CREATED;
    } catch (error) {
      this.logger.error(`Failed to get on-chain status for ${contractId}: ${error}`);
      return OnChainStatus.CREATED;
    }
  }

  /**
   * Counts on-chain FUNDED contracts.
   */
  private async countOnChainFunded(contractIds: string[]): Promise<number> {
    if (contractIds.length === 0) {
      return 0;
    }

    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM contracts
       WHERE id = ANY($1) AND status = 'FUNDED'`,
      [contractIds]
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Gets retry count for an invoice.
   */
  private async getRetryCount(invoiceId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM reconciliation_retry_attempts
       WHERE invoice_id = $1`,
      [invoiceId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Records a retry attempt.
   */
  private async recordRetryAttempt(
    invoiceId: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO reconciliation_retry_attempts
       (id, invoice_id, success, error_message, attempted_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [uuidv4(), invoiceId, success, error || null]
    );
  }

  /**
   * Saves reconciliation report to database.
   */
  private async saveReport(report: ReconciliationReport): Promise<void> {
    await this.pool.query(
      `INSERT INTO reconciliation_reports
       (id, generated_at, period_start, period_end,
        total_invoices_checked, total_xendit_paid, total_db_funded, total_onchain_funded,
        discrepancy_count, repair_count, status, report_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        report.reportId,
        report.generatedAt,
        report.periodStart,
        report.periodEnd,
        report.totalInvoicesChecked,
        report.totalXenditPaid,
        report.totalDbFunded,
        report.totalOnChainFunded,
        report.discrepancies.length,
        report.autoRepairAttempts.length,
        report.status,
        JSON.stringify(report),
      ]
    );
  }

  /**
   * Gets default start date (7 days ago).
   */
  private getDefaultStartDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() - this.config.lookbackDays);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Creates empty report for disabled/skipped runs.
   */
  private createEmptyReport(): ReconciliationReport {
    return {
      reportId: uuidv4(),
      generatedAt: new Date(),
      periodStart: new Date(),
      periodEnd: new Date(),
      totalInvoicesChecked: 0,
      totalXenditPaid: 0,
      totalDbFunded: 0,
      totalOnChainFunded: 0,
      discrepancies: [],
      autoRepairAttempts: [],
      status: 'COMPLETED',
    };
  }
}
