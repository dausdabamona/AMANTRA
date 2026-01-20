/**
 * AMANTRA - Bank Escrow Service Implementation
 *
 * Implementasi EscrowService untuk integrasi dengan Bank API.
 * Dana SELALU berada di bank - tidak di blockchain!
 */

import axios, { AxiosInstance } from 'axios';
import {
  EscrowService,
  CreateEscrowAccountParams,
  EscrowAccount,
  TransferRequest,
  TransferResult,
  EscrowTransaction,
} from '../../application/services/EscrowService';
import { Logger } from '../../shared/Logger';
import { v4 as uuidv4 } from 'uuid';

export interface BankApiConfig {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  escrowMasterAccount: string;
  timeout: number;
}

export class BankEscrowService implements EscrowService {
  private client: AxiosInstance;

  constructor(
    private readonly config: BankApiConfig,
    private readonly logger: Logger
  ) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
        'Authorization': `Bearer ${this.generateBankToken()}`,
      },
    });

    // Request interceptor untuk logging
    this.client.interceptors.request.use((request) => {
      this.logger.debug('Bank API Request', {
        method: request.method,
        url: request.url,
        // Jangan log sensitive data
      });
      return request;
    });

    // Response interceptor untuk error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('Bank API Error', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });
        throw error;
      }
    );
  }

  async createEscrowAccount(params: CreateEscrowAccountParams): Promise<EscrowAccount> {
    this.logger.info('Creating escrow account', {
      contractId: params.contractId,
      amount: params.amount,
    });

    const requestId = uuidv4();

    try {
      const response = await this.client.post('/escrow/accounts', {
        request_id: requestId,
        contract_id: params.contractId,
        initial_amount: params.amount,
        currency: params.currency,
        source_reference: params.sourceReference,
        master_account: this.config.escrowMasterAccount,
      });

      const data = response.data;

      this.logger.info('Escrow account created', {
        contractId: params.contractId,
        accountId: data.account_id,
      });

      return {
        accountId: data.account_id,
        contractId: params.contractId,
        balance: data.balance,
        currency: data.currency,
        status: 'ACTIVE',
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      this.logger.error('Failed to create escrow account', {
        contractId: params.contractId,
        error: (error as Error).message,
      });
      throw new EscrowServiceError(
        `Failed to create escrow account: ${(error as Error).message}`
      );
    }
  }

  async getBalance(escrowAccountId: string): Promise<number> {
    try {
      const response = await this.client.get(`/escrow/accounts/${escrowAccountId}/balance`);
      return response.data.balance;
    } catch (error) {
      this.logger.error('Failed to get escrow balance', {
        escrowAccountId,
        error: (error as Error).message,
      });
      throw new EscrowServiceError(
        `Failed to get balance: ${(error as Error).message}`
      );
    }
  }

  async getEscrowAccount(escrowAccountId: string): Promise<EscrowAccount | null> {
    try {
      const response = await this.client.get(`/escrow/accounts/${escrowAccountId}`);
      const data = response.data;

      return {
        accountId: data.account_id,
        contractId: data.contract_id,
        balance: data.balance,
        currency: data.currency,
        status: data.status,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async executeTransfer(request: TransferRequest): Promise<TransferResult> {
    this.logger.info('Executing escrow transfer', {
      fromAccountId: request.fromAccountId,
      toAccountNumber: request.toAccountNumber.slice(-4), // Mask for logging
      amount: request.amount,
      reference: request.reference,
    });

    try {
      const response = await this.client.post('/escrow/transfers', {
        request_id: uuidv4(),
        from_escrow_account_id: request.fromAccountId,
        to_account_number: request.toAccountNumber,
        amount: request.amount,
        currency: request.currency,
        description: request.description,
        reference: request.reference,
      });

      const data = response.data;

      this.logger.info('Transfer executed successfully', {
        reference: request.reference,
        bankReference: data.bank_reference,
      });

      return {
        success: true,
        reference: request.reference,
        bankReference: data.bank_reference,
        timestamp: new Date(data.timestamp),
      };
    } catch (error) {
      this.logger.error('Transfer failed', {
        reference: request.reference,
        error: (error as Error).message,
      });

      return {
        success: false,
        reference: request.reference,
        timestamp: new Date(),
        error: (error as Error).message,
      };
    }
  }

  async executeTransfers(requests: TransferRequest[]): Promise<TransferResult[]> {
    this.logger.info('Executing batch transfers', {
      count: requests.length,
      totalAmount: requests.reduce((sum, r) => sum + r.amount, 0),
    });

    // Bank API mendukung batch transfer atomik
    try {
      const response = await this.client.post('/escrow/transfers/batch', {
        request_id: uuidv4(),
        transfers: requests.map((r) => ({
          from_escrow_account_id: r.fromAccountId,
          to_account_number: r.toAccountNumber,
          amount: r.amount,
          currency: r.currency,
          description: r.description,
          reference: r.reference,
        })),
        atomic: true, // Semua berhasil atau semua gagal
      });

      const results = response.data.results.map((r: { reference: string; bank_reference: string; timestamp: string }) => ({
        success: true,
        reference: r.reference,
        bankReference: r.bank_reference,
        timestamp: new Date(r.timestamp),
      }));

      this.logger.info('Batch transfers completed', {
        successCount: results.length,
      });

      return results;
    } catch (error) {
      this.logger.error('Batch transfer failed', {
        error: (error as Error).message,
      });

      // Return failure for all transfers
      return requests.map((r) => ({
        success: false,
        reference: r.reference,
        timestamp: new Date(),
        error: (error as Error).message,
      }));
    }
  }

  async freezeEscrowAccount(escrowAccountId: string, reason: string): Promise<void> {
    this.logger.info('Freezing escrow account', {
      escrowAccountId,
      reason,
    });

    await this.client.post(`/escrow/accounts/${escrowAccountId}/freeze`, {
      request_id: uuidv4(),
      reason,
    });

    this.logger.info('Escrow account frozen', { escrowAccountId });
  }

  async unfreezeEscrowAccount(escrowAccountId: string): Promise<void> {
    this.logger.info('Unfreezing escrow account', { escrowAccountId });

    await this.client.post(`/escrow/accounts/${escrowAccountId}/unfreeze`, {
      request_id: uuidv4(),
    });

    this.logger.info('Escrow account unfrozen', { escrowAccountId });
  }

  async closeEscrowAccount(escrowAccountId: string): Promise<void> {
    this.logger.info('Closing escrow account', { escrowAccountId });

    // Validasi saldo = 0 sebelum close
    const balance = await this.getBalance(escrowAccountId);
    if (balance !== 0) {
      throw new EscrowServiceError(
        `Cannot close escrow account with non-zero balance: ${balance}`
      );
    }

    await this.client.post(`/escrow/accounts/${escrowAccountId}/close`, {
      request_id: uuidv4(),
    });

    this.logger.info('Escrow account closed', { escrowAccountId });
  }

  async refundToBuyer(params: {
    escrowAccountId: string;
    buyerAccountNumber: string;
    amount: number;
    reason: string;
    reference: string;
  }): Promise<TransferResult> {
    this.logger.info('Processing refund to buyer', {
      escrowAccountId: params.escrowAccountId,
      amount: params.amount,
      reason: params.reason,
    });

    return this.executeTransfer({
      fromAccountId: params.escrowAccountId,
      toAccountNumber: params.buyerAccountNumber,
      amount: params.amount,
      currency: 'IDR',
      description: `Refund: ${params.reason}`,
      reference: params.reference,
    });
  }

  async getTransactionHistory(escrowAccountId: string): Promise<EscrowTransaction[]> {
    const response = await this.client.get(
      `/escrow/accounts/${escrowAccountId}/transactions`
    );

    return response.data.transactions.map((t: {
      id: string;
      escrow_account_id: string;
      type: 'CREDIT' | 'DEBIT';
      amount: number;
      balance_after: number;
      reference: string;
      description: string;
      timestamp: string;
    }) => ({
      id: t.id,
      escrowAccountId: t.escrow_account_id,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balance_after,
      reference: t.reference,
      description: t.description,
      timestamp: new Date(t.timestamp),
    }));
  }

  // ============================================
  // Helpers
  // ============================================

  private generateBankToken(): string {
    // Dalam production, implementasikan JWT signing dengan secret key
    // atau gunakan OAuth2 flow
    const timestamp = Date.now();
    const payload = `${this.config.apiKey}:${timestamp}`;

    // Placeholder - implement proper signing
    return Buffer.from(payload).toString('base64');
  }
}

export class EscrowServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscrowServiceError';
  }
}
