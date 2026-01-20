/**
 * AMANTRA - Xendit Invoice-Contract Mapper
 *
 * Maps Xendit invoices to AMANTRA contracts and provides
 * data transformation between Xendit API format and internal domain.
 *
 * External ID Format: AMANTRA-{contractId}
 * This format allows extraction of contractId from webhook payloads.
 *
 * @module payments/xendit
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { InjectPool } from '../../infrastructure/database/database.module';
import {
  QrisInvoice,
  QrisInvoiceStatus,
  XenditInvoiceResponse,
  XenditInvoiceStatus,
  XenditWebhookPayload,
} from './xendit.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * External ID prefix for AMANTRA invoices
 */
const EXTERNAL_ID_PREFIX = 'AMANTRA';

/**
 * External ID separator
 */
const EXTERNAL_ID_SEPARATOR = '-';

@Injectable()
export class XenditMapper {
  private readonly logger = new Logger(XenditMapper.name);

  constructor(@InjectPool() private readonly pool: Pool) {}

  // ============================================
  // External ID Handling
  // ============================================

  /**
   * Generates external_id for Xendit API.
   *
   * Format: AMANTRA-{contractId}
   *
   * @param contractId - AMANTRA contract ID
   * @returns Formatted external_id
   */
  generateExternalId(contractId: string): string {
    // Validate contractId format (should be UUID or bytes32)
    if (!contractId || contractId.length < 8) {
      throw new Error(`Invalid contractId: ${contractId}`);
    }

    return `${EXTERNAL_ID_PREFIX}${EXTERNAL_ID_SEPARATOR}${contractId}`;
  }

  /**
   * Extracts contractId from external_id.
   *
   * @param externalId - Xendit external_id
   * @returns Extracted contractId or null if invalid format
   */
  extractContractId(externalId: string): string | null {
    if (!externalId) {
      return null;
    }

    // Check prefix
    if (!externalId.startsWith(EXTERNAL_ID_PREFIX + EXTERNAL_ID_SEPARATOR)) {
      this.logger.warn(`Invalid external_id format: ${externalId}`);
      return null;
    }

    // Extract contractId
    const contractId = externalId.slice(
      EXTERNAL_ID_PREFIX.length + EXTERNAL_ID_SEPARATOR.length
    );

    if (!contractId || contractId.length < 8) {
      this.logger.warn(`Extracted contractId too short: ${contractId}`);
      return null;
    }

    return contractId;
  }

  /**
   * Validates if external_id belongs to AMANTRA.
   *
   * @param externalId - External ID to validate
   * @returns true if valid AMANTRA external_id
   */
  isAmantraExternalId(externalId: string): boolean {
    return (
      externalId &&
      externalId.startsWith(EXTERNAL_ID_PREFIX + EXTERNAL_ID_SEPARATOR)
    );
  }

  // ============================================
  // Status Mapping
  // ============================================

  /**
   * Maps Xendit status to internal QrisInvoiceStatus.
   *
   * @param xenditStatus - Xendit invoice status
   * @returns Internal status
   */
  mapXenditStatusToInternal(xenditStatus: XenditInvoiceStatus): QrisInvoiceStatus {
    switch (xenditStatus) {
      case XenditInvoiceStatus.PENDING:
        return QrisInvoiceStatus.PENDING;
      case XenditInvoiceStatus.PAID:
        return QrisInvoiceStatus.PAID;
      case XenditInvoiceStatus.SETTLED:
        return QrisInvoiceStatus.PAID; // Settled means paid in our context
      case XenditInvoiceStatus.EXPIRED:
        return QrisInvoiceStatus.EXPIRED;
      default:
        this.logger.warn(`Unknown Xendit status: ${xenditStatus}`);
        return QrisInvoiceStatus.PENDING;
    }
  }

  /**
   * Maps internal status to Xendit status for queries.
   *
   * @param internalStatus - Internal status
   * @returns Xendit status
   */
  mapInternalStatusToXendit(internalStatus: QrisInvoiceStatus): XenditInvoiceStatus {
    switch (internalStatus) {
      case QrisInvoiceStatus.CREATED:
      case QrisInvoiceStatus.PENDING:
        return XenditInvoiceStatus.PENDING;
      case QrisInvoiceStatus.PAID:
      case QrisInvoiceStatus.PROCESSING:
      case QrisInvoiceStatus.FUNDED:
        return XenditInvoiceStatus.PAID;
      case QrisInvoiceStatus.EXPIRED:
      case QrisInvoiceStatus.CANCELLED:
        return XenditInvoiceStatus.EXPIRED;
      default:
        return XenditInvoiceStatus.PENDING;
    }
  }

  // ============================================
  // Invoice Mapping
  // ============================================

  /**
   * Maps Xendit API response to internal QrisInvoice.
   *
   * @param response - Xendit invoice response
   * @param contractId - Associated contract ID
   * @returns Internal invoice representation
   */
  mapXenditResponseToInvoice(
    response: XenditInvoiceResponse,
    contractId: string
  ): QrisInvoice {
    // Extract QR string from available QRIS options
    const qrString = response.available_qr_codes?.find(
      (qr) => qr.qr_code_type === 'QRIS'
    )?.qr_string;

    return {
      id: uuidv4(),
      contractId,
      xenditInvoiceId: response.id,
      externalId: response.external_id,
      amount: response.amount,
      currency: response.currency,
      status: this.mapXenditStatusToInternal(response.status),
      invoiceUrl: response.invoice_url,
      qrString,
      expiryTime: new Date(response.expiry_date),
      paidAt: response.paid_at ? new Date(response.paid_at) : undefined,
      paidAmount: response.paid_amount,
      paymentMethod: response.payment_method,
      paymentChannel: response.payment_channel,
      createdAt: new Date(response.created),
      updatedAt: new Date(response.updated),
      version: 1,
    };
  }

  /**
   * Maps webhook payload to update data.
   *
   * @param payload - Xendit webhook payload
   * @returns Partial invoice update data
   */
  mapWebhookToInvoiceUpdate(
    payload: XenditWebhookPayload
  ): Partial<QrisInvoice> {
    return {
      status: this.mapXenditStatusToInternal(payload.status),
      paidAt: payload.paid_at ? new Date(payload.paid_at) : undefined,
      paidAmount: payload.paid_amount,
      paymentMethod: payload.payment_method,
      paymentChannel: payload.payment_channel,
      updatedAt: new Date(),
    };
  }

  // ============================================
  // Database Operations
  // ============================================

  /**
   * Saves a new QRIS invoice to database.
   *
   * @param invoice - Invoice to save
   * @param client - Optional DB client for transaction
   */
  async saveInvoice(invoice: QrisInvoice, client?: PoolClient): Promise<void> {
    const dbClient = client || (await this.pool.connect());
    const shouldRelease = !client;

    try {
      await dbClient.query(
        `INSERT INTO qris_invoices (
          id, contract_id, xendit_invoice_id, external_id,
          amount, currency, status, invoice_url, qr_string,
          expiry_time, paid_at, paid_amount,
          payment_method, payment_channel,
          blockchain_tx_hash, block_number, onchain_timestamp,
          created_at, updated_at, version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )`,
        [
          invoice.id,
          invoice.contractId,
          invoice.xenditInvoiceId,
          invoice.externalId,
          invoice.amount,
          invoice.currency,
          invoice.status,
          invoice.invoiceUrl,
          invoice.qrString || null,
          invoice.expiryTime,
          invoice.paidAt || null,
          invoice.paidAmount || null,
          invoice.paymentMethod || null,
          invoice.paymentChannel || null,
          invoice.blockchainTxHash || null,
          invoice.blockNumber || null,
          invoice.onChainTimestamp || null,
          invoice.createdAt,
          invoice.updatedAt,
          invoice.version,
        ]
      );

      this.logger.debug(`Saved invoice ${invoice.id} for contract ${invoice.contractId}`);
    } finally {
      if (shouldRelease) {
        dbClient.release();
      }
    }
  }

  /**
   * Updates invoice with payment and blockchain data.
   *
   * Uses optimistic locking to prevent concurrent updates.
   *
   * @param invoiceId - Invoice ID
   * @param updates - Fields to update
   * @param expectedVersion - Expected version for optimistic locking
   * @param client - Optional DB client for transaction
   * @returns true if update succeeded
   */
  async updateInvoice(
    invoiceId: string,
    updates: Partial<QrisInvoice>,
    expectedVersion: number,
    client?: PoolClient
  ): Promise<boolean> {
    const dbClient = client || (await this.pool.connect());
    const shouldRelease = !client;

    try {
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      // Build dynamic SET clause
      const updateFields: (keyof QrisInvoice)[] = [
        'status',
        'paidAt',
        'paidAmount',
        'paymentMethod',
        'paymentChannel',
        'blockchainTxHash',
        'blockNumber',
        'onChainTimestamp',
      ];

      for (const field of updateFields) {
        if (updates[field] !== undefined) {
          const dbField = this.camelToSnake(field);
          setClauses.push(`${dbField} = $${paramIndex}`);
          values.push(updates[field]);
          paramIndex++;
        }
      }

      // Always update timestamp and version
      setClauses.push(`updated_at = $${paramIndex}`);
      values.push(new Date());
      paramIndex++;

      setClauses.push(`version = version + 1`);

      // Add WHERE conditions
      values.push(invoiceId);
      values.push(expectedVersion);

      const query = `
        UPDATE qris_invoices
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        AND version = $${paramIndex + 1}
        RETURNING version
      `;

      const result = await dbClient.query(query, values);

      if (result.rowCount === 0) {
        this.logger.warn(
          `Version mismatch updating invoice ${invoiceId}: expected ${expectedVersion}`
        );
        return false;
      }

      this.logger.debug(`Updated invoice ${invoiceId} to version ${result.rows[0].version}`);
      return true;
    } finally {
      if (shouldRelease) {
        dbClient.release();
      }
    }
  }

  /**
   * Finds invoice by Xendit invoice ID.
   *
   * @param xenditInvoiceId - Xendit's invoice ID
   * @returns Invoice or null if not found
   */
  async findByXenditInvoiceId(xenditInvoiceId: string): Promise<QrisInvoice | null> {
    const result = await this.pool.query(
      `SELECT * FROM qris_invoices WHERE xendit_invoice_id = $1`,
      [xenditInvoiceId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToInvoice(result.rows[0]);
  }

  /**
   * Finds invoice by contract ID.
   *
   * @param contractId - AMANTRA contract ID
   * @returns Invoice or null if not found
   */
  async findByContractId(contractId: string): Promise<QrisInvoice | null> {
    const result = await this.pool.query(
      `SELECT * FROM qris_invoices WHERE contract_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [contractId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToInvoice(result.rows[0]);
  }

  /**
   * Finds invoice by external ID.
   *
   * @param externalId - Xendit external_id
   * @returns Invoice or null if not found
   */
  async findByExternalId(externalId: string): Promise<QrisInvoice | null> {
    const result = await this.pool.query(
      `SELECT * FROM qris_invoices WHERE external_id = $1`,
      [externalId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToInvoice(result.rows[0]);
  }

  /**
   * Gets invoice with row lock for update.
   *
   * @param invoiceId - Invoice ID
   * @param client - DB client (required for transaction context)
   * @returns Invoice with lock or null
   */
  async findForUpdate(
    invoiceId: string,
    client: PoolClient
  ): Promise<QrisInvoice | null> {
    const result = await client.query(
      `SELECT * FROM qris_invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToInvoice(result.rows[0]);
  }

  /**
   * Finds invoices by status for reconciliation.
   *
   * @param status - Invoice status to find
   * @param limit - Maximum number of records
   * @returns Array of invoices
   */
  async findByStatus(status: QrisInvoiceStatus, limit: number = 100): Promise<QrisInvoice[]> {
    const result = await this.pool.query(
      `SELECT * FROM qris_invoices WHERE status = $1 ORDER BY created_at ASC LIMIT $2`,
      [status, limit]
    );

    return result.rows.map((row) => this.mapRowToInvoice(row));
  }

  /**
   * Finds invoices pending blockchain confirmation.
   *
   * @param limit - Maximum number of records
   * @returns Array of invoices needing chain confirmation
   */
  async findPendingChainConfirmation(limit: number = 100): Promise<QrisInvoice[]> {
    const result = await this.pool.query(
      `SELECT * FROM qris_invoices
       WHERE status = 'PAID' OR status = 'PROCESSING'
       AND blockchain_tx_hash IS NULL
       ORDER BY paid_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => this.mapRowToInvoice(row));
  }

  /**
   * Finds invoices for reconciliation within date range.
   *
   * @param startDate - Start of period
   * @param endDate - End of period
   * @returns Array of invoices in period
   */
  async findForReconciliation(startDate: Date, endDate: Date): Promise<QrisInvoice[]> {
    const result = await this.pool.query(
      `SELECT * FROM qris_invoices
       WHERE created_at >= $1 AND created_at <= $2
       AND status IN ('PAID', 'PROCESSING', 'FUNDED')
       ORDER BY created_at ASC`,
      [startDate, endDate]
    );

    return result.rows.map((row) => this.mapRowToInvoice(row));
  }

  // ============================================
  // Contract Validation
  // ============================================

  /**
   * Gets contract details for validation.
   *
   * @param contractId - Contract ID
   * @returns Contract data or null if not found
   */
  async getContractForValidation(contractId: string): Promise<{
    id: string;
    status: string;
    totalAmount: number;
    escrowAccountId?: string;
  } | null> {
    const result = await this.pool.query(
      `SELECT id, status, total_amount, escrow_account_id
       FROM contracts WHERE id = $1`,
      [contractId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      status: row.status,
      totalAmount: parseFloat(row.total_amount),
      escrowAccountId: row.escrow_account_id,
    };
  }

  /**
   * Validates that contract is in CREATED status and amount matches.
   *
   * @param contractId - Contract ID to validate
   * @param amount - Expected payment amount
   * @returns Validation result
   */
  async validateContractForPayment(
    contractId: string,
    amount: number
  ): Promise<{
    valid: boolean;
    reason?: string;
    contract?: {
      id: string;
      status: string;
      totalAmount: number;
      escrowAccountId?: string;
    };
  }> {
    const contract = await this.getContractForValidation(contractId);

    if (!contract) {
      return {
        valid: false,
        reason: `Contract not found: ${contractId}`,
      };
    }

    if (contract.status !== 'CREATED') {
      return {
        valid: false,
        reason: `Invalid contract status: ${contract.status} (expected CREATED)`,
        contract,
      };
    }

    if (contract.totalAmount !== amount) {
      return {
        valid: false,
        reason: `Amount mismatch: expected ${contract.totalAmount}, got ${amount}`,
        contract,
      };
    }

    return {
      valid: true,
      contract,
    };
  }

  // ============================================
  // Helpers
  // ============================================

  /**
   * Maps database row to QrisInvoice.
   */
  private mapRowToInvoice(row: Record<string, unknown>): QrisInvoice {
    return {
      id: row.id as string,
      contractId: row.contract_id as string,
      xenditInvoiceId: row.xendit_invoice_id as string,
      externalId: row.external_id as string,
      amount: parseFloat(row.amount as string),
      currency: row.currency as string,
      status: row.status as QrisInvoiceStatus,
      invoiceUrl: row.invoice_url as string,
      qrString: row.qr_string as string | undefined,
      expiryTime: row.expiry_time as Date,
      paidAt: row.paid_at as Date | undefined,
      paidAmount: row.paid_amount ? parseFloat(row.paid_amount as string) : undefined,
      paymentMethod: row.payment_method as string | undefined,
      paymentChannel: row.payment_channel as string | undefined,
      blockchainTxHash: row.blockchain_tx_hash as string | undefined,
      blockNumber: row.block_number as number | undefined,
      onChainTimestamp: row.onchain_timestamp as Date | undefined,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
      version: parseInt(row.version as string, 10),
    };
  }

  /**
   * Converts camelCase to snake_case.
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
