/**
 * AMANTRA - Settle Contract Use Case
 *
 * Use case untuk mencairkan dana ke seller setelah barang diverifikasi.
 *
 * SYARAT WAJIB untuk settlement:
 * 1. Status kontrak = VERIFIED
 * 2. Status on-chain = VERIFIED
 * 3. Escrow balance mencukupi
 *
 * Flow:
 * 1. Validasi prasyarat
 * 2. Hitung fee breakdown
 * 3. Transfer dari escrow ke seller (dikurangi fee)
 * 4. Transfer fee ke platform & mediator
 * 5. Update database
 * 6. Record ke blockchain
 */

import { v4 as uuidv4 } from 'uuid';
import { Contract } from '../../domain/entities/Contract';
import { ContractRepository } from '../../domain/repositories/ContractRepository';
import { ContractStatus } from '../../domain/value-objects/ContractStatus';
import { BlockchainService } from '../services/BlockchainService';
import { EscrowService, TransferRequest } from '../services/EscrowService';
import { EventPublisher, EventMetadata } from '../../domain/events/DomainEvent';
import { Logger } from '../../shared/Logger';
import { IdempotencyStore } from './ProcessQRISPaymentUseCase';

export interface SettleContractInput {
  contractId: string;
  performedBy: string;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SettleContractOutput {
  success: boolean;
  contractId: string;
  contractNumber: string;
  settlement: {
    totalAmount: string;
    sellerReceived: string;
    platformFee: string;
    mediatorFee?: string;
    settlementReference: string;
  };
  blockchainTxHash?: string;
}

export class SettleContractUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly blockchainService: BlockchainService,
    private readonly escrowService: EscrowService,
    private readonly eventPublisher: EventPublisher,
    private readonly logger: Logger,
    private readonly idempotencyStore: IdempotencyStore
  ) {}

  async execute(input: SettleContractInput): Promise<SettleContractOutput> {
    this.logger.info('Starting contract settlement', {
      correlationId: input.correlationId,
      contractId: input.contractId,
      performedBy: input.performedBy,
    });

    // 1. Cek idempotency
    const idempotencyKey = `settlement:${input.contractId}`;
    if (await this.idempotencyStore.exists(idempotencyKey)) {
      this.logger.warn('Settlement already processed (idempotency check)', {
        correlationId: input.correlationId,
        contractId: input.contractId,
      });

      const existingResult = await this.idempotencyStore.get(idempotencyKey);
      return existingResult as SettleContractOutput;
    }

    // 2. Load dan lock contract
    const contract = await this.contractRepository.lockForUpdate(input.contractId);

    if (!contract) {
      throw new SettlementError(`Contract not found: ${input.contractId}`);
    }

    // 3. Validasi status database
    if (contract.status !== ContractStatus.VERIFIED) {
      throw new SettlementError(
        `Contract status is ${contract.status}, expected VERIFIED`
      );
    }

    // 4. Validasi status on-chain (CRITICAL!)
    const onChainStatus = await this.blockchainService.getContractStatus(input.contractId);

    if (onChainStatus !== 'VERIFIED') {
      throw new SettlementError(
        `On-chain status is ${onChainStatus}, expected VERIFIED. Settlement blocked.`
      );
    }

    this.logger.info('On-chain status verified', {
      correlationId: input.correlationId,
      contractId: input.contractId,
      onChainStatus,
    });

    // 5. Hitung fee breakdown
    const feeBreakdown = contract.feeStructure.calculateFees(contract.totalAmount);

    // 6. Validasi escrow balance
    const escrowBalance = await this.escrowService.getBalance(contract.escrowAccountId!);

    if (escrowBalance < contract.totalAmount.amount) {
      throw new SettlementError(
        `Insufficient escrow balance: ${escrowBalance}, required: ${contract.totalAmount.amount}`
      );
    }

    // 7. Generate settlement reference
    const settlementReference = `STL-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    // 8. Execute transfers dari escrow
    const transfers: TransferRequest[] = [
      // Transfer ke seller (net amount)
      {
        fromAccountId: contract.escrowAccountId!,
        toAccountNumber: contract.seller.bankAccountNumber!,
        amount: feeBreakdown.netAmount.amount,
        currency: 'IDR',
        description: `Settlement ${contract.contractNumber} - Seller Payment`,
        reference: `${settlementReference}-SELLER`,
      },
      // Transfer platform fee
      {
        fromAccountId: contract.escrowAccountId!,
        toAccountNumber: process.env.PLATFORM_BANK_ACCOUNT!,
        amount: feeBreakdown.platformFee.amount,
        currency: 'IDR',
        description: `Settlement ${contract.contractNumber} - Platform Fee`,
        reference: `${settlementReference}-PLATFORM`,
      },
    ];

    // Mediator fee (jika ada)
    if (feeBreakdown.mediatorFee && contract.mediator?.bankAccountNumber) {
      transfers.push({
        fromAccountId: contract.escrowAccountId!,
        toAccountNumber: contract.mediator.bankAccountNumber,
        amount: feeBreakdown.mediatorFee.amount,
        currency: 'IDR',
        description: `Settlement ${contract.contractNumber} - Mediator Fee`,
        reference: `${settlementReference}-MEDIATOR`,
      });
    }

    // Execute all transfers
    await this.escrowService.executeTransfers(transfers);

    this.logger.info('Escrow transfers completed', {
      correlationId: input.correlationId,
      contractId: input.contractId,
      settlementReference,
      transferCount: transfers.length,
    });

    // 9. Close escrow account
    await this.escrowService.closeEscrowAccount(contract.escrowAccountId!);

    // 10. Update contract status ke SETTLED
    contract.settle({
      blockchainTxHash: '', // Will update after blockchain tx
      settlementRef: settlementReference,
      performedBy: input.performedBy,
    });

    // 11. Save to database
    await this.contractRepository.save(contract);

    // 12. Publish events
    const metadata: EventMetadata = {
      correlationId: input.correlationId,
      userId: input.performedBy,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    const events = contract.pullDomainEvents();
    await this.eventPublisher.publishAll(events, metadata);

    // 13. Record ke blockchain
    let blockchainTxHash: string | undefined;
    try {
      blockchainTxHash = await this.blockchainService.recordSettlement({
        contractId: contract.id,
        sellerAmount: feeBreakdown.netAmount.amount,
        platformFee: feeBreakdown.platformFee.amount,
        mediatorFee: feeBreakdown.mediatorFee?.amount || 0,
        settlementReference,
        transactionId: uuidv4(),
      });

      this.logger.info('Settlement recorded on blockchain', {
        correlationId: input.correlationId,
        contractId: contract.id,
        txHash: blockchainTxHash,
      });
    } catch (error) {
      // Log tapi jangan gagalkan - dana sudah ditransfer
      // Background job akan retry blockchain recording
      this.logger.error('Failed to record settlement on blockchain', {
        correlationId: input.correlationId,
        contractId: contract.id,
        error: (error as Error).message,
      });
    }

    const result: SettleContractOutput = {
      success: true,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      settlement: {
        totalAmount: contract.totalAmount.toString(),
        sellerReceived: feeBreakdown.netAmount.toString(),
        platformFee: feeBreakdown.platformFee.toString(),
        mediatorFee: feeBreakdown.mediatorFee?.toString(),
        settlementReference,
      },
      blockchainTxHash,
    };

    // 14. Simpan idempotency record
    await this.idempotencyStore.set(idempotencyKey, result, 86400 * 30); // 30 days

    this.logger.info('Contract settlement completed', {
      correlationId: input.correlationId,
      contractId: contract.id,
      settlementReference,
    });

    return result;
  }
}

export class SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettlementError';
  }
}
