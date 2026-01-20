/**
 * AMANTRA - Xendit Idempotency Guard
 *
 * Ensures webhook processing is idempotent - each payment is processed
 * exactly once, regardless of how many times Xendit retries the webhook.
 *
 * Idempotency Key: invoice_id (Xendit's unique invoice identifier)
 *
 * Storage: PostgreSQL with atomic operations
 * - Prevents race conditions using SELECT FOR UPDATE
 * - Maintains full audit trail of all processing attempts
 *
 * @module payments/xendit
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { InjectPool } from '../../infrastructure/database/database.module';
import {
  IdempotencyViolationError,
  WebhookProcessingResult,
  WebhookProcessingContext,
} from './xendit.types';

/**
 * Idempotency record stored in database
 */
export interface IdempotencyRecord {
  id: string;
  invoiceId: string;
  contractId: string;
  webhookId: string;
  processingResult: WebhookProcessingResult;
  blockchainTxHash?: string;
  processedAt: Date;
  rawPayloadHash: string;
  createdAt: Date;
}

/**
 * Processing lock status
 */
export interface ProcessingLock {
  acquired: boolean;
  lockId?: string;
  existingRecord?: IdempotencyRecord;
}

@Injectable()
export class XenditIdempotencyGuard {
  private readonly logger = new Logger(XenditIdempotencyGuard.name);

  constructor(@InjectPool() private readonly pool: Pool) {}

  /**
   * Attempts to acquire a processing lock for the invoice.
   *
   * Uses PostgreSQL advisory locks combined with record insertion
   * to ensure only one process handles each invoice.
   *
   * Flow:
   * 1. Try to acquire advisory lock on invoice_id hash
   * 2. Check if invoice already processed
   * 3. If not processed, insert pending record
   * 4. Return lock status
   *
   * @param invoiceId - Xendit invoice ID (idempotency key)
   * @param contractId - Associated contract ID
   * @param webhookId - Current webhook ID
   * @param rawPayloadHash - Hash of raw webhook payload
   * @param client - Optional DB client for transaction
   * @returns Lock acquisition result
   */
  async acquireProcessingLock(
    invoiceId: string,
    contractId: string,
    webhookId: string,
    rawPayloadHash: string,
    client?: PoolClient
  ): Promise<ProcessingLock> {
    const dbClient = client || (await this.pool.connect());
    const shouldRelease = !client;

    try {
      // Generate lock key from invoice ID
      const lockKey = this.generateLockKey(invoiceId);

      this.logger.debug(`Attempting to acquire lock for invoice ${invoiceId}, key: ${lockKey}`);

      // Try to acquire advisory lock (non-blocking)
      const lockResult = await dbClient.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [lockKey]
      );

      if (!lockResult.rows[0].acquired) {
        this.logger.warn(`Lock contention for invoice ${invoiceId} - another process is handling`);
        return {
          acquired: false,
        };
      }

      // Check if already processed
      const existingResult = await dbClient.query(
        `SELECT * FROM xendit_idempotency
         WHERE invoice_id = $1
         FOR UPDATE`,
        [invoiceId]
      );

      if (existingResult.rows.length > 0) {
        const existing = this.mapToRecord(existingResult.rows[0]);

        this.logger.info(
          `Invoice ${invoiceId} already processed: ${existing.processingResult} at ${existing.processedAt}`
        );

        // Release advisory lock since we're not processing
        await dbClient.query('SELECT pg_advisory_unlock($1)', [lockKey]);

        return {
          acquired: false,
          existingRecord: existing,
        };
      }

      // Insert pending record to claim this invoice
      const lockId = `${webhookId}-${Date.now()}`;

      await dbClient.query(
        `INSERT INTO xendit_idempotency (
          id, invoice_id, contract_id, webhook_id,
          processing_result, raw_payload_hash,
          processed_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [
          lockId,
          invoiceId,
          contractId,
          webhookId,
          'PROCESSING', // Temporary status
          rawPayloadHash,
        ]
      );

      this.logger.info(`Acquired processing lock for invoice ${invoiceId}, lock ID: ${lockId}`);

      return {
        acquired: true,
        lockId,
      };
    } catch (error) {
      this.logger.error(`Failed to acquire lock for invoice ${invoiceId}: ${error}`);
      throw error;
    } finally {
      if (shouldRelease) {
        dbClient.release();
      }
    }
  }

  /**
   * Releases the processing lock and updates the final status.
   *
   * Must be called after processing completes (success or failure).
   *
   * @param invoiceId - Invoice ID
   * @param lockId - Lock ID from acquireProcessingLock
   * @param result - Final processing result
   * @param blockchainTxHash - Optional blockchain transaction hash
   * @param client - Optional DB client for transaction
   */
  async releaseProcessingLock(
    invoiceId: string,
    lockId: string,
    result: WebhookProcessingResult,
    blockchainTxHash?: string,
    client?: PoolClient
  ): Promise<void> {
    const dbClient = client || (await this.pool.connect());
    const shouldRelease = !client;

    try {
      const lockKey = this.generateLockKey(invoiceId);

      // Update the record with final status
      await dbClient.query(
        `UPDATE xendit_idempotency
         SET processing_result = $1,
             blockchain_tx_hash = $2,
             processed_at = NOW()
         WHERE id = $3 AND invoice_id = $4`,
        [result, blockchainTxHash || null, lockId, invoiceId]
      );

      // Release advisory lock
      await dbClient.query('SELECT pg_advisory_unlock($1)', [lockKey]);

      this.logger.info(
        `Released lock for invoice ${invoiceId}, result: ${result}, txHash: ${blockchainTxHash || 'N/A'}`
      );
    } catch (error) {
      this.logger.error(`Failed to release lock for invoice ${invoiceId}: ${error}`);
      throw error;
    } finally {
      if (shouldRelease) {
        dbClient.release();
      }
    }
  }

  /**
   * Checks if an invoice has been processed.
   *
   * Non-blocking check for quick validation before acquiring lock.
   *
   * @param invoiceId - Invoice ID to check
   * @returns Existing record if processed, null otherwise
   */
  async checkProcessed(invoiceId: string): Promise<IdempotencyRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM xendit_idempotency
       WHERE invoice_id = $1
       AND processing_result != 'PROCESSING'`,
      [invoiceId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToRecord(result.rows[0]);
  }

  /**
   * Checks if invoice is already processed and throws if so.
   *
   * Convenience method for quick validation with exception.
   *
   * @param invoiceId - Invoice ID to check
   * @throws IdempotencyViolationError if already processed
   */
  async ensureNotProcessed(invoiceId: string): Promise<void> {
    const existing = await this.checkProcessed(invoiceId);

    if (existing) {
      throw new IdempotencyViolationError(invoiceId, existing.id);
    }
  }

  /**
   * Records a webhook processing attempt for audit trail.
   *
   * Called for every webhook, regardless of whether processing occurs.
   * Useful for security auditing and debugging.
   *
   * @param context - Full processing context
   */
  async recordProcessingAttempt(context: WebhookProcessingContext): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO xendit_webhook_audit (
          id, webhook_id, invoice_id, contract_id,
          amount, paid_amount, paid_at,
          payment_method, payment_channel,
          raw_payload, signature, signature_verified,
          timestamp_validated, idempotency_checked,
          processing_result, error_message,
          blockchain_tx_hash, block_number,
          processing_started_at, processing_completed_at,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW()
        )`,
        [
          `audit-${context.webhookId}-${Date.now()}`,
          context.webhookId,
          context.invoiceId,
          context.contractId,
          context.amount,
          context.paidAmount,
          context.paidAt,
          context.paymentMethod,
          context.paymentChannel,
          context.rawPayload,
          context.signature,
          context.signatureVerified,
          context.timestampValidated,
          context.idempotencyChecked,
          context.processingResult,
          context.errorMessage || null,
          context.blockchainTxHash || null,
          context.blockNumber || null,
          context.processingStartedAt,
          context.processingCompletedAt || null,
        ]
      );

      this.logger.debug(`Recorded audit entry for webhook ${context.webhookId}`);
    } catch (error) {
      // Audit logging should not fail the main process
      this.logger.error(`Failed to record audit entry: ${error}`);
    }
  }

  /**
   * Gets processing history for an invoice.
   *
   * Useful for debugging and support investigations.
   *
   * @param invoiceId - Invoice ID
   * @returns All processing attempts for this invoice
   */
  async getProcessingHistory(invoiceId: string): Promise<WebhookProcessingContext[]> {
    const result = await this.pool.query(
      `SELECT * FROM xendit_webhook_audit
       WHERE invoice_id = $1
       ORDER BY created_at DESC`,
      [invoiceId]
    );

    return result.rows.map((row) => ({
      webhookId: row.webhook_id,
      invoiceId: row.invoice_id,
      externalId: row.external_id,
      contractId: row.contract_id,
      amount: parseFloat(row.amount),
      paidAmount: parseFloat(row.paid_amount),
      paidAt: row.paid_at,
      paymentMethod: row.payment_method,
      paymentChannel: row.payment_channel,
      rawPayload: row.raw_payload,
      signature: row.signature,
      signatureVerified: row.signature_verified,
      timestampValidated: row.timestamp_validated,
      idempotencyChecked: row.idempotency_checked,
      processingResult: row.processing_result,
      errorMessage: row.error_message,
      blockchainTxHash: row.blockchain_tx_hash,
      blockNumber: row.block_number,
      processingStartedAt: row.processing_started_at,
      processingCompletedAt: row.processing_completed_at,
    }));
  }

  /**
   * Cleans up stale processing locks.
   *
   * Handles cases where a process crashed during processing,
   * leaving locks in 'PROCESSING' state.
   *
   * @param maxAgeMinutes - Maximum age for PROCESSING records
   * @returns Number of cleaned up records
   */
  async cleanupStaleLocks(maxAgeMinutes: number = 30): Promise<number> {
    const result = await this.pool.query(
      `UPDATE xendit_idempotency
       SET processing_result = 'UNKNOWN_ERROR'
       WHERE processing_result = 'PROCESSING'
       AND created_at < NOW() - INTERVAL '${maxAgeMinutes} minutes'
       RETURNING id`,
      []
    );

    const cleanedCount = result.rowCount || 0;

    if (cleanedCount > 0) {
      this.logger.warn(`Cleaned up ${cleanedCount} stale processing locks`);
    }

    return cleanedCount;
  }

  /**
   * Gets statistics for monitoring and alerting.
   *
   * @param hours - Time window in hours
   * @returns Processing statistics
   */
  async getStatistics(hours: number = 24): Promise<{
    total: number;
    success: number;
    duplicates: number;
    failures: number;
    byResult: Record<string, number>;
  }> {
    const result = await this.pool.query(
      `SELECT processing_result, COUNT(*) as count
       FROM xendit_idempotency
       WHERE created_at > NOW() - INTERVAL '${hours} hours'
       GROUP BY processing_result`,
      []
    );

    const byResult: Record<string, number> = {};
    let total = 0;
    let success = 0;
    let duplicates = 0;
    let failures = 0;

    for (const row of result.rows) {
      const count = parseInt(row.count, 10);
      byResult[row.processing_result] = count;
      total += count;

      if (row.processing_result === 'SUCCESS') {
        success = count;
      } else if (row.processing_result === 'DUPLICATE') {
        duplicates = count;
      } else if (row.processing_result !== 'PROCESSING') {
        failures += count;
      }
    }

    return { total, success, duplicates, failures, byResult };
  }

  /**
   * Generates a numeric lock key from invoice ID.
   *
   * PostgreSQL advisory locks require bigint keys.
   *
   * @param invoiceId - Invoice ID string
   * @returns Numeric lock key
   */
  private generateLockKey(invoiceId: string): number {
    // Use a hash to generate consistent numeric key
    let hash = 0;
    for (let i = 0; i < invoiceId.length; i++) {
      const char = invoiceId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Ensure positive number within safe range
    return Math.abs(hash);
  }

  /**
   * Maps database row to IdempotencyRecord.
   */
  private mapToRecord(row: Record<string, unknown>): IdempotencyRecord {
    return {
      id: row.id as string,
      invoiceId: row.invoice_id as string,
      contractId: row.contract_id as string,
      webhookId: row.webhook_id as string,
      processingResult: row.processing_result as WebhookProcessingResult,
      blockchainTxHash: row.blockchain_tx_hash as string | undefined,
      processedAt: row.processed_at as Date,
      rawPayloadHash: row.raw_payload_hash as string,
      createdAt: row.created_at as Date,
    };
  }
}
