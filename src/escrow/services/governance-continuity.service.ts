/**
 * AMANTRA - Governance Continuity Service
 *
 * Backend integration hooks for AmantraLedgerV5 governance features:
 * - Dead Man Switch monitoring
 * - Succession management
 * - Heartbeat automation
 * - Multi-bank escrow management
 * - System mode monitoring
 *
 * @module escrow/services/governance-continuity
 *
 * ETHICAL PRINCIPLE:
 * "Al-amru idza ta'allaqa bi huquqil 'ibad la yajuzu an yu'allaqa bi fardh wahid."
 * (Urusan hak manusia tidak boleh bergantung pada satu orang)
 */

import { ethers, Contract, Signer } from 'ethers';
import { Logger } from '@nestjs/common';

// ============================================
// Types & Interfaces
// ============================================

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

export interface MultisigConfig {
  multisigAddress: string;
  threshold: bigint;
  memberCount: bigint;
  lastValidatedAt: bigint;
  lastActivityAt: bigint;
  validated: boolean;
  active: boolean;
}

export interface SystemContinuity {
  backupOracle: string;
  backupArbitrator: string;
  backupHisbah: string;
  backupOperator: string;
  lastOracleHeartbeat: bigint;
  lastArbitratorHeartbeat: bigint;
  lastOperatorHeartbeat: bigint;
  lastHisbahHeartbeat: bigint;
}

export interface SuccessionProposal {
  role: MultisigRole;
  currentHolder: string;
  proposedSuccessor: string;
  proposedBy: string;
  proposedAt: bigint;
  executeAfter: bigint;
  hisbahApproved: boolean;
  executed: boolean;
  cancelled: boolean;
  reason: string;
}

export interface UpgradeProposal {
  newImplementation: string;
  proposedBy: string;
  proposedAt: bigint;
  executeAfter: bigint;
  oracleApproved: boolean;
  hisbahApproved: boolean;
  announcedPublicly: boolean;
  executed: boolean;
  cancelled: boolean;
  codeHash: string;
}

export interface BankEscrowConfig {
  bankId: string;
  bankName: string;
  isPrimary: boolean;
  isActive: boolean;
  isFrozen: boolean;
  totalBalance: bigint;
  addedAt: bigint;
  lastActivityAt: bigint;
}

export interface DeadManSwitchStatus {
  role: MultisigRole;
  canTrigger: boolean;
  lastActivity: Date;
  threshold: number;
  daysRemaining: number;
  percentElapsed: number;
}

export interface GovernanceHealthReport {
  systemMode: SystemMode;
  multisigStatuses: MultisigHealthStatus[];
  deadManSwitchStatuses: DeadManSwitchStatus[];
  pendingSuccessions: SuccessionProposal[];
  pendingUpgrades: UpgradeProposal[];
  bankStatuses: BankEscrowConfig[];
  overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  recommendations: string[];
}

export interface MultisigHealthStatus {
  role: MultisigRole;
  roleName: string;
  address: string;
  threshold: number;
  memberCount: number;
  lastActivity: Date;
  daysSinceActivity: number;
  health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

// ============================================
// Constants
// ============================================

const DEAD_MAN_SWITCH_THRESHOLD_DAYS = 180;
const HEARTBEAT_WARNING_DAYS = 30;
const HEARTBEAT_CRITICAL_DAYS = 60;
const SUCCESSION_TIMELOCK_DAYS = 7;
const UPGRADE_TIMELOCK_HOURS = 72;

const ROLE_NAMES: Record<MultisigRole, string> = {
  [MultisigRole.OPERATOR]: 'Operator',
  [MultisigRole.ORACLE]: 'Oracle',
  [MultisigRole.EMERGENCY]: 'Emergency',
  [MultisigRole.ARBITRATION_COUNCIL]: 'Arbitration Council',
  [MultisigRole.HISBAH]: 'Hisbah',
  [MultisigRole.BACKUP]: 'Backup',
};

// ============================================
// AmantraLedgerV5 ABI (partial for governance)
// ============================================

const AMANTRA_V5_ABI = [
  // Multisig Management
  'function multisigs(uint8 role) view returns (address multisigAddress, uint256 threshold, uint256 memberCount, uint64 lastValidatedAt, uint64 lastActivityAt, bool validated, bool active)',
  'function continuity() view returns (address backupOracle, address backupArbitrator, address backupHisbah, address backupOperator, uint64 lastOracleHeartbeat, uint64 lastArbitratorHeartbeat, uint64 lastOperatorHeartbeat, uint64 lastHisbahHeartbeat)',
  'function systemMode() view returns (uint8)',
  'function sendHeartbeat(uint8 role)',
  'function canTriggerDeadManSwitch(uint8 role) view returns (bool canTrigger, uint64 lastActivity, uint64 threshold)',
  'function triggerDeadManSwitch(uint8 role)',

  // Succession
  'function successionProposalCount() view returns (uint256)',
  'function successionProposals(uint256 proposalId) view returns (uint8 role, address currentHolder, address proposedSuccessor, address proposedBy, uint64 proposedAt, uint64 executeAfter, bool hisbahApproved, bool executed, bool cancelled, string reason)',
  'function proposeRoleSuccession(uint8 role, address newMultisig, string reason) returns (uint256)',
  'function approveSuccession(uint256 proposalId)',
  'function executeRoleSuccession(uint256 proposalId)',
  'function cancelSuccession(uint256 proposalId, string reason)',

  // Upgrade
  'function upgradeProposalCount() view returns (uint256)',
  'function upgradeProposals(uint256 proposalId) view returns (address newImplementation, address proposedBy, uint64 proposedAt, uint64 executeAfter, bool oracleApproved, bool hisbahApproved, bool announcedPublicly, bool executed, bool cancelled, bytes32 codeHash)',
  'function proposeUpgrade(address newImplementation) returns (uint256)',
  'function approveUpgrade(uint256 proposalId)',
  'function announceUpgradePublicly(uint256 proposalId)',
  'function executeUpgrade(uint256 proposalId)',
  'function cancelUpgrade(uint256 proposalId, string reason)',

  // Bank Escrow
  'function registeredBanks(uint256 index) view returns (bytes32)',
  'function bankEscrows(bytes32 bankId) view returns (bytes32 bankId, string bankName, bool isPrimary, bool isActive, bool isFrozen, uint256 totalBalance, uint64 addedAt, uint64 lastActivityAt)',
  'function primaryBankId() view returns (bytes32)',
  'function getAvailableBank() view returns (bytes32)',
  'function addBankEscrow(bytes32 bankId, string bankName, bool isPrimary)',
  'function freezeBankEscrow(bytes32 bankId, string reason)',
  'function unfreezeBankEscrow(bytes32 bankId)',
  'function initiateBankMigration(bytes32 fromBankId, bytes32 toBankId, uint256 amount)',

  // System Mode
  'function pause(string reason)',
  'function unpause()',
  'function activateRecoveryMode(string reason)',
  'function deactivateRecoveryMode()',

  // Events
  'event HeartbeatReceived(uint8 indexed role, address indexed from, uint64 timestamp)',
  'event DeadManSwitchTriggered(uint8 indexed role, address indexed oldHolder, address indexed backupHolder, uint64 lastActivity)',
  'event RecoveryModeActivated(address activatedBy, string reason)',
  'event SuccessionProposed(uint256 indexed proposalId, uint8 role, address currentHolder, address proposedSuccessor)',
  'event SuccessionApprovedByHisbah(uint256 indexed proposalId, address approvedBy)',
  'event SuccessionExecuted(uint256 indexed proposalId, uint8 role, address oldHolder, address newHolder)',
  'event UpgradeProposed(uint256 indexed proposalId, address newImplementation, bytes32 codeHash)',
  'event UpgradeApprovedByHisbah(uint256 indexed proposalId, address approvedBy)',
  'event UpgradeExecuted(uint256 indexed proposalId, address newImplementation)',
  'event BankEscrowFrozen(bytes32 indexed bankId, string reason, address frozenBy)',
  'event BankMigrationInitiated(bytes32 indexed fromBank, bytes32 indexed toBank, uint256 amount)',
  'event SystemModeChanged(uint8 indexed oldMode, uint8 indexed newMode, address changedBy, string reason)',
];

// ============================================
// Governance Continuity Service
// ============================================

export class GovernanceContinuityService {
  private readonly logger = new Logger(GovernanceContinuityService.name);
  private contract: Contract;
  private provider: ethers.Provider;

  constructor(
    private readonly contractAddress: string,
    private readonly rpcUrl: string,
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(
      contractAddress,
      AMANTRA_V5_ABI,
      this.provider,
    );
  }

  // ============================================
  // HEARTBEAT MONITORING & AUTOMATION
  // ============================================

  /**
   * Send heartbeat for a specific role
   * Should be called periodically by the multisig
   */
  async sendHeartbeat(role: MultisigRole, signer: Signer): Promise<string> {
    const contractWithSigner = this.contract.connect(signer);
    const tx = await contractWithSigner.sendHeartbeat(role);
    const receipt = await tx.wait();

    this.logger.log(`Heartbeat sent for role ${ROLE_NAMES[role]}: ${receipt.hash}`);

    return receipt.hash;
  }

  /**
   * Get heartbeat status for all roles
   */
  async getHeartbeatStatuses(): Promise<MultisigHealthStatus[]> {
    const statuses: MultisigHealthStatus[] = [];
    const now = Date.now();

    for (let role = 0; role <= 5; role++) {
      const config = await this.getMultisigConfig(role as MultisigRole);

      if (config.active) {
        const lastActivity = new Date(Number(config.lastActivityAt) * 1000);
        const daysSinceActivity = Math.floor(
          (now - lastActivity.getTime()) / (1000 * 60 * 60 * 24),
        );

        let health: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
        if (daysSinceActivity >= HEARTBEAT_CRITICAL_DAYS) {
          health = 'CRITICAL';
        } else if (daysSinceActivity >= HEARTBEAT_WARNING_DAYS) {
          health = 'WARNING';
        }

        statuses.push({
          role: role as MultisigRole,
          roleName: ROLE_NAMES[role as MultisigRole],
          address: config.multisigAddress,
          threshold: Number(config.threshold),
          memberCount: Number(config.memberCount),
          lastActivity,
          daysSinceActivity,
          health,
        });
      }
    }

    return statuses;
  }

  // ============================================
  // DEAD MAN SWITCH MONITORING
  // ============================================

  /**
   * Check if dead man switch can be triggered for any role
   */
  async checkDeadManSwitchStatuses(): Promise<DeadManSwitchStatus[]> {
    const statuses: DeadManSwitchStatus[] = [];

    for (let role = 0; role <= 5; role++) {
      const [canTrigger, lastActivity, threshold] =
        await this.contract.canTriggerDeadManSwitch(role);

      const lastActivityDate = new Date(Number(lastActivity) * 1000);
      const thresholdDays = Number(threshold) / (24 * 60 * 60);
      const now = Date.now();
      const elapsedDays = (now - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24);
      const daysRemaining = Math.max(0, thresholdDays - elapsedDays);
      const percentElapsed = Math.min(100, (elapsedDays / thresholdDays) * 100);

      statuses.push({
        role: role as MultisigRole,
        canTrigger,
        lastActivity: lastActivityDate,
        threshold: thresholdDays,
        daysRemaining,
        percentElapsed,
      });
    }

    return statuses;
  }

  /**
   * Trigger dead man switch for a specific role
   * Can be called by anyone if threshold is exceeded
   */
  async triggerDeadManSwitch(role: MultisigRole, signer: Signer): Promise<string> {
    const contractWithSigner = this.contract.connect(signer);

    // Check if can trigger first
    const [canTrigger, lastActivity] =
      await this.contract.canTriggerDeadManSwitch(role);

    if (!canTrigger) {
      throw new Error(
        `Dead man switch cannot be triggered for ${ROLE_NAMES[role]}. Last activity: ${new Date(Number(lastActivity) * 1000).toISOString()}`,
      );
    }

    const tx = await contractWithSigner.triggerDeadManSwitch(role);
    const receipt = await tx.wait();

    this.logger.warn(
      `DEAD MAN SWITCH TRIGGERED for ${ROLE_NAMES[role]}: ${receipt.hash}`,
    );

    return receipt.hash;
  }

  // ============================================
  // SUCCESSION MANAGEMENT
  // ============================================

  /**
   * Get all pending succession proposals
   */
  async getPendingSuccessions(): Promise<SuccessionProposal[]> {
    const count = await this.contract.successionProposalCount();
    const pending: SuccessionProposal[] = [];

    for (let i = 0; i < Number(count); i++) {
      const proposal = await this.contract.successionProposals(i);

      if (!proposal.executed && !proposal.cancelled) {
        pending.push({
          role: proposal.role,
          currentHolder: proposal.currentHolder,
          proposedSuccessor: proposal.proposedSuccessor,
          proposedBy: proposal.proposedBy,
          proposedAt: proposal.proposedAt,
          executeAfter: proposal.executeAfter,
          hisbahApproved: proposal.hisbahApproved,
          executed: proposal.executed,
          cancelled: proposal.cancelled,
          reason: proposal.reason,
        });
      }
    }

    return pending;
  }

  /**
   * Propose succession for a role
   */
  async proposeSuccession(
    role: MultisigRole,
    newMultisig: string,
    reason: string,
    signer: Signer,
  ): Promise<{ proposalId: string; txHash: string }> {
    const contractWithSigner = this.contract.connect(signer);
    const tx = await contractWithSigner.proposeRoleSuccession(
      role,
      newMultisig,
      reason,
    );
    const receipt = await tx.wait();

    // Get proposal ID from event
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === 'SuccessionProposed',
    );
    const proposalId = event?.args?.[0]?.toString() || '0';

    this.logger.log(
      `Succession proposed for ${ROLE_NAMES[role]}: proposalId=${proposalId}, tx=${receipt.hash}`,
    );

    return { proposalId, txHash: receipt.hash };
  }

  /**
   * Approve succession (Hisbah only)
   */
  async approveSuccession(
    proposalId: number,
    signer: Signer,
  ): Promise<string> {
    const contractWithSigner = this.contract.connect(signer);
    const tx = await contractWithSigner.approveSuccession(proposalId);
    const receipt = await tx.wait();

    this.logger.log(`Succession ${proposalId} approved by Hisbah: ${receipt.hash}`);

    return receipt.hash;
  }

  /**
   * Execute succession after timelock
   */
  async executeSuccession(
    proposalId: number,
    signer: Signer,
  ): Promise<string> {
    const proposal = await this.contract.successionProposals(proposalId);

    // Check timelock
    const now = Math.floor(Date.now() / 1000);
    if (now < Number(proposal.executeAfter)) {
      const remaining = Number(proposal.executeAfter) - now;
      throw new Error(
        `Succession timelock not passed. ${Math.ceil(remaining / 3600)} hours remaining.`,
      );
    }

    // Check Hisbah approval
    if (!proposal.hisbahApproved) {
      throw new Error('Succession not approved by Hisbah');
    }

    const contractWithSigner = this.contract.connect(signer);
    const tx = await contractWithSigner.executeRoleSuccession(proposalId);
    const receipt = await tx.wait();

    this.logger.log(
      `Succession ${proposalId} executed: ${receipt.hash}`,
    );

    return receipt.hash;
  }

  // ============================================
  // UPGRADE MANAGEMENT
  // ============================================

  /**
   * Get all pending upgrade proposals
   */
  async getPendingUpgrades(): Promise<UpgradeProposal[]> {
    const count = await this.contract.upgradeProposalCount();
    const pending: UpgradeProposal[] = [];

    for (let i = 0; i < Number(count); i++) {
      const proposal = await this.contract.upgradeProposals(i);

      if (!proposal.executed && !proposal.cancelled) {
        pending.push({
          newImplementation: proposal.newImplementation,
          proposedBy: proposal.proposedBy,
          proposedAt: proposal.proposedAt,
          executeAfter: proposal.executeAfter,
          oracleApproved: proposal.oracleApproved,
          hisbahApproved: proposal.hisbahApproved,
          announcedPublicly: proposal.announcedPublicly,
          executed: proposal.executed,
          cancelled: proposal.cancelled,
          codeHash: proposal.codeHash,
        });
      }
    }

    return pending;
  }

  /**
   * Check upgrade readiness
   */
  async checkUpgradeReadiness(
    proposalId: number,
  ): Promise<{
    ready: boolean;
    missing: string[];
    hoursRemaining: number;
  }> {
    const proposal = await this.contract.upgradeProposals(proposalId);
    const missing: string[] = [];

    if (!proposal.oracleApproved) {
      missing.push('Oracle approval');
    }
    if (!proposal.hisbahApproved) {
      missing.push('Hisbah approval');
    }
    if (!proposal.announcedPublicly) {
      missing.push('Public announcement');
    }

    const now = Math.floor(Date.now() / 1000);
    const hoursRemaining = Math.max(
      0,
      (Number(proposal.executeAfter) - now) / 3600,
    );

    if (hoursRemaining > 0) {
      missing.push(`Timelock (${Math.ceil(hoursRemaining)}h remaining)`);
    }

    return {
      ready: missing.length === 0,
      missing,
      hoursRemaining,
    };
  }

  // ============================================
  // BANK ESCROW MANAGEMENT
  // ============================================

  /**
   * Get all registered banks
   */
  async getRegisteredBanks(): Promise<BankEscrowConfig[]> {
    const banks: BankEscrowConfig[] = [];

    try {
      let index = 0;
      while (true) {
        try {
          const bankId = await this.contract.registeredBanks(index);
          const bank = await this.contract.bankEscrows(bankId);

          banks.push({
            bankId: bank.bankId,
            bankName: bank.bankName,
            isPrimary: bank.isPrimary,
            isActive: bank.isActive,
            isFrozen: bank.isFrozen,
            totalBalance: bank.totalBalance,
            addedAt: bank.addedAt,
            lastActivityAt: bank.lastActivityAt,
          });

          index++;
        } catch {
          // End of array
          break;
        }
      }
    } catch (error) {
      this.logger.error('Error fetching registered banks', error);
    }

    return banks;
  }

  /**
   * Get available bank for new contracts
   */
  async getAvailableBank(): Promise<string> {
    return this.contract.getAvailableBank();
  }

  /**
   * Freeze a bank escrow
   */
  async freezeBankEscrow(
    bankId: string,
    reason: string,
    signer: Signer,
  ): Promise<string> {
    const contractWithSigner = this.contract.connect(signer);
    const tx = await contractWithSigner.freezeBankEscrow(bankId, reason);
    const receipt = await tx.wait();

    this.logger.warn(`Bank ${bankId} FROZEN: ${reason}. Tx: ${receipt.hash}`);

    return receipt.hash;
  }

  /**
   * Unfreeze a bank escrow
   */
  async unfreezeBankEscrow(
    bankId: string,
    signer: Signer,
  ): Promise<string> {
    const contractWithSigner = this.contract.connect(signer);
    const tx = await contractWithSigner.unfreezeBankEscrow(bankId);
    const receipt = await tx.wait();

    this.logger.log(`Bank ${bankId} unfrozen. Tx: ${receipt.hash}`);

    return receipt.hash;
  }

  /**
   * Initiate bank migration
   */
  async initiateBankMigration(
    fromBankId: string,
    toBankId: string,
    amount: bigint,
    signer: Signer,
  ): Promise<string> {
    const contractWithSigner = this.contract.connect(signer);
    const tx = await contractWithSigner.initiateBankMigration(
      fromBankId,
      toBankId,
      amount,
    );
    const receipt = await tx.wait();

    this.logger.log(
      `Bank migration initiated from ${fromBankId} to ${toBankId}. Amount: ${amount}. Tx: ${receipt.hash}`,
    );

    return receipt.hash;
  }

  // ============================================
  // SYSTEM MODE MANAGEMENT
  // ============================================

  /**
   * Get current system mode
   */
  async getSystemMode(): Promise<SystemMode> {
    return this.contract.systemMode();
  }

  /**
   * Pause the system
   */
  async pauseSystem(reason: string, signer: Signer): Promise<string> {
    const contractWithSigner = this.contract.connect(signer);
    const tx = await contractWithSigner.pause(reason);
    const receipt = await tx.wait();

    this.logger.warn(`SYSTEM PAUSED: ${reason}. Tx: ${receipt.hash}`);

    return receipt.hash;
  }

  /**
   * Unpause the system (Hisbah only)
   */
  async unpauseSystem(signer: Signer): Promise<string> {
    const contractWithSigner = this.contract.connect(signer);
    const tx = await contractWithSigner.unpause();
    const receipt = await tx.wait();

    this.logger.log(`System unpaused. Tx: ${receipt.hash}`);

    return receipt.hash;
  }

  // ============================================
  // COMPREHENSIVE HEALTH CHECK
  // ============================================

  /**
   * Generate comprehensive governance health report
   */
  async generateHealthReport(): Promise<GovernanceHealthReport> {
    const [
      systemMode,
      multisigStatuses,
      deadManSwitchStatuses,
      pendingSuccessions,
      pendingUpgrades,
      bankStatuses,
    ] = await Promise.all([
      this.getSystemMode(),
      this.getHeartbeatStatuses(),
      this.checkDeadManSwitchStatuses(),
      this.getPendingSuccessions(),
      this.getPendingUpgrades(),
      this.getRegisteredBanks(),
    ]);

    const recommendations: string[] = [];
    let overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'EMERGENCY' = 'HEALTHY';

    // Check system mode
    if (systemMode === SystemMode.EMERGENCY || systemMode === SystemMode.RECOVERY) {
      overallHealth = 'EMERGENCY';
      recommendations.push('System is in emergency/recovery mode. Investigate immediately.');
    }

    // Check multisig health
    for (const status of multisigStatuses) {
      if (status.health === 'CRITICAL') {
        if (overallHealth !== 'EMERGENCY') overallHealth = 'CRITICAL';
        recommendations.push(
          `${status.roleName} has not been active for ${status.daysSinceActivity} days. Send heartbeat immediately.`,
        );
      } else if (status.health === 'WARNING') {
        if (overallHealth === 'HEALTHY') overallHealth = 'WARNING';
        recommendations.push(
          `${status.roleName} heartbeat overdue (${status.daysSinceActivity} days). Consider sending heartbeat.`,
        );
      }
    }

    // Check dead man switch
    for (const dms of deadManSwitchStatuses) {
      if (dms.canTrigger) {
        if (overallHealth !== 'EMERGENCY') overallHealth = 'CRITICAL';
        recommendations.push(
          `CRITICAL: Dead man switch can be triggered for ${ROLE_NAMES[dms.role]}!`,
        );
      } else if (dms.percentElapsed > 75) {
        if (overallHealth === 'HEALTHY') overallHealth = 'WARNING';
        recommendations.push(
          `${ROLE_NAMES[dms.role]} dead man switch at ${dms.percentElapsed.toFixed(0)}%. ${Math.ceil(dms.daysRemaining)} days remaining.`,
        );
      }
    }

    // Check bank statuses
    const activeBanks = bankStatuses.filter((b) => b.isActive && !b.isFrozen);
    if (activeBanks.length === 0) {
      if (overallHealth !== 'EMERGENCY') overallHealth = 'CRITICAL';
      recommendations.push('No active banks available! All contracts will fail.');
    } else if (activeBanks.length === 1) {
      if (overallHealth === 'HEALTHY') overallHealth = 'WARNING';
      recommendations.push('Only one active bank. Consider adding backup bank.');
    }

    const frozenBanks = bankStatuses.filter((b) => b.isFrozen);
    if (frozenBanks.length > 0) {
      recommendations.push(
        `${frozenBanks.length} bank(s) are frozen: ${frozenBanks.map((b) => b.bankName).join(', ')}`,
      );
    }

    // Check pending proposals
    if (pendingSuccessions.length > 0) {
      recommendations.push(
        `${pendingSuccessions.length} pending succession proposal(s) require attention.`,
      );
    }

    if (pendingUpgrades.length > 0) {
      recommendations.push(
        `${pendingUpgrades.length} pending upgrade proposal(s) require attention.`,
      );
    }

    return {
      systemMode,
      multisigStatuses,
      deadManSwitchStatuses,
      pendingSuccessions,
      pendingUpgrades,
      bankStatuses,
      overallHealth,
      recommendations,
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async getMultisigConfig(role: MultisigRole): Promise<MultisigConfig> {
    const config = await this.contract.multisigs(role);
    return {
      multisigAddress: config.multisigAddress,
      threshold: config.threshold,
      memberCount: config.memberCount,
      lastValidatedAt: config.lastValidatedAt,
      lastActivityAt: config.lastActivityAt,
      validated: config.validated,
      active: config.active,
    };
  }

  /**
   * Setup event listeners for governance events
   */
  setupEventListeners(callbacks: {
    onHeartbeat?: (role: MultisigRole, from: string, timestamp: Date) => void;
    onDeadManSwitch?: (
      role: MultisigRole,
      oldHolder: string,
      newHolder: string,
    ) => void;
    onRecoveryMode?: (activatedBy: string, reason: string) => void;
    onSuccessionProposed?: (proposalId: string, role: MultisigRole) => void;
    onSuccessionExecuted?: (proposalId: string, role: MultisigRole) => void;
    onUpgradeProposed?: (proposalId: string, implementation: string) => void;
    onUpgradeExecuted?: (proposalId: string, implementation: string) => void;
    onBankFrozen?: (bankId: string, reason: string) => void;
    onSystemModeChanged?: (oldMode: SystemMode, newMode: SystemMode) => void;
  }) {
    if (callbacks.onHeartbeat) {
      this.contract.on('HeartbeatReceived', (role, from, timestamp) => {
        callbacks.onHeartbeat!(role, from, new Date(Number(timestamp) * 1000));
      });
    }

    if (callbacks.onDeadManSwitch) {
      this.contract.on(
        'DeadManSwitchTriggered',
        (role, oldHolder, backupHolder) => {
          callbacks.onDeadManSwitch!(role, oldHolder, backupHolder);
        },
      );
    }

    if (callbacks.onRecoveryMode) {
      this.contract.on('RecoveryModeActivated', (activatedBy, reason) => {
        callbacks.onRecoveryMode!(activatedBy, reason);
      });
    }

    if (callbacks.onSuccessionProposed) {
      this.contract.on('SuccessionProposed', (proposalId, role) => {
        callbacks.onSuccessionProposed!(proposalId.toString(), role);
      });
    }

    if (callbacks.onSuccessionExecuted) {
      this.contract.on('SuccessionExecuted', (proposalId, role) => {
        callbacks.onSuccessionExecuted!(proposalId.toString(), role);
      });
    }

    if (callbacks.onUpgradeProposed) {
      this.contract.on('UpgradeProposed', (proposalId, implementation) => {
        callbacks.onUpgradeProposed!(proposalId.toString(), implementation);
      });
    }

    if (callbacks.onUpgradeExecuted) {
      this.contract.on('UpgradeExecuted', (proposalId, implementation) => {
        callbacks.onUpgradeExecuted!(proposalId.toString(), implementation);
      });
    }

    if (callbacks.onBankFrozen) {
      this.contract.on('BankEscrowFrozen', (bankId, reason) => {
        callbacks.onBankFrozen!(bankId, reason);
      });
    }

    if (callbacks.onSystemModeChanged) {
      this.contract.on('SystemModeChanged', (oldMode, newMode) => {
        callbacks.onSystemModeChanged!(oldMode, newMode);
      });
    }

    this.logger.log('Event listeners set up successfully');
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners() {
    this.contract.removeAllListeners();
    this.logger.log('All event listeners removed');
  }
}

// ============================================
// HEARTBEAT CRON JOB
// ============================================

/**
 * Heartbeat Automation Service
 * Should be run as a cron job every 7 days for OPERATOR
 */
export class HeartbeatAutomationService {
  private readonly logger = new Logger(HeartbeatAutomationService.name);

  constructor(private readonly governanceService: GovernanceContinuityService) {}

  /**
   * Run heartbeat check and send if needed
   */
  async runHeartbeatCheck(
    role: MultisigRole,
    signer: Signer,
    warningThresholdDays: number = 7,
  ): Promise<{ sent: boolean; reason: string }> {
    const statuses = await this.governanceService.getHeartbeatStatuses();
    const roleStatus = statuses.find((s) => s.role === role);

    if (!roleStatus) {
      return { sent: false, reason: `Role ${ROLE_NAMES[role]} not found or inactive` };
    }

    if (roleStatus.daysSinceActivity >= warningThresholdDays) {
      try {
        await this.governanceService.sendHeartbeat(role, signer);
        return {
          sent: true,
          reason: `Heartbeat sent for ${ROLE_NAMES[role]} (was ${roleStatus.daysSinceActivity} days inactive)`,
        };
      } catch (error) {
        return {
          sent: false,
          reason: `Failed to send heartbeat: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return {
      sent: false,
      reason: `No heartbeat needed for ${ROLE_NAMES[role]} (only ${roleStatus.daysSinceActivity} days since last activity)`,
    };
  }

  /**
   * Run full health check and alert if needed
   */
  async runHealthCheckWithAlerts(
    alertCallback: (level: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY', message: string) => void,
  ): Promise<GovernanceHealthReport> {
    const report = await this.governanceService.generateHealthReport();

    // Send alerts based on health level
    if (report.overallHealth === 'EMERGENCY') {
      alertCallback('EMERGENCY', `AMANTRA GOVERNANCE EMERGENCY: ${report.recommendations.join(' | ')}`);
    } else if (report.overallHealth === 'CRITICAL') {
      alertCallback('CRITICAL', `AMANTRA GOVERNANCE CRITICAL: ${report.recommendations.join(' | ')}`);
    } else if (report.overallHealth === 'WARNING') {
      alertCallback('WARNING', `AMANTRA Governance Warning: ${report.recommendations.join(' | ')}`);
    } else {
      alertCallback('INFO', 'AMANTRA Governance: All systems healthy');
    }

    return report;
  }
}

export default GovernanceContinuityService;
