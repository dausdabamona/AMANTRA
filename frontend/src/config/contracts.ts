/**
 * AMANTRA - Smart Contract Configuration
 */

// Contract addresses (update for each network)
export const CONTRACT_ADDRESSES = {
  // Ethereum Mainnet
  1: {
    ledger: '0x0000000000000000000000000000000000000000',
  },
  // Polygon Mainnet
  137: {
    ledger: '0x0000000000000000000000000000000000000000',
  },
  // Sepolia Testnet
  11155111: {
    ledger: '0x0000000000000000000000000000000000000000',
  },
  // Localhost
  31337: {
    ledger: '0x0000000000000000000000000000000000000000',
  },
} as const;

// Supported chain IDs
export const SUPPORTED_CHAINS = [1, 137, 11155111, 31337] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number];

// Default chain
export const DEFAULT_CHAIN_ID: SupportedChainId = 11155111;

// AmantraLedgerV5 ABI (partial - key functions)
export const AMANTRA_LEDGER_ABI = [
  // View Functions
  'function VERSION() view returns (string)',
  'function systemMode() view returns (uint8)',
  'function totalContracts() view returns (uint256)',
  'function totalSettledValue() view returns (uint256)',
  'function totalDisputesRaised() view returns (uint256)',
  'function totalDisputesResolved() view returns (uint256)',
  'function resolutionDelay() view returns (uint64)',
  'function primaryBankId() view returns (bytes32)',

  // Multisig Config
  'function multisigs(uint8 role) view returns (address multisigAddress, uint256 threshold, uint256 memberCount, uint64 lastValidatedAt, uint64 lastActivityAt, bool validated, bool active)',
  'function continuity() view returns (address backupOracle, address backupArbitrator, address backupHisbah, address backupOperator, uint64 lastOracleHeartbeat, uint64 lastArbitratorHeartbeat, uint64 lastOperatorHeartbeat, uint64 lastHisbahHeartbeat)',

  // Contract Functions
  'function getContract(bytes32 contractId) view returns (tuple(bytes32 id, bytes32 contractNumber, bytes32 seller, bytes32 buyer, address sellerAddress, address buyerAddress, uint256 totalAmount, uint8 status, tuple(uint16 bps, uint256 platformFee, uint256 sellerAmount, uint256 mediatorFee, uint8 networkFeeBearer, uint256 estimatedNetworkFee, bytes32 akadStatementHash) feeInfo, bytes32 escrowReference, bytes32 bankId, uint64 createdAt, uint64 updatedAt, uint32 version))',
  'function getDispute(bytes32 contractId) view returns (tuple(bool active, bytes32 reasonHash, bytes32 evidenceHash, bytes32 arbitrationHash, uint64 raisedAt, uint64 resolvedAt, address raisedBy, uint8 raiserType, bool resolutionQueued, bytes32 queuedResolutionHash, uint64 resolutionExecutableAt, uint8 queuedResolutionType, bool appealed, bytes32 appealHash))',
  'function getContractEvidence(bytes32 contractId) view returns (bytes32[])',
  'function isContractParty(bytes32 contractId, address addr) view returns (bool)',

  // Bank Escrow
  'function getRegisteredBanks() view returns (bytes32[])',
  'function getBankEscrow(bytes32 bankId) view returns (tuple(bytes32 bankId, string bankName, bool isPrimary, bool isActive, bool isFrozen, uint256 totalBalance, uint64 addedAt, uint64 lastActivityAt))',
  'function getAvailableBank() view returns (bytes32)',

  // Dead Man Switch
  'function canTriggerDeadManSwitch(uint8 role) view returns (bool canTrigger, uint64 lastActivity, uint64 threshold)',

  // Succession
  'function successionProposalCount() view returns (uint256)',
  'function successionProposals(uint256 proposalId) view returns (uint8 role, address currentHolder, address proposedSuccessor, address proposedBy, uint64 proposedAt, uint64 executeAfter, bool hisbahApproved, bool executed, bool cancelled, string reason)',

  // Upgrade
  'function upgradeProposalCount() view returns (uint256)',
  'function upgradeProposals(uint256 proposalId) view returns (address newImplementation, address proposedBy, uint64 proposedAt, uint64 executeAfter, bool oracleApproved, bool hisbahApproved, bool announcedPublicly, bool executed, bool cancelled, bytes32 codeHash)',

  // Write Functions
  'function createContract(bytes32 contractId, bytes32 contractNumber, bytes32 seller, bytes32 buyer, address sellerAddress, address buyerAddress, uint256 totalAmount, uint16 feeBps, uint256 platformFee, uint256 sellerAmount, uint256 mediatorFee, uint8 networkFeeBearer, uint256 estimatedNetworkFee, bytes32 akadStatementHash)',
  'function markFunded(bytes32 contractId, bytes32 qrisReference, bytes32 escrowReference, bytes32 transactionRef)',
  'function markVerified(bytes32 contractId, bytes32 verificationHash, bytes32 transactionRef)',
  'function markSettled(bytes32 contractId, bytes32 settlementRef, bytes32 transactionRef, uint256 actualNetworkFee, uint256 sellerNetReceived, uint256 platformNetReceived, bytes32 bankReceiptHash)',
  'function cancelContract(bytes32 contractId, bytes32 reasonHash, bytes32 transactionRef)',

  // Dispute Functions
  'function raiseDispute(bytes32 contractId, bytes32 reasonHash, bytes32 evidenceHash, bytes32 transactionRef)',
  'function queueResolution(bytes32 contractId, bytes32 arbitrationHash, uint8 resolutionType)',
  'function executeResolution(bytes32 contractId, bytes32 arbitrationHash, bytes32 transactionRef)',
  'function appealResolution(bytes32 contractId, bytes32 appealHash)',

  // Heartbeat & Dead Man Switch
  'function sendHeartbeat(uint8 role)',
  'function triggerDeadManSwitch(uint8 role)',

  // Succession
  'function proposeRoleSuccession(uint8 role, address newMultisig, string reason) returns (uint256)',
  'function approveSuccession(uint256 proposalId)',
  'function executeRoleSuccession(uint256 proposalId)',
  'function cancelSuccession(uint256 proposalId, string reason)',

  // Upgrade
  'function proposeUpgrade(address newImplementation) returns (uint256)',
  'function approveUpgrade(uint256 proposalId)',
  'function announceUpgradePublicly(uint256 proposalId)',
  'function executeUpgrade(uint256 proposalId)',
  'function cancelUpgrade(uint256 proposalId, string reason)',

  // Bank Escrow Management
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
  'event ContractCreated(bytes32 indexed contractId, bytes32 indexed contractNumber, bytes32 seller, bytes32 buyer, address sellerAddress, address buyerAddress, uint256 totalAmount, bytes32 bankId, uint64 timestamp)',
  'event StatusTransition(bytes32 indexed contractId, uint8 indexed oldStatus, uint8 indexed newStatus, address triggeredBy, bytes32 transactionRef, uint64 timestamp, uint32 newVersion)',
  'event PaymentMarked(bytes32 indexed contractId, bytes32 indexed qrisReference, uint256 amount, bytes32 escrowReference, address markedBy, uint64 timestamp)',
  'event VerificationMarked(bytes32 indexed contractId, bytes32 indexed verificationHash, address verifiedBy, uint64 timestamp)',
  'event SettlementMarked(bytes32 indexed contractId, bytes32 indexed settlementRef, uint256 sellerAmount, uint256 platformFee, uint256 mediatorFee, address settledBy, uint64 timestamp)',
  'event DisputeRaised(bytes32 indexed contractId, bytes32 indexed reasonHash, bytes32 evidenceHash, address raisedBy, uint8 raiserType, uint64 timestamp)',
  'event ResolutionQueued(bytes32 indexed contractId, bytes32 indexed resolutionHash, uint8 resolutionType, uint64 executableAt, address queuedBy, uint64 timestamp)',
  'event ResolutionExecuted(bytes32 indexed contractId, bytes32 indexed arbitrationHash, uint8 resolutionType, uint8 finalStatus, address executedBy, uint64 timestamp)',
  'event HeartbeatReceived(uint8 indexed role, address indexed from, uint64 timestamp)',
  'event DeadManSwitchTriggered(uint8 indexed role, address indexed oldHolder, address indexed backupHolder, uint64 lastActivity)',
  'event RecoveryModeActivated(address activatedBy, string reason)',
  'event SuccessionProposed(uint256 indexed proposalId, uint8 role, address currentHolder, address proposedSuccessor)',
  'event SuccessionExecuted(uint256 indexed proposalId, uint8 role, address oldHolder, address newHolder)',
  'event UpgradeProposed(uint256 indexed proposalId, address newImplementation, bytes32 codeHash)',
  'event UpgradeExecuted(uint256 indexed proposalId, address newImplementation)',
  'event BankEscrowFrozen(bytes32 indexed bankId, string reason, address frozenBy)',
  'event SystemModeChanged(uint8 indexed oldMode, uint8 indexed newMode, address changedBy, string reason)',
] as const;

// Chain names
export const CHAIN_NAMES: Record<SupportedChainId, string> = {
  1: 'Ethereum Mainnet',
  137: 'Polygon',
  11155111: 'Sepolia Testnet',
  31337: 'Localhost',
};

// Block explorers
export const BLOCK_EXPLORERS: Record<SupportedChainId, string> = {
  1: 'https://etherscan.io',
  137: 'https://polygonscan.com',
  11155111: 'https://sepolia.etherscan.io',
  31337: '',
};

// RPC URLs
export const RPC_URLS: Record<SupportedChainId, string> = {
  1: 'https://eth.llamarpc.com',
  137: 'https://polygon.llamarpc.com',
  11155111: 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
  31337: 'http://localhost:8545',
};

/**
 * Get contract address for chain
 */
export function getContractAddress(chainId: number): string | undefined {
  return CONTRACT_ADDRESSES[chainId as SupportedChainId]?.ledger;
}

/**
 * Get block explorer URL
 */
export function getExplorerUrl(chainId: number, type: 'tx' | 'address', hash: string): string {
  const baseUrl = BLOCK_EXPLORERS[chainId as SupportedChainId];
  if (!baseUrl) return '';
  return `${baseUrl}/${type}/${hash}`;
}

/**
 * Check if chain is supported
 */
export function isSupportedChain(chainId: number): chainId is SupportedChainId {
  return SUPPORTED_CHAINS.includes(chainId as SupportedChainId);
}
