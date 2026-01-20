/**
 * AMANTRA - QRIS Webhook Controller
 *
 * Handler untuk webhook dari payment gateway QRIS.
 * Prinsip:
 * - Validasi signature webhook
 * - Idempotent processing
 * - Return 200 secepatnya (async processing)
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ProcessQRISPaymentUseCase, QRISPaymentNotification } from '../../../application/use-cases/ProcessQRISPaymentUseCase';
import { Logger } from '../../../shared/Logger';
import { v4 as uuidv4 } from 'uuid';

interface QRISWebhookPayload {
  reference_id: string;
  merchant_id: string;
  payment_code: string;
  amount: number;
  currency: string;
  status: 'PAID' | 'FAILED' | 'EXPIRED';
  paid_at?: string;
  payer_name?: string;
  payer_bank?: string;
  metadata?: {
    contract_id?: string;
    [key: string]: unknown;
  };
}

export class QRISWebhookController {
  constructor(
    private readonly processQRISPaymentUseCase: ProcessQRISPaymentUseCase,
    private readonly logger: Logger,
    private readonly webhookSecret: string
  ) {}

  /**
   * Handle QRIS payment notification
   * POST /webhooks/qris/payment
   */
  async handlePaymentNotification(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
    const signature = req.headers['x-webhook-signature'] as string;

    this.logger.info('Received QRIS webhook', {
      correlationId,
      path: req.path,
      method: req.method,
    });

    try {
      // 1. Validasi signature
      if (!this.verifySignature(req.body, signature)) {
        this.logger.warn('Invalid webhook signature', { correlationId });
        res.status(401).json({
          success: false,
          error: 'Invalid signature',
        });
        return;
      }

      // 2. Parse payload
      const payload = req.body as QRISWebhookPayload;

      // 3. Validasi payload
      if (!payload.reference_id || !payload.metadata?.contract_id) {
        this.logger.warn('Invalid webhook payload', {
          correlationId,
          referenceId: payload.reference_id,
        });
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
        });
        return;
      }

      // 4. Return 200 immediately (async processing)
      res.status(200).json({
        success: true,
        message: 'Webhook received, processing',
        correlationId,
      });

      // 5. Process payment asynchronously
      this.processPaymentAsync(payload, correlationId, signature);
    } catch (error) {
      this.logger.error('Error handling QRIS webhook', {
        correlationId,
        error: (error as Error).message,
      });

      // Still return 200 to prevent retries for invalid payloads
      res.status(200).json({
        success: false,
        error: 'Processing error',
        correlationId,
      });
    }
  }

  /**
   * Process payment asynchronously
   * Ini bisa dipindah ke message queue (Bull, RabbitMQ) untuk production
   */
  private async processPaymentAsync(
    payload: QRISWebhookPayload,
    correlationId: string,
    signature: string
  ): Promise<void> {
    try {
      const notification: QRISPaymentNotification = {
        referenceId: payload.reference_id,
        merchantId: payload.merchant_id,
        paymentCode: payload.payment_code,
        amount: payload.amount,
        currency: payload.currency,
        status: payload.status,
        paidAt: payload.paid_at ? new Date(payload.paid_at) : undefined,
        payerName: payload.payer_name,
        payerBank: payload.payer_bank,
        contractId: payload.metadata!.contract_id!,
        correlationId,
        signature,
      };

      const result = await this.processQRISPaymentUseCase.execute(notification);

      this.logger.info('QRIS payment processed', {
        correlationId,
        referenceId: payload.reference_id,
        contractId: payload.metadata!.contract_id,
        success: result.success,
        newStatus: result.newStatus,
      });
    } catch (error) {
      this.logger.error('Failed to process QRIS payment', {
        correlationId,
        referenceId: payload.reference_id,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });

      // Di production, ini bisa di-queue ulang untuk retry
      // atau disimpan ke dead letter queue untuk manual review
    }
  }

  /**
   * Verify webhook signature menggunakan HMAC-SHA256
   */
  private verifySignature(payload: unknown, signature: string): boolean {
    if (!signature) {
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      // Timing-safe comparison
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }
}

/**
 * Middleware untuk raw body (diperlukan untuk signature verification)
 */
export function rawBodyMiddleware(
  req: Request,
  res: Response,
  buf: Buffer
): void {
  (req as Request & { rawBody: Buffer }).rawBody = buf;
}
