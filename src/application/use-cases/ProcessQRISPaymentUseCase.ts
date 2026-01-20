/**
 * AMANTRA - Process QRIS Payment Use Case
 *
 * Use case untuk memproses pembayaran QRIS yang masuk.
 * Dipanggil oleh webhook handler saat ada notifikasi dari payment gateway.
 *
 * Prinsip:
 * - IDEMPOTENT: Tidak boleh proses dobel
 * - Validasi status kontrak sebelum transisi
 * - Update database → Update blockchain
 */

import { v4 as uuidv4 } from 'uuid';
import { Contract } from '../../domain/entities/Contract';
import { ContractRepository } from '../../domain/repositories/ContractRepository';
import { ContractStatus } from '../../domain/value-objects/ContractStatus';
import { BlockchainService } from '../services/BlockchainService';
import { EscrowService } from '../services/EscrowService';
import { EventPublisher, EventMetadata } from '../../domain/events/DomainEvent';
import { Logger } from '../../shared/Logger';

export interface QRISPaymentNotification {
  // QRIS Gateway fields
  referenceId: string;
  merchantId: string;
  paymentCode: string;
  amount: number;
  currency: string;
  status: 'PAID' | 'FAILED' | 'EXPIRED';
  paidAt?: Date;
  payerName?: string;
  payerBank?: string;

  // Our reference
  contractId: string;

  // Request context
  correlationId: string;
  signature: string; // Webhook signature untuk verifikasi
}

export interface ProcessQRISPaymentOutput {
  success: boolean;
  contractId: string;
  contractNumber: string;
  newStatus: ContractStatus;
  escrowAccountId?: string;
  blockchainTxHash?: string;
  message: string;
}

export class ProcessQRISPaymentUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly blockchainService: BlockchainService,
    private readonly escrowService: EscrowService,
    private readonly eventPublisher: EventPublisher,
    private readonly logger: Logger,
    private readonly idempotencyStore: IdempotencyStore
  ) {}

  async execute(input: QRISPaymentNotification): Promise<ProcessQRISPaymentOutput> {
    this.logger.info('Processing QRIS payment notification', {
      correlationId: input.correlationId,
      referenceId: input.referenceId,
      contractId: input.contractId,
      status: input.status,
    });

    // 1. Cek idempotency - jangan proses dobel
    const idempotencyKey = `qris:${input.referenceId}`;
    if (await this.idempotencyStore.exists(idempotencyKey)) {
      this.logger.warn('Payment already processed (idempotency check)', {
        correlationId: input.correlationId,
        referenceId: input.referenceId,
      });

      const contract = await this.contractRepository.findById(input.contractId);
      return {
        success: true,
        contractId: input.contractId,
        contractNumber: contract?.contractNumber || 'UNKNOWN',
        newStatus: contract?.status || ContractStatus.CREATED,
        message: 'Payment already processed',
      };
    }

    // 2. Load contract dengan lock
    const contract = await this.contractRepository.lockForUpdate(input.contractId);

    if (!contract) {
      throw new PaymentProcessingError(`Contract not found: ${input.contractId}`);
    }

    // 3. Validasi status kontrak
    if (contract.status !== ContractStatus.CREATED) {
      this.logger.warn('Contract not in CREATED status', {
        correlationId: input.correlationId,
        contractId: input.contractId,
        currentStatus: contract.status,
      });

      return {
        success: false,
        contractId: input.contractId,
        contractNumber: contract.contractNumber,
        newStatus: contract.status,
        message: `Contract status is ${contract.status}, expected CREATED`,
      };
    }

    // 4. Validasi amount
    if (input.amount !== contract.totalAmount.amount) {
      throw new PaymentProcessingError(
        `Amount mismatch: expected ${contract.totalAmount.amount}, got ${input.amount}`
      );
    }

    // 5. Handle berdasarkan status pembayaran
    if (input.status !== 'PAID') {
      this.logger.info('Payment not successful', {
        correlationId: input.correlationId,
        referenceId: input.referenceId,
        status: input.status,
      });

      // Simpan idempotency record
      await this.idempotencyStore.set(idempotencyKey, {
        processedAt: new Date(),
        status: input.status,
        result: 'IGNORED',
      });

      return {
        success: false,
        contractId: input.contractId,
        contractNumber: contract.contractNumber,
        newStatus: contract.status,
        message: `Payment status is ${input.status}`,
      };
    }

    // 6. Buat escrow account di bank
    const escrowAccount = await this.escrowService.createEscrowAccount({
      contractId: contract.id,
      amount: input.amount,
      currency: input.currency,
      sourceReference: input.referenceId,
    });

    this.logger.info('Escrow account created', {
      correlationId: input.correlationId,
      contractId: contract.id,
      escrowAccountId: escrowAccount.accountId,
    });

    // 7. Update contract status ke FUNDED
    contract.fund({
      escrowAccountId: escrowAccount.accountId,
      qrisPaymentCode: input.paymentCode,
      performedBy: 'SYSTEM:QRIS_WEBHOOK',
      transactionRef: input.referenceId,
    });

    // 8. Simpan ke database
    await this.contractRepository.save(contract);

    // 9. Publish events
    const metadata: EventMetadata = {
      correlationId: input.correlationId,
      causationId: input.referenceId,
    };

    const events = contract.pullDomainEvents();
    await this.eventPublisher.publishAll(events, metadata);

    // 10. Record ke blockchain
    let blockchainTxHash: string | undefined;
    try {
      blockchainTxHash = await this.blockchainService.recordFunding({
        contractId: contract.id,
        amount: input.amount,
        bankReference: input.referenceId,
        transactionId: uuidv4(),
      });

      this.logger.info('Funding recorded on blockchain', {
        correlationId: input.correlationId,
        contractId: contract.id,
        txHash: blockchainTxHash,
      });
    } catch (error) {
      // Log tapi jangan gagalkan - background job akan retry
      this.logger.warn('Failed to record funding on blockchain, will retry', {
        correlationId: input.correlationId,
        contractId: contract.id,
        error: (error as Error).message,
      });
    }

    // 11. Simpan idempotency record
    await this.idempotencyStore.set(idempotencyKey, {
      processedAt: new Date(),
      status: input.status,
      result: 'FUNDED',
      escrowAccountId: escrowAccount.accountId,
      blockchainTxHash,
    });

    this.logger.info('QRIS payment processed successfully', {
      correlationId: input.correlationId,
      contractId: contract.id,
      newStatus: contract.status,
    });

    return {
      success: true,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      newStatus: contract.status,
      escrowAccountId: escrowAccount.accountId,
      blockchainTxHash,
      message: 'Payment processed successfully, contract is now FUNDED',
    };
  }
}

export class PaymentProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProcessingError';
  }
}

export interface IdempotencyStore {
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
}
