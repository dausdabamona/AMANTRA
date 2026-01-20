/**
 * AMANTRA - Create Contract Use Case
 *
 * Use case untuk membuat kontrak baru.
 * Mengikuti prinsip:
 * - Validasi semua input
 * - Fee structure harus ditentukan di awal
 * - Simpan ke database & blockchain
 */

import { v4 as uuidv4 } from 'uuid';
import { Contract, ContractParty, ContractTerms } from '../../domain/entities/Contract';
import { ContractRepository } from '../../domain/repositories/ContractRepository';
import { FeeStructure } from '../../domain/value-objects/FeeStructure';
import { Money } from '../../domain/value-objects/Money';
import { BlockchainService } from '../services/BlockchainService';
import { EventPublisher, EventMetadata } from '../../domain/events/DomainEvent';
import { Logger } from '../../shared/Logger';

export interface CreateContractInput {
  // Seller info
  sellerId: string;
  sellerName: string;
  sellerWalletAddress?: string;
  sellerBankAccount?: string;

  // Buyer info
  buyerId: string;
  buyerName: string;
  buyerWalletAddress?: string;
  buyerBankAccount?: string;

  // Mediator (optional)
  mediatorId?: string;
  mediatorName?: string;
  mediatorWalletAddress?: string;

  // Contract terms
  description: string;
  goodsDescription: string;
  quantity: number;
  unit: string;
  unitPriceAmount: number;
  deliveryDeadlineDays: number;
  qualityRequirements: string[];
  disputeResolutionDays?: number;

  // Fee structure (wajib ditentukan di awal)
  platformFeeBps: number;
  mediatorFeeBps?: number;

  // Request context
  requestedBy: string;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateContractOutput {
  contractId: string;
  contractNumber: string;
  totalAmount: string;
  feeBreakdown: {
    platformFee: string;
    mediatorFee?: string;
    netToSeller: string;
  };
  blockchainTxHash?: string;
}

export class CreateContractUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly blockchainService: BlockchainService,
    private readonly eventPublisher: EventPublisher,
    private readonly logger: Logger
  ) {}

  async execute(input: CreateContractInput): Promise<CreateContractOutput> {
    this.logger.info('Creating new contract', {
      correlationId: input.correlationId,
      sellerId: input.sellerId,
      buyerId: input.buyerId,
    });

    // 1. Validasi input
    this.validateInput(input);

    // 2. Bangun entitas
    const seller: ContractParty = {
      id: input.sellerId,
      role: 'SELLER',
      name: input.sellerName,
      walletAddress: input.sellerWalletAddress,
      bankAccountNumber: input.sellerBankAccount,
    };

    const buyer: ContractParty = {
      id: input.buyerId,
      role: 'BUYER',
      name: input.buyerName,
      walletAddress: input.buyerWalletAddress,
      bankAccountNumber: input.buyerBankAccount,
    };

    const mediator: ContractParty | undefined = input.mediatorId
      ? {
          id: input.mediatorId,
          role: 'MEDIATOR',
          name: input.mediatorName!,
          walletAddress: input.mediatorWalletAddress,
        }
      : undefined;

    const deliveryDeadline = new Date();
    deliveryDeadline.setDate(deliveryDeadline.getDate() + input.deliveryDeadlineDays);

    const terms: ContractTerms = {
      description: input.description,
      goodsDescription: input.goodsDescription,
      quantity: input.quantity,
      unit: input.unit,
      unitPrice: Money.fromIDR(input.unitPriceAmount),
      deliveryDeadline,
      qualityRequirements: input.qualityRequirements,
      disputeResolutionDays: input.disputeResolutionDays || 7,
    };

    // 3. Buat fee structure (IMMUTABLE setelah ini)
    const feeStructure = FeeStructure.create({
      platformFeeBps: input.platformFeeBps,
      mediatorFeeBps: input.mediatorFeeBps,
      minimumPlatformFee: Money.fromIDR(5000),
      maximumPlatformFee: Money.fromIDR(500000),
    });

    // 4. Buat contract entity
    const contract = Contract.create({
      seller,
      buyer,
      mediator,
      terms,
      feeStructure,
      createdBy: input.requestedBy,
    });

    // 5. Hitung fee breakdown untuk response
    const feeBreakdown = feeStructure.calculateFees(contract.totalAmount);

    // 6. Simpan ke database
    await this.contractRepository.save(contract);

    this.logger.info('Contract saved to database', {
      correlationId: input.correlationId,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
    });

    // 7. Publish events
    const metadata: EventMetadata = {
      correlationId: input.correlationId,
      userId: input.requestedBy,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    const events = contract.pullDomainEvents();
    await this.eventPublisher.publishAll(events, metadata);

    // 8. Daftarkan ke blockchain (async, bisa retry)
    let blockchainTxHash: string | undefined;
    try {
      blockchainTxHash = await this.blockchainService.registerContract({
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        sellerWallet: seller.walletAddress || '',
        buyerWallet: buyer.walletAddress || '',
        mediatorWallet: mediator?.walletAddress,
        totalAmount: contract.totalAmount.amount,
        termsHash: this.hashTerms(terms),
        feeStructure: feeStructure.toSmartContractFormat(),
        transactionId: uuidv4(),
      });

      this.logger.info('Contract registered on blockchain', {
        correlationId: input.correlationId,
        contractId: contract.id,
        txHash: blockchainTxHash,
      });
    } catch (error) {
      // Log error tapi jangan gagalkan operasi
      // Background job akan retry
      this.logger.warn('Failed to register contract on blockchain, will retry', {
        correlationId: input.correlationId,
        contractId: contract.id,
        error: (error as Error).message,
      });
    }

    return {
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      totalAmount: contract.totalAmount.toString(),
      feeBreakdown: {
        platformFee: feeBreakdown.platformFee.toString(),
        mediatorFee: feeBreakdown.mediatorFee?.toString(),
        netToSeller: feeBreakdown.netAmount.toString(),
      },
      blockchainTxHash,
    };
  }

  private validateInput(input: CreateContractInput): void {
    if (!input.sellerId || !input.buyerId) {
      throw new ValidationError('Seller and buyer IDs are required');
    }

    if (input.sellerId === input.buyerId) {
      throw new ValidationError('Seller and buyer must be different');
    }

    if (input.quantity <= 0) {
      throw new ValidationError('Quantity must be positive');
    }

    if (input.unitPriceAmount <= 0) {
      throw new ValidationError('Unit price must be positive');
    }

    if (input.deliveryDeadlineDays <= 0) {
      throw new ValidationError('Delivery deadline must be in the future');
    }

    if (input.platformFeeBps < 0 || input.platformFeeBps > 1000) {
      throw new ValidationError('Platform fee must be between 0 and 10%');
    }

    if (input.mediatorFeeBps !== undefined && (input.mediatorFeeBps < 0 || input.mediatorFeeBps > 500)) {
      throw new ValidationError('Mediator fee must be between 0 and 5%');
    }

    // Jika ada mediator fee, harus ada mediator
    if (input.mediatorFeeBps && !input.mediatorId) {
      throw new ValidationError('Mediator is required when mediator fee is specified');
    }
  }

  private hashTerms(terms: ContractTerms): string {
    // Dalam implementasi nyata, gunakan keccak256
    const termsString = JSON.stringify({
      description: terms.description,
      goodsDescription: terms.goodsDescription,
      quantity: terms.quantity,
      unit: terms.unit,
      unitPrice: terms.unitPrice.amount,
      deliveryDeadline: terms.deliveryDeadline.toISOString(),
      qualityRequirements: terms.qualityRequirements,
    });

    // Placeholder - use ethers.keccak256 in real implementation
    return `0x${Buffer.from(termsString).toString('hex').slice(0, 64)}`;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
