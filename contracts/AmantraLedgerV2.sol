// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AmantraLedgerV2
 * @author AMANTRA Team
 * @notice Production-grade Digital Contract Ledger for Escrow-Backed Financial Settlement
 * @dev This contract serves as a Notary + State Machine + Audit Ledger.
 *      NO FUNDS ARE HELD IN THIS CONTRACT - Money stays in bank escrow.
 *
 *      Key Features:
 *      - UUPS Upgradeable pattern for future improvements
 *      - Multisig governance (Gnosis Safe compatible)
 *      - Strict state machine with mathematical transition guards
 *      - Immutable fee structure per contract (Akad-safe)
 *      - Comprehensive dispute resolution system
 *      - Emergency circuit breaker (pause/unpause)
 *      - Audit-grade event emissions for regulatory compliance
 *
 *      This contract is designed for:
 *      - National-grade digital escrow notary
 *      - Regulatory audit compliance
 *      - Central clearing system equivalent rigor
 */

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @title IAmantraLedgerV2
 * @notice Interface for AmantraLedgerV2 contract
 */
interface IAmantraLedgerV2 {
    // ============================================
    // Enums
    // ============================================

    /**
     * @notice Contract lifecycle states
     * @dev State transitions are strictly enforced via allowedTransitions mapping
     */
    enum Status {
        CREATED,    // 0: Contract created, awaiting payment
        FUNDED,     // 1: Payment received via QRIS, funds in bank escrow
        VERIFIED,   // 2: Goods/services verified by QC
        SETTLED,    // 3: Settlement complete, funds distributed
        DISPUTED,   // 4: Under dispute resolution
        CANCELLED   // 5: Contract cancelled, funds refunded
    }

    // ============================================
    // Structs
    // ============================================

    /**
     * @notice Immutable fee information set at contract creation
     * @dev Fee structure follows Islamic finance (Akad) principles - cannot be modified
     * @param bps Fee in basis points (1 bps = 0.01%), max 500 bps (5%)
     * @param platformFee Absolute platform fee amount in smallest currency unit
     * @param sellerAmount Net amount seller will receive after fees
     * @param mediatorFee Optional mediator fee amount
     */
    struct FeeInfo {
        uint16 bps;
        uint256 platformFee;
        uint256 sellerAmount;
        uint256 mediatorFee;
    }

    /**
     * @notice Dispute information for contracts under arbitration
     * @param active Whether dispute is currently active
     * @param reason Hash of the dispute reason/evidence document
     * @param arbitrationHash Hash of signed arbitration decision PDF
     * @param raisedAt Timestamp when dispute was raised
     * @param resolvedAt Timestamp when dispute was resolved (0 if pending)
     * @param raisedBy Address that raised the dispute
     */
    struct Dispute {
        bool active;
        bytes32 reason;
        bytes32 arbitrationHash;
        uint64 raisedAt;
        uint64 resolvedAt;
        address raisedBy;
    }

    /**
     * @notice Core contract data structure
     * @param id Unique contract identifier (UUID hash)
     * @param contractNumber Human-readable contract number
     * @param seller Seller's identifier (address or hash)
     * @param buyer Buyer's identifier (address or hash)
     * @param totalAmount Total transaction amount in smallest currency unit
     * @param status Current contract status
     * @param feeInfo Immutable fee structure
     * @param escrowReference External bank escrow account reference
     * @param createdAt Contract creation timestamp
     * @param updatedAt Last status change timestamp
     * @param version Optimistic locking version number
     */
    struct Contract {
        bytes32 id;
        bytes32 contractNumber;
        bytes32 seller;
        bytes32 buyer;
        uint256 totalAmount;
        Status status;
        FeeInfo feeInfo;
        bytes32 escrowReference;
        uint64 createdAt;
        uint64 updatedAt;
        uint32 version;
    }

    // ============================================
    // Events
    // ============================================

    event ContractCreated(
        bytes32 indexed contractId,
        bytes32 indexed contractNumber,
        bytes32 indexed seller,
        bytes32 buyer,
        uint256 totalAmount,
        uint16 feeBps,
        uint256 platformFee,
        uint256 sellerAmount,
        uint64 timestamp
    );

    event StatusTransition(
        bytes32 indexed contractId,
        Status indexed oldStatus,
        Status indexed newStatus,
        address triggeredBy,
        bytes32 transactionRef,
        uint64 timestamp,
        uint32 newVersion
    );

    event PaymentMarked(
        bytes32 indexed contractId,
        bytes32 indexed qrisReference,
        uint256 amount,
        bytes32 escrowReference,
        address markedBy,
        uint64 timestamp
    );

    event VerificationMarked(
        bytes32 indexed contractId,
        bytes32 indexed verificationHash,
        address verifiedBy,
        uint64 timestamp
    );

    event SettlementMarked(
        bytes32 indexed contractId,
        bytes32 indexed settlementRef,
        uint256 sellerAmount,
        uint256 platformFee,
        uint256 mediatorFee,
        address settledBy,
        uint64 timestamp
    );

    event DisputeOpened(
        bytes32 indexed contractId,
        bytes32 indexed reasonHash,
        address indexed raisedBy,
        uint64 timestamp
    );

    event DisputeResolved(
        bytes32 indexed contractId,
        bytes32 indexed arbitrationHash,
        Status finalStatus,
        address resolvedBy,
        uint64 timestamp
    );

    event ContractCancelled(
        bytes32 indexed contractId,
        bytes32 indexed reasonHash,
        address cancelledBy,
        uint64 timestamp
    );

    event EmergencyPaused(address indexed by, string reason, uint64 timestamp);
    event EmergencyUnpaused(address indexed by, uint64 timestamp);
    event ContractUpgraded(address indexed newImplementation, address indexed by, uint64 timestamp);
    event OracleMultisigChanged(address indexed oldMultisig, address indexed newMultisig, uint64 timestamp);
}

/**
 * @title AmantraLedgerV2
 * @notice Production-grade implementation of the AMANTRA digital contract ledger
 */
contract AmantraLedgerV2 is
    Initializable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessControlUpgradeable,
    IAmantraLedgerV2
{
    // ============================================
    // Constants
    // ============================================

    /// @notice Maximum allowed fee in basis points (5% = 500 bps)
    uint16 public constant MAX_FEE_BPS = 500;

    /// @notice Role for oracle multisig operations
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @notice Role for operator (can mark funded, verified)
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Role for auditor (read-only elevated access)
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    /// @notice Role for emergency actions
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    /// @notice Contract version for upgrade tracking
    string public constant VERSION = "2.0.0";

    // ============================================
    // State Variables
    // ============================================

    /// @notice Oracle multisig address (Gnosis Safe compatible)
    address public oracleMultisig;

    /// @notice Mapping of contract ID to Contract data
    mapping(bytes32 => Contract) private _contracts;

    /// @notice Mapping of contract number to contract ID (for lookup)
    mapping(bytes32 => bytes32) private _contractNumberToId;

    /// @notice State transition matrix: from => to => allowed
    mapping(Status => mapping(Status => bool)) private _allowedTransitions;

    /// @notice Dispute information per contract
    mapping(bytes32 => Dispute) private _disputes;

    /// @notice Processed transaction references for idempotency
    mapping(bytes32 => bool) private _processedTransactions;

    /// @notice Total contracts created
    uint256 public totalContracts;

    /// @notice Total settled value (for statistics)
    uint256 public totalSettledValue;

    /// @notice Storage gap for future upgrades
    uint256[44] private __gap;

    // ============================================
    // Errors
    // ============================================

    /// @notice Contract with given ID already exists
    error ContractAlreadyExists(bytes32 contractId);

    /// @notice Contract not found
    error ContractNotFound(bytes32 contractId);

    /// @notice Invalid state transition
    error InvalidStateTransition(bytes32 contractId, Status from, Status to);

    /// @notice Transaction already processed (idempotency guard)
    error TransactionAlreadyProcessed(bytes32 transactionRef);

    /// @notice Fee exceeds maximum allowed
    error FeeExceedsMaximum(uint16 provided, uint16 maximum);

    /// @notice Invalid fee calculation
    error InvalidFeeCalculation(uint256 total, uint256 platformFee, uint256 sellerAmount);

    /// @notice Dispute not active
    error DisputeNotActive(bytes32 contractId);

    /// @notice Dispute already active
    error DisputeAlreadyActive(bytes32 contractId);

    /// @notice Invalid amount
    error InvalidAmount(uint256 amount);

    /// @notice Zero address not allowed
    error ZeroAddressNotAllowed();

    /// @notice Invalid contract number
    error InvalidContractNumber(bytes32 contractNumber);

    /// @notice Version mismatch for optimistic locking
    error VersionMismatch(bytes32 contractId, uint32 expected, uint32 actual);

    // ============================================
    // Modifiers
    // ============================================

    /**
     * @notice Ensures caller is the oracle multisig
     */
    modifier onlyOracleMultisig() {
        if (msg.sender != oracleMultisig) {
            revert AccessControlUnauthorizedAccount(msg.sender, ORACLE_ROLE);
        }
        _;
    }

    /**
     * @notice Ensures contract exists
     */
    modifier contractExists(bytes32 contractId) {
        if (_contracts[contractId].createdAt == 0) {
            revert ContractNotFound(contractId);
        }
        _;
    }

    /**
     * @notice Ensures transaction hasn't been processed (idempotency)
     */
    modifier idempotent(bytes32 transactionRef) {
        if (_processedTransactions[transactionRef]) {
            revert TransactionAlreadyProcessed(transactionRef);
        }
        _processedTransactions[transactionRef] = true;
        _;
    }

    // ============================================
    // Initializer
    // ============================================

    /**
     * @notice Initializes the contract (replaces constructor for upgradeable pattern)
     * @param _oracleMultisig Address of the oracle multisig (Gnosis Safe)
     * @param _admin Address of the admin for initial setup
     */
    function initialize(
        address _oracleMultisig,
        address _admin
    ) external initializer {
        if (_oracleMultisig == address(0)) revert ZeroAddressNotAllowed();
        if (_admin == address(0)) revert ZeroAddressNotAllowed();

        __UUPSUpgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __AccessControl_init();

        oracleMultisig = _oracleMultisig;

        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ORACLE_ROLE, _oracleMultisig);
        _grantRole(OPERATOR_ROLE, _oracleMultisig);
        _grantRole(EMERGENCY_ROLE, _oracleMultisig);

        // Initialize state transition matrix
        _initializeTransitionMatrix();
    }

    /**
     * @notice Initializes the allowed state transitions
     * @dev Called once during initialize, defines the complete state machine
     *
     * Allowed transitions:
     * - CREATED  -> FUNDED    (payment received)
     * - CREATED  -> CANCELLED (buyer/seller cancels before funding)
     * - FUNDED   -> VERIFIED  (goods/services verified)
     * - FUNDED   -> DISPUTED  (dispute raised)
     * - VERIFIED -> SETTLED   (settlement complete)
     * - DISPUTED -> VERIFIED  (dispute resolved in favor of continuing)
     * - DISPUTED -> CANCELLED (dispute resolved with cancellation/refund)
     */
    function _initializeTransitionMatrix() private {
        // From CREATED
        _allowedTransitions[Status.CREATED][Status.FUNDED] = true;
        _allowedTransitions[Status.CREATED][Status.CANCELLED] = true;

        // From FUNDED
        _allowedTransitions[Status.FUNDED][Status.VERIFIED] = true;
        _allowedTransitions[Status.FUNDED][Status.DISPUTED] = true;

        // From VERIFIED
        _allowedTransitions[Status.VERIFIED][Status.SETTLED] = true;

        // From DISPUTED
        _allowedTransitions[Status.DISPUTED][Status.VERIFIED] = true;
        _allowedTransitions[Status.DISPUTED][Status.CANCELLED] = true;
    }

    // ============================================
    // Core Contract Management
    // ============================================

    /**
     * @notice Creates a new contract record in the ledger
     * @dev Fee structure is immutable after creation (Akad-safe)
     * @param contractId Unique contract identifier (UUID hash)
     * @param contractNumber Human-readable contract number
     * @param seller Seller identifier hash
     * @param buyer Buyer identifier hash
     * @param totalAmount Total transaction amount
     * @param feeBps Fee in basis points (max 500)
     * @param platformFee Absolute platform fee
     * @param sellerAmount Net amount for seller
     * @param mediatorFee Optional mediator fee
     *
     * Requirements:
     * - Contract ID must not exist
     * - Fee must not exceed MAX_FEE_BPS
     * - platformFee + sellerAmount + mediatorFee must equal totalAmount
     * - Caller must have OPERATOR_ROLE
     * - Contract must not be paused
     */
    function createContract(
        bytes32 contractId,
        bytes32 contractNumber,
        bytes32 seller,
        bytes32 buyer,
        uint256 totalAmount,
        uint16 feeBps,
        uint256 platformFee,
        uint256 sellerAmount,
        uint256 mediatorFee
    )
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
    {
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

        // Create contract with immutable fee structure
        uint64 timestamp = uint64(block.timestamp);

        _contracts[contractId] = Contract({
            id: contractId,
            contractNumber: contractNumber,
            seller: seller,
            buyer: buyer,
            totalAmount: totalAmount,
            status: Status.CREATED,
            feeInfo: FeeInfo({
                bps: feeBps,
                platformFee: platformFee,
                sellerAmount: sellerAmount,
                mediatorFee: mediatorFee
            }),
            escrowReference: bytes32(0),
            createdAt: timestamp,
            updatedAt: timestamp,
            version: 1
        });

        _contractNumberToId[contractNumber] = contractId;
        totalContracts++;

        emit ContractCreated(
            contractId,
            contractNumber,
            seller,
            buyer,
            totalAmount,
            feeBps,
            platformFee,
            sellerAmount,
            timestamp
        );
    }

    // ============================================
    // State Transition Functions
    // ============================================

    /**
     * @notice Marks a contract as funded after QRIS payment confirmation
     * @param contractId Contract identifier
     * @param qrisReference QRIS payment reference for audit trail
     * @param escrowReference Bank escrow account reference
     * @param transactionRef Unique transaction reference for idempotency
     *
     * Requirements:
     * - Contract must exist and be in CREATED status
     * - Transaction must not have been processed before
     * - Caller must have OPERATOR_ROLE
     */
    function markFunded(
        bytes32 contractId,
        bytes32 qrisReference,
        bytes32 escrowReference,
        bytes32 transactionRef
    )
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];

        _transition(contractId, c.status, Status.FUNDED, transactionRef);

        c.escrowReference = escrowReference;

        emit PaymentMarked(
            contractId,
            qrisReference,
            c.totalAmount,
            escrowReference,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    /**
     * @notice Marks a contract as verified after quality check
     * @param contractId Contract identifier
     * @param verificationHash Hash of verification evidence/document
     * @param transactionRef Unique transaction reference for idempotency
     *
     * Requirements:
     * - Contract must exist and be in FUNDED or DISPUTED status
     * - Transaction must not have been processed before
     * - Caller must have OPERATOR_ROLE
     */
    function markVerified(
        bytes32 contractId,
        bytes32 verificationHash,
        bytes32 transactionRef
    )
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];

        _transition(contractId, c.status, Status.VERIFIED, transactionRef);

        // Clear dispute if transitioning from DISPUTED
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

    /**
     * @notice Marks a contract as settled after fund distribution
     * @param contractId Contract identifier
     * @param settlementRef Bank settlement reference
     * @param transactionRef Unique transaction reference for idempotency
     *
     * Requirements:
     * - Contract must exist and be in VERIFIED status
     * - Transaction must not have been processed before
     * - Caller must be oracleMultisig (settlement requires multisig authority)
     */
    function markSettled(
        bytes32 contractId,
        bytes32 settlementRef,
        bytes32 transactionRef
    )
        external
        onlyOracleMultisig
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];

        _transition(contractId, c.status, Status.SETTLED, transactionRef);

        totalSettledValue += c.totalAmount;

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

    /**
     * @notice Cancels a contract (before funding or after dispute resolution)
     * @param contractId Contract identifier
     * @param reasonHash Hash of cancellation reason
     * @param transactionRef Unique transaction reference for idempotency
     *
     * Requirements:
     * - Contract must exist and be in CREATED or DISPUTED status
     * - Transaction must not have been processed before
     * - Caller must have OPERATOR_ROLE (for CREATED) or be oracleMultisig (for DISPUTED)
     */
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

        // CREATED -> CANCELLED can be done by OPERATOR
        // DISPUTED -> CANCELLED requires oracle multisig
        if (c.status == Status.CREATED) {
            _checkRole(OPERATOR_ROLE, msg.sender);
        } else if (c.status == Status.DISPUTED) {
            if (msg.sender != oracleMultisig) {
                revert AccessControlUnauthorizedAccount(msg.sender, ORACLE_ROLE);
            }
            // Clear dispute
            _disputes[contractId].active = false;
            _disputes[contractId].resolvedAt = uint64(block.timestamp);
        } else {
            revert InvalidStateTransition(contractId, c.status, Status.CANCELLED);
        }

        _transition(contractId, c.status, Status.CANCELLED, transactionRef);

        emit ContractCancelled(
            contractId,
            reasonHash,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    // ============================================
    // Dispute Resolution
    // ============================================

    /**
     * @notice Raises a dispute on a funded contract
     * @param contractId Contract identifier
     * @param reasonHash Hash of dispute reason/evidence
     * @param transactionRef Unique transaction reference for idempotency
     *
     * Requirements:
     * - Contract must exist and be in FUNDED status
     * - No active dispute on this contract
     * - Caller must have OPERATOR_ROLE
     */
    function raiseDispute(
        bytes32 contractId,
        bytes32 reasonHash,
        bytes32 transactionRef
    )
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];

        if (_disputes[contractId].active) {
            revert DisputeAlreadyActive(contractId);
        }

        _transition(contractId, c.status, Status.DISPUTED, transactionRef);

        _disputes[contractId] = Dispute({
            active: true,
            reason: reasonHash,
            arbitrationHash: bytes32(0),
            raisedAt: uint64(block.timestamp),
            resolvedAt: 0,
            raisedBy: msg.sender
        });

        emit DisputeOpened(
            contractId,
            reasonHash,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    /**
     * @notice Resolves a dispute with arbitration decision
     * @param contractId Contract identifier
     * @param arbitrationHash Hash of signed arbitration decision PDF
     * @param finalStatus Final status after resolution (VERIFIED or CANCELLED)
     * @param transactionRef Unique transaction reference for idempotency
     *
     * Requirements:
     * - Contract must exist and be in DISPUTED status
     * - Dispute must be active
     * - finalStatus must be VERIFIED or CANCELLED
     * - Caller must be oracleMultisig (dispute resolution requires multisig)
     */
    function resolveDispute(
        bytes32 contractId,
        bytes32 arbitrationHash,
        Status finalStatus,
        bytes32 transactionRef
    )
        external
        onlyOracleMultisig
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];

        if (!_disputes[contractId].active) {
            revert DisputeNotActive(contractId);
        }

        // Validate final status is allowed from DISPUTED
        if (finalStatus != Status.VERIFIED && finalStatus != Status.CANCELLED) {
            revert InvalidStateTransition(contractId, Status.DISPUTED, finalStatus);
        }

        _transition(contractId, c.status, finalStatus, transactionRef);

        // Update dispute record
        _disputes[contractId].active = false;
        _disputes[contractId].arbitrationHash = arbitrationHash;
        _disputes[contractId].resolvedAt = uint64(block.timestamp);

        emit DisputeResolved(
            contractId,
            arbitrationHash,
            finalStatus,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    // ============================================
    // Internal State Machine
    // ============================================

    /**
     * @notice Internal function to execute state transition with guards
     * @dev This is the core state machine enforcement mechanism
     * @param contractId Contract identifier
     * @param from Current status
     * @param to Target status
     * @param transactionRef Transaction reference for audit
     */
    function _transition(
        bytes32 contractId,
        Status from,
        Status to,
        bytes32 transactionRef
    ) internal {
        // Validate transition is allowed
        if (!_allowedTransitions[from][to]) {
            revert InvalidStateTransition(contractId, from, to);
        }

        Contract storage c = _contracts[contractId];

        // Update contract
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
    // Emergency Circuit Breaker
    // ============================================

    /**
     * @notice Pauses all contract operations (emergency use)
     * @param reason Reason for pausing (for audit trail)
     *
     * Requirements:
     * - Caller must have EMERGENCY_ROLE or be oracleMultisig
     */
    function pause(string calldata reason)
        external
    {
        if (!hasRole(EMERGENCY_ROLE, msg.sender) && msg.sender != oracleMultisig) {
            revert AccessControlUnauthorizedAccount(msg.sender, EMERGENCY_ROLE);
        }

        _pause();

        emit EmergencyPaused(msg.sender, reason, uint64(block.timestamp));
    }

    /**
     * @notice Unpauses contract operations
     *
     * Requirements:
     * - Caller must be oracleMultisig (unpause requires higher authority)
     */
    function unpause()
        external
        onlyOracleMultisig
    {
        _unpause();

        emit EmergencyUnpaused(msg.sender, uint64(block.timestamp));
    }

    // ============================================
    // Governance
    // ============================================

    /**
     * @notice Updates the oracle multisig address
     * @param newMultisig New multisig address
     *
     * Requirements:
     * - Caller must be current oracleMultisig
     * - New address must not be zero
     */
    function setOracleMultisig(address newMultisig)
        external
        onlyOracleMultisig
    {
        if (newMultisig == address(0)) revert ZeroAddressNotAllowed();

        address oldMultisig = oracleMultisig;
        oracleMultisig = newMultisig;

        // Transfer roles
        _revokeRole(ORACLE_ROLE, oldMultisig);
        _revokeRole(OPERATOR_ROLE, oldMultisig);
        _revokeRole(EMERGENCY_ROLE, oldMultisig);

        _grantRole(ORACLE_ROLE, newMultisig);
        _grantRole(OPERATOR_ROLE, newMultisig);
        _grantRole(EMERGENCY_ROLE, newMultisig);

        emit OracleMultisigChanged(oldMultisig, newMultisig, uint64(block.timestamp));
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Gets contract details by ID
     * @param contractId Contract identifier
     * @return Contract struct with all details
     */
    function getContract(bytes32 contractId)
        external
        view
        returns (Contract memory)
    {
        if (_contracts[contractId].createdAt == 0) {
            revert ContractNotFound(contractId);
        }
        return _contracts[contractId];
    }

    /**
     * @notice Gets contract ID by contract number
     * @param contractNumber Human-readable contract number
     * @return contractId Contract identifier
     */
    function getContractIdByNumber(bytes32 contractNumber)
        external
        view
        returns (bytes32)
    {
        bytes32 contractId = _contractNumberToId[contractNumber];
        if (contractId == bytes32(0)) {
            revert ContractNotFound(contractNumber);
        }
        return contractId;
    }

    /**
     * @notice Gets contract status
     * @param contractId Contract identifier
     * @return Current status
     */
    function getContractStatus(bytes32 contractId)
        external
        view
        contractExists(contractId)
        returns (Status)
    {
        return _contracts[contractId].status;
    }

    /**
     * @notice Gets immutable fee information
     * @param contractId Contract identifier
     * @return FeeInfo struct with fee details
     */
    function getFeeInfo(bytes32 contractId)
        external
        view
        contractExists(contractId)
        returns (FeeInfo memory)
    {
        return _contracts[contractId].feeInfo;
    }

    /**
     * @notice Gets dispute information
     * @param contractId Contract identifier
     * @return Dispute struct with dispute details
     */
    function getDispute(bytes32 contractId)
        external
        view
        contractExists(contractId)
        returns (Dispute memory)
    {
        return _disputes[contractId];
    }

    /**
     * @notice Checks if a state transition is allowed
     * @param from Current status
     * @param to Target status
     * @return true if transition is allowed
     */
    function isTransitionAllowed(Status from, Status to)
        external
        view
        returns (bool)
    {
        return _allowedTransitions[from][to];
    }

    /**
     * @notice Checks if a transaction has been processed
     * @param transactionRef Transaction reference
     * @return true if already processed
     */
    function isTransactionProcessed(bytes32 transactionRef)
        external
        view
        returns (bool)
    {
        return _processedTransactions[transactionRef];
    }

    /**
     * @notice Gets contract version (for optimistic locking)
     * @param contractId Contract identifier
     * @return Current version number
     */
    function getContractVersion(bytes32 contractId)
        external
        view
        contractExists(contractId)
        returns (uint32)
    {
        return _contracts[contractId].version;
    }

    // ============================================
    // Batch View Functions (for reconciliation)
    // ============================================

    /**
     * @notice Gets multiple contracts by IDs (for batch reconciliation)
     * @param contractIds Array of contract identifiers
     * @return Array of Contract structs
     */
    function getContracts(bytes32[] calldata contractIds)
        external
        view
        returns (Contract[] memory)
    {
        Contract[] memory contracts = new Contract[](contractIds.length);
        for (uint256 i = 0; i < contractIds.length; i++) {
            if (_contracts[contractIds[i]].createdAt != 0) {
                contracts[i] = _contracts[contractIds[i]];
            }
        }
        return contracts;
    }

    // ============================================
    // UUPS Upgrade Authorization
    // ============================================

    /**
     * @notice Authorizes contract upgrade
     * @dev Only oracleMultisig can authorize upgrades
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOracleMultisig
    {
        emit ContractUpgraded(
            newImplementation,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    /**
     * @notice Returns the current implementation address
     * @return Implementation address
     */
    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
