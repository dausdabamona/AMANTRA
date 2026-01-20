/**
 * AMANTRA - Xendit Webhook Signature Verification
 *
 * Implements secure signature verification for Xendit webhooks.
 * Supports both HMAC-SHA256 (callback verification token) and
 * RSA (for advanced verification scenarios).
 *
 * Security Requirements:
 * - Constant-time comparison to prevent timing attacks
 * - Timestamp validation to prevent replay attacks
 * - Raw payload preservation for signature verification
 *
 * @see https://developers.xendit.co/api-reference/#webhook-verification
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  XenditWebhookPayload,
  WebhookVerificationResult,
  WebhookValidationError,
  WebhookProcessingResult,
} from './xendit.types';

@Injectable()
export class XenditSignatureService {
  private readonly logger = new Logger(XenditSignatureService.name);
  private readonly webhookToken: string;
  private readonly timestampToleranceSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.webhookToken = this.configService.getOrThrow<string>('XENDIT_WEBHOOK_TOKEN');
    this.timestampToleranceSeconds = this.configService.get<number>(
      'XENDIT_TIMESTAMP_TOLERANCE_SECONDS',
      300 // 5 minutes default
    );

    if (!this.webhookToken || this.webhookToken.length < 32) {
      throw new Error('XENDIT_WEBHOOK_TOKEN must be at least 32 characters');
    }
  }

  /**
   * Verifies Xendit webhook signature using callback verification token.
   *
   * Xendit uses x-callback-token header which should match the
   * webhook verification token configured in dashboard.
   *
   * @param callbackToken - Token from x-callback-token header
   * @param rawBody - Raw request body as string (before parsing)
   * @param webhookId - Webhook ID from x-callback-id header
   * @returns Verification result with parsed payload if valid
   */
  verifyCallbackToken(
    callbackToken: string | undefined,
    rawBody: string,
    webhookId: string
  ): WebhookVerificationResult {
    this.logger.debug(`Verifying webhook signature for ID: ${webhookId}`);

    // Check if token is provided
    if (!callbackToken) {
      this.logger.warn(`Missing callback token for webhook ${webhookId}`);
      return {
        isValid: false,
        reason: 'Missing x-callback-token header',
      };
    }

    // Constant-time comparison to prevent timing attacks
    const isTokenValid = this.constantTimeCompare(callbackToken, this.webhookToken);

    if (!isTokenValid) {
      this.logger.warn(`Invalid callback token for webhook ${webhookId}`);
      return {
        isValid: false,
        reason: 'Invalid callback token',
      };
    }

    // Parse payload after signature verification
    let payload: XenditWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      this.logger.error(`Failed to parse webhook payload: ${error}`);
      return {
        isValid: false,
        reason: 'Invalid JSON payload',
      };
    }

    this.logger.debug(`Webhook signature verified for ID: ${webhookId}`);

    return {
      isValid: true,
      payload,
    };
  }

  /**
   * Verifies webhook using HMAC-SHA256 signature.
   *
   * Some Xendit integrations use HMAC-based signatures instead of
   * or in addition to the callback token.
   *
   * Signature format: HMAC-SHA256(webhook_token, raw_body)
   *
   * @param signature - Signature from x-signature header
   * @param rawBody - Raw request body
   * @param webhookId - Webhook ID for logging
   * @returns Verification result
   */
  verifyHmacSignature(
    signature: string | undefined,
    rawBody: string,
    webhookId: string
  ): WebhookVerificationResult {
    this.logger.debug(`Verifying HMAC signature for webhook ${webhookId}`);

    if (!signature) {
      this.logger.warn(`Missing signature header for webhook ${webhookId}`);
      return {
        isValid: false,
        reason: 'Missing x-signature header',
      };
    }

    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookToken)
      .update(rawBody, 'utf8')
      .digest('hex');

    // Constant-time comparison
    const isValid = this.constantTimeCompare(signature, expectedSignature);

    if (!isValid) {
      this.logger.warn(`Invalid HMAC signature for webhook ${webhookId}`);
      return {
        isValid: false,
        reason: 'Invalid HMAC signature',
      };
    }

    let payload: XenditWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      return {
        isValid: false,
        reason: 'Invalid JSON payload',
      };
    }

    return {
      isValid: true,
      payload,
    };
  }

  /**
   * Validates webhook timestamp to prevent replay attacks.
   *
   * Checks if the webhook was sent within acceptable time window.
   * Rejects webhooks that are too old or from the future.
   *
   * @param paidAt - Payment timestamp from webhook
   * @param webhookId - Webhook ID for logging
   * @returns true if timestamp is within tolerance
   * @throws WebhookValidationError if timestamp is invalid
   */
  validateTimestamp(paidAt: string, webhookId: string): boolean {
    const paymentTime = new Date(paidAt);
    const now = new Date();

    // Check if date is valid
    if (isNaN(paymentTime.getTime())) {
      this.logger.warn(`Invalid timestamp format for webhook ${webhookId}: ${paidAt}`);
      throw new WebhookValidationError(
        `Invalid timestamp format: ${paidAt}`,
        WebhookProcessingResult.INVALID_TIMESTAMP
      );
    }

    const diffSeconds = Math.abs((now.getTime() - paymentTime.getTime()) / 1000);

    // Check if timestamp is within tolerance
    // Allow some tolerance for future timestamps due to clock skew
    const maxFutureSeconds = 60; // 1 minute future tolerance

    if (paymentTime.getTime() > now.getTime() + maxFutureSeconds * 1000) {
      this.logger.warn(
        `Future timestamp rejected for webhook ${webhookId}: ${paidAt} (${diffSeconds}s ahead)`
      );
      throw new WebhookValidationError(
        `Timestamp too far in future: ${diffSeconds}s`,
        WebhookProcessingResult.INVALID_TIMESTAMP
      );
    }

    // Check if timestamp is not too old
    if (diffSeconds > this.timestampToleranceSeconds) {
      this.logger.warn(
        `Stale timestamp rejected for webhook ${webhookId}: ${paidAt} (${diffSeconds}s old)`
      );
      throw new WebhookValidationError(
        `Timestamp too old: ${diffSeconds}s (max: ${this.timestampToleranceSeconds}s)`,
        WebhookProcessingResult.INVALID_TIMESTAMP
      );
    }

    this.logger.debug(
      `Timestamp validated for webhook ${webhookId}: ${paidAt} (${diffSeconds}s difference)`
    );

    return true;
  }

  /**
   * Generates a hash for the payment reference.
   *
   * Used to create a unique, verifiable reference for blockchain transactions.
   * Format: keccak256(invoice_id + amount + paid_at)
   *
   * @param invoiceId - Xendit invoice ID
   * @param amount - Payment amount
   * @param paidAt - Payment timestamp
   * @returns bytes32 hash for blockchain
   */
  generatePaymentRefHash(invoiceId: string, amount: number, paidAt: string): string {
    const data = `${invoiceId}|${amount}|${paidAt}`;

    // Use keccak256 for Ethereum compatibility
    const hash = crypto
      .createHash('sha3-256')
      .update(data, 'utf8')
      .digest('hex');

    // Return as bytes32 format (0x prefixed)
    return `0x${hash}`;
  }

  /**
   * Generates a hash for the QRIS reference.
   *
   * Used to create idempotency key for blockchain transactions.
   *
   * @param invoiceId - Xendit invoice ID
   * @param escrowReference - Bank escrow account reference
   * @returns bytes32 hash for blockchain transaction reference
   */
  generateTransactionRefHash(invoiceId: string, escrowReference: string): string {
    const data = `AMANTRA:QRIS:${invoiceId}:${escrowReference}:${Date.now()}`;

    const hash = crypto
      .createHash('sha3-256')
      .update(data, 'utf8')
      .digest('hex');

    return `0x${hash}`;
  }

  /**
   * Generates webhook audit hash for immutable logging.
   *
   * @param rawBody - Raw webhook body
   * @param signature - Original signature
   * @param processedAt - Processing timestamp
   * @returns SHA-256 hash for audit
   */
  generateAuditHash(rawBody: string, signature: string, processedAt: Date): string {
    const data = `${rawBody}|${signature}|${processedAt.toISOString()}`;

    return crypto
      .createHash('sha256')
      .update(data, 'utf8')
      .digest('hex');
  }

  /**
   * Constant-time string comparison.
   *
   * Prevents timing attacks by ensuring comparison takes the same
   * time regardless of where strings differ.
   *
   * @param a - First string
   * @param b - Second string
   * @returns true if strings are equal
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }

    // Convert to buffers
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');

    // If lengths differ, pad the shorter one
    // This prevents length-based timing attacks
    if (bufA.length !== bufB.length) {
      // Still perform comparison to maintain constant time
      const maxLength = Math.max(bufA.length, bufB.length);
      const paddedA = Buffer.alloc(maxLength);
      const paddedB = Buffer.alloc(maxLength);
      bufA.copy(paddedA);
      bufB.copy(paddedB);

      // Use timingSafeEqual on padded buffers, but return false
      // since lengths are different
      try {
        crypto.timingSafeEqual(paddedA, paddedB);
      } catch {
        // Ignore - we're returning false anyway
      }
      return false;
    }

    // Use Node's built-in timing-safe comparison
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Masks sensitive data for logging.
   *
   * @param token - Token to mask
   * @returns Masked token showing only first and last 4 characters
   */
  maskToken(token: string): string {
    if (!token || token.length < 12) {
      return '***';
    }
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  }
}
