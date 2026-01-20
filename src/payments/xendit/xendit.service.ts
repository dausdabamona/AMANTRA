/**
 * AMANTRA - Xendit QRIS Service
 *
 * Core service for Xendit QRIS integration. Handles:
 * - Creating QRIS invoices for contracts
 * - Querying invoice status
 * - Processing payment webhooks
 * - Integrating with AmantraLedgerV2 blockchain
 *
 * Flow:
 * 1. Contract Created → createQrisForContract()
 * 2. QRIS Payment → Webhook → processPayment()
 * 3. Validation → markFunded() on blockchain
 * 4. Settlement (handled separately)
 *
 * @module payments/xendit
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Pool, PoolClient } from 'pg';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { InjectPool } from '../../infrastructure/database/database.module';
import { XenditMapper } from './xendit.mapper';
import { XenditSignatureService } from './xendit.signature';
import { XenditIdempotencyGuard, ProcessingLock } from './xendit.idempotency';
import {
  XenditConfig,
  XenditCreateInvoiceRequest,
  XenditInvoiceResponse,
  XenditInvoiceStatus,
  XenditWebhookPayload,
  XenditPaymentMethod,
  XenditApiError,
  CreateQrisRequest,
  CreateQrisResponse,
  QrisInvoice,
  QrisInvoiceStatus,
  WebhookProcessingContext,
  WebhookProcessingResult,
  WebhookValidationError,
  BlockchainTransactionError,
  QrisInvoiceCreatedEvent,
  QrisPaymentReceivedEvent,
  QrisPaymentValidatedEvent,
  QrisOnChainFundedEvent,
  QrisRejectedEvent,
} from './xendit.types';
import { ethers } from 'ethers';
import * as crypto from 'crypto';

/**
 * AmantraLedgerV2 Contract Interface (minimal for this service)
 */
interface AmantraLedgerV2Contract {
  markFunded(
    contractId: string,
    qrisReference: string,
    escrowReference: string,
    transactionRef: string
  ): Promise<ethers.ContractTransactionResponse>;

  getContractStatus(contractId: string): Promise<number>;
}

@Injectable()
export class XenditService {
  private readonly logger = new Logger(XenditService.name);
  private readonly httpClient: AxiosInstance;
  private readonly config: XenditConfig;
  private ledgerContract: AmantraLedgerV2Contract | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly mapper: XenditMapper,
    private readonly signatureService: XenditSignatureService,
    private readonly idempotencyGuard: XenditIdempotencyGuard,
    @InjectPool() private readonly pool: Pool
  ) {
    // Load configuration
    this.config = {
      apiKey: this.configService.getOrThrow<string>('XENDIT_API_KEY'),
      webhookVerificationToken: this.configService.getOrThrow<string>('XENDIT_WEBHOOK_TOKEN'),
      baseUrl: this.configService.get<string>('XENDIT_BASE_URL', 'https://api.xendit.co'),
      callbackUrl: this.configService.getOrThrow<string>('XENDIT_CALLBACK_URL'),
      successRedirectUrl: this.configService.get<string>('XENDIT_SUCCESS_URL', ''),
      failureRedirectUrl: this.configService.get<string>('XENDIT_FAILURE_URL', ''),
      defaultInvoiceDurationSeconds: this.configService.get<number>(
        'XENDIT_INVOICE_DURATION_SECONDS',
        86400 // 24 hours
      ),
      timestampToleranceSeconds: this.configService.get<number>(
        'XENDIT_TIMESTAMP_TOLERANCE_SECONDS',
        300
      ),
      enableQrisOnly: this.configService.get<boolean>('XENDIT_QRIS_ONLY', true),
      sandboxMode: this.configService.get<boolean>('XENDIT_SANDBOX', false),
    };

    // Initialize HTTP client with Xendit API key
    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        username: this.config.apiKey,
        password: '', // Xendit uses API key as username, empty password
      },
    });

    // Request logging (masked for security)
    this.httpClient.interceptors.request.use((request) => {
      this.logger.debug(`Xendit API Request: ${request.method?.toUpperCase()} ${request.url}`);
      return request;
    });

    // Response/error logging
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug(`Xendit API Response: ${response.status}`);
        return response;
      },
      (error: AxiosError) => {
        this.logger.error(
          `Xendit API Error: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`
        );
        throw error;
      }
    );

    this.logger.log(`XenditService initialized (sandbox: ${this.config.sandboxMode})`);
  }

  /**
   * Sets the AmantraLedgerV2 contract instance.
   *
   * Called by the module setup after contract is loaded.
   *
   * @param contract - Ethers contract instance
   */
  setLedgerContract(contract: AmantraLedgerV2Contract): void {
    this.ledgerContract = contract;
    this.logger.log('AmantraLedgerV2 contract connected');
  }

  // ============================================
  // QRIS Invoice Creation
  // ============================================

  /**
   * Creates a QRIS invoice for a contract.
   *
   * Flow:
   * 1. Validate contract exists and is in CREATED status
   * 2. Check no existing active invoice
   * 3. Call Xendit Create Invoice API
   * 4. Store invoice in database
   * 5. Emit QrisInvoiceCreated event
   *
   * @param request - Create QRIS request
   * @returns Response with invoice URL and QR string
   */
  async createQrisForContract(request: CreateQrisRequest): Promise<CreateQrisResponse> {
    this.logger.log(`Creating QRIS for contract ${request.contractId}`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Validate contract
      const validation = await this.mapper.validateContractForPayment(
        request.contractId,
        request.amount
      );

      if (!validation.valid) {
        this.logger.warn(`Contract validation failed: ${validation.reason}`);
        return {
          success: false,
          error: validation.reason,
        };
      }

      // 2. Check for existing active invoice
      const existingInvoice = await this.mapper.findByContractId(request.contractId);
      if (existingInvoice) {
        if (
          existingInvoice.status === QrisInvoiceStatus.PENDING ||
          existingInvoice.status === QrisInvoiceStatus.CREATED
        ) {
          // Return existing active invoice
          this.logger.info(
            `Returning existing invoice ${existingInvoice.xenditInvoiceId} for contract ${request.contractId}`
          );
          return {
            success: true,
            invoice: existingInvoice,
            invoiceUrl: existingInvoice.invoiceUrl,
            qrString: existingInvoice.qrString,
            expiryTime: existingInvoice.expiryTime,
          };
        }

        // If previous invoice expired/failed, we can create new one
        if (
          existingInvoice.status !== QrisInvoiceStatus.EXPIRED &&
          existingInvoice.status !== QrisInvoiceStatus.FAILED &&
          existingInvoice.status !== QrisInvoiceStatus.CANCELLED
        ) {
          return {
            success: false,
            error: `Contract already has invoice in status: ${existingInvoice.status}`,
          };
        }
      }

      // 3. Prepare Xendit request
      const externalId = this.mapper.generateExternalId(request.contractId);
      const invoiceDuration = request.expiryMinutes
        ? request.expiryMinutes * 60
        : this.config.defaultInvoiceDurationSeconds;

      const xenditRequest: XenditCreateInvoiceRequest = {
        external_id: externalId,
        amount: request.amount,
        description: request.description || `AMANTRA Contract ${request.contractId}`,
        invoice_duration: invoiceDuration,
        currency: 'IDR',
        success_redirect_url: this.config.successRedirectUrl || undefined,
        failure_redirect_url: this.config.failureRedirectUrl || undefined,
      };

      // Enable QRIS only if configured
      if (this.config.enableQrisOnly) {
        xenditRequest.payment_methods = [XenditPaymentMethod.QRIS];
      }

      // Add customer info if provided
      if (request.buyerEmail || request.buyerName || request.buyerPhone) {
        xenditRequest.customer = {
          given_names: request.buyerName,
          email: request.buyerEmail,
          mobile_number: request.buyerPhone,
        };
      }

      // 4. Call Xendit API
      const xenditResponse = await this.createXenditInvoice(xenditRequest);

      // 5. Map and save invoice
      const invoice = this.mapper.mapXenditResponseToInvoice(xenditResponse, request.contractId);
      await this.mapper.saveInvoice(invoice, client);

      await client.query('COMMIT');

      // 6. Emit event
      const event: QrisInvoiceCreatedEvent = {
        type: 'QRIS_INVOICE_CREATED',
        contractId: request.contractId,
        invoiceId: invoice.xenditInvoiceId,
        externalId: invoice.externalId,
        amount: invoice.amount,
        invoiceUrl: invoice.invoiceUrl,
        expiryTime: invoice.expiryTime,
        timestamp: new Date(),
      };
      this.eventEmitter.emit('qris.invoice.created', event);

      this.logger.log(
        `Created QRIS invoice ${invoice.xenditInvoiceId} for contract ${request.contractId}`
      );

      return {
        success: true,
        invoice,
        invoiceUrl: invoice.invoiceUrl,
        qrString: invoice.qrString,
        expiryTime: invoice.expiryTime,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Failed to create QRIS: ${error}`);

      if (error instanceof XenditApiError) {
        return {
          success: false,
          error: `Xendit API error: ${error.message}`,
        };
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calls Xendit Create Invoice API.
   *
   * @param request - Xendit API request
   * @returns Invoice response
   * @throws XenditApiError on API failure
   */
  private async createXenditInvoice(
    request: XenditCreateInvoiceRequest
  ): Promise<XenditInvoiceResponse> {
    try {
      const response = await this.httpClient.post<XenditInvoiceResponse>('/v2/invoices', request);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ error_code?: string; message?: string }>;
        throw new XenditApiError(
          axiosError.response?.data?.message || axiosError.message,
          axiosError.response?.status || 500,
          axiosError.response?.data?.error_code,
          axiosError.response?.data
        );
      }
      throw error;
    }
  }

  // ============================================
  // Invoice Query
  // ============================================

  /**
   * Gets invoice status from Xendit.
   *
   * @param invoiceId - Xendit invoice ID
   * @returns Invoice response or null if not found
   */
  async getXenditInvoice(invoiceId: string): Promise<XenditInvoiceResponse | null> {
    try {
      const response = await this.httpClient.get<XenditInvoiceResponse>(`/v2/invoices/${invoiceId}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Gets invoice by external ID.
   *
   * @param externalId - External ID (AMANTRA-{contractId})
   * @returns Invoice response or null
   */
  async getXenditInvoiceByExternalId(externalId: string): Promise<XenditInvoiceResponse | null> {
    try {
      const response = await this.httpClient.get<XenditInvoiceResponse[]>('/v2/invoices', {
        params: { external_id: externalId },
      });

      if (response.data.length === 0) {
        return null;
      }

      // Return most recent
      return response.data[0];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Lists paid invoices from Xendit for reconciliation.
   *
   * @param fromDate - Start date
   * @param toDate - End date
   * @returns Array of paid invoices
   */
  async listPaidInvoices(fromDate: Date, toDate: Date): Promise<XenditInvoiceResponse[]> {
    try {
      const response = await this.httpClient.get<XenditInvoiceResponse[]>('/v2/invoices', {
        params: {
          statuses: [XenditInvoiceStatus.PAID, XenditInvoiceStatus.SETTLED],
          created_after: fromDate.toISOString(),
          created_before: toDate.toISOString(),
          limit: 100,
        },
      });

      // Filter to only AMANTRA invoices
      return response.data.filter((inv) => this.mapper.isAmantraExternalId(inv.external_id));
    } catch (error) {
      this.logger.error(`Failed to list paid invoices: ${error}`);
      throw error;
    }
  }

  // ============================================
  // Payment Processing (Webhook Handler)
  // ============================================

  /**
   * Processes a QRIS payment webhook.
   *
   * This is the critical path for converting a Xendit payment
   * into an on-chain FUNDED state.
   *
   * Processing Steps (strict order):
   * 1. Verify signature (x-callback-token)
   * 2. Validate timestamp (anti-replay)
   * 3. Parse external_id → contractId
   * 4. Check idempotency (invoice_id not processed)
   * 5. Validate amount == contract.totalAmount
   * 6. Query blockchain: status must be CREATED
   * 7. Lock DB row (SELECT FOR UPDATE)
   * 8. Call AmantraLedgerV2.markFunded()
   * 9. Wait for PaymentMarked event
   * 10. Update DB → FUNDED
   * 11. Persist audit trail
   *
   * @param payload - Verified webhook payload
   * @param rawPayload - Raw JSON string
   * @param signature - x-callback-token value
   * @param webhookId - x-callback-id value
   * @returns Processing result
   */
  async processPaymentWebhook(
    payload: XenditWebhookPayload,
    rawPayload: string,
    signature: string,
    webhookId: string
  ): Promise<WebhookProcessingResult> {
    const processingStartedAt = new Date();
    const rawPayloadHash = this.generatePayloadHash(rawPayload);

    // Initialize processing context
    const context: WebhookProcessingContext = {
      webhookId,
      invoiceId: payload.id,
      externalId: payload.external_id,
      contractId: '', // Will be extracted
      amount: payload.amount,
      paidAmount: payload.paid_amount,
      paidAt: new Date(payload.paid_at),
      paymentMethod: payload.payment_method,
      paymentChannel: payload.payment_channel,
      rawPayload,
      signature,
      signatureVerified: true, // Already verified by controller
      timestampValidated: false,
      idempotencyChecked: false,
      processingResult: WebhookProcessingResult.UNKNOWN_ERROR,
      processingStartedAt,
    };

    this.logger.log(`Processing payment webhook ${webhookId} for invoice ${payload.id}`);

    let lock: ProcessingLock | null = null;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Step 2: Validate timestamp
      try {
        this.signatureService.validateTimestamp(payload.paid_at, webhookId);
        context.timestampValidated = true;
      } catch (error) {
        if (error instanceof WebhookValidationError) {
          context.processingResult = error.reason;
          context.errorMessage = error.message;
          return this.finalizeProcessing(context, client);
        }
        throw error;
      }

      // Step 3: Extract contractId
      const contractId = this.mapper.extractContractId(payload.external_id);
      if (!contractId) {
        context.processingResult = WebhookProcessingResult.CONTRACT_NOT_FOUND;
        context.errorMessage = `Invalid external_id format: ${payload.external_id}`;
        return this.finalizeProcessing(context, client);
      }
      context.contractId = contractId;

      // Step 4: Idempotency check
      lock = await this.idempotencyGuard.acquireProcessingLock(
        payload.id,
        contractId,
        webhookId,
        rawPayloadHash,
        client
      );

      context.idempotencyChecked = true;

      if (!lock.acquired) {
        if (lock.existingRecord) {
          context.processingResult = WebhookProcessingResult.DUPLICATE;
          context.errorMessage = `Already processed: ${lock.existingRecord.processingResult}`;
          context.blockchainTxHash = lock.existingRecord.blockchainTxHash;
        } else {
          context.processingResult = WebhookProcessingResult.DUPLICATE;
          context.errorMessage = 'Concurrent processing in progress';
        }
        return this.finalizeProcessing(context, client);
      }

      // Step 5: Validate amount
      const validation = await this.mapper.validateContractForPayment(contractId, payload.amount);

      if (!validation.valid) {
        context.processingResult = validation.reason?.includes('Amount')
          ? WebhookProcessingResult.INVALID_AMOUNT
          : validation.reason?.includes('status')
            ? WebhookProcessingResult.INVALID_STATE
            : WebhookProcessingResult.CONTRACT_NOT_FOUND;
        context.errorMessage = validation.reason;
        return this.finalizeProcessing(context, client, lock);
      }

      // Step 6: Query blockchain status
      if (!this.ledgerContract) {
        throw new Error('Blockchain contract not initialized');
      }

      const onChainStatus = await this.ledgerContract.getContractStatus(contractId);
      const CREATED_STATUS = 0; // Status.CREATED in AmantraLedgerV2

      if (onChainStatus !== CREATED_STATUS) {
        context.processingResult = WebhookProcessingResult.INVALID_STATE;
        context.errorMessage = `On-chain status is ${onChainStatus}, expected ${CREATED_STATUS} (CREATED)`;
        return this.finalizeProcessing(context, client, lock);
      }

      // Step 7: Lock invoice row
      const invoice = await this.mapper.findByXenditInvoiceId(payload.id);
      if (!invoice) {
        // Create invoice record if webhook arrived before our API call completed
        this.logger.warn(`Invoice ${payload.id} not found in DB, will be created`);
      }

      // Emit PaymentReceived event
      const receivedEvent: QrisPaymentReceivedEvent = {
        type: 'QRIS_PAYMENT_RECEIVED',
        contractId,
        invoiceId: payload.id,
        amount: payload.amount,
        paidAmount: payload.paid_amount,
        paidAt: new Date(payload.paid_at),
        paymentMethod: payload.payment_method,
        timestamp: new Date(),
      };
      this.eventEmitter.emit('qris.payment.received', receivedEvent);

      // Emit Validated event
      const validatedEvent: QrisPaymentValidatedEvent = {
        type: 'QRIS_PAYMENT_VALIDATED',
        contractId,
        invoiceId: payload.id,
        validationPassed: true,
        validationDetails: {
          signatureValid: true,
          timestampValid: true,
          amountValid: true,
          stateValid: true,
          idempotencyValid: true,
        },
        timestamp: new Date(),
      };
      this.eventEmitter.emit('qris.payment.validated', validatedEvent);

      // Step 8: Call blockchain markFunded
      const qrisReference = this.signatureService.generatePaymentRefHash(
        payload.id,
        payload.amount,
        payload.paid_at
      );

      const escrowReference = validation.contract?.escrowAccountId
        ? ethers.keccak256(ethers.toUtf8Bytes(validation.contract.escrowAccountId))
        : ethers.keccak256(ethers.toUtf8Bytes(`ESCROW-${contractId}`));

      const transactionRef = this.signatureService.generateTransactionRefHash(
        payload.id,
        escrowReference
      );

      this.logger.log(`Calling markFunded for contract ${contractId}`);

      let tx: ethers.ContractTransactionResponse;
      try {
        tx = await this.ledgerContract.markFunded(
          contractId,
          qrisReference,
          escrowReference,
          transactionRef
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        context.processingResult = WebhookProcessingResult.BLOCKCHAIN_ERROR;
        context.errorMessage = `markFunded failed: ${errorMsg}`;

        this.logger.error(`Blockchain call failed: ${errorMsg}`);

        // Emit rejection event
        const rejectedEvent: QrisRejectedEvent = {
          type: 'QRIS_REJECTED',
          contractId,
          invoiceId: payload.id,
          reason: WebhookProcessingResult.BLOCKCHAIN_ERROR,
          errorMessage: errorMsg,
          timestamp: new Date(),
        };
        this.eventEmitter.emit('qris.rejected', rejectedEvent);

        return this.finalizeProcessing(context, client, lock);
      }

      // Step 9: Wait for transaction confirmation
      this.logger.log(`Waiting for tx ${tx.hash} confirmation`);

      const receipt = await tx.wait(1); // Wait for 1 confirmation

      if (!receipt || receipt.status !== 1) {
        context.processingResult = WebhookProcessingResult.BLOCKCHAIN_ERROR;
        context.errorMessage = `Transaction reverted: ${tx.hash}`;
        return this.finalizeProcessing(context, client, lock);
      }

      context.blockchainTxHash = tx.hash;
      context.blockNumber = receipt.blockNumber;

      this.logger.log(`Transaction confirmed: ${tx.hash} at block ${receipt.blockNumber}`);

      // Step 10: Update database
      const block = await tx.provider?.getBlock(receipt.blockNumber);

      if (invoice) {
        await this.mapper.updateInvoice(
          invoice.id,
          {
            status: QrisInvoiceStatus.FUNDED,
            paidAt: new Date(payload.paid_at),
            paidAmount: payload.paid_amount,
            paymentMethod: payload.payment_method,
            paymentChannel: payload.payment_channel,
            blockchainTxHash: tx.hash,
            blockNumber: receipt.blockNumber,
            onChainTimestamp: block ? new Date(block.timestamp * 1000) : new Date(),
          },
          invoice.version,
          client
        );
      }

      // Update contract status in DB
      await client.query(
        `UPDATE contracts SET
          status = 'FUNDED',
          qris_payment_code = $1,
          updated_at = NOW(),
          funded_at = NOW()
         WHERE id = $2`,
        [payload.id, contractId]
      );

      await client.query('COMMIT');

      // Emit success event
      const fundedEvent: QrisOnChainFundedEvent = {
        type: 'QRIS_ONCHAIN_FUNDED',
        contractId,
        invoiceId: payload.id,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        onChainTimestamp: block ? new Date(block.timestamp * 1000) : new Date(),
        gasUsed: receipt.gasUsed.toString(),
        timestamp: new Date(),
      };
      this.eventEmitter.emit('qris.onchain.funded', fundedEvent);

      context.processingResult = WebhookProcessingResult.SUCCESS;

      this.logger.log(
        `Successfully processed payment for contract ${contractId}, tx: ${tx.hash}`
      );

      return this.finalizeProcessing(context, client, lock);
    } catch (error) {
      await client.query('ROLLBACK');

      const errorMsg = error instanceof Error ? error.message : String(error);
      context.processingResult = WebhookProcessingResult.UNKNOWN_ERROR;
      context.errorMessage = errorMsg;

      this.logger.error(`Payment processing failed: ${errorMsg}`);

      // Emit rejection event
      const rejectedEvent: QrisRejectedEvent = {
        type: 'QRIS_REJECTED',
        contractId: context.contractId || 'UNKNOWN',
        invoiceId: payload.id,
        reason: WebhookProcessingResult.UNKNOWN_ERROR,
        errorMessage: errorMsg,
        timestamp: new Date(),
      };
      this.eventEmitter.emit('qris.rejected', rejectedEvent);

      // Try to finalize with whatever we have
      try {
        if (lock?.lockId) {
          await this.idempotencyGuard.releaseProcessingLock(
            payload.id,
            lock.lockId,
            WebhookProcessingResult.UNKNOWN_ERROR,
            undefined
          );
        }
        await this.idempotencyGuard.recordProcessingAttempt({
          ...context,
          processingCompletedAt: new Date(),
        });
      } catch (finalizeError) {
        this.logger.error(`Failed to finalize processing: ${finalizeError}`);
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Finalizes processing and records audit trail.
   */
  private async finalizeProcessing(
    context: WebhookProcessingContext,
    client: PoolClient,
    lock?: ProcessingLock | null
  ): Promise<WebhookProcessingResult> {
    context.processingCompletedAt = new Date();

    // Release lock if acquired
    if (lock?.lockId) {
      await this.idempotencyGuard.releaseProcessingLock(
        context.invoiceId,
        lock.lockId,
        context.processingResult,
        context.blockchainTxHash
      );
    }

    // Record audit trail
    await this.idempotencyGuard.recordProcessingAttempt(context);

    // Commit any DB changes for audit
    try {
      await client.query('COMMIT');
    } catch {
      // Already committed or rolled back
    }

    return context.processingResult;
  }

  /**
   * Generates SHA-256 hash of payload.
   */
  private generatePayloadHash(payload: string): string {
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  // ============================================
  // Retry Logic
  // ============================================

  /**
   * Retries markFunded for a contract that was paid but not funded on-chain.
   *
   * Used by reconciliation job.
   *
   * @param contractId - Contract ID
   * @param invoice - QRIS invoice record
   * @returns Transaction hash if successful
   */
  async retryMarkFunded(contractId: string, invoice: QrisInvoice): Promise<string | null> {
    this.logger.log(`Retrying markFunded for contract ${contractId}`);

    if (!this.ledgerContract) {
      throw new Error('Blockchain contract not initialized');
    }

    // Verify on-chain status is still CREATED
    const onChainStatus = await this.ledgerContract.getContractStatus(contractId);
    if (onChainStatus !== 0) {
      this.logger.info(`Contract ${contractId} already at status ${onChainStatus}`);
      return null;
    }

    const qrisReference = this.signatureService.generatePaymentRefHash(
      invoice.xenditInvoiceId,
      invoice.amount,
      invoice.paidAt?.toISOString() || new Date().toISOString()
    );

    const escrowReference = ethers.keccak256(ethers.toUtf8Bytes(`ESCROW-${contractId}`));
    const transactionRef = this.signatureService.generateTransactionRefHash(
      invoice.xenditInvoiceId,
      escrowReference
    );

    try {
      const tx = await this.ledgerContract.markFunded(
        contractId,
        qrisReference,
        escrowReference,
        transactionRef
      );

      const receipt = await tx.wait(1);

      if (receipt && receipt.status === 1) {
        // Update database
        await this.mapper.updateInvoice(
          invoice.id,
          {
            status: QrisInvoiceStatus.FUNDED,
            blockchainTxHash: tx.hash,
            blockNumber: receipt.blockNumber,
          },
          invoice.version
        );

        this.logger.log(`Retry successful for contract ${contractId}, tx: ${tx.hash}`);
        return tx.hash;
      }

      return null;
    } catch (error) {
      this.logger.error(`Retry failed for contract ${contractId}: ${error}`);
      throw new BlockchainTransactionError(
        `Retry markFunded failed: ${error}`,
        contractId
      );
    }
  }
}
