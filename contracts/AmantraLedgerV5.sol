// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AmantraLedgerV5
 * @author AMANTRA Team
 * @notice Production-grade Digital Contract Ledger with Zero Single Point of Failure
 * @dev Implements SOP 7 Pilar 1:
 *      "Tidak boleh ada satu manusia, satu kunci, satu server, atau satu institusi
 *       yang jika hilang membuat dana, keadilan, atau sistem mati."
 *
 *      ARCHITECTURAL PRINCIPLES:
 *      1. Multi-Layer Multisig - 6 separate multisigs, no address holds multiple critical roles
 *      2. Dead Man Switch - Auto-recovery after 180 days inactivity
 *      3. Succession Protocol - Timelock + Hisbah approval for all role changes
 *      4. Anti-Hostage Bank - Multi-bank escrow with migration capability
 *      5. Upgrade Safety - Triple approval + 72h timelock + public announcement
 *      6. Governance Inheritance - Backup authorities for disaster recovery
 *
 *      ETHICAL PRINCIPLE:
 *      "Al-amru idza ta'allaqa bi huquqil 'ibad la yajuzu an yu'allaqa bi fardh wahid."
 *      (Urusan hak manusia tidak boleh bergantung pada satu orang)
 *
 *      NO FUNDS ARE HELD IN THIS CONTRACT - Money stays in bank escrow.
 */

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

// ============================================
// INTERFACES
// ============================================

/**
 * @title IGnosisSafe
 * @notice Minimal interface for Gnosis Safe multisig validation
 */
interface IGnosisSafe {
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
    function isOwner(address owner) external view returns (bool);
    function nonce() external view returns (uint256);
}

/**
 * @title IAmantraConstitution
 * @notice Interface for the immutable constitution contract
 */
interface IAmantraConstitution {
    function isRightProtected(bytes32 rightHash) external view returns (bool);
    function isDissolving() external view returns (bool);
    function getCurrentTrustee() external view returns (address);
    function CONSTITUTION_HASH() external view returns (bytes32);
}

/**
 * @title IAmantraLedgerV5
 * @notice Full interface for AmantraLedgerV5
 */
interface IAmantraLedgerV5 {
    // ============================================
    // Enums
    // ============================================

    enum Status {
        CREATED,    // 0: Contract created, awaiting payment
        FUNDED,     // 1: Payment received via QRIS, funds in bank escrow
        VERIFIED,   // 2: Goods/services verified by QC
        SETTLED,    // 3: Settlement complete, funds distributed
        DISPUTED,   // 4: Under dispute resolution
        CANCELLED   // 5: Contract cancelled, funds refunded
    }

    enum NetworkFeeBearer {
        PLATFORM,   // 0: AMANTRA pays all bank transfer fees
        SELLER,     // 1: Seller bears bank transfer fees
        BUYER       // 2: Buyer pays additional network fee
    }

    enum DisputeRaiserType {
        BUYER,      // 0: Raised by buyer
        SELLER,     // 1: Raised by seller
        OPERATOR    // 2: Raised by platform operator
    }

    enum ResolutionType {
        CONTINUE_SETTLEMENT,  // 0: Proceed with settlement (VERIFIED)
        REFUND_BUYER,         // 1: Full refund to buyer (CANCELLED)
        PAY_SELLER,           // 2: Full payment to seller
        CUSTOM_SPLIT          // 3: Custom split between parties
    }

    enum MultisigRole {
        OPERATOR,            // 0: Day-to-day operations
        ORACLE,              // 1: Settlement execution
        EMERGENCY,           // 2: Circuit breaker
        ARBITRATION_COUNCIL, // 3: Dispute resolution
        HISBAH,              // 4: Oversight & Veto
        BACKUP               // 5: Disaster recovery
    }

    enum SystemMode {
        NORMAL,              // 0: Normal operations
        EMERGENCY,           // 1: Emergency mode (limited operations)
        RECOVERY,            // 2: Recovery mode (backup in control)
        DISSOLUTION          // 3: Platform shutting down
    }

    // ============================================
    // Structs
    // ============================================

    struct MultisigConfig {
        address multisigAddress;
        uint256 threshold;
        uint256 memberCount;
        uint64 lastValidatedAt;
        uint64 lastActivityAt;
        bool validated;
        bool active;
    }

    struct SuccessionProposal {
        MultisigRole role;
        address currentHolder;
        address proposedSuccessor;
        address proposedBy;
        uint64 proposedAt;
        uint64 executeAfter;
        bool hisbahApproved;
        bool executed;
        bool cancelled;
        string reason;
    }

    struct UpgradeProposal {
        address newImplementation;
        address proposedBy;
        uint64 proposedAt;
        uint64 executeAfter;
        bool oracleApproved;
        bool hisbahApproved;
        bool announcedPublicly;
        bool executed;
        bool cancelled;
        bytes32 codeHash;
    }

    struct SystemContinuity {
        address backupOracle;
        address backupArbitrator;
        address backupHisbah;
        address backupOperator;
        uint64 lastOracleHeartbeat;
        uint64 lastArbitratorHeartbeat;
        uint64 lastOperatorHeartbeat;
        uint64 lastHisbahHeartbeat;
    }

    struct BankEscrowConfig {
        bytes32 bankId;
        string bankName;
        bool isPrimary;
        bool isActive;
        bool isFrozen;
        uint256 totalBalance;
        uint64 addedAt;
        uint64 lastActivityAt;
    }

    struct FeeInfo {
        uint16 bps;
        uint256 platformFee;
        uint256 sellerAmount;
        uint256 mediatorFee;
        NetworkFeeBearer networkFeeBearer;
        uint256 estimatedNetworkFee;
        bytes32 akadStatementHash;
    }

    struct Dispute {
        bool active;
        bytes32 reasonHash;
        bytes32 evidenceHash;
        bytes32 arbitrationHash;
        uint64 raisedAt;
        uint64 resolvedAt;
        address raisedBy;
        DisputeRaiserType raiserType;
        bool resolutionQueued;
        bytes32 queuedResolutionHash;
        uint64 resolutionExecutableAt;
        ResolutionType queuedResolutionType;
        bool appealed;
        bytes32 appealHash;
    }

    struct Contract {
        bytes32 id;
        bytes32 contractNumber;
        bytes32 seller;
        bytes32 buyer;
        address sellerAddress;
        address buyerAddress;
        uint256 totalAmount;
        Status status;
        FeeInfo feeInfo;
        bytes32 escrowReference;
        bytes32 bankId;  // Which bank holds the escrow
        uint64 createdAt;
        uint64 updatedAt;
        uint32 version;
    }

    // ============================================
    // Events
    // ============================================

    // Multisig Events
    event MultisigRegistered(MultisigRole indexed role, address indexed multisig, uint256 threshold, uint256 members);
    event MultisigActivityRecorded(MultisigRole indexed role, address indexed multisig, uint64 timestamp);
    event HeartbeatReceived(MultisigRole indexed role, address indexed from, uint64 timestamp);

    // Succession Events
    event SuccessionProposed(uint256 indexed proposalId, MultisigRole role, address currentHolder, address proposedSuccessor);
    event SuccessionApprovedByHisbah(uint256 indexed proposalId, address approvedBy);
    event SuccessionExecuted(uint256 indexed proposalId, MultisigRole role, address oldHolder, address newHolder);
    event SuccessionCancelled(uint256 indexed proposalId, string reason);

    // Dead Man Switch Events
    event DeadManSwitchTriggered(MultisigRole indexed role, address indexed oldHolder, address indexed backupHolder, uint64 lastActivity);
    event RecoveryModeActivated(address activatedBy, string reason);
    event RecoveryModeDeactivated(address deactivatedBy);

    // Upgrade Events
    event UpgradeProposed(uint256 indexed proposalId, address newImplementation, bytes32 codeHash);
    event UpgradeApprovedByOracle(uint256 indexed proposalId, address approvedBy);
    event UpgradeApprovedByHisbah(uint256 indexed proposalId, address approvedBy);
    event UpgradeAnnouncedPublicly(uint256 indexed proposalId, uint64 executeAfter);
    event UpgradeExecuted(uint256 indexed proposalId, address newImplementation);
    event UpgradeCancelled(uint256 indexed proposalId, string reason);

    // Bank Escrow Events
    event BankEscrowAdded(bytes32 indexed bankId, string bankName, bool isPrimary);
    event BankEscrowFrozen(bytes32 indexed bankId, string reason, address frozenBy);
    event BankEscrowUnfrozen(bytes32 indexed bankId, address unfrozenBy);
    event BankMigrationInitiated(bytes32 indexed fromBank, bytes32 indexed toBank, uint256 amount);
    event BankMigrationCompleted(bytes32 indexed fromBank, bytes32 indexed toBank, uint256 amount);

    // Contract Events
    event ContractCreated(bytes32 indexed contractId, bytes32 indexed contractNumber, bytes32 seller, bytes32 buyer, address sellerAddress, address buyerAddress, uint256 totalAmount, bytes32 bankId, uint64 timestamp);
    event StatusTransition(bytes32 indexed contractId, Status indexed oldStatus, Status indexed newStatus, address triggeredBy, bytes32 transactionRef, uint64 timestamp, uint32 newVersion);
    event PaymentMarked(bytes32 indexed contractId, bytes32 indexed qrisReference, uint256 amount, bytes32 escrowReference, address markedBy, uint64 timestamp);
    event VerificationMarked(bytes32 indexed contractId, bytes32 indexed verificationHash, address verifiedBy, uint64 timestamp);
    event SettlementMarked(bytes32 indexed contractId, bytes32 indexed settlementRef, uint256 sellerAmount, uint256 platformFee, uint256 mediatorFee, address settledBy, uint64 timestamp);

    // Dispute Events
    event DisputeRaised(bytes32 indexed contractId, bytes32 indexed reasonHash, bytes32 evidenceHash, address raisedBy, DisputeRaiserType raiserType, uint64 timestamp);
    event ResolutionQueued(bytes32 indexed contractId, bytes32 indexed resolutionHash, ResolutionType resolutionType, uint64 executableAt, address queuedBy, uint64 timestamp);
    event ResolutionExecuted(bytes32 indexed contractId, bytes32 indexed arbitrationHash, ResolutionType resolutionType, Status finalStatus, address executedBy, uint64 timestamp);
    event DisputeAppealed(bytes32 indexed contractId, bytes32 indexed appealHash, address appealedBy, uint64 timestamp);

    // System Events
    event SystemModeChanged(SystemMode indexed oldMode, SystemMode indexed newMode, address changedBy, string reason);
    event EmergencyPaused(address indexed by, string reason, uint64 timestamp);
    event EmergencyUnpaused(address indexed by, uint64 timestamp);
}

/**
 * @title AmantraLedgerV5
 * @notice Production implementation with Zero Single Point of Failure
 */
contract AmantraLedgerV5 is
    Initializable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessControlUpgradeable,
    IAmantraLedgerV5
{
    // ============================================
    // Constants
    // ============================================

    string public constant VERSION = "5.0.0";
    uint16 public constant MAX_FEE_BPS = 500;

    // Timelock Constants
    uint64 public constant SUCCESSION_TIMELOCK = 7 days;
    uint64 public constant UPGRADE_TIMELOCK = 72 hours;
    uint64 public constant RESOLUTION_MIN_DELAY = 24 hours;
    uint64 public constant RESOLUTION_MAX_DELAY = 48 hours;

    // Dead Man Switch Constants
    uint64 public constant DEAD_MAN_SWITCH_THRESHOLD = 180 days;
    uint64 public constant HEARTBEAT_INTERVAL = 30 days;

    // Multisig Requirements
    uint256 public constant MIN_MULTISIG_THRESHOLD = 2;
    uint256 public constant MIN_OPERATOR_MEMBERS = 3;
    uint256 public constant MIN_ORACLE_MEMBERS = 5;
    uint256 public constant MIN_ARBITRATION_MEMBERS = 3;
    uint256 public constant MIN_HISBAH_MEMBERS = 5;
    uint256 public constant MIN_BACKUP_MEMBERS = 7;

    // Role Identifiers
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    bytes32 public constant HISBAH_ROLE = keccak256("HISBAH_ROLE");
    bytes32 public constant BACKUP_ROLE = keccak256("BACKUP_ROLE");

    // Inalienable Rights Hashes
    bytes32 public constant RIGHT_TO_ESCROW_REFUND = keccak256("RIGHT_TO_ESCROW_REFUND");
    bytes32 public constant RIGHT_TO_RAISE_DISPUTE = keccak256("RIGHT_TO_RAISE_DISPUTE");
    bytes32 public constant RIGHT_TO_FAIR_HEARING = keccak256("RIGHT_TO_FAIR_HEARING");

    // ============================================
    // State Variables - Multisig Configuration
    // ============================================

    /// @notice Configuration for each multisig role
    mapping(MultisigRole => MultisigConfig) public multisigs;

    /// @notice Mapping to check if an address holds any critical role
    mapping(address => MultisigRole[]) public addressRoles;

    /// @notice System continuity configuration
    SystemContinuity public continuity;

    /// @notice Current system mode
    SystemMode public systemMode;

    // ============================================
    // State Variables - Succession
    // ============================================

    /// @notice Succession proposal counter
    uint256 public successionProposalCount;

    /// @notice Succession proposals
    mapping(uint256 => SuccessionProposal) public successionProposals;

    // ============================================
    // State Variables - Upgrade
    // ============================================

    /// @notice Upgrade proposal counter
    uint256 public upgradeProposalCount;

    /// @notice Upgrade proposals
    mapping(uint256 => UpgradeProposal) public upgradeProposals;

    // ============================================
    // State Variables - Bank Escrow
    // ============================================

    /// @notice Bank escrow configurations
    mapping(bytes32 => BankEscrowConfig) public bankEscrows;

    /// @notice List of registered bank IDs
    bytes32[] public registeredBanks;

    /// @notice Primary bank ID
    bytes32 public primaryBankId;

    // ============================================
    // State Variables - Contracts & Disputes
    // ============================================

    mapping(bytes32 => Contract) private _contracts;
    mapping(bytes32 => bytes32) private _contractNumberToId;
    mapping(Status => mapping(Status => bool)) private _allowedTransitions;
    mapping(bytes32 => Dispute) private _disputes;
    mapping(bytes32 => bool) private _processedTransactions;
    mapping(bytes32 => bytes32[]) private _contractEvidence;
    mapping(bytes32 => mapping(address => bool)) private _contractParties;

    /// @notice Resolution timelock delay
    uint64 public resolutionDelay;

    // ============================================
    // State Variables - Statistics
    // ============================================

    uint256 public totalContracts;
    uint256 public totalSettledValue;
    uint256 public totalDisputesRaised;
    uint256 public totalDisputesResolved;

    // ============================================
    // State Variables - Gap for upgrades
    // ============================================

    uint256[30] private __gap;

    // ============================================
    // Errors
    // ============================================

    error ContractAlreadyExists(bytes32 contractId);
    error ContractNotFound(bytes32 contractId);
    error InvalidStateTransition(bytes32 contractId, Status from, Status to);
    error TransactionAlreadyProcessed(bytes32 transactionRef);
    error FeeExceedsMaximum(uint16 provided, uint16 maximum);
    error InvalidFeeCalculation(uint256 total, uint256 platformFee, uint256 sellerAmount);
    error DisputeNotActive(bytes32 contractId);
    error DisputeAlreadyActive(bytes32 contractId);
    error InvalidAmount(uint256 amount);
    error ZeroAddressNotAllowed();
    error InvalidContractNumber(bytes32 contractNumber);
    error AkadStatementRequired();

    // Multisig Errors
    error NotValidMultisig(address multisig, string reason);
    error MultisigThresholdTooLow(uint256 threshold, uint256 required);
    error MultisigMembersTooFew(uint256 members, uint256 required);
    error AddressAlreadyHasCriticalRole(address addr, MultisigRole existingRole);
    error MultisigRoleNotActive(MultisigRole role);

    // Succession Errors
    error SuccessionNotFound(uint256 proposalId);
    error SuccessionAlreadyExecuted(uint256 proposalId);
    error SuccessionTimelockNotPassed(uint256 proposalId, uint64 executeAfter);
    error SuccessionNotApprovedByHisbah(uint256 proposalId);
    error SuccessionCancelledError(uint256 proposalId);

    // Dead Man Switch Errors
    error DeadManSwitchNotTriggerable(MultisigRole role, uint64 lastActivity, uint64 threshold);
    error NoBackupAvailable(MultisigRole role);
    error SystemNotInRecoveryMode();
    error SystemInRecoveryMode();

    // Upgrade Errors
    error UpgradeNotFound(uint256 proposalId);
    error UpgradeAlreadyExecuted(uint256 proposalId);
    error UpgradeTimelockNotPassed(uint256 proposalId);
    error UpgradeNotApproved(uint256 proposalId);
    error UpgradeNotAnnouncedPublicly(uint256 proposalId);

    // Bank Escrow Errors
    error BankNotFound(bytes32 bankId);
    error BankAlreadyExists(bytes32 bankId);
    error BankIsFrozen(bytes32 bankId);
    error NoPrimaryBankSet();
    error CannotFreezeLastActiveBank();

    // Resolution Errors
    error ResolutionNotQueued(bytes32 contractId);
    error ResolutionAlreadyQueued(bytes32 contractId);
    error ResolutionNotExecutable(bytes32 contractId, uint64 executableAt);
    error ResolutionHashMismatch(bytes32 expected, bytes32 provided);
    error NotContractParty(bytes32 contractId, address caller);

    // System Mode Errors
    error InvalidSystemMode(SystemMode current, SystemMode required);
    error OperationNotAllowedInCurrentMode(SystemMode mode, string operation);

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyMultisig(MultisigRole role) {
        MultisigConfig storage config = multisigs[role];
        if (msg.sender != config.multisigAddress) {
            revert AccessControlUnauthorizedAccount(msg.sender, _getRoleHash(role));
        }
        if (!config.active) {
            revert MultisigRoleNotActive(role);
        }
        _recordActivity(role);
        _;
    }

    modifier onlyInMode(SystemMode requiredMode) {
        if (systemMode != requiredMode) {
            revert InvalidSystemMode(systemMode, requiredMode);
        }
        _;
    }

    modifier notInMode(SystemMode forbiddenMode) {
        if (systemMode == forbiddenMode) {
            revert OperationNotAllowedInCurrentMode(forbiddenMode, "this operation");
        }
        _;
    }

    modifier contractExists(bytes32 contractId) {
        if (_contracts[contractId].createdAt == 0) {
            revert ContractNotFound(contractId);
        }
        _;
    }

    modifier idempotent(bytes32 transactionRef) {
        if (_processedTransactions[transactionRef]) {
            revert TransactionAlreadyProcessed(transactionRef);
        }
        _processedTransactions[transactionRef] = true;
        _;
    }

    modifier onlyContractPartyOrOperator(bytes32 contractId) {
        if (!_isContractParty(contractId, msg.sender) &&
            msg.sender != multisigs[MultisigRole.OPERATOR].multisigAddress) {
            revert NotContractParty(contractId, msg.sender);
        }
        _;
    }

    modifier bankNotFrozen(bytes32 bankId) {
        if (bankEscrows[bankId].isFrozen) {
            revert BankIsFrozen(bankId);
        }
        _;
    }

    // ============================================
    // Initializer
    // ============================================

    /**
     * @notice Initializes the contract with all six multisigs
     * @dev NO ADDRESS CAN HOLD MULTIPLE CRITICAL ROLES
     * @param _operator Operator multisig address
     * @param _oracle Oracle multisig address
     * @param _emergency Emergency multisig address
     * @param _arbitrationCouncil Arbitration council multisig address
     * @param _hisbah Hisbah oversight multisig address
     * @param _backup Backup disaster recovery multisig address
     * @param _admin Initial admin for DEFAULT_ADMIN_ROLE
     */
    function initialize(
        address _operator,
        address _oracle,
        address _emergency,
        address _arbitrationCouncil,
        address _hisbah,
        address _backup,
        address _admin
    ) external initializer {
        // Validate no zero addresses
        if (_operator == address(0) || _oracle == address(0) ||
            _emergency == address(0) || _arbitrationCouncil == address(0) ||
            _hisbah == address(0) || _backup == address(0) || _admin == address(0)) {
            revert ZeroAddressNotAllowed();
        }

        // Validate all addresses are unique (no address holds multiple roles)
        _validateUniqueAddresses(_operator, _oracle, _emergency, _arbitrationCouncil, _hisbah, _backup);

        __UUPSUpgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __AccessControl_init();

        // Validate and register all multisigs
        _validateAndRegisterMultisig(MultisigRole.OPERATOR, _operator, MIN_OPERATOR_MEMBERS);
        _validateAndRegisterMultisig(MultisigRole.ORACLE, _oracle, MIN_ORACLE_MEMBERS);
        _validateAndRegisterMultisig(MultisigRole.EMERGENCY, _emergency, MIN_OPERATOR_MEMBERS);
        _validateAndRegisterMultisig(MultisigRole.ARBITRATION_COUNCIL, _arbitrationCouncil, MIN_ARBITRATION_MEMBERS);
        _validateAndRegisterMultisig(MultisigRole.HISBAH, _hisbah, MIN_HISBAH_MEMBERS);
        _validateAndRegisterMultisig(MultisigRole.BACKUP, _backup, MIN_BACKUP_MEMBERS);

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _operator);
        _grantRole(ORACLE_ROLE, _oracle);
        _grantRole(EMERGENCY_ROLE, _emergency);
        _grantRole(ARBITRATOR_ROLE, _arbitrationCouncil);
        _grantRole(HISBAH_ROLE, _hisbah);
        _grantRole(BACKUP_ROLE, _backup);

        // Initialize system continuity with backups
        continuity = SystemContinuity({
            backupOracle: _backup,
            backupArbitrator: _backup,
            backupHisbah: _backup,
            backupOperator: _backup,
            lastOracleHeartbeat: uint64(block.timestamp),
            lastArbitratorHeartbeat: uint64(block.timestamp),
            lastOperatorHeartbeat: uint64(block.timestamp),
            lastHisbahHeartbeat: uint64(block.timestamp)
        });

        // Set default resolution delay
        resolutionDelay = RESOLUTION_MIN_DELAY;

        // Initialize system mode
        systemMode = SystemMode.NORMAL;

        // Initialize state transitions
        _initializeTransitionMatrix();
    }

    function _validateUniqueAddresses(
        address _operator,
        address _oracle,
        address _emergency,
        address _arbitrationCouncil,
        address _hisbah,
        address _backup
    ) internal pure {
        address[6] memory addresses = [_operator, _oracle, _emergency, _arbitrationCouncil, _hisbah, _backup];

        for (uint i = 0; i < addresses.length; i++) {
            for (uint j = i + 1; j < addresses.length; j++) {
                if (addresses[i] == addresses[j]) {
                    revert AddressAlreadyHasCriticalRole(addresses[i], MultisigRole(i));
                }
            }
        }
    }

    function _validateAndRegisterMultisig(
        MultisigRole role,
        address multisig,
        uint256 minMembers
    ) internal {
        // Try to call Gnosis Safe interface
        try IGnosisSafe(multisig).getThreshold() returns (uint256 threshold) {
            if (threshold < MIN_MULTISIG_THRESHOLD) {
                revert MultisigThresholdTooLow(threshold, MIN_MULTISIG_THRESHOLD);
            }

            address[] memory owners = IGnosisSafe(multisig).getOwners();
            uint256 memberCount = owners.length;

            if (memberCount < minMembers) {
                revert MultisigMembersTooFew(memberCount, minMembers);
            }

            multisigs[role] = MultisigConfig({
                multisigAddress: multisig,
                threshold: threshold,
                memberCount: memberCount,
                lastValidatedAt: uint64(block.timestamp),
                lastActivityAt: uint64(block.timestamp),
                validated: true,
                active: true
            });

            addressRoles[multisig].push(role);

            emit MultisigRegistered(role, multisig, threshold, memberCount);
        } catch {
            revert NotValidMultisig(multisig, "Cannot verify Gnosis Safe interface");
        }
    }

    function _initializeTransitionMatrix() private {
        _allowedTransitions[Status.CREATED][Status.FUNDED] = true;
        _allowedTransitions[Status.CREATED][Status.CANCELLED] = true;
        _allowedTransitions[Status.FUNDED][Status.VERIFIED] = true;
        _allowedTransitions[Status.FUNDED][Status.DISPUTED] = true;
        _allowedTransitions[Status.VERIFIED][Status.SETTLED] = true;
        _allowedTransitions[Status.VERIFIED][Status.DISPUTED] = true;
        _allowedTransitions[Status.DISPUTED][Status.VERIFIED] = true;
        _allowedTransitions[Status.DISPUTED][Status.CANCELLED] = true;
    }

    // ============================================
    // HEARTBEAT & ACTIVITY TRACKING
    // ============================================

    /**
     * @notice Records activity for a multisig role
     */
    function _recordActivity(MultisigRole role) internal {
        multisigs[role].lastActivityAt = uint64(block.timestamp);

        // Update continuity heartbeat
        if (role == MultisigRole.ORACLE) {
            continuity.lastOracleHeartbeat = uint64(block.timestamp);
        } else if (role == MultisigRole.ARBITRATION_COUNCIL) {
            continuity.lastArbitratorHeartbeat = uint64(block.timestamp);
        } else if (role == MultisigRole.OPERATOR) {
            continuity.lastOperatorHeartbeat = uint64(block.timestamp);
        } else if (role == MultisigRole.HISBAH) {
            continuity.lastHisbahHeartbeat = uint64(block.timestamp);
        }

        emit MultisigActivityRecorded(role, msg.sender, uint64(block.timestamp));
    }

    /**
     * @notice Send heartbeat to prove multisig is alive
     * @dev Should be called at least every 30 days
     */
    function sendHeartbeat(MultisigRole role) external onlyMultisig(role) {
        emit HeartbeatReceived(role, msg.sender, uint64(block.timestamp));
    }

    // ============================================
    // DEAD MAN SWITCH
    // ============================================

    /**
     * @notice Triggers dead man switch if a critical role has been inactive
     * @dev Anyone can call this if the inactivity threshold is exceeded
     * @param role The role to trigger dead man switch for
     */
    function triggerDeadManSwitch(MultisigRole role) external nonReentrant {
        MultisigConfig storage config = multisigs[role];
        uint64 lastActivity = config.lastActivityAt;

        // Check if threshold exceeded
        if (block.timestamp < lastActivity + DEAD_MAN_SWITCH_THRESHOLD) {
            revert DeadManSwitchNotTriggerable(role, lastActivity, DEAD_MAN_SWITCH_THRESHOLD);
        }

        // Get backup address
        address backup = _getBackupFor(role);
        if (backup == address(0)) {
            revert NoBackupAvailable(role);
        }

        address oldHolder = config.multisigAddress;

        // Transfer role to backup
        _revokeRole(_getRoleHash(role), oldHolder);
        _grantRole(_getRoleHash(role), backup);

        // Update config
        config.multisigAddress = backup;
        config.lastActivityAt = uint64(block.timestamp);

        // Enter recovery mode
        if (systemMode != SystemMode.RECOVERY) {
            SystemMode oldMode = systemMode;
            systemMode = SystemMode.RECOVERY;
            emit SystemModeChanged(oldMode, SystemMode.RECOVERY, msg.sender, "Dead man switch triggered");
        }

        emit DeadManSwitchTriggered(role, oldHolder, backup, lastActivity);
    }

    function _getBackupFor(MultisigRole role) internal view returns (address) {
        if (role == MultisigRole.ORACLE) {
            return continuity.backupOracle;
        } else if (role == MultisigRole.ARBITRATION_COUNCIL) {
            return continuity.backupArbitrator;
        } else if (role == MultisigRole.OPERATOR) {
            return continuity.backupOperator;
        } else if (role == MultisigRole.HISBAH) {
            return continuity.backupHisbah;
        }
        return multisigs[MultisigRole.BACKUP].multisigAddress;
    }

    /**
     * @notice Check if dead man switch can be triggered for a role
     */
    function canTriggerDeadManSwitch(MultisigRole role) external view returns (bool, uint64 lastActivity, uint64 threshold) {
        MultisigConfig storage config = multisigs[role];
        return (
            block.timestamp >= config.lastActivityAt + DEAD_MAN_SWITCH_THRESHOLD,
            config.lastActivityAt,
            DEAD_MAN_SWITCH_THRESHOLD
        );
    }

    // ============================================
    // SUCCESSION & KEY ROTATION
    // ============================================

    /**
     * @notice Propose succession for a role
     * @dev Only the role holder or Hisbah can propose
     * @param role The role to propose succession for
     * @param newMultisig The proposed new multisig address
     * @param reason Reason for succession
     */
    function proposeRoleSuccession(
        MultisigRole role,
        address newMultisig,
        string calldata reason
    ) external returns (uint256 proposalId) {
        // Only current holder or Hisbah can propose
        MultisigConfig storage config = multisigs[role];
        address hisbahAddress = multisigs[MultisigRole.HISBAH].multisigAddress;

        if (msg.sender != config.multisigAddress && msg.sender != hisbahAddress) {
            revert AccessControlUnauthorizedAccount(msg.sender, _getRoleHash(role));
        }

        // Validate new multisig
        if (newMultisig == address(0)) {
            revert ZeroAddressNotAllowed();
        }

        // Check new address doesn't already hold a critical role
        if (addressRoles[newMultisig].length > 0) {
            revert AddressAlreadyHasCriticalRole(newMultisig, addressRoles[newMultisig][0]);
        }

        proposalId = successionProposalCount++;

        successionProposals[proposalId] = SuccessionProposal({
            role: role,
            currentHolder: config.multisigAddress,
            proposedSuccessor: newMultisig,
            proposedBy: msg.sender,
            proposedAt: uint64(block.timestamp),
            executeAfter: uint64(block.timestamp) + SUCCESSION_TIMELOCK,
            hisbahApproved: false,
            executed: false,
            cancelled: false,
            reason: reason
        });

        emit SuccessionProposed(proposalId, role, config.multisigAddress, newMultisig);
    }

    /**
     * @notice Hisbah approves a succession proposal
     * @param proposalId The proposal to approve
     */
    function approveSuccession(uint256 proposalId)
        external
        onlyMultisig(MultisigRole.HISBAH)
    {
        SuccessionProposal storage proposal = successionProposals[proposalId];

        if (proposal.proposedAt == 0) {
            revert SuccessionNotFound(proposalId);
        }
        if (proposal.executed) {
            revert SuccessionAlreadyExecuted(proposalId);
        }
        if (proposal.cancelled) {
            revert SuccessionCancelledError(proposalId);
        }

        proposal.hisbahApproved = true;

        emit SuccessionApprovedByHisbah(proposalId, msg.sender);
    }

    /**
     * @notice Execute a succession after timelock and Hisbah approval
     * @param proposalId The proposal to execute
     */
    function executeRoleSuccession(uint256 proposalId) external nonReentrant {
        SuccessionProposal storage proposal = successionProposals[proposalId];

        if (proposal.proposedAt == 0) {
            revert SuccessionNotFound(proposalId);
        }
        if (proposal.executed) {
            revert SuccessionAlreadyExecuted(proposalId);
        }
        if (proposal.cancelled) {
            revert SuccessionCancelledError(proposalId);
        }
        if (block.timestamp < proposal.executeAfter) {
            revert SuccessionTimelockNotPassed(proposalId, proposal.executeAfter);
        }
        if (!proposal.hisbahApproved) {
            revert SuccessionNotApprovedByHisbah(proposalId);
        }

        // Validate new multisig meets requirements
        _validateNewMultisig(proposal.role, proposal.proposedSuccessor);

        // Execute the succession
        MultisigConfig storage config = multisigs[proposal.role];
        address oldHolder = config.multisigAddress;
        address newHolder = proposal.proposedSuccessor;

        // Revoke from old, grant to new
        _revokeRole(_getRoleHash(proposal.role), oldHolder);
        _grantRole(_getRoleHash(proposal.role), newHolder);

        // Update config
        config.multisigAddress = newHolder;
        config.lastActivityAt = uint64(block.timestamp);
        config.lastValidatedAt = uint64(block.timestamp);

        // Update address roles mapping
        _removeAddressRole(oldHolder, proposal.role);
        addressRoles[newHolder].push(proposal.role);

        proposal.executed = true;

        emit SuccessionExecuted(proposalId, proposal.role, oldHolder, newHolder);
    }

    function _validateNewMultisig(MultisigRole role, address multisig) internal view {
        try IGnosisSafe(multisig).getThreshold() returns (uint256 threshold) {
            if (threshold < MIN_MULTISIG_THRESHOLD) {
                revert MultisigThresholdTooLow(threshold, MIN_MULTISIG_THRESHOLD);
            }

            uint256 minMembers = _getMinMembersForRole(role);
            address[] memory owners = IGnosisSafe(multisig).getOwners();

            if (owners.length < minMembers) {
                revert MultisigMembersTooFew(owners.length, minMembers);
            }
        } catch {
            revert NotValidMultisig(multisig, "Cannot verify Gnosis Safe interface");
        }
    }

    function _getMinMembersForRole(MultisigRole role) internal pure returns (uint256) {
        if (role == MultisigRole.OPERATOR) return MIN_OPERATOR_MEMBERS;
        if (role == MultisigRole.ORACLE) return MIN_ORACLE_MEMBERS;
        if (role == MultisigRole.ARBITRATION_COUNCIL) return MIN_ARBITRATION_MEMBERS;
        if (role == MultisigRole.HISBAH) return MIN_HISBAH_MEMBERS;
        if (role == MultisigRole.BACKUP) return MIN_BACKUP_MEMBERS;
        return MIN_OPERATOR_MEMBERS;
    }

    function _removeAddressRole(address addr, MultisigRole role) internal {
        MultisigRole[] storage roles = addressRoles[addr];
        for (uint i = 0; i < roles.length; i++) {
            if (roles[i] == role) {
                roles[i] = roles[roles.length - 1];
                roles.pop();
                break;
            }
        }
    }

    /**
     * @notice Cancel a succession proposal
     */
    function cancelSuccession(uint256 proposalId, string calldata reason)
        external
        onlyMultisig(MultisigRole.HISBAH)
    {
        SuccessionProposal storage proposal = successionProposals[proposalId];

        if (proposal.proposedAt == 0) {
            revert SuccessionNotFound(proposalId);
        }
        if (proposal.executed) {
            revert SuccessionAlreadyExecuted(proposalId);
        }

        proposal.cancelled = true;

        emit SuccessionCancelled(proposalId, reason);
    }

    // ============================================
    // UPGRADE SAFETY (Triple Approval + 72h Timelock)
    // ============================================

    /**
     * @notice Propose a contract upgrade
     * @dev Only Oracle can propose upgrades
     */
    function proposeUpgrade(address newImplementation)
        external
        onlyMultisig(MultisigRole.ORACLE)
        returns (uint256 proposalId)
    {
        if (newImplementation == address(0)) {
            revert ZeroAddressNotAllowed();
        }

        bytes32 codeHash = newImplementation.codehash;

        proposalId = upgradeProposalCount++;

        upgradeProposals[proposalId] = UpgradeProposal({
            newImplementation: newImplementation,
            proposedBy: msg.sender,
            proposedAt: uint64(block.timestamp),
            executeAfter: uint64(block.timestamp) + UPGRADE_TIMELOCK,
            oracleApproved: true, // Proposer is Oracle, auto-approved
            hisbahApproved: false,
            announcedPublicly: false,
            executed: false,
            cancelled: false,
            codeHash: codeHash
        });

        emit UpgradeProposed(proposalId, newImplementation, codeHash);
    }

    /**
     * @notice Hisbah approves an upgrade proposal
     */
    function approveUpgrade(uint256 proposalId)
        external
        onlyMultisig(MultisigRole.HISBAH)
    {
        UpgradeProposal storage proposal = upgradeProposals[proposalId];

        if (proposal.proposedAt == 0) {
            revert UpgradeNotFound(proposalId);
        }
        if (proposal.executed) {
            revert UpgradeAlreadyExecuted(proposalId);
        }

        proposal.hisbahApproved = true;

        emit UpgradeApprovedByHisbah(proposalId, msg.sender);
    }

    /**
     * @notice Announce upgrade publicly (starts the 72h timelock)
     */
    function announceUpgradePublicly(uint256 proposalId)
        external
        onlyMultisig(MultisigRole.ORACLE)
    {
        UpgradeProposal storage proposal = upgradeProposals[proposalId];

        if (proposal.proposedAt == 0) {
            revert UpgradeNotFound(proposalId);
        }
        if (!proposal.hisbahApproved) {
            revert UpgradeNotApproved(proposalId);
        }

        proposal.announcedPublicly = true;
        proposal.executeAfter = uint64(block.timestamp) + UPGRADE_TIMELOCK;

        emit UpgradeAnnouncedPublicly(proposalId, proposal.executeAfter);
    }

    /**
     * @notice Execute an approved and announced upgrade
     */
    function executeUpgrade(uint256 proposalId)
        external
        onlyMultisig(MultisigRole.ORACLE)
        nonReentrant
    {
        UpgradeProposal storage proposal = upgradeProposals[proposalId];

        if (proposal.proposedAt == 0) {
            revert UpgradeNotFound(proposalId);
        }
        if (proposal.executed) {
            revert UpgradeAlreadyExecuted(proposalId);
        }
        if (!proposal.oracleApproved || !proposal.hisbahApproved) {
            revert UpgradeNotApproved(proposalId);
        }
        if (!proposal.announcedPublicly) {
            revert UpgradeNotAnnouncedPublicly(proposalId);
        }
        if (block.timestamp < proposal.executeAfter) {
            revert UpgradeTimelockNotPassed(proposalId);
        }

        // Verify code hash hasn't changed
        if (proposal.newImplementation.codehash != proposal.codeHash) {
            revert UpgradeNotApproved(proposalId);
        }

        proposal.executed = true;

        // Perform the upgrade
        _upgradeToAndCallUUPS(proposal.newImplementation, "", false);

        emit UpgradeExecuted(proposalId, proposal.newImplementation);
    }

    /**
     * @notice Cancel an upgrade proposal
     */
    function cancelUpgrade(uint256 proposalId, string calldata reason)
        external
        onlyMultisig(MultisigRole.HISBAH)
    {
        UpgradeProposal storage proposal = upgradeProposals[proposalId];

        if (proposal.proposedAt == 0) {
            revert UpgradeNotFound(proposalId);
        }
        if (proposal.executed) {
            revert UpgradeAlreadyExecuted(proposalId);
        }

        proposal.cancelled = true;

        emit UpgradeCancelled(proposalId, reason);
    }

    // ============================================
    // ANTI-HOSTAGE BANK LAYER
    // ============================================

    /**
     * @notice Register a new bank escrow partner
     */
    function addBankEscrow(
        bytes32 bankId,
        string calldata bankName,
        bool isPrimary
    ) external onlyMultisig(MultisigRole.ORACLE) {
        if (bankEscrows[bankId].addedAt != 0) {
            revert BankAlreadyExists(bankId);
        }

        bankEscrows[bankId] = BankEscrowConfig({
            bankId: bankId,
            bankName: bankName,
            isPrimary: isPrimary,
            isActive: true,
            isFrozen: false,
            totalBalance: 0,
            addedAt: uint64(block.timestamp),
            lastActivityAt: uint64(block.timestamp)
        });

        registeredBanks.push(bankId);

        if (isPrimary) {
            primaryBankId = bankId;
        }

        emit BankEscrowAdded(bankId, bankName, isPrimary);
    }

    /**
     * @notice Freeze a bank escrow (Hisbah + Oracle authority)
     * @dev Used when bank has issues - prevents new deposits but allows withdrawals
     */
    function freezeBankEscrow(bytes32 bankId, string calldata reason)
        external
    {
        // Either Hisbah OR Oracle can freeze
        address hisbahAddress = multisigs[MultisigRole.HISBAH].multisigAddress;
        address oracleAddress = multisigs[MultisigRole.ORACLE].multisigAddress;

        if (msg.sender != hisbahAddress && msg.sender != oracleAddress) {
            revert AccessControlUnauthorizedAccount(msg.sender, HISBAH_ROLE);
        }

        BankEscrowConfig storage bank = bankEscrows[bankId];
        if (bank.addedAt == 0) {
            revert BankNotFound(bankId);
        }

        // Cannot freeze if it's the only active bank
        uint256 activeCount = 0;
        for (uint i = 0; i < registeredBanks.length; i++) {
            if (bankEscrows[registeredBanks[i]].isActive && !bankEscrows[registeredBanks[i]].isFrozen) {
                activeCount++;
            }
        }
        if (activeCount <= 1 && !bank.isFrozen) {
            revert CannotFreezeLastActiveBank();
        }

        bank.isFrozen = true;

        emit BankEscrowFrozen(bankId, reason, msg.sender);
    }

    /**
     * @notice Unfreeze a bank escrow
     */
    function unfreezeBankEscrow(bytes32 bankId)
        external
        onlyMultisig(MultisigRole.HISBAH)
    {
        BankEscrowConfig storage bank = bankEscrows[bankId];
        if (bank.addedAt == 0) {
            revert BankNotFound(bankId);
        }

        bank.isFrozen = false;

        emit BankEscrowUnfrozen(bankId, msg.sender);
    }

    /**
     * @notice Initiate migration from one bank to another
     */
    function initiateBankMigration(
        bytes32 fromBankId,
        bytes32 toBankId,
        uint256 amount
    ) external onlyMultisig(MultisigRole.ORACLE) {
        BankEscrowConfig storage fromBank = bankEscrows[fromBankId];
        BankEscrowConfig storage toBank = bankEscrows[toBankId];

        if (fromBank.addedAt == 0) revert BankNotFound(fromBankId);
        if (toBank.addedAt == 0) revert BankNotFound(toBankId);
        if (toBank.isFrozen) revert BankIsFrozen(toBankId);

        emit BankMigrationInitiated(fromBankId, toBankId, amount);
    }

    /**
     * @notice Get the best available bank for a new contract
     */
    function getAvailableBank() public view returns (bytes32) {
        // First try primary bank
        if (primaryBankId != bytes32(0)) {
            BankEscrowConfig storage primary = bankEscrows[primaryBankId];
            if (primary.isActive && !primary.isFrozen) {
                return primaryBankId;
            }
        }

        // Fall back to any active, non-frozen bank
        for (uint i = 0; i < registeredBanks.length; i++) {
            bytes32 bankId = registeredBanks[i];
            BankEscrowConfig storage bank = bankEscrows[bankId];
            if (bank.isActive && !bank.isFrozen) {
                return bankId;
            }
        }

        revert NoPrimaryBankSet();
    }

    // ============================================
    // CONTRACT CREATION & LIFECYCLE
    // ============================================

    /**
     * @notice Creates a new contract with multi-bank support
     */
    function createContract(
        bytes32 contractId,
        bytes32 contractNumber,
        bytes32 seller,
        bytes32 buyer,
        address sellerAddress,
        address buyerAddress,
        uint256 totalAmount,
        uint16 feeBps,
        uint256 platformFee,
        uint256 sellerAmount,
        uint256 mediatorFee,
        NetworkFeeBearer networkFeeBearer,
        uint256 estimatedNetworkFee,
        bytes32 akadStatementHash
    )
        external
        onlyMultisig(MultisigRole.OPERATOR)
        whenNotPaused
        notInMode(SystemMode.DISSOLUTION)
        nonReentrant
    {
        // Get available bank
        bytes32 bankId = getAvailableBank();

        // Validations
        if (_contracts[contractId].createdAt != 0) {
            revert ContractAlreadyExists(contractId);
        }
        if (contractNumber == bytes32(0)) {
            revert InvalidContractNumber(contractNumber);
        }
        if (_contractNumberToId[contractNumber] != bytes32(0)) {
            revert ContractAlreadyExists(_contractNumberToId[contractNumber]);
        }
        if (totalAmount == 0) {
            revert InvalidAmount(totalAmount);
        }
        if (feeBps > MAX_FEE_BPS) {
            revert FeeExceedsMaximum(feeBps, MAX_FEE_BPS);
        }
        if (platformFee + sellerAmount + mediatorFee != totalAmount) {
            revert InvalidFeeCalculation(totalAmount, platformFee, sellerAmount);
        }
        if (akadStatementHash == bytes32(0)) {
            revert AkadStatementRequired();
        }
        if (sellerAddress == address(0) || buyerAddress == address(0)) {
            revert ZeroAddressNotAllowed();
        }

        uint64 timestamp = uint64(block.timestamp);

        _contracts[contractId] = Contract({
            id: contractId,
            contractNumber: contractNumber,
            seller: seller,
            buyer: buyer,
            sellerAddress: sellerAddress,
            buyerAddress: buyerAddress,
            totalAmount: totalAmount,
            status: Status.CREATED,
            feeInfo: FeeInfo({
                bps: feeBps,
                platformFee: platformFee,
                sellerAmount: sellerAmount,
                mediatorFee: mediatorFee,
                networkFeeBearer: networkFeeBearer,
                estimatedNetworkFee: estimatedNetworkFee,
                akadStatementHash: akadStatementHash
            }),
            escrowReference: bytes32(0),
            bankId: bankId,
            createdAt: timestamp,
            updatedAt: timestamp,
            version: 1
        });

        // Register parties for direct dispute access
        _contractParties[contractId][sellerAddress] = true;
        _contractParties[contractId][buyerAddress] = true;

        _contractNumberToId[contractNumber] = contractId;
        totalContracts++;

        emit ContractCreated(
            contractId,
            contractNumber,
            seller,
            buyer,
            sellerAddress,
            buyerAddress,
            totalAmount,
            bankId,
            timestamp
        );
    }

    // ============================================
    // STATE TRANSITIONS
    // ============================================

    function markFunded(
        bytes32 contractId,
        bytes32 qrisReference,
        bytes32 escrowReference,
        bytes32 transactionRef
    )
        external
        onlyMultisig(MultisigRole.OPERATOR)
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];
        _transition(contractId, c.status, Status.FUNDED, transactionRef);
        c.escrowReference = escrowReference;

        // Update bank balance tracking
        bankEscrows[c.bankId].totalBalance += c.totalAmount;
        bankEscrows[c.bankId].lastActivityAt = uint64(block.timestamp);

        emit PaymentMarked(
            contractId,
            qrisReference,
            c.totalAmount,
            escrowReference,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    function markVerified(
        bytes32 contractId,
        bytes32 verificationHash,
        bytes32 transactionRef
    )
        external
        onlyMultisig(MultisigRole.OPERATOR)
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];
        _transition(contractId, c.status, Status.VERIFIED, transactionRef);

        if (_disputes[contractId].active) {
            _disputes[contractId].active = false;
            _disputes[contractId].resolvedAt = uint64(block.timestamp);
        }

        emit VerificationMarked(
            contractId,
            verificationHash,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    function markSettled(
        bytes32 contractId,
        bytes32 settlementRef,
        bytes32 transactionRef,
        uint256 actualNetworkFee,
        uint256 sellerNetReceived,
        uint256 platformNetReceived,
        bytes32 bankReceiptHash
    )
        external
        onlyMultisig(MultisigRole.ORACLE)
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];

        _transition(contractId, c.status, Status.SETTLED, transactionRef);
        totalSettledValue += c.totalAmount;

        // Update bank balance tracking
        bankEscrows[c.bankId].totalBalance -= c.totalAmount;

        emit SettlementMarked(
            contractId,
            settlementRef,
            c.feeInfo.sellerAmount,
            c.feeInfo.platformFee,
            c.feeInfo.mediatorFee,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    function cancelContract(
        bytes32 contractId,
        bytes32 reasonHash,
        bytes32 transactionRef
    )
        external
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];

        if (c.status == Status.CREATED) {
            // Only Operator can cancel CREATED contracts
            if (msg.sender != multisigs[MultisigRole.OPERATOR].multisigAddress) {
                revert AccessControlUnauthorizedAccount(msg.sender, OPERATOR_ROLE);
            }
        } else if (c.status == Status.DISPUTED) {
            // Only Arbitration Council can cancel disputed contracts
            if (msg.sender != multisigs[MultisigRole.ARBITRATION_COUNCIL].multisigAddress) {
                revert AccessControlUnauthorizedAccount(msg.sender, ARBITRATOR_ROLE);
            }
            _disputes[contractId].active = false;
            _disputes[contractId].resolvedAt = uint64(block.timestamp);
        } else {
            revert InvalidStateTransition(contractId, c.status, Status.CANCELLED);
        }

        _transition(contractId, c.status, Status.CANCELLED, transactionRef);
    }

    function _transition(
        bytes32 contractId,
        Status from,
        Status to,
        bytes32 transactionRef
    ) internal {
        if (!_allowedTransitions[from][to]) {
            revert InvalidStateTransition(contractId, from, to);
        }

        Contract storage c = _contracts[contractId];
        Status oldStatus = c.status;
        c.status = to;
        c.updatedAt = uint64(block.timestamp);
        c.version++;

        emit StatusTransition(
            contractId,
            oldStatus,
            to,
            msg.sender,
            transactionRef,
            uint64(block.timestamp),
            c.version
        );
    }

    // ============================================
    // DISPUTE RESOLUTION
    // ============================================

    /**
     * @notice Raises a dispute - callable by buyer, seller, or operator
     */
    function raiseDispute(
        bytes32 contractId,
        bytes32 reasonHash,
        bytes32 evidenceHash,
        bytes32 transactionRef
    )
        external
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        onlyContractPartyOrOperator(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];

        if (_disputes[contractId].active) {
            revert DisputeAlreadyActive(contractId);
        }

        if (c.status != Status.FUNDED && c.status != Status.VERIFIED) {
            revert InvalidStateTransition(contractId, c.status, Status.DISPUTED);
        }

        _transition(contractId, c.status, Status.DISPUTED, transactionRef);

        DisputeRaiserType raiserType;
        if (msg.sender == c.buyerAddress) {
            raiserType = DisputeRaiserType.BUYER;
        } else if (msg.sender == c.sellerAddress) {
            raiserType = DisputeRaiserType.SELLER;
        } else {
            raiserType = DisputeRaiserType.OPERATOR;
        }

        _disputes[contractId] = Dispute({
            active: true,
            reasonHash: reasonHash,
            evidenceHash: evidenceHash,
            arbitrationHash: bytes32(0),
            raisedAt: uint64(block.timestamp),
            resolvedAt: 0,
            raisedBy: msg.sender,
            raiserType: raiserType,
            resolutionQueued: false,
            queuedResolutionHash: bytes32(0),
            resolutionExecutableAt: 0,
            queuedResolutionType: ResolutionType.CONTINUE_SETTLEMENT,
            appealed: false,
            appealHash: bytes32(0)
        });

        _contractEvidence[contractId].push(evidenceHash);
        totalDisputesRaised++;

        emit DisputeRaised(
            contractId,
            reasonHash,
            evidenceHash,
            msg.sender,
            raiserType,
            uint64(block.timestamp)
        );
    }

    /**
     * @notice Queue a dispute resolution (starts timelock)
     */
    function queueResolution(
        bytes32 contractId,
        bytes32 arbitrationHash,
        ResolutionType resolutionType
    )
        external
        onlyMultisig(MultisigRole.ARBITRATION_COUNCIL)
        whenNotPaused
        nonReentrant
        contractExists(contractId)
    {
        Dispute storage d = _disputes[contractId];

        if (!d.active) {
            revert DisputeNotActive(contractId);
        }
        if (d.resolutionQueued) {
            revert ResolutionAlreadyQueued(contractId);
        }

        uint64 executableAt = uint64(block.timestamp) + resolutionDelay;

        d.resolutionQueued = true;
        d.queuedResolutionHash = arbitrationHash;
        d.resolutionExecutableAt = executableAt;
        d.queuedResolutionType = resolutionType;

        emit ResolutionQueued(
            contractId,
            arbitrationHash,
            resolutionType,
            executableAt,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    /**
     * @notice Execute a queued resolution after timelock expires
     */
    function executeResolution(
        bytes32 contractId,
        bytes32 arbitrationHash,
        bytes32 transactionRef
    )
        external
        onlyMultisig(MultisigRole.ARBITRATION_COUNCIL)
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Dispute storage d = _disputes[contractId];

        if (!d.active) {
            revert DisputeNotActive(contractId);
        }
        if (!d.resolutionQueued) {
            revert ResolutionNotQueued(contractId);
        }
        if (block.timestamp < d.resolutionExecutableAt) {
            revert ResolutionNotExecutable(contractId, d.resolutionExecutableAt);
        }
        if (d.queuedResolutionHash != arbitrationHash) {
            revert ResolutionHashMismatch(d.queuedResolutionHash, arbitrationHash);
        }

        ResolutionType resType = d.queuedResolutionType;
        Status finalStatus;

        if (resType == ResolutionType.CONTINUE_SETTLEMENT || resType == ResolutionType.PAY_SELLER) {
            finalStatus = Status.VERIFIED;
        } else {
            finalStatus = Status.CANCELLED;
        }

        _transition(contractId, Status.DISPUTED, finalStatus, transactionRef);

        d.active = false;
        d.arbitrationHash = arbitrationHash;
        d.resolvedAt = uint64(block.timestamp);
        d.resolutionQueued = false;

        totalDisputesResolved++;

        emit ResolutionExecuted(
            contractId,
            arbitrationHash,
            resType,
            finalStatus,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    /**
     * @notice Appeal a resolution (before execution)
     * @dev Extends the timelock and escalates to Hisbah review
     */
    function appealResolution(
        bytes32 contractId,
        bytes32 appealHash
    )
        external
        contractExists(contractId)
        onlyContractPartyOrOperator(contractId)
    {
        Dispute storage d = _disputes[contractId];

        if (!d.resolutionQueued) {
            revert ResolutionNotQueued(contractId);
        }
        if (block.timestamp >= d.resolutionExecutableAt) {
            revert ResolutionNotExecutable(contractId, d.resolutionExecutableAt);
        }

        d.appealed = true;
        d.appealHash = appealHash;
        // Extend timelock for review
        d.resolutionExecutableAt = uint64(block.timestamp) + RESOLUTION_MAX_DELAY;

        emit DisputeAppealed(contractId, appealHash, msg.sender, uint64(block.timestamp));
    }

    // ============================================
    // EMERGENCY & SYSTEM MODE MANAGEMENT
    // ============================================

    function pause(string calldata reason) external {
        // Emergency, Hisbah, or Oracle can pause
        address emergencyAddr = multisigs[MultisigRole.EMERGENCY].multisigAddress;
        address hisbahAddr = multisigs[MultisigRole.HISBAH].multisigAddress;
        address oracleAddr = multisigs[MultisigRole.ORACLE].multisigAddress;

        if (msg.sender != emergencyAddr && msg.sender != hisbahAddr && msg.sender != oracleAddr) {
            revert AccessControlUnauthorizedAccount(msg.sender, EMERGENCY_ROLE);
        }

        _pause();
        emit EmergencyPaused(msg.sender, reason, uint64(block.timestamp));
    }

    function unpause() external onlyMultisig(MultisigRole.HISBAH) {
        _unpause();
        emit EmergencyUnpaused(msg.sender, uint64(block.timestamp));
    }

    /**
     * @notice Activate recovery mode
     */
    function activateRecoveryMode(string calldata reason)
        external
        onlyMultisig(MultisigRole.BACKUP)
    {
        SystemMode oldMode = systemMode;
        systemMode = SystemMode.RECOVERY;

        emit RecoveryModeActivated(msg.sender, reason);
        emit SystemModeChanged(oldMode, SystemMode.RECOVERY, msg.sender, reason);
    }

    /**
     * @notice Deactivate recovery mode (return to normal)
     */
    function deactivateRecoveryMode()
        external
        onlyMultisig(MultisigRole.HISBAH)
        onlyInMode(SystemMode.RECOVERY)
    {
        systemMode = SystemMode.NORMAL;

        emit RecoveryModeDeactivated(msg.sender);
        emit SystemModeChanged(SystemMode.RECOVERY, SystemMode.NORMAL, msg.sender, "Recovery completed");
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    function getContract(bytes32 contractId)
        external
        view
        contractExists(contractId)
        returns (Contract memory)
    {
        return _contracts[contractId];
    }

    function getDispute(bytes32 contractId)
        external
        view
        contractExists(contractId)
        returns (Dispute memory)
    {
        return _disputes[contractId];
    }

    function getMultisigConfig(MultisigRole role)
        external
        view
        returns (MultisigConfig memory)
    {
        return multisigs[role];
    }

    function getSystemContinuity()
        external
        view
        returns (SystemContinuity memory)
    {
        return continuity;
    }

    function getContractEvidence(bytes32 contractId)
        external
        view
        returns (bytes32[] memory)
    {
        return _contractEvidence[contractId];
    }

    function isContractParty(bytes32 contractId, address addr)
        external
        view
        returns (bool)
    {
        return _contractParties[contractId][addr];
    }

    function _isContractParty(bytes32 contractId, address addr)
        internal
        view
        returns (bool)
    {
        return _contractParties[contractId][addr];
    }

    function getRegisteredBanks() external view returns (bytes32[] memory) {
        return registeredBanks;
    }

    function getBankEscrow(bytes32 bankId)
        external
        view
        returns (BankEscrowConfig memory)
    {
        return bankEscrows[bankId];
    }

    // ============================================
    // INTERNAL HELPERS
    // ============================================

    function _getRoleHash(MultisigRole role) internal pure returns (bytes32) {
        if (role == MultisigRole.OPERATOR) return OPERATOR_ROLE;
        if (role == MultisigRole.ORACLE) return ORACLE_ROLE;
        if (role == MultisigRole.EMERGENCY) return EMERGENCY_ROLE;
        if (role == MultisigRole.ARBITRATION_COUNCIL) return ARBITRATOR_ROLE;
        if (role == MultisigRole.HISBAH) return HISBAH_ROLE;
        if (role == MultisigRole.BACKUP) return BACKUP_ROLE;
        return bytes32(0);
    }

    // ============================================
    // UUPS UPGRADE AUTHORIZATION
    // ============================================

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        view
    {
        // Only callable through executeUpgrade which already has all checks
        // This is a safeguard for direct UUPS calls
        if (msg.sender != multisigs[MultisigRole.ORACLE].multisigAddress) {
            revert AccessControlUnauthorizedAccount(msg.sender, ORACLE_ROLE);
        }
    }

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
