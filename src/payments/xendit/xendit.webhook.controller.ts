/**
 * AMANTRA - Xendit Webhook Controller
 *
 * Handles incoming webhooks from Xendit for QRIS payments.
 * Implements strict security validation before any processing.
 *
 * Security Layers:
 * 1. Signature verification (x-callback-token)
 * 2. Timestamp validation (anti-replay)
 * 3. Idempotency enforcement
 * 4. Rate limiting (applied by middleware)
 *
 * @module payments/xendit
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  RawBodyRequest,
  Req,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { XenditService } from './xendit.service';
import { XenditSignatureService } from './xendit.signature';
import { XenditMapper } from './xendit.mapper';
import {
  XenditWebhookPayload,
  XenditInvoiceStatus,
  WebhookProcessingResult,
} from './xendit.types';

/**
 * Webhook Response DTO
 */
interface WebhookResponse {
  success: boolean;
  message: string;
  webhookId?: string;
  result?: WebhookProcessingResult;
}

/**
 * Custom guard to validate webhook comes from Xendit
 * Validates x-callback-token header before controller method execution
 */
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class XenditWebhookGuard implements CanActivate {
  private readonly logger = new Logger(XenditWebhookGuard.name);

  constructor(private readonly signatureService: XenditSignatureService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();

    const callbackToken = request.headers['x-callback-token'] as string | undefined;
    const webhookId = (request.headers['x-callback-id'] as string) || 'unknown';

    // Get raw body for signature verification
    const rawBody = request.rawBody?.toString('utf8');

    if (!rawBody) {
      this.logger.warn(`Webhook ${webhookId}: No raw body available`);
      throw new HttpException(
        { success: false, message: 'Raw body required' },
        HttpStatus.BAD_REQUEST
      );
    }

    // Verify signature
    const verification = this.signatureService.verifyCallbackToken(
      callbackToken,
      rawBody,
      webhookId
    );

    if (!verification.isValid) {
      this.logger.warn(
        `Webhook ${webhookId}: Signature verification failed - ${verification.reason}`
      );
      throw new HttpException(
        { success: false, message: 'Invalid signature' },
        HttpStatus.UNAUTHORIZED
      );
    }

    // Store verified payload for controller
    (request as unknown as Record<string, unknown>)['verifiedPayload'] = verification.payload;
    (request as unknown as Record<string, unknown>)['rawPayload'] = rawBody;

    return true;
  }
}

@Controller('webhooks/xendit')
export class XenditWebhookController {
  private readonly logger = new Logger(XenditWebhookController.name);

  constructor(
    private readonly xenditService: XenditService,
    private readonly signatureService: XenditSignatureService,
    private readonly mapper: XenditMapper
  ) {}

  /**
   * QRIS Payment Webhook Endpoint
   *
   * Receives payment notifications from Xendit when QRIS payment is completed.
   * Only processes PAID status webhooks - other statuses are acknowledged but not processed.
   *
   * Headers Required:
   * - x-callback-token: Xendit verification token
   * - x-callback-id: Webhook ID for idempotency
   *
   * Response:
   * - 200: Successfully processed
   * - 400: Invalid request format
   * - 401: Invalid signature
   * - 409: Already processed (idempotent)
   * - 422: Business logic error (amount mismatch, invalid state, etc.)
   * - 500: Internal error
   *
   * NOTE: Always return 200 to Xendit to prevent retries for business logic errors.
   * We handle retries internally for blockchain failures.
   *
   * @param req - Request with raw body
   * @param body - Parsed webhook payload
   * @param callbackToken - Signature verification token
   * @param callbackId - Webhook ID
   * @returns Webhook processing result
   */
  @Post('qris')
  @HttpCode(HttpStatus.OK)
  @UseGuards(XenditWebhookGuard)
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
  async handleQrisWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: XenditWebhookPayload,
    @Headers('x-callback-token') callbackToken: string,
    @Headers('x-callback-id') callbackId: string
  ): Promise<WebhookResponse> {
    const webhookId = callbackId || `webhook-${Date.now()}`;
    const startTime = Date.now();

    this.logger.log(
      `Received QRIS webhook ${webhookId}: invoice=${body.id}, status=${body.status}, amount=${body.amount}`
    );

    try {
      // Get verified payload from guard
      const verifiedPayload = (req as unknown as Record<string, unknown>)['verifiedPayload'] as XenditWebhookPayload;
      const rawPayload = (req as unknown as Record<string, unknown>)['rawPayload'] as string;

      // Validate this is an AMANTRA invoice
      if (!this.mapper.isAmantraExternalId(verifiedPayload.external_id)) {
        this.logger.warn(
          `Webhook ${webhookId}: Not an AMANTRA invoice: ${verifiedPayload.external_id}`
        );
        return {
          success: true,
          message: 'Ignored: Not an AMANTRA invoice',
          webhookId,
        };
      }

      // Only process PAID status
      if (verifiedPayload.status !== XenditInvoiceStatus.PAID) {
        this.logger.info(
          `Webhook ${webhookId}: Acknowledging non-PAID status: ${verifiedPayload.status}`
        );
        return {
          success: true,
          message: `Acknowledged: Status ${verifiedPayload.status}`,
          webhookId,
        };
      }

      // Process the payment
      const result = await this.xenditService.processPaymentWebhook(
        verifiedPayload,
        rawPayload,
        callbackToken,
        webhookId
      );

      const duration = Date.now() - startTime;
      this.logger.log(
        `Webhook ${webhookId} processed in ${duration}ms: result=${result}`
      );

      // Map result to response
      return this.mapResultToResponse(result, webhookId);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Webhook ${webhookId} failed after ${duration}ms: ${errorMsg}`
      );

      // Always return 200 to Xendit to prevent endless retries
      // We log and handle errors internally
      return {
        success: false,
        message: 'Internal processing error',
        webhookId,
        result: WebhookProcessingResult.UNKNOWN_ERROR,
      };
    }
  }

  /**
   * Invoice Status Update Webhook
   *
   * Handles non-payment status updates (EXPIRED, etc.)
   * These don't trigger blockchain transactions.
   */
  @Post('invoice')
  @HttpCode(HttpStatus.OK)
  @UseGuards(XenditWebhookGuard)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async handleInvoiceWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: XenditWebhookPayload,
    @Headers('x-callback-id') callbackId: string
  ): Promise<WebhookResponse> {
    const webhookId = callbackId || `webhook-${Date.now()}`;

    this.logger.log(
      `Received invoice webhook ${webhookId}: invoice=${body.id}, status=${body.status}`
    );

    try {
      const verifiedPayload = (req as unknown as Record<string, unknown>)['verifiedPayload'] as XenditWebhookPayload;

      // Validate AMANTRA invoice
      if (!this.mapper.isAmantraExternalId(verifiedPayload.external_id)) {
        return {
          success: true,
          message: 'Ignored: Not an AMANTRA invoice',
          webhookId,
        };
      }

      // Handle PAID status same as QRIS endpoint
      if (verifiedPayload.status === XenditInvoiceStatus.PAID) {
        this.logger.info(
          `Webhook ${webhookId}: Redirecting PAID status to QRIS handler`
        );
        return this.handleQrisWebhook(
          req,
          body,
          req.headers['x-callback-token'] as string,
          callbackId
        );
      }

      // Handle EXPIRED status
      if (verifiedPayload.status === XenditInvoiceStatus.EXPIRED) {
        const contractId = this.mapper.extractContractId(verifiedPayload.external_id);

        if (contractId) {
          // Update invoice status in DB
          const invoice = await this.mapper.findByXenditInvoiceId(verifiedPayload.id);
          if (invoice) {
            await this.mapper.updateInvoice(
              invoice.id,
              { status: 'EXPIRED' as unknown as typeof invoice.status },
              invoice.version
            );
          }

          this.logger.info(`Invoice ${verifiedPayload.id} marked as EXPIRED`);
        }

        return {
          success: true,
          message: 'Processed: Invoice expired',
          webhookId,
        };
      }

      // Acknowledge other statuses
      return {
        success: true,
        message: `Acknowledged: Status ${verifiedPayload.status}`,
        webhookId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Invoice webhook ${webhookId} failed: ${errorMsg}`);

      return {
        success: false,
        message: 'Processing error',
        webhookId,
      };
    }
  }

  /**
   * Health check endpoint for webhook configuration verification
   */
  @Post('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Maps processing result to HTTP response.
   */
  private mapResultToResponse(
    result: WebhookProcessingResult,
    webhookId: string
  ): WebhookResponse {
    switch (result) {
      case WebhookProcessingResult.SUCCESS:
        return {
          success: true,
          message: 'Payment processed successfully',
          webhookId,
          result,
        };

      case WebhookProcessingResult.DUPLICATE:
        return {
          success: true, // Idempotent - return success for duplicate
          message: 'Already processed',
          webhookId,
          result,
        };

      case WebhookProcessingResult.INVALID_SIGNATURE:
        return {
          success: false,
          message: 'Invalid signature',
          webhookId,
          result,
        };

      case WebhookProcessingResult.INVALID_TIMESTAMP:
        return {
          success: false,
          message: 'Invalid timestamp',
          webhookId,
          result,
        };

      case WebhookProcessingResult.CONTRACT_NOT_FOUND:
        return {
          success: false,
          message: 'Contract not found',
          webhookId,
          result,
        };

      case WebhookProcessingResult.INVALID_AMOUNT:
        return {
          success: false,
          message: 'Amount mismatch',
          webhookId,
          result,
        };

      case WebhookProcessingResult.INVALID_STATE:
        return {
          success: false,
          message: 'Invalid contract state',
          webhookId,
          result,
        };

      case WebhookProcessingResult.BLOCKCHAIN_ERROR:
        return {
          success: false,
          message: 'Blockchain transaction failed',
          webhookId,
          result,
        };

      case WebhookProcessingResult.DATABASE_ERROR:
        return {
          success: false,
          message: 'Database error',
          webhookId,
          result,
        };

      default:
        return {
          success: false,
          message: 'Unknown error',
          webhookId,
          result: WebhookProcessingResult.UNKNOWN_ERROR,
        };
    }
  }
}
