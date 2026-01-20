/**
 * AMANTRA - Majelis Arbitrase Digital (Digital Arbitration Council)
 *
 * Domain types for the arbitration system following Islamic ethical principles:
 * "Uang dikunci oleh teknologi, keputusan dikunci oleh amanah manusia,
 *  dan keadilan tidak boleh berada di satu tangan."
 *
 * @module escrow/domain/arbitration
 */

// ============================================
// Enums
// ============================================

/**
 * Type of entity that raised the dispute
 */
export enum DisputeRaiserType {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
  OPERATOR = 'OPERATOR',
}

/**
 * On-chain dispute raiser type (matches Solidity enum)
 */
export const DisputeRaiserTypeOnChain = {
  BUYER: 0,
  SELLER: 1,
  OPERATOR: 2,
} as const;

/**
 * Resolution type for dispute outcome
 */
export enum ResolutionType {
  /** Proceed with settlement (status -> VERIFIED) */
  CONTINUE_SETTLEMENT = 'CONTINUE_SETTLEMENT',
  /** Full refund to buyer (status -> CANCELLED) */
  REFUND_BUYER = 'REFUND_BUYER',
  /** Full payment to seller (status -> VERIFIED -> SETTLED) */
  PAY_SELLER = 'PAY_SELLER',
  /** Custom split between parties */
  CUSTOM_SPLIT = 'CUSTOM_SPLIT',
}

/**
 * On-chain resolution type (matches Solidity enum)
 */
export const ResolutionTypeOnChain = {
  CONTINUE_SETTLEMENT: 0,
  REFUND_BUYER: 1,
  PAY_SELLER: 2,
  CUSTOM_SPLIT: 3,
} as const;

/**
 * Status of a dispute in the arbitration process
 */
export enum DisputeStatus {
  /** Dispute raised, awaiting review */
  SUBMITTED = 'SUBMITTED',
  /** Evidence collection in progress */
  EVIDENCE_COLLECTION = 'EVIDENCE_COLLECTION',
  /** Under review by arbitration council */
  UNDER_REVIEW = 'UNDER_REVIEW',
  /** Resolution decision made, queued with timelock */
  RESOLUTION_QUEUED = 'RESOLUTION_QUEUED',
  /** Timelock expired, resolution executed */
  RESOLVED = 'RESOLVED',
  /** Dispute cancelled or withdrawn */
  CANCELLED = 'CANCELLED',
}

/**
 * Type of evidence submitted
 */
export enum EvidenceType {
  /** Text document (PDF, DOC) */
  DOCUMENT = 'DOCUMENT',
  /** Photo evidence */
  PHOTO = 'PHOTO',
  /** Video evidence */
  VIDEO = 'VIDEO',
  /** Chat/message history */
  CHAT_LOG = 'CHAT_LOG',
  /** Transaction receipt */
  RECEIPT = 'RECEIPT',
  /** Shipping/delivery proof */
  DELIVERY_PROOF = 'DELIVERY_PROOF',
  /** Quality inspection report */
  QC_REPORT = 'QC_REPORT',
  /** Other evidence type */
  OTHER = 'OTHER',
}

/**
 * Role in the arbitration council
 */
export enum ArbitratorRole {
  /** Lead arbitrator with additional responsibilities */
  LEAD = 'LEAD',
  /** Regular council member */
  MEMBER = 'MEMBER',
  /** Expert witness (non-voting) */
  EXPERT = 'EXPERT',
}

// ============================================
// Interfaces
// ============================================

/**
 * Evidence item submitted for a dispute
 */
export interface DisputeEvidence {
  /** Unique evidence identifier */
  id: string;
  /** Contract ID this evidence belongs to */
  contractId: string;
  /** Dispute ID this evidence is for */
  disputeId: string;
  /** IPFS hash of the evidence file */
  ipfsHash: string;
  /** SHA-256 hash of the file content */
  contentHash: string;
  /** Type of evidence */
  evidenceType: EvidenceType;
  /** Human-readable description */
  description: string;
  /** Who submitted this evidence */
  submittedBy: string;
  /** Submitter's role (buyer/seller/operator) */
  submitterRole: DisputeRaiserType;
  /** Original filename */
  filename?: string;
  /** File size in bytes */
  fileSize?: number;
  /** MIME type */
  mimeType?: string;
  /** When evidence was submitted */
  submittedAt: Date;
  /** On-chain transaction hash if recorded */
  txHash?: string;
  /** Block number if recorded on-chain */
  blockNumber?: number;
}

/**
 * Dispute record from on-chain event
 */
export interface OnChainDispute {
  contractId: string;
  reasonHash: string;
  evidenceHash: string;
  raisedBy: string;
  raiserType: number;
  raisedAt: number;
  blockNumber: number;
  txHash: string;
}

/**
 * Resolution queue record from on-chain event
 */
export interface OnChainResolutionQueued {
  contractId: string;
  resolutionHash: string;
  resolutionType: number;
  executableAt: number;
  queuedBy: string;
  queuedAt: number;
  blockNumber: number;
  txHash: string;
}

/**
 * Resolution execution record from on-chain event
 */
export interface OnChainResolutionExecuted {
  contractId: string;
  arbitrationHash: string;
  resolutionType: number;
  finalStatus: number;
  executedBy: string;
  executedAt: number;
  blockNumber: number;
  txHash: string;
}

/**
 * Dispute entity for database storage
 */
export interface DisputeEntity {
  id: string;
  contractId: string;
  contractNumber: string;
  status: DisputeStatus;

  // Raiser information
  raisedBy: string;
  raiserType: DisputeRaiserType;
  raiserAddress: string;

  // Reason and evidence
  reasonHash: string;
  reasonText?: string;
  initialEvidenceHash: string;

  // Timeline
  raisedAt: Date;
  evidenceDeadline?: Date;
  reviewStartedAt?: Date;
  resolutionQueuedAt?: Date;
  resolutionExecutableAt?: Date;
  resolvedAt?: Date;

  // Resolution
  resolutionType?: ResolutionType;
  arbitrationHash?: string;
  arbitrationDocumentUrl?: string;
  finalStatus?: string;

  // Blockchain references
  raiseTxHash: string;
  raiseBlockNumber: number;
  queueTxHash?: string;
  queueBlockNumber?: number;
  executeTxHash?: string;
  executeBlockNumber?: number;

  // Metadata
  buyerAddress: string;
  sellerAddress: string;
  totalAmount: number;
  currency: string;

  createdAt: Date;
  updatedAt: Date;
  version: number;
}

/**
 * Arbitration council member
 */
export interface ArbitratorMember {
  id: string;
  address: string;
  name: string;
  role: ArbitratorRole;
  expertise?: string[];
  isActive: boolean;
  joinedAt: Date;
  conflictOfInterestDeclaration?: string;
}

/**
 * Arbitration council configuration
 */
export interface ArbitrationCouncilConfig {
  /** Gnosis Safe multisig address */
  multisigAddress: string;
  /** Required signature threshold */
  threshold: number;
  /** Total council members */
  memberCount: number;
  /** When last validated */
  lastValidatedAt: Date;
  /** Minimum threshold allowed */
  minThreshold: number;
  /** Minimum members allowed */
  minMembers: number;
  /** Resolution timelock delay in seconds */
  resolutionDelaySeconds: number;
}

/**
 * Arbitration decision document
 */
export interface ArbitrationDecision {
  /** Unique decision identifier */
  id: string;
  /** Dispute this decision is for */
  disputeId: string;
  /** Contract ID */
  contractId: string;

  /** Resolution type */
  resolutionType: ResolutionType;

  /** Decision summary */
  summary: string;

  /** Detailed reasoning */
  reasoning: string;

  /** Evidence considered */
  evidenceConsidered: string[];

  /** Custom split amounts (if CUSTOM_SPLIT) */
  customSplit?: {
    buyerAmount: number;
    sellerAmount: number;
    platformAmount: number;
  };

  /** Council members who signed */
  signers: string[];

  /** Hash of the decision PDF */
  documentHash: string;

  /** IPFS hash of the decision PDF */
  ipfsHash: string;

  /** When decision was made */
  decidedAt: Date;

  /** When queued on-chain */
  queuedAt?: Date;

  /** When executable (after timelock) */
  executableAt?: Date;

  /** When executed on-chain */
  executedAt?: Date;
}

/**
 * Dispute submission request from API
 */
export interface RaiseDisputeRequest {
  contractId: string;
  reason: string;
  evidenceFiles?: {
    file: Buffer;
    filename: string;
    mimeType: string;
    evidenceType: EvidenceType;
    description: string;
  }[];
}

/**
 * Evidence submission request
 */
export interface SubmitEvidenceRequest {
  contractId: string;
  disputeId: string;
  file: Buffer;
  filename: string;
  mimeType: string;
  evidenceType: EvidenceType;
  description: string;
}

/**
 * Resolution queue request (from arbitration council)
 */
export interface QueueResolutionRequest {
  contractId: string;
  disputeId: string;
  resolutionType: ResolutionType;
  summary: string;
  reasoning: string;
  evidenceConsidered: string[];
  customSplit?: {
    buyerAmount: number;
    sellerAmount: number;
    platformAmount: number;
  };
  signers: string[];
}

/**
 * Dispute timeline event
 */
export interface DisputeTimelineEvent {
  id: string;
  disputeId: string;
  eventType: string;
  description: string;
  performedBy: string;
  data?: Record<string, unknown>;
  txHash?: string;
  blockNumber?: number;
  timestamp: Date;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Converts on-chain raiser type to domain enum
 */
export function toDisputeRaiserType(onChainType: number): DisputeRaiserType {
  switch (onChainType) {
    case 0:
      return DisputeRaiserType.BUYER;
    case 1:
      return DisputeRaiserType.SELLER;
    case 2:
      return DisputeRaiserType.OPERATOR;
    default:
      return DisputeRaiserType.OPERATOR;
  }
}

/**
 * Converts domain raiser type to on-chain value
 */
export function toOnChainRaiserType(type: DisputeRaiserType): number {
  return DisputeRaiserTypeOnChain[type];
}

/**
 * Converts on-chain resolution type to domain enum
 */
export function toResolutionType(onChainType: number): ResolutionType {
  switch (onChainType) {
    case 0:
      return ResolutionType.CONTINUE_SETTLEMENT;
    case 1:
      return ResolutionType.REFUND_BUYER;
    case 2:
      return ResolutionType.PAY_SELLER;
    case 3:
      return ResolutionType.CUSTOM_SPLIT;
    default:
      return ResolutionType.CONTINUE_SETTLEMENT;
  }
}

/**
 * Converts domain resolution type to on-chain value
 */
export function toOnChainResolutionType(type: ResolutionType): number {
  return ResolutionTypeOnChain[type];
}

/**
 * Gets human-readable description of dispute status
 */
export function getDisputeStatusDescription(status: DisputeStatus): string {
  const descriptions: Record<DisputeStatus, string> = {
    [DisputeStatus.SUBMITTED]:
      'Sengketa telah diajukan dan menunggu pengumpulan bukti.',
    [DisputeStatus.EVIDENCE_COLLECTION]:
      'Dalam tahap pengumpulan bukti dari kedua pihak.',
    [DisputeStatus.UNDER_REVIEW]:
      'Sedang ditinjau oleh Majelis Arbitrase Digital.',
    [DisputeStatus.RESOLUTION_QUEUED]:
      'Keputusan telah dibuat dan menunggu masa tunggu sebelum eksekusi.',
    [DisputeStatus.RESOLVED]:
      'Sengketa telah diselesaikan dan keputusan telah dieksekusi.',
    [DisputeStatus.CANCELLED]: 'Sengketa dibatalkan atau ditarik.',
  };
  return descriptions[status] || `Status: ${status}`;
}

/**
 * Gets human-readable description of resolution type
 */
export function getResolutionTypeDescription(type: ResolutionType): string {
  const descriptions: Record<ResolutionType, string> = {
    [ResolutionType.CONTINUE_SETTLEMENT]:
      'Lanjutkan proses settlement - dana akan ditransfer ke penjual.',
    [ResolutionType.REFUND_BUYER]:
      'Pengembalian dana penuh kepada pembeli - kontrak dibatalkan.',
    [ResolutionType.PAY_SELLER]:
      'Pembayaran penuh kepada penjual - transaksi diselesaikan.',
    [ResolutionType.CUSTOM_SPLIT]:
      'Pembagian dana khusus sesuai keputusan majelis.',
  };
  return descriptions[type] || `Tipe: ${type}`;
}

/**
 * Calculates timelock remaining time
 */
export function getTimelockRemaining(executableAt: Date): {
  expired: boolean;
  remainingSeconds: number;
  remainingHuman: string;
} {
  const now = new Date();
  const execTime = new Date(executableAt);
  const remainingMs = execTime.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return {
      expired: true,
      remainingSeconds: 0,
      remainingHuman: 'Dapat dieksekusi sekarang',
    };
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);

  return {
    expired: false,
    remainingSeconds,
    remainingHuman: `${hours} jam ${minutes} menit lagi`,
  };
}

/**
 * Validates evidence file
 */
export function validateEvidenceFile(
  file: Buffer,
  mimeType: string,
  maxSizeBytes: number = 50 * 1024 * 1024, // 50MB default
): { valid: boolean; error?: string } {
  // Check size
  if (file.length > maxSizeBytes) {
    return {
      valid: false,
      error: `File terlalu besar. Maksimal ${maxSizeBytes / 1024 / 1024}MB`,
    };
  }

  // Check allowed MIME types
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'text/plain',
    'application/json',
  ];

  if (!allowedTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `Tipe file tidak didukung: ${mimeType}`,
    };
  }

  return { valid: true };
}
