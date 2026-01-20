/**
 * AMANTRA - BSI (Bank Syariah Indonesia) Adapter
 *
 * Production adapter for BSI Corporate Banking API.
 * Implements Islamic banking compliant escrow operations.
 *
 * API Documentation: [BSI Corporate API - requires NDA]
 *
 * Features:
 * - Wadiah-based escrow accounts
 * - Real-time gross settlement (RTGS)
 * - BI-FAST integration
 * - Sharia-compliant fee structure
 *
 * @module escrow/adapters
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import * as crypto from 'crypto';
import {
  BankEscrowPort,
  CreateEscrowAccountRequest,
  CreateEscrowAccountResponse,
  FreezeFundsRequest,
  FreezeFundsResponse,
  UnfreezeFundsRequest,
  UnfreezeFundsResponse,
  SplitTransferRequest,
  SplitTransferAck,
  SplitTransferStatus,
  BalanceResponse,
  TransactionHistoryRequest,
  TransactionHistoryResponse,
  BankCallbackPayload,
} from '../ports/bank-escrow.port';
import { BankTransferStatus } from '../domain/settlement-status.enum';

/**
 * BSI API Configuration
 */
interface BSIConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  corporateId: string;
  callbackUrl: string;
  publicKeyPath: string;
  timeout: number;
}

/**
 * BSI API Error Response
 */
interface BSIErrorResponse {
  responseCode: string;
  responseMessage: string;
  errorDetails?: {
    field: string;
    message: string;
  }[];
}

/**
 * BSI Bank Adapter
 *
 * Production implementation for Bank Syariah Indonesia.
 *
 * NOTE: This is a reference implementation stub.
 * Actual implementation requires:
 * - BSI API credentials and documentation
 * - HSM integration for signing
 * - IP whitelisting
 * - Production onboarding
 */
@Injectable()
export class BSIBankAdapter implements BankEscrowPort {
  private readonly logger = new Logger(BSIBankAdapter.name);
  private readonly httpClient: AxiosInstance;
  private readonly config: BSIConfig;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private readonly latencyRecords: number[] = [];

  readonly bankCode = 'BSI';
  readonly bankName = 'Bank Syariah Indonesia';
  readonly supportsAtomicSplit = true;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      baseUrl: this.configService.getOrThrow<string>('BSI_API_URL'),
      clientId: this.configService.getOrThrow<string>('BSI_CLIENT_ID'),
      clientSecret: this.configService.getOrThrow<string>('BSI_CLIENT_SECRET'),
      corporateId: this.configService.getOrThrow<string>('BSI_CORPORATE_ID'),
      callbackUrl: this.configService.getOrThrow<string>('BSI_CALLBACK_URL'),
      publicKeyPath: this.configService.get<string>('BSI_PUBLIC_KEY_PATH', ''),
      timeout: this.configService.get<number>('BSI_TIMEOUT_MS', 30000),
    };

    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Corporate-ID': this.config.corporateId,
      },
    });

    // Request interceptor for auth and logging
    this.httpClient.interceptors.request.use(async (request) => {
      // Ensure valid token
      const token = await this.getAccessToken();
      request.headers.Authorization = `Bearer ${token}`;

      // Add request signature
      const timestamp = new Date().toISOString();
      request.headers['X-Timestamp'] = timestamp;
      request.headers['X-Signature'] = this.signRequest(
        request.method || 'GET',
        request.url || '',
        timestamp,
        JSON.stringify(request.data || {})
      );

      this.logger.debug(`BSI API Request: ${request.method?.toUpperCase()} ${request.url}`);
      return request;
    });

    // Response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug(`BSI API Response: ${response.status}`);
        return response;
      },
      (error: AxiosError<BSIErrorResponse>) => {
        this.logger.error(
          `BSI API Error: ${error.response?.status} - ${error.response?.data?.responseMessage}`
        );
        throw error;
      }
    );

    this.logger.log('BSI Bank Adapter initialized');
  }

  // ============================================
  // Escrow Account Management
  // ============================================

  async createEscrowAccount(
    request: CreateEscrowAccountRequest
  ): Promise<CreateEscrowAccountResponse> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.post('/v1/escrow/accounts', {
        contractReference: request.contractId,
        accountType: 'WADIAH_ESCROW',
        currency: request.currency,
        initialDeposit: request.initialDeposit || 0,
        callbackUrl: this.config.callbackUrl,
        metadata: request.metadata,
      });

      this.recordLatency(startTime);

      return {
        success: true,
        escrowAccountId: response.data.accountId,
        accountNumber: response.data.accountNumber,
        bankCode: this.bankCode,
        virtualAccountNumber: response.data.virtualAccountNumber,
        createdAt: new Date(response.data.createdAt),
      };
    } catch (error) {
      this.recordLatency(startTime);
      return this.handleError(error, 'createEscrowAccount');
    }
  }

  async getBalance(escrowAccountId: string): Promise<BalanceResponse> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get(
        `/v1/escrow/accounts/${escrowAccountId}/balance`
      );

      this.recordLatency(startTime);

      return {
        accountNumber: response.data.accountNumber,
        availableBalance: response.data.availableBalance,
        currentBalance: response.data.currentBalance,
        frozenBalance: response.data.frozenBalance,
        currency: response.data.currency,
        asOf: new Date(response.data.timestamp),
      };
    } catch (error) {
      this.recordLatency(startTime);
      throw this.handleError(error, 'getBalance');
    }
  }

  async getTransactionHistory(
    request: TransactionHistoryRequest
  ): Promise<TransactionHistoryResponse> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get(
        `/v1/escrow/accounts/${request.escrowAccountId}/transactions`,
        {
          params: {
            startDate: request.startDate.toISOString(),
            endDate: request.endDate.toISOString(),
            limit: request.limit || 50,
            offset: request.offset || 0,
          },
        }
      );

      this.recordLatency(startTime);

      return {
        transactions: response.data.transactions.map((t: Record<string, unknown>) => ({
          transactionId: t.transactionId,
          type: t.type,
          amount: t.amount,
          balanceAfter: t.balanceAfter,
          referenceNumber: t.referenceNumber,
          description: t.description,
          counterpartyAccount: t.counterpartyAccount,
          counterpartyName: t.counterpartyName,
          timestamp: new Date(t.timestamp as string),
        })),
        totalCount: response.data.totalCount,
        hasMore: response.data.hasMore,
      };
    } catch (error) {
      this.recordLatency(startTime);
      throw this.handleError(error, 'getTransactionHistory');
    }
  }

  // ============================================
  // Fund Management
  // ============================================

  async freezeFunds(request: FreezeFundsRequest): Promise<FreezeFundsResponse> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.post(
        `/v1/escrow/accounts/${request.escrowAccountId}/freeze`,
        {
          amount: request.amount,
          referenceId: request.referenceId,
          reason: request.reason,
          expiresAt: request.expiresAt?.toISOString(),
        }
      );

      this.recordLatency(startTime);

      return {
        success: true,
        freezeId: response.data.freezeId,
        frozenAmount: response.data.frozenAmount,
        bankReference: response.data.bankReference,
        timestamp: new Date(response.data.timestamp),
      };
    } catch (error) {
      this.recordLatency(startTime);
      return {
        success: false,
        freezeId: '',
        frozenAmount: 0,
        bankReference: '',
        timestamp: new Date(),
        error: this.extractErrorMessage(error),
      };
    }
  }

  async unfreezeFunds(request: UnfreezeFundsRequest): Promise<UnfreezeFundsResponse> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.post(
        `/v1/escrow/accounts/${request.escrowAccountId}/unfreeze`,
        {
          freezeId: request.freezeId,
          referenceId: request.referenceId,
          reason: request.reason,
        }
      );

      this.recordLatency(startTime);

      return {
        success: true,
        unfrozenAmount: response.data.unfrozenAmount,
        bankReference: response.data.bankReference,
        timestamp: new Date(response.data.timestamp),
      };
    } catch (error) {
      this.recordLatency(startTime);
      return {
        success: false,
        unfrozenAmount: 0,
        bankReference: '',
        timestamp: new Date(),
        error: this.extractErrorMessage(error),
      };
    }
  }

  // ============================================
  // Settlement Transfers
  // ============================================

  async executeSplitTransfer(request: SplitTransferRequest): Promise<SplitTransferAck> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.post('/v1/transfers/split', {
        sourceAccountId: request.escrowAccountId,
        referenceId: request.referenceId,
        totalAmount: request.totalAmount,
        transfers: request.transfers.map((t) => ({
          beneficiaryAccount: t.toAccount.accountNumber,
          beneficiaryBankCode: t.toAccount.bankCode,
          beneficiaryName: t.toAccount.accountName,
          amount: t.amount,
          description: t.description,
          recipientType: t.recipientType,
        })),
        callbackUrl: this.config.callbackUrl,
        metadata: request.metadata,
      });

      this.recordLatency(startTime);

      return {
        success: true,
        batchId: response.data.batchId,
        referenceId: request.referenceId,
        status: response.data.status,
        estimatedCompletionTime: response.data.estimatedCompletionTime
          ? new Date(response.data.estimatedCompletionTime)
          : undefined,
      };
    } catch (error) {
      this.recordLatency(startTime);

      if (axios.isAxiosError(error) && error.response?.status === 409) {
        // Duplicate request - return existing batch info
        const existing = error.response.data;
        return {
          success: true,
          batchId: existing.existingBatchId,
          referenceId: request.referenceId,
          status: 'ACCEPTED',
        };
      }

      return {
        success: false,
        batchId: '',
        referenceId: request.referenceId,
        status: 'REJECTED',
        error: this.extractErrorMessage(error),
      };
    }
  }

  async queryTransferStatus(referenceId: string): Promise<SplitTransferStatus> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get(
        `/v1/transfers/status/${referenceId}`
      );

      this.recordLatency(startTime);

      return {
        batchId: response.data.batchId,
        referenceId: response.data.referenceId,
        overallStatus: this.mapBSIStatus(response.data.status),
        transferResults: response.data.transfers.map((t: Record<string, unknown>) => ({
          recipientType: t.recipientType,
          toAccountNumber: t.beneficiaryAccount,
          amount: t.amount,
          status: this.mapBSIStatus(t.status as string),
          bankReference: t.bankReference,
          bankTimestamp: t.completedAt ? new Date(t.completedAt as string) : undefined,
          errorCode: t.errorCode,
          errorMessage: t.errorMessage,
        })),
        totalTransferred: response.data.totalTransferred,
        totalFailed: response.data.totalFailed,
        completedAt: response.data.completedAt
          ? new Date(response.data.completedAt)
          : undefined,
        bankStatement: response.data.statementReference,
      };
    } catch (error) {
      this.recordLatency(startTime);
      throw this.handleError(error, 'queryTransferStatus');
    }
  }

  // ============================================
  // Callback Handling
  // ============================================

  verifyCallbackSignature(payload: string, signature: string): boolean {
    try {
      // BSI uses RSA signature with their public key
      // This is a placeholder - actual implementation needs BSI's public key
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(payload);

      // In production, load public key from config.publicKeyPath
      // For now, this is a stub
      this.logger.warn('BSI signature verification is a stub - implement with actual public key');

      return true; // Stub - always returns true
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error}`);
      return false;
    }
  }

  parseCallback(rawPayload: string, signature: string): BankCallbackPayload {
    if (!this.verifyCallbackSignature(rawPayload, signature)) {
      throw new Error('Invalid callback signature');
    }

    const data = JSON.parse(rawPayload);

    return {
      callbackType: data.eventType,
      batchId: data.batchId,
      referenceId: data.referenceId,
      status: this.mapBSIStatus(data.status),
      transferResults: data.transfers?.map((t: Record<string, unknown>) => ({
        recipientType: t.recipientType,
        toAccountNumber: t.beneficiaryAccount,
        amount: t.amount,
        status: this.mapBSIStatus(t.status as string),
        bankReference: t.bankReference,
        bankTimestamp: t.completedAt ? new Date(t.completedAt as string) : undefined,
        errorCode: t.errorCode,
        errorMessage: t.errorMessage,
      })),
      amount: data.amount,
      bankReference: data.bankReference,
      timestamp: new Date(data.timestamp),
      signature,
      rawPayload,
    };
  }

  // ============================================
  // Health & Diagnostics
  // ============================================

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/v1/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  getLatencyStats(): {
    averageMs: number;
    p95Ms: number;
    p99Ms: number;
    sampleCount: number;
  } {
    if (this.latencyRecords.length === 0) {
      return { averageMs: 0, p95Ms: 0, p99Ms: 0, sampleCount: 0 };
    }

    const sorted = [...this.latencyRecords].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      averageMs: sum / sorted.length,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99Ms: sorted[Math.floor(sorted.length * 0.99)] || 0,
      sampleCount: sorted.length,
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Gets a valid access token, refreshing if needed
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        `${this.config.baseUrl}/oauth/token`,
        {
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000 - 60000);

      this.logger.debug('BSI access token refreshed');
      return this.accessToken;
    } catch (error) {
      this.logger.error(`Failed to refresh BSI access token: ${error}`);
      throw error;
    }
  }

  /**
   * Signs a request for BSI API
   */
  private signRequest(
    method: string,
    path: string,
    timestamp: string,
    body: string
  ): string {
    const data = `${method}:${path}:${timestamp}:${body}`;

    // In production, this should use HSM for signing
    return crypto
      .createHmac('sha256', this.config.clientSecret)
      .update(data, 'utf8')
      .digest('hex');
  }

  /**
   * Maps BSI status to our enum
   */
  private mapBSIStatus(bsiStatus: string): BankTransferStatus {
    const statusMap: Record<string, BankTransferStatus> = {
      PENDING: BankTransferStatus.PENDING,
      PROCESSING: BankTransferStatus.PROCESSING,
      SUCCESS: BankTransferStatus.SUCCESS,
      COMPLETED: BankTransferStatus.SUCCESS,
      FAILED: BankTransferStatus.FAILED,
      REJECTED: BankTransferStatus.REJECTED,
      TIMEOUT: BankTransferStatus.TIMEOUT,
    };

    return statusMap[bsiStatus] || BankTransferStatus.PENDING;
  }

  /**
   * Records latency for monitoring
   */
  private recordLatency(startTime: number): void {
    const latency = Date.now() - startTime;
    this.latencyRecords.push(latency);

    if (this.latencyRecords.length > 1000) {
      this.latencyRecords.shift();
    }
  }

  /**
   * Extracts error message from axios error
   */
  private extractErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      return (
        error.response?.data?.responseMessage ||
        error.response?.data?.message ||
        error.message
      );
    }
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Handles errors and converts to appropriate return type
   */
  private handleError(error: unknown, operation: string): never {
    const message = this.extractErrorMessage(error);
    this.logger.error(`BSI ${operation} failed: ${message}`);
    throw new Error(`BSI ${operation} failed: ${message}`);
  }
}
