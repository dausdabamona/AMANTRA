/**
 * AMANTRA - Ethers.js Blockchain Service Implementation
 *
 * Implementasi BlockchainService menggunakan ethers.js
 * dengan integrasi KMS untuk signing.
 *
 * PENTING: Private key tidak pernah di-expose ke frontend!
 */

import { ethers, Contract, Wallet } from 'ethers';
import {
  BlockchainService,
  RegisterContractParams,
  RecordFundingParams,
  RecordVerificationParams,
  RecordSettlementParams,
  RecordDisputeParams,
  RecordCancellationParams,
  ContractStatusOnChain,
} from '../../application/services/BlockchainService';
import { Logger } from '../../shared/Logger';

// ABI untuk AmantraContract (simplified)
const AMANTRA_CONTRACT_ABI = [
  'function createContract(bytes32 _contractId, string _contractNumber, address _seller, address _buyer, address _mediator, uint256 _totalAmount, bytes32 _termsHash, tuple(uint16 platformFeeBps, uint16 mediatorFeeBps, uint256 platformFixedFee, uint256 minimumPlatformFee, uint256 maximumPlatformFee) _feeStructure, bytes32 _transactionId) external',
  'function recordFunding(bytes32 _contractId, uint256 _amount, string _bankReference, bytes32 _transactionId) external',
  'function recordVerification(bytes32 _contractId, bytes32 _evidenceHash, bytes32 _transactionId) external',
  'function recordSettlement(bytes32 _contractId, uint256 _sellerAmount, uint256 _platformFee, uint256 _mediatorFee, string _settlementReference, bytes32 _transactionId) external',
  'function recordDispute(bytes32 _contractId, address _disputedBy, string _reason, bytes32 _transactionId) external',
  'function recordCancellation(bytes32 _contractId, string _reason, bool _refundRequired, bytes32 _transactionId) external',
  'function getContractStatus(bytes32 _contractId) external view returns (uint8)',
  'function isTransactionProcessed(bytes32 _transactionId) external view returns (bool)',
  'function getFeeStructure(bytes32 _contractId) external view returns (tuple(uint16 platformFeeBps, uint16 mediatorFeeBps, uint256 platformFixedFee, uint256 minimumPlatformFee, uint256 maximumPlatformFee))',
  'event ContractCreated(bytes32 indexed contractId, string contractNumber, address indexed seller, address indexed buyer, uint256 totalAmount, bytes32 termsHash)',
  'event ContractFunded(bytes32 indexed contractId, uint256 amount, string bankReference)',
  'event ContractVerified(bytes32 indexed contractId, address verifiedBy, bytes32 evidenceHash)',
  'event ContractSettled(bytes32 indexed contractId, uint256 sellerAmount, uint256 platformFee, uint256 mediatorFee, string settlementReference)',
  'event ContractDisputed(bytes32 indexed contractId, address disputedBy, string reason)',
  'event ContractCancelled(bytes32 indexed contractId, string reason, bool refundRequired)',
];

const STATUS_MAP: Record<number, ContractStatusOnChain> = {
  0: 'CREATED',
  1: 'FUNDED',
  2: 'VERIFIED',
  3: 'SETTLED',
  4: 'DISPUTED',
  5: 'CANCELLED',
};

export interface BlockchainConfig {
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  privateKey?: string; // Untuk development only!
  kmsKeyId?: string;   // Untuk production dengan KMS
}

export class EthersBlockchainService implements BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private signer: Wallet;
  private contract: Contract;

  constructor(
    private readonly config: BlockchainConfig,
    private readonly logger: Logger
  ) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);

    // PERINGATAN: Dalam production, gunakan KMS untuk signing!
    if (config.privateKey) {
      this.logger.warn('Using raw private key - NOT FOR PRODUCTION!');
      this.signer = new Wallet(config.privateKey, this.provider);
    } else {
      throw new Error('KMS integration required for production');
    }

    this.contract = new Contract(
      config.contractAddress,
      AMANTRA_CONTRACT_ABI,
      this.signer
    );
  }

  async registerContract(params: RegisterContractParams): Promise<string> {
    this.logger.info('Registering contract on blockchain', {
      contractId: params.contractId,
      contractNumber: params.contractNumber,
    });

    // Check idempotency
    const transactionIdBytes = this.stringToBytes32(params.transactionId);
    if (await this.isTransactionProcessed(params.transactionId)) {
      this.logger.warn('Transaction already processed', {
        transactionId: params.transactionId,
      });
      return 'ALREADY_PROCESSED';
    }

    const contractIdBytes = this.uuidToBytes32(params.contractId);

    const tx = await this.contract.createContract(
      contractIdBytes,
      params.contractNumber,
      params.sellerWallet || ethers.ZeroAddress,
      params.buyerWallet || ethers.ZeroAddress,
      params.mediatorWallet || ethers.ZeroAddress,
      params.totalAmount,
      params.termsHash,
      {
        platformFeeBps: params.feeStructure.platformFeeBps,
        mediatorFeeBps: params.feeStructure.mediatorFeeBps,
        platformFixedFee: params.feeStructure.platformFixedFee,
        minimumPlatformFee: params.feeStructure.minimumPlatformFee,
        maximumPlatformFee: params.feeStructure.maximumPlatformFee,
      },
      transactionIdBytes
    );

    const receipt = await tx.wait();

    this.logger.info('Contract registered on blockchain', {
      contractId: params.contractId,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    });

    return receipt.hash;
  }

  async recordFunding(params: RecordFundingParams): Promise<string> {
    this.logger.info('Recording funding on blockchain', {
      contractId: params.contractId,
      amount: params.amount,
    });

    const transactionIdBytes = this.stringToBytes32(params.transactionId);
    if (await this.isTransactionProcessed(params.transactionId)) {
      return 'ALREADY_PROCESSED';
    }

    const contractIdBytes = this.uuidToBytes32(params.contractId);

    const tx = await this.contract.recordFunding(
      contractIdBytes,
      params.amount,
      params.bankReference,
      transactionIdBytes
    );

    const receipt = await tx.wait();

    this.logger.info('Funding recorded on blockchain', {
      contractId: params.contractId,
      txHash: receipt.hash,
    });

    return receipt.hash;
  }

  async recordVerification(params: RecordVerificationParams): Promise<string> {
    this.logger.info('Recording verification on blockchain', {
      contractId: params.contractId,
    });

    const transactionIdBytes = this.stringToBytes32(params.transactionId);
    if (await this.isTransactionProcessed(params.transactionId)) {
      return 'ALREADY_PROCESSED';
    }

    const contractIdBytes = this.uuidToBytes32(params.contractId);

    const tx = await this.contract.recordVerification(
      contractIdBytes,
      params.evidenceHash,
      transactionIdBytes
    );

    const receipt = await tx.wait();

    this.logger.info('Verification recorded on blockchain', {
      contractId: params.contractId,
      txHash: receipt.hash,
    });

    return receipt.hash;
  }

  async recordSettlement(params: RecordSettlementParams): Promise<string> {
    this.logger.info('Recording settlement on blockchain', {
      contractId: params.contractId,
      sellerAmount: params.sellerAmount,
      platformFee: params.platformFee,
    });

    const transactionIdBytes = this.stringToBytes32(params.transactionId);
    if (await this.isTransactionProcessed(params.transactionId)) {
      return 'ALREADY_PROCESSED';
    }

    const contractIdBytes = this.uuidToBytes32(params.contractId);

    const tx = await this.contract.recordSettlement(
      contractIdBytes,
      params.sellerAmount,
      params.platformFee,
      params.mediatorFee,
      params.settlementReference,
      transactionIdBytes
    );

    const receipt = await tx.wait();

    this.logger.info('Settlement recorded on blockchain', {
      contractId: params.contractId,
      txHash: receipt.hash,
    });

    return receipt.hash;
  }

  async recordDispute(params: RecordDisputeParams): Promise<string> {
    this.logger.info('Recording dispute on blockchain', {
      contractId: params.contractId,
      disputedBy: params.disputedBy,
    });

    const transactionIdBytes = this.stringToBytes32(params.transactionId);
    if (await this.isTransactionProcessed(params.transactionId)) {
      return 'ALREADY_PROCESSED';
    }

    const contractIdBytes = this.uuidToBytes32(params.contractId);

    const tx = await this.contract.recordDispute(
      contractIdBytes,
      params.disputedBy,
      params.reason,
      transactionIdBytes
    );

    const receipt = await tx.wait();

    this.logger.info('Dispute recorded on blockchain', {
      contractId: params.contractId,
      txHash: receipt.hash,
    });

    return receipt.hash;
  }

  async recordCancellation(params: RecordCancellationParams): Promise<string> {
    this.logger.info('Recording cancellation on blockchain', {
      contractId: params.contractId,
      refundRequired: params.refundRequired,
    });

    const transactionIdBytes = this.stringToBytes32(params.transactionId);
    if (await this.isTransactionProcessed(params.transactionId)) {
      return 'ALREADY_PROCESSED';
    }

    const contractIdBytes = this.uuidToBytes32(params.contractId);

    const tx = await this.contract.recordCancellation(
      contractIdBytes,
      params.reason,
      params.refundRequired,
      transactionIdBytes
    );

    const receipt = await tx.wait();

    this.logger.info('Cancellation recorded on blockchain', {
      contractId: params.contractId,
      txHash: receipt.hash,
    });

    return receipt.hash;
  }

  async getContractStatus(contractId: string): Promise<ContractStatusOnChain> {
    try {
      const contractIdBytes = this.uuidToBytes32(contractId);
      const statusCode = await this.contract.getContractStatus(contractIdBytes);
      return STATUS_MAP[Number(statusCode)] || 'NOT_FOUND';
    } catch {
      return 'NOT_FOUND';
    }
  }

  async isTransactionProcessed(transactionId: string): Promise<boolean> {
    try {
      const transactionIdBytes = this.stringToBytes32(transactionId);
      return await this.contract.isTransactionProcessed(transactionIdBytes);
    } catch {
      return false;
    }
  }

  async getContractFeeStructure(contractId: string): Promise<{
    platformFeeBps: number;
    mediatorFeeBps: number;
  }> {
    const contractIdBytes = this.uuidToBytes32(contractId);
    const feeStructure = await this.contract.getFeeStructure(contractIdBytes);

    return {
      platformFeeBps: Number(feeStructure.platformFeeBps),
      mediatorFeeBps: Number(feeStructure.mediatorFeeBps),
    };
  }

  // ============================================
  // Helpers
  // ============================================

  private uuidToBytes32(uuid: string): string {
    // Remove hyphens and pad to 32 bytes
    const hex = uuid.replace(/-/g, '');
    return '0x' + hex.padStart(64, '0');
  }

  private stringToBytes32(str: string): string {
    // Hash string to get consistent 32 bytes
    return ethers.keccak256(ethers.toUtf8Bytes(str));
  }
}
