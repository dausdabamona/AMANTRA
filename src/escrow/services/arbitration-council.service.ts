/**
 * AMANTRA - Majelis Arbitrase Digital Service
 *
 * Backend service for managing the Digital Arbitration Council.
 * Handles dispute lifecycle, evidence management, and resolution execution.
 *
 * ETHICAL PRINCIPLE:
 * "Uang dikunci oleh teknologi, keputusan dikunci oleh amanah manusia,
 *  dan keadilan tidak boleh berada di satu tangan."
 *
 * @module escrow/services/arbitration-council
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';
import { createHash } from 'crypto';

import {
  DisputeStatus,
  DisputeRaiserType,
  ResolutionType,
  EvidenceType,
  DisputeEntity,
  DisputeEvidence,
  ArbitrationDecision,
  ArbitrationCouncilConfig,
  RaiseDisputeRequest,
  SubmitEvidenceRequest,
  QueueResolutionRequest,
  DisputeTimelineEvent,
  toOnChainResolutionType,
  toDisputeRaiserType,
  toResolutionType,
  getTimelockRemaining,
  validateEvidenceFile,
} from '../domain/arbitration.types';

// ============================================
// ABI for AmantraLedgerV3
// ============================================

const AMANTRA_LEDGER_V3_ABI = [
  // Dispute functions
  'function raiseDispute(bytes32 contractId, bytes32 reasonHash, bytes32 evidenceHash, bytes32 transactionRef) external',
  'function submitEvidence(bytes32 contractId, bytes32 evidenceHash, string evidenceType) external',
  'function queueResolution(bytes32 contractId, bytes32 arbitrationHash, uint8 resolutionType) external',
  'function executeResolution(bytes32 contractId, bytes32 arbitrationHash, bytes32 transactionRef) external',
  'function cancelQueuedResolution(bytes32 contractId, string reason) external',

  // View functions
  'function getDispute(bytes32 contractId) external view returns (tuple(bool active, bytes32 reasonHash, bytes32 evidenceHash, bytes32 arbitrationHash, uint64 raisedAt, uint64 resolvedAt, address raisedBy, uint8 raiserType, bool resolutionQueued, bytes32 queuedResolutionHash, uint64 resolutionExecutableAt, uint8 queuedResolutionType))',
  'function getContract(bytes32 contractId) external view returns (tuple(bytes32 id, bytes32 contractNumber, bytes32 seller, bytes32 buyer, address sellerAddress, address buyerAddress, uint256 totalAmount, uint8 status, tuple(uint16 bps, uint256 platformFee, uint256 sellerAmount, uint256 mediatorFee, uint8 networkFeeBearer, uint256 estimatedNetworkFee, bytes32 akadStatementHash) feeInfo, bytes32 escrowReference, uint64 createdAt, uint64 updatedAt, uint32 version))',
  'function isContractParty(bytes32 contractId, address addr) external view returns (bool)',
  'function getArbitrationCouncilInfo() external view returns (tuple(address multisigAddress, uint256 threshold, uint256 memberCount, bool validated, uint64 lastValidatedAt))',
  'function resolutionDelay() external view returns (uint64)',

  // Events
  'event DisputeRaised(bytes32 indexed contractId, bytes32 indexed reasonHash, bytes32 indexed evidenceHash, address raisedBy, uint8 raiserType, uint64 timestamp)',
  'event EvidenceSubmitted(bytes32 indexed contractId, bytes32 indexed evidenceHash, address submittedBy, string evidenceType, uint64 timestamp)',
  'event ResolutionQueued(bytes32 indexed contractId, bytes32 indexed resolutionHash, uint8 resolutionType, uint64 executableAt, address queuedBy, uint64 timestamp)',
  'event ResolutionExecuted(bytes32 indexed contractId, bytes32 indexed arbitrationHash, uint8 resolutionType, uint8 finalStatus, address executedBy, uint64 timestamp)',
  'event ResolutionCancelled(bytes32 indexed contractId, bytes32 indexed resolutionHash, address cancelledBy, string reason, uint64 timestamp)',
];

// ============================================
// Service Interface
// ============================================

export interface ArbitrationServiceConfig {
  contractAddress: string;
  rpcUrl: string;
  councilPrivateKey?: string; // For council operations (should be from KMS in production)
  ipfsGateway: string;
}

export interface DisputeRaiseResult {
  success: boolean;
  disputeId?: string;
  txHash?: string;
  blockNumber?: number;
  error?: string;
}

export interface ResolutionQueueResult {
  success: boolean;
  executableAt?: Date;
  resolutionHash?: string;
  txHash?: string;
  error?: string;
}

export interface ResolutionExecuteResult {
  success: boolean;
  finalStatus?: string;
  txHash?: string;
  blockNumber?: number;
  error?: string;
}

// ============================================
// Service Implementation
// ============================================

@Injectable()
export class ArbitrationCouncilService implements OnModuleInit {
  private readonly logger = new Logger(ArbitrationCouncilService.name);

  private provider: JsonRpcProvider | null = null;
  private contract: Contract | null = null;
  private councilSigner: Wallet | null = null;
  private contractAddress: string | null = null;
  private ipfsGateway: string = '';

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeBlockchainConnection();
  }

  private async initializeBlockchainConnection(): Promise<void> {
    const rpcUrl = this.configService.get<string>('BLOCKCHAIN_RPC_URL');
    this.contractAddress = this.configService.get<string>('AMANTRA_LEDGER_V3_ADDRESS') || null;
    this.ipfsGateway = this.configService.get<string>('IPFS_GATEWAY') || 'https://ipfs.io/ipfs/';

    if (!rpcUrl || !this.contractAddress) {
      this.logger.warn('Blockchain config not set - running in mock mode');
      return;
    }

    try {
      this.provider = new JsonRpcProvider(rpcUrl);
      const network = await this.provider.getNetwork();
      this.logger.log(`Connected to blockchain: chainId=${network.chainId}`);

      // Create read-only contract
      this.contract = new Contract(
        this.contractAddress,
        AMANTRA_LEDGER_V3_ABI,
        this.provider,
      );

      // Council signer (for council operations - should use KMS in production)
      const councilKey = this.configService.get<string>('ARBITRATION_COUNCIL_PRIVATE_KEY');
      if (councilKey) {
        this.councilSigner = new Wallet(councilKey, this.provider);
        this.logger.log(`Council signer initialized: ${await this.councilSigner.getAddress()}`);
      }

      this.logger.log(`ArbitrationCouncilService initialized at ${this.contractAddress}`);
    } catch (error) {
      this.logger.error(`Failed to initialize: ${error}`);
    }
  }

  // ============================================
  // Dispute Lifecycle Methods
  // ============================================

  /**
   * Raises a dispute on behalf of a contract party.
   *
   * PRINCIPLE: "Parties must have direct access to justice"
   */
  async raiseDispute(
    request: RaiseDisputeRequest,
    callerAddress: string,
    signer: Wallet,
  ): Promise<DisputeRaiseResult> {
    if (!this.contract || !this.provider) {
      return { success: false, error: 'Blockchain not connected' };
    }

    try {
      const contractIdBytes = this.toBytes32(request.contractId);

      // Verify caller is a contract party
      const isParty = await this.contract.isContractParty(contractIdBytes, callerAddress);
      if (!isParty) {
        return { success: false, error: 'Caller is not a party to this contract' };
      }

      // Hash the reason
      const reasonHash = this.hashString(request.reason);

      // Upload evidence to IPFS and get hash (mock for now)
      const evidenceHash = request.evidenceFiles?.length
        ? await this.uploadEvidenceToIPFS(request.evidenceFiles[0])
        : ethers.ZeroHash;

      // Generate transaction reference
      const transactionRef = this.generateTransactionRef('DISPUTE', request.contractId);

      // Execute on-chain
      const contractWithSigner = this.contract.connect(signer) as Contract;
      const tx = await contractWithSigner.raiseDispute(
        contractIdBytes,
        reasonHash,
        evidenceHash,
        transactionRef,
      );

      const receipt = await tx.wait(1);

      this.logger.log(`Dispute raised for contract ${request.contractId}: ${receipt.hash}`);

      // Emit event
      this.eventEmitter.emit('dispute.raised', {
        contractId: request.contractId,
        reasonHash,
        evidenceHash,
        raisedBy: callerAddress,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        success: true,
        disputeId: `${request.contractId}-${receipt.blockNumber}`,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error: any) {
      this.logger.error(`Failed to raise dispute: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Submits additional evidence for a dispute.
   */
  async submitEvidence(
    request: SubmitEvidenceRequest,
    callerAddress: string,
    signer: Wallet,
  ): Promise<{ success: boolean; evidenceId?: string; txHash?: string; error?: string }> {
    if (!this.contract || !this.provider) {
      return { success: false, error: 'Blockchain not connected' };
    }

    try {
      // Validate file
      const validation = validateEvidenceFile(request.file, request.mimeType);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const contractIdBytes = this.toBytes32(request.contractId);

      // Verify caller is a contract party
      const isParty = await this.contract.isContractParty(contractIdBytes, callerAddress);
      if (!isParty) {
        return { success: false, error: 'Caller is not a party to this contract' };
      }

      // Upload to IPFS
      const evidenceHash = await this.uploadEvidenceToIPFS({
        file: request.file,
        filename: request.filename,
        mimeType: request.mimeType,
        evidenceType: request.evidenceType,
        description: request.description,
      });

      // Submit on-chain
      const contractWithSigner = this.contract.connect(signer) as Contract;
      const tx = await contractWithSigner.submitEvidence(
        contractIdBytes,
        evidenceHash,
        request.evidenceType,
      );

      const receipt = await tx.wait(1);

      this.logger.log(`Evidence submitted for dispute ${request.disputeId}: ${receipt.hash}`);

      return {
        success: true,
        evidenceId: evidenceHash,
        txHash: receipt.hash,
      };
    } catch (error: any) {
      this.logger.error(`Failed to submit evidence: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Queues a resolution decision (starts timelock).
   *
   * PRINCIPLE: "Decisions must go through cooling period for transparency"
   */
  async queueResolution(request: QueueResolutionRequest): Promise<ResolutionQueueResult> {
    if (!this.contract || !this.provider || !this.councilSigner) {
      return { success: false, error: 'Blockchain or council signer not connected' };
    }

    try {
      const contractIdBytes = this.toBytes32(request.contractId);

      // Create arbitration decision document
      const decision: ArbitrationDecision = {
        id: this.generateUUID(),
        disputeId: request.disputeId,
        contractId: request.contractId,
        resolutionType: request.resolutionType,
        summary: request.summary,
        reasoning: request.reasoning,
        evidenceConsidered: request.evidenceConsidered,
        customSplit: request.customSplit,
        signers: request.signers,
        documentHash: '', // Will be set after creating PDF
        ipfsHash: '', // Will be set after IPFS upload
        decidedAt: new Date(),
      };

      // Generate document hash
      const documentContent = JSON.stringify({
        ...decision,
        timestamp: decision.decidedAt.toISOString(),
      });
      const documentHash = this.hashString(documentContent);
      decision.documentHash = documentHash;

      // Upload to IPFS (mock)
      const ipfsHash = await this.uploadDecisionToIPFS(decision);
      decision.ipfsHash = ipfsHash;

      // Queue on-chain
      const arbitrationHash = this.toBytes32(documentHash);
      const resolutionTypeOnChain = toOnChainResolutionType(request.resolutionType);

      const contractWithSigner = this.contract.connect(this.councilSigner) as Contract;
      const tx = await contractWithSigner.queueResolution(
        contractIdBytes,
        arbitrationHash,
        resolutionTypeOnChain,
      );

      const receipt = await tx.wait(1);

      // Get executable time from contract
      const resolutionDelay = await this.contract.resolutionDelay();
      const executableAt = new Date(Date.now() + Number(resolutionDelay) * 1000);

      this.logger.log(
        `Resolution queued for contract ${request.contractId}. ` +
        `Executable at: ${executableAt.toISOString()}`
      );

      // Emit event
      this.eventEmitter.emit('resolution.queued', {
        contractId: request.contractId,
        disputeId: request.disputeId,
        resolutionType: request.resolutionType,
        arbitrationHash: documentHash,
        executableAt,
        txHash: receipt.hash,
      });

      return {
        success: true,
        executableAt,
        resolutionHash: documentHash,
        txHash: receipt.hash,
      };
    } catch (error: any) {
      this.logger.error(`Failed to queue resolution: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Executes a queued resolution after timelock expires.
   *
   * PRINCIPLE: "Decisions are final and executed automatically"
   */
  async executeResolution(
    contractId: string,
    arbitrationHash: string,
  ): Promise<ResolutionExecuteResult> {
    if (!this.contract || !this.provider || !this.councilSigner) {
      return { success: false, error: 'Blockchain or council signer not connected' };
    }

    try {
      const contractIdBytes = this.toBytes32(contractId);

      // Verify timelock has expired
      const dispute = await this.contract.getDispute(contractIdBytes);
      if (!dispute.resolutionQueued) {
        return { success: false, error: 'No resolution queued for this contract' };
      }

      const executableAt = new Date(Number(dispute.resolutionExecutableAt) * 1000);
      const timelockStatus = getTimelockRemaining(executableAt);

      if (!timelockStatus.expired) {
        return {
          success: false,
          error: `Timelock belum berakhir. ${timelockStatus.remainingHuman}`,
        };
      }

      // Verify hash matches
      const arbitrationHashBytes = this.toBytes32(arbitrationHash);
      if (dispute.queuedResolutionHash !== arbitrationHashBytes) {
        return { success: false, error: 'Arbitration hash does not match queued resolution' };
      }

      // Generate transaction reference
      const transactionRef = this.generateTransactionRef('EXECUTE', contractId);

      // Execute on-chain
      const contractWithSigner = this.contract.connect(this.councilSigner) as Contract;
      const tx = await contractWithSigner.executeResolution(
        contractIdBytes,
        arbitrationHashBytes,
        transactionRef,
      );

      const receipt = await tx.wait(1);

      // Get final status
      const contractData = await this.contract.getContract(contractIdBytes);
      const finalStatus = this.statusToString(Number(contractData.status));

      this.logger.log(
        `Resolution executed for contract ${contractId}. ` +
        `Final status: ${finalStatus}`
      );

      // Emit event
      this.eventEmitter.emit('resolution.executed', {
        contractId,
        arbitrationHash,
        finalStatus,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        success: true,
        finalStatus,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error: any) {
      this.logger.error(`Failed to execute resolution: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancels a queued resolution (before timelock expires).
   */
  async cancelQueuedResolution(
    contractId: string,
    reason: string,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!this.contract || !this.provider || !this.councilSigner) {
      return { success: false, error: 'Blockchain or council signer not connected' };
    }

    try {
      const contractIdBytes = this.toBytes32(contractId);

      const contractWithSigner = this.contract.connect(this.councilSigner) as Contract;
      const tx = await contractWithSigner.cancelQueuedResolution(contractIdBytes, reason);

      const receipt = await tx.wait(1);

      this.logger.log(`Resolution cancelled for contract ${contractId}: ${reason}`);

      // Emit event
      this.eventEmitter.emit('resolution.cancelled', {
        contractId,
        reason,
        txHash: receipt.hash,
      });

      return {
        success: true,
        txHash: receipt.hash,
      };
    } catch (error: any) {
      this.logger.error(`Failed to cancel resolution: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // Query Methods
  // ============================================

  /**
   * Gets dispute details from blockchain.
   */
  async getDispute(contractId: string): Promise<{
    active: boolean;
    reasonHash: string;
    evidenceHash: string;
    arbitrationHash: string;
    raisedAt: Date;
    resolvedAt: Date | null;
    raisedBy: string;
    raiserType: DisputeRaiserType;
    resolutionQueued: boolean;
    queuedResolutionHash: string;
    resolutionExecutableAt: Date | null;
    queuedResolutionType: ResolutionType;
  } | null> {
    if (!this.contract) {
      return null;
    }

    try {
      const contractIdBytes = this.toBytes32(contractId);
      const dispute = await this.contract.getDispute(contractIdBytes);

      return {
        active: dispute.active,
        reasonHash: dispute.reasonHash,
        evidenceHash: dispute.evidenceHash,
        arbitrationHash: dispute.arbitrationHash,
        raisedAt: new Date(Number(dispute.raisedAt) * 1000),
        resolvedAt: dispute.resolvedAt > 0
          ? new Date(Number(dispute.resolvedAt) * 1000)
          : null,
        raisedBy: dispute.raisedBy,
        raiserType: toDisputeRaiserType(Number(dispute.raiserType)),
        resolutionQueued: dispute.resolutionQueued,
        queuedResolutionHash: dispute.queuedResolutionHash,
        resolutionExecutableAt: dispute.resolutionExecutableAt > 0
          ? new Date(Number(dispute.resolutionExecutableAt) * 1000)
          : null,
        queuedResolutionType: toResolutionType(Number(dispute.queuedResolutionType)),
      };
    } catch (error: any) {
      this.logger.error(`Failed to get dispute: ${error.message}`);
      return null;
    }
  }

  /**
   * Gets arbitration council info from blockchain.
   */
  async getCouncilInfo(): Promise<ArbitrationCouncilConfig | null> {
    if (!this.contract) {
      return null;
    }

    try {
      const info = await this.contract.getArbitrationCouncilInfo();
      const resolutionDelay = await this.contract.resolutionDelay();

      return {
        multisigAddress: info.multisigAddress,
        threshold: Number(info.threshold),
        memberCount: Number(info.memberCount),
        lastValidatedAt: new Date(Number(info.lastValidatedAt) * 1000),
        minThreshold: 2,
        minMembers: 3,
        resolutionDelaySeconds: Number(resolutionDelay),
      };
    } catch (error: any) {
      this.logger.error(`Failed to get council info: ${error.message}`);
      return null;
    }
  }

  /**
   * Checks if an address is a contract party.
   */
  async isContractParty(contractId: string, address: string): Promise<boolean> {
    if (!this.contract) {
      return false;
    }

    try {
      const contractIdBytes = this.toBytes32(contractId);
      return await this.contract.isContractParty(contractIdBytes, address);
    } catch (error) {
      return false;
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  private toBytes32(value: string): string {
    if (value.startsWith('0x') && value.length === 66) {
      return value;
    }
    return ethers.id(value);
  }

  private hashString(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private generateTransactionRef(prefix: string, contractId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return this.toBytes32(`${prefix}-${contractId}-${timestamp}-${random}`);
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private statusToString(status: number): string {
    const statuses = ['CREATED', 'FUNDED', 'VERIFIED', 'SETTLED', 'DISPUTED', 'CANCELLED'];
    return statuses[status] || `UNKNOWN(${status})`;
  }

  /**
   * Uploads evidence to IPFS (mock implementation).
   * In production, this should use actual IPFS or Pinata.
   */
  private async uploadEvidenceToIPFS(evidence: {
    file: Buffer;
    filename: string;
    mimeType: string;
    evidenceType: EvidenceType;
    description: string;
  }): Promise<string> {
    // Mock: Generate hash from file content
    const contentHash = createHash('sha256').update(evidence.file).digest('hex');
    const ipfsHash = `Qm${contentHash.substring(0, 44)}`;

    this.logger.log(`Evidence uploaded to IPFS (mock): ${ipfsHash}`);

    return this.toBytes32(ipfsHash);
  }

  /**
   * Uploads arbitration decision to IPFS (mock implementation).
   */
  private async uploadDecisionToIPFS(decision: ArbitrationDecision): Promise<string> {
    const content = JSON.stringify(decision);
    const contentHash = createHash('sha256').update(content).digest('hex');
    const ipfsHash = `Qm${contentHash.substring(0, 44)}`;

    this.logger.log(`Decision uploaded to IPFS (mock): ${ipfsHash}`);

    return ipfsHash;
  }
}
