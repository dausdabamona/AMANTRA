/**
 * AMANTRA - Type Definitions
 */

// ============================================
// Enums
// ============================================

export enum ContractStatus {
  CREATED = 0,
  FUNDED = 1,
  VERIFIED = 2,
  SETTLED = 3,
  DISPUTED = 4,
  CANCELLED = 5,
}

export enum MultisigRole {
  OPERATOR = 0,
  ORACLE = 1,
  EMERGENCY = 2,
  ARBITRATION_COUNCIL = 3,
  HISBAH = 4,
  BACKUP = 5,
}

export enum SystemMode {
  NORMAL = 0,
  EMERGENCY = 1,
  RECOVERY = 2,
  DISSOLUTION = 3,
}

export enum DisputeRaiserType {
  BUYER = 0,
  SELLER = 1,
  OPERATOR = 2,
}

export enum ResolutionType {
  CONTINUE_SETTLEMENT = 0,
  REFUND_BUYER = 1,
  PAY_SELLER = 2,
  CUSTOM_SPLIT = 3,
}

export enum NetworkFeeBearer {
  PLATFORM = 0,
  SELLER = 1,
  BUYER = 2,
}

// ============================================
// Contract Types
// ============================================

export interface Contract {
  id: string;
  contractNumber: string;
  seller: string;
  buyer: string;
  sellerAddress: string;
  buyerAddress: string;
  totalAmount: bigint;
  status: ContractStatus;
  feeInfo: FeeInfo;
  escrowReference: string;
  bankId: string;
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface FeeInfo {
  bps: number;
  platformFee: bigint;
  sellerAmount: bigint;
  mediatorFee: bigint;
  networkFeeBearer: NetworkFeeBearer;
  estimatedNetworkFee: bigint;
  akadStatementHash: string;
}

export interface Dispute {
  active: boolean;
  reasonHash: string;
  evidenceHash: string;
  arbitrationHash: string;
  raisedAt: number;
  resolvedAt: number;
  raisedBy: string;
  raiserType: DisputeRaiserType;
  resolutionQueued: boolean;
  queuedResolutionHash: string;
  resolutionExecutableAt: number;
  queuedResolutionType: ResolutionType;
  appealed: boolean;
  appealHash: string;
}

// ============================================
// Governance Types
// ============================================

export interface MultisigConfig {
  multisigAddress: string;
  threshold: number;
  memberCount: number;
  lastValidatedAt: number;
  lastActivityAt: number;
  validated: boolean;
  active: boolean;
}

export interface SuccessionProposal {
  id: number;
  role: MultisigRole;
  currentHolder: string;
  proposedSuccessor: string;
  proposedBy: string;
  proposedAt: number;
  executeAfter: number;
  hisbahApproved: boolean;
  executed: boolean;
  cancelled: boolean;
  reason: string;
}

export interface UpgradeProposal {
  id: number;
  newImplementation: string;
  proposedBy: string;
  proposedAt: number;
  executeAfter: number;
  oracleApproved: boolean;
  hisbahApproved: boolean;
  announcedPublicly: boolean;
  executed: boolean;
  cancelled: boolean;
  codeHash: string;
}

export interface SystemContinuity {
  backupOracle: string;
  backupArbitrator: string;
  backupHisbah: string;
  backupOperator: string;
  lastOracleHeartbeat: number;
  lastArbitratorHeartbeat: number;
  lastOperatorHeartbeat: number;
  lastHisbahHeartbeat: number;
}

export interface BankEscrow {
  bankId: string;
  bankName: string;
  isPrimary: boolean;
  isActive: boolean;
  isFrozen: boolean;
  totalBalance: bigint;
  addedAt: number;
  lastActivityAt: number;
}

// ============================================
// Dead Man Switch Types
// ============================================

export interface DeadManSwitchStatus {
  role: MultisigRole;
  canTrigger: boolean;
  lastActivity: number;
  threshold: number;
  daysRemaining: number;
  percentElapsed: number;
}

// ============================================
// Event Types
// ============================================

export interface OnChainEvent {
  id: string;
  type: string;
  contractId?: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
  data: Record<string, unknown>;
}

export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: number;
  actor?: string;
  data?: Record<string, unknown>;
}

// ============================================
// UI Types
// ============================================

export interface NavItem {
  title: string;
  href: string;
  icon?: string;
  badge?: string | number;
  children?: NavItem[];
}

export interface StatCard {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
}

// ============================================
// User Types
// ============================================

export interface UserProfile {
  address: string;
  displayName?: string;
  avatar?: string;
  role: 'user' | 'operator' | 'arbitrator' | 'hisbah';
  createdAt: number;
  lastActive: number;
}

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  balance: bigint | null;
}

// ============================================
// Form Types
// ============================================

export interface CreateContractForm {
  counterpartyAddress: string;
  counterpartyRole: 'buyer' | 'seller';
  amount: string;
  description: string;
  deadline: Date;
  terms: string;
  akadStatement: string;
  feeBps: number;
  networkFeeBearer: NetworkFeeBearer;
}

export interface FileDisputeForm {
  contractId: string;
  reason: string;
  evidence: File[];
  additionalNotes?: string;
}

export interface ArbitrationDecisionForm {
  contractId: string;
  resolutionType: ResolutionType;
  findings: string;
  ruling: string;
  customSplit?: {
    buyerAmount: string;
    sellerAmount: string;
  };
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================
// Health & Monitoring Types
// ============================================

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  lastCheck: number;
  services: {
    blockchain: ServiceStatus;
    database: ServiceStatus;
    bank: ServiceStatus;
    ipfs: ServiceStatus;
  };
}

export interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  lastError?: string;
  lastCheck: number;
}

export interface GovernanceHealthReport {
  systemMode: SystemMode;
  multisigStatuses: MultisigConfig[];
  deadManSwitchStatuses: DeadManSwitchStatus[];
  pendingSuccessions: SuccessionProposal[];
  pendingUpgrades: UpgradeProposal[];
  bankStatuses: BankEscrow[];
  overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  recommendations: string[];
}
