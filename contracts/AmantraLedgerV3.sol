// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AmantraLedgerV3
 * @author AMANTRA Team
 * @notice Production-grade Digital Contract Ledger with Majelis Arbitrase Digital
 * @dev Enhanced version with:
 *      - Party-initiated disputes (buyer/seller can raise directly)
 *      - Gnosis Safe multisig validation (threshold >= 2)
 *      - Separate ARBITRATOR_ROLE for dispute resolution
 *      - Timelock mechanism for dispute resolution (24-48h)
 *      - Enhanced evidence storage with IPFS hash support
 *      - Separation of powers: Operator ≠ Arbitrator ≠ Escrow Bank
 *
 *      ETHICAL PRINCIPLE:
 *      "Uang dikunci oleh teknologi, keputusan dikunci oleh amanah manusia,
 *       dan keadilan tidak boleh berada di satu tangan."
 *
 *      NO FUNDS ARE HELD IN THIS CONTRACT - Money stays in bank escrow.
 */

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

// ============================================
// Gnosis Safe Interface for Multisig Validation
// ============================================

/**
 * @title IGnosisSafe
 * @notice Minimal interface for Gnosis Safe multisig validation
 */
interface IGnosisSafe {
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
    function isOwner(address owner) external view returns (bool);
}

/**
 * @title IAmantraLedgerV3
 * @notice Interface for AmantraLedgerV3 contract with Majelis Arbitrase Digital
 */
interface IAmantraLedgerV3 {
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

    /**
     * @notice Type of dispute raiser
     */
    enum DisputeRaiserType {
        BUYER,      // 0: Raised by buyer
        SELLER,     // 1: Raised by seller
        OPERATOR    // 2: Raised by platform operator
    }

    /**
     * @notice Resolution type for dispute outcome
     */
    enum ResolutionType {
        CONTINUE_SETTLEMENT,  // 0: Proceed with settlement (VERIFIED)
        REFUND_BUYER,         // 1: Full refund to buyer (CANCELLED)
        PAY_SELLER,           // 2: Full payment to seller (VERIFIED then SETTLED)
        CUSTOM_SPLIT          // 3: Custom split (requires additional parameters)
    }

    // ============================================
    // Structs
    // ============================================

    struct FeeInfo {
        uint16 bps;
        uint256 platformFee;
        uint256 sellerAmount;
        uint256 mediatorFee;
        NetworkFeeBearer networkFeeBearer;
        uint256 estimatedNetworkFee;
        bytes32 akadStatementHash;
    }

    /**
     * @notice Enhanced dispute information with evidence and timelock
     */
    struct Dispute {
        bool active;
        bytes32 reasonHash;              // Hash of dispute reason document
        bytes32 evidenceHash;            // IPFS hash of evidence bundle
        bytes32 arbitrationHash;         // Hash of signed arbitration decision
        uint64 raisedAt;
        uint64 resolvedAt;
        address raisedBy;
        DisputeRaiserType raiserType;
        // Timelock fields
        bool resolutionQueued;
        bytes32 queuedResolutionHash;    // Hash of queued resolution
        uint64 resolutionExecutableAt;   // Timestamp when resolution can be executed
        ResolutionType queuedResolutionType;
    }

    /**
     * @notice Arbitration council member info
     */
    struct ArbitrationCouncil {
        address multisigAddress;         // Gnosis Safe address
        uint256 threshold;               // Required signatures
        uint256 memberCount;             // Total members
        bool validated;                  // Has been validated as real multisig
        uint64 lastValidatedAt;
    }

    struct Contract {
        bytes32 id;
        bytes32 contractNumber;
        bytes32 seller;
        bytes32 buyer;
        address sellerAddress;           // NEW: Seller's wallet address
        address buyerAddress;            // NEW: Buyer's wallet address
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
        address sellerAddress,
        address buyerAddress,
        uint256 totalAmount,
        uint64 timestamp
    );

    event FeeDisclosure(
        bytes32 indexed contractId,
        NetworkFeeBearer networkFeeBearer,
        uint256 estimatedNetworkFee,
        bytes32 akadStatementHash,
        uint256 mediatorFee,
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

    event SettlementNetworkFeeRecord(
        bytes32 indexed contractId,
        bytes32 indexed settlementRef,
        NetworkFeeBearer declaredBearer,
        uint256 actualNetworkFee,
        uint256 sellerNetReceived,
        uint256 platformNetReceived,
        bytes32 bankReceiptHash,
        uint64 timestamp
    );

    // Enhanced Dispute Events
    event DisputeRaised(
        bytes32 indexed contractId,
        bytes32 indexed reasonHash,
        bytes32 indexed evidenceHash,
        address raisedBy,
        DisputeRaiserType raiserType,
        uint64 timestamp
    );

    event EvidenceSubmitted(
        bytes32 indexed contractId,
        bytes32 indexed evidenceHash,
        address submittedBy,
        string evidenceType,
        uint64 timestamp
    );

    event ResolutionQueued(
        bytes32 indexed contractId,
        bytes32 indexed resolutionHash,
        ResolutionType resolutionType,
        uint64 executableAt,
        address queuedBy,
        uint64 timestamp
    );

    event ResolutionExecuted(
        bytes32 indexed contractId,
        bytes32 indexed arbitrationHash,
        ResolutionType resolutionType,
        Status finalStatus,
        address executedBy,
        uint64 timestamp
    );

    event ResolutionCancelled(
        bytes32 indexed contractId,
        bytes32 indexed resolutionHash,
        address cancelledBy,
        string reason,
        uint64 timestamp
    );

    event ArbitrationCouncilValidated(
        address indexed multisigAddress,
        uint256 threshold,
        uint256 memberCount,
        uint64 timestamp
    );

    event ArbitrationCouncilChanged(
        address indexed oldMultisig,
        address indexed newMultisig,
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
}

/**
 * @title AmantraLedgerV3
 * @notice Production implementation with Majelis Arbitrase Digital
 */
contract AmantraLedgerV3 is
    Initializable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessControlUpgradeable,
    IAmantraLedgerV3
{
    // ============================================
    // Constants
    // ============================================

    uint16 public constant MAX_FEE_BPS = 500;

    /// @notice Minimum timelock delay for dispute resolution (24 hours)
    uint64 public constant MIN_RESOLUTION_DELAY = 24 hours;

    /// @notice Maximum timelock delay for dispute resolution (48 hours)
    uint64 public constant MAX_RESOLUTION_DELAY = 48 hours;

    /// @notice Minimum multisig threshold required
    uint256 public constant MIN_MULTISIG_THRESHOLD = 2;

    /// @notice Minimum arbitration council members
    uint256 public constant MIN_COUNCIL_MEMBERS = 3;

    // Roles
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    string public constant VERSION = "3.0.0";

    // ============================================
    // State Variables
    // ============================================

    /// @notice Oracle multisig for settlements
    address public oracleMultisig;

    /// @notice Arbitration council multisig (separate from oracle)
    address public arbitrationCouncil;

    /// @notice Arbitration council info
    ArbitrationCouncil public councilInfo;

    /// @notice Current resolution timelock delay
    uint64 public resolutionDelay;

    mapping(bytes32 => Contract) private _contracts;
    mapping(bytes32 => bytes32) private _contractNumberToId;
    mapping(Status => mapping(Status => bool)) private _allowedTransitions;
    mapping(bytes32 => Dispute) private _disputes;
    mapping(bytes32 => bool) private _processedTransactions;

    /// @notice Evidence hashes per contract (array for multiple submissions)
    mapping(bytes32 => bytes32[]) private _contractEvidence;

    /// @notice Registered party addresses per contract
    mapping(bytes32 => mapping(address => bool)) private _contractParties;

    uint256 public totalContracts;
    uint256 public totalSettledValue;
    uint256 public totalDisputesRaised;
    uint256 public totalDisputesResolved;

    uint256[40] private __gap;

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
    error VersionMismatch(bytes32 contractId, uint32 expected, uint32 actual);
    error AkadStatementRequired();
    error InsufficientPlatformFeeForNetworkCost(uint256 platformFee, uint256 estimatedNetworkFee);
    error NetworkFeePolicyViolation(
        NetworkFeeBearer declaredBearer,
        uint256 expectedAmount,
        uint256 actualAmount,
        string reason
    );

    // New errors for V3
    error NotContractParty(bytes32 contractId, address caller);
    error NotValidMultisig(address multisig, string reason);
    error MultisigThresholdTooLow(uint256 threshold, uint256 required);
    error MultisigMembersTooFew(uint256 members, uint256 required);
    error ResolutionNotQueued(bytes32 contractId);
    error ResolutionAlreadyQueued(bytes32 contractId);
    error ResolutionNotExecutable(bytes32 contractId, uint64 executableAt, uint64 currentTime);
    error ResolutionHashMismatch(bytes32 expected, bytes32 provided);
    error InvalidResolutionDelay(uint64 delay);
    error ArbitratorCannotBeOperator(address arbitrator);

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyOracleMultisig() {
        if (msg.sender != oracleMultisig) {
            revert AccessControlUnauthorizedAccount(msg.sender, ORACLE_ROLE);
        }
        _;
    }

    modifier onlyArbitrationCouncil() {
        if (msg.sender != arbitrationCouncil) {
            revert AccessControlUnauthorizedAccount(msg.sender, ARBITRATOR_ROLE);
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

    /**
     * @notice Ensures caller is a party to the contract (buyer, seller, or operator)
     */
    modifier onlyContractPartyOrOperator(bytes32 contractId) {
        if (!_isContractParty(contractId, msg.sender) && !hasRole(OPERATOR_ROLE, msg.sender)) {
            revert NotContractParty(contractId, msg.sender);
        }
        _;
    }

    // ============================================
    // Initializer
    // ============================================

    /**
     * @notice Initializes the contract with separate oracle and arbitration council
     * @param _oracleMultisig Address of the oracle multisig for settlements
     * @param _arbitrationCouncil Address of the arbitration council multisig
     * @param _admin Address of the admin for initial setup
     * @param _resolutionDelay Timelock delay for dispute resolution (24-48h)
     */
    function initialize(
        address _oracleMultisig,
        address _arbitrationCouncil,
        address _admin,
        uint64 _resolutionDelay
    ) external initializer {
        if (_oracleMultisig == address(0)) revert ZeroAddressNotAllowed();
        if (_arbitrationCouncil == address(0)) revert ZeroAddressNotAllowed();
        if (_admin == address(0)) revert ZeroAddressNotAllowed();

        // Validate resolution delay
        if (_resolutionDelay < MIN_RESOLUTION_DELAY || _resolutionDelay > MAX_RESOLUTION_DELAY) {
            revert InvalidResolutionDelay(_resolutionDelay);
        }

        // Ensure separation of powers: oracle != arbitrator
        if (_oracleMultisig == _arbitrationCouncil) {
            revert ArbitratorCannotBeOperator(_arbitrationCouncil);
        }

        __UUPSUpgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __AccessControl_init();

        oracleMultisig = _oracleMultisig;
        arbitrationCouncil = _arbitrationCouncil;
        resolutionDelay = _resolutionDelay;

        // Setup roles - SEPARATION OF POWERS
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ORACLE_ROLE, _oracleMultisig);
        _grantRole(OPERATOR_ROLE, _oracleMultisig);
        _grantRole(EMERGENCY_ROLE, _oracleMultisig);

        // Arbitration council gets ONLY arbitrator role - NOT operator
        _grantRole(ARBITRATOR_ROLE, _arbitrationCouncil);

        // Validate multisigs
        _validateAndStoreMultisig(_oracleMultisig, true);
        _validateAndStoreMultisig(_arbitrationCouncil, false);

        _initializeTransitionMatrix();
    }

    /**
     * @notice Validates that an address is a proper Gnosis Safe multisig
     * @param multisig Address to validate
     * @param isOracle Whether this is the oracle (true) or arbitration council (false)
     */
    function _validateAndStoreMultisig(address multisig, bool isOracle) internal {
        // Try to call Gnosis Safe interface
        try IGnosisSafe(multisig).getThreshold() returns (uint256 threshold) {
            if (threshold < MIN_MULTISIG_THRESHOLD) {
                revert MultisigThresholdTooLow(threshold, MIN_MULTISIG_THRESHOLD);
            }

            address[] memory owners = IGnosisSafe(multisig).getOwners();
            uint256 memberCount = owners.length;

            // For arbitration council, require minimum members
            if (!isOracle && memberCount < MIN_COUNCIL_MEMBERS) {
                revert MultisigMembersTooFew(memberCount, MIN_COUNCIL_MEMBERS);
            }

            // Store arbitration council info
            if (!isOracle) {
                councilInfo = ArbitrationCouncil({
                    multisigAddress: multisig,
                    threshold: threshold,
                    memberCount: memberCount,
                    validated: true,
                    lastValidatedAt: uint64(block.timestamp)
                });

                emit ArbitrationCouncilValidated(
                    multisig,
                    threshold,
                    memberCount,
                    uint64(block.timestamp)
                );
            }
        } catch {
            // If we can't verify it's a multisig, reject it
            revert NotValidMultisig(multisig, "Cannot verify Gnosis Safe interface");
        }
    }

    function _initializeTransitionMatrix() private {
        _allowedTransitions[Status.CREATED][Status.FUNDED] = true;
        _allowedTransitions[Status.CREATED][Status.CANCELLED] = true;
        _allowedTransitions[Status.FUNDED][Status.VERIFIED] = true;
        _allowedTransitions[Status.FUNDED][Status.DISPUTED] = true;
        _allowedTransitions[Status.VERIFIED][Status.SETTLED] = true;
        _allowedTransitions[Status.VERIFIED][Status.DISPUTED] = true; // NEW: Can dispute even after verification
        _allowedTransitions[Status.DISPUTED][Status.VERIFIED] = true;
        _allowedTransitions[Status.DISPUTED][Status.CANCELLED] = true;
    }

    // ============================================
    // Contract Creation with Party Addresses
    // ============================================

    /**
     * @notice Creates a new contract with party addresses for direct dispute access
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
        if (akadStatementHash == bytes32(0)) {
            revert AkadStatementRequired();
        }
        if (networkFeeBearer == NetworkFeeBearer.PLATFORM && platformFee < estimatedNetworkFee) {
            revert InsufficientPlatformFeeForNetworkCost(platformFee, estimatedNetworkFee);
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
            timestamp
        );

        emit FeeDisclosure(
            contractId,
            networkFeeBearer,
            estimatedNetworkFee,
            akadStatementHash,
            mediatorFee,
            timestamp
        );
    }

    // ============================================
    // State Transitions
    // ============================================

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
        onlyOracleMultisig
        whenNotPaused
        nonReentrant
        contractExists(contractId)
        idempotent(transactionRef)
    {
        Contract storage c = _contracts[contractId];

        _validateNetworkFeePolicy(
            c.feeInfo,
            actualNetworkFee,
            sellerNetReceived,
            platformNetReceived
        );

        _transition(contractId, c.status, Status.SETTLED, transactionRef);
        totalSettledValue += c.totalAmount;

        uint64 timestamp = uint64(block.timestamp);

        emit SettlementMarked(
            contractId,
            settlementRef,
            c.feeInfo.sellerAmount,
            c.feeInfo.platformFee,
            c.feeInfo.mediatorFee,
            msg.sender,
            timestamp
        );

        emit SettlementNetworkFeeRecord(
            contractId,
            settlementRef,
            c.feeInfo.networkFeeBearer,
            actualNetworkFee,
            sellerNetReceived,
            platformNetReceived,
            bankReceiptHash,
            timestamp
        );
    }

    function _validateNetworkFeePolicy(
        FeeInfo memory feeInfo,
        uint256 actualNetworkFee,
        uint256 sellerNetReceived,
        uint256 platformNetReceived
    ) internal pure {
        if (feeInfo.networkFeeBearer == NetworkFeeBearer.PLATFORM) {
            if (sellerNetReceived < feeInfo.sellerAmount) {
                revert NetworkFeePolicyViolation(
                    feeInfo.networkFeeBearer,
                    feeInfo.sellerAmount,
                    sellerNetReceived,
                    "Seller must receive full amount when PLATFORM bears network fees"
                );
            }
        } else if (feeInfo.networkFeeBearer == NetworkFeeBearer.SELLER) {
            uint256 expectedSellerNet = feeInfo.sellerAmount > actualNetworkFee
                ? feeInfo.sellerAmount - actualNetworkFee
                : 0;
            uint256 tolerance = feeInfo.sellerAmount / 100;

            if (sellerNetReceived < expectedSellerNet - tolerance) {
                revert NetworkFeePolicyViolation(
                    feeInfo.networkFeeBearer,
                    expectedSellerNet,
                    sellerNetReceived,
                    "Seller net amount exceeds declared network fee deduction"
                );
            }
        }
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
            _checkRole(OPERATOR_ROLE, msg.sender);
        } else if (c.status == Status.DISPUTED) {
            // Only arbitration council can cancel disputed contracts
            if (msg.sender != arbitrationCouncil) {
                revert AccessControlUnauthorizedAccount(msg.sender, ARBITRATOR_ROLE);
            }
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
    // MAJELIS ARBITRASE DIGITAL - Dispute Resolution
    // ============================================

    /**
     * @notice Raises a dispute - callable by buyer, seller, or operator
     * @dev ETHICAL PRINCIPLE: "Parties must have direct access to justice"
     * @param contractId Contract identifier
     * @param reasonHash Hash of dispute reason document
     * @param evidenceHash IPFS hash of evidence bundle
     * @param transactionRef Unique transaction reference
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

        // Must be in FUNDED or VERIFIED status
        if (c.status != Status.FUNDED && c.status != Status.VERIFIED) {
            revert InvalidStateTransition(contractId, c.status, Status.DISPUTED);
        }

        _transition(contractId, c.status, Status.DISPUTED, transactionRef);

        // Determine raiser type
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
            queuedResolutionType: ResolutionType.CONTINUE_SETTLEMENT
        });

        // Store evidence
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
     * @notice Submit additional evidence for a dispute
     * @param contractId Contract identifier
     * @param evidenceHash IPFS hash of additional evidence
     * @param evidenceType Description of evidence type
     */
    function submitEvidence(
        bytes32 contractId,
        bytes32 evidenceHash,
        string calldata evidenceType
    )
        external
        whenNotPaused
        contractExists(contractId)
        onlyContractPartyOrOperator(contractId)
    {
        if (!_disputes[contractId].active) {
            revert DisputeNotActive(contractId);
        }

        _contractEvidence[contractId].push(evidenceHash);

        emit EvidenceSubmitted(
            contractId,
            evidenceHash,
            msg.sender,
            evidenceType,
            uint64(block.timestamp)
        );
    }

    /**
     * @notice Queue a dispute resolution (starts timelock)
     * @dev Only arbitration council can queue resolutions
     * @param contractId Contract identifier
     * @param arbitrationHash Hash of signed arbitration decision PDF
     * @param resolutionType Type of resolution
     */
    function queueResolution(
        bytes32 contractId,
        bytes32 arbitrationHash,
        ResolutionType resolutionType
    )
        external
        onlyArbitrationCouncil
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
     * @param contractId Contract identifier
     * @param arbitrationHash Hash to verify (must match queued)
     * @param transactionRef Transaction reference for idempotency
     */
    function executeResolution(
        bytes32 contractId,
        bytes32 arbitrationHash,
        bytes32 transactionRef
    )
        external
        onlyArbitrationCouncil
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
            revert ResolutionNotExecutable(contractId, d.resolutionExecutableAt, uint64(block.timestamp));
        }
        if (d.queuedResolutionHash != arbitrationHash) {
            revert ResolutionHashMismatch(d.queuedResolutionHash, arbitrationHash);
        }

        ResolutionType resType = d.queuedResolutionType;
        Status finalStatus;

        // Determine final status based on resolution type
        if (resType == ResolutionType.CONTINUE_SETTLEMENT || resType == ResolutionType.PAY_SELLER) {
            finalStatus = Status.VERIFIED;
        } else {
            finalStatus = Status.CANCELLED;
        }

        _transition(contractId, Status.DISPUTED, finalStatus, transactionRef);

        // Update dispute record
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
     * @notice Cancel a queued resolution (before execution)
     * @param contractId Contract identifier
     * @param reason Reason for cancellation
     */
    function cancelQueuedResolution(
        bytes32 contractId,
        string calldata reason
    )
        external
        onlyArbitrationCouncil
        whenNotPaused
        contractExists(contractId)
    {
        Dispute storage d = _disputes[contractId];

        if (!d.resolutionQueued) {
            revert ResolutionNotQueued(contractId);
        }

        bytes32 cancelledHash = d.queuedResolutionHash;

        d.resolutionQueued = false;
        d.queuedResolutionHash = bytes32(0);
        d.resolutionExecutableAt = 0;

        emit ResolutionCancelled(
            contractId,
            cancelledHash,
            msg.sender,
            reason,
            uint64(block.timestamp)
        );
    }

    // ============================================
    // Internal Functions
    // ============================================

    function _isContractParty(bytes32 contractId, address addr) internal view returns (bool) {
        return _contractParties[contractId][addr];
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
    // Governance
    // ============================================

    /**
     * @notice Updates the arbitration council multisig
     * @param newCouncil New council multisig address
     */
    function setArbitrationCouncil(address newCouncil)
        external
        onlyArbitrationCouncil
    {
        if (newCouncil == address(0)) revert ZeroAddressNotAllowed();
        if (newCouncil == oracleMultisig) revert ArbitratorCannotBeOperator(newCouncil);

        // Validate new multisig
        _validateAndStoreMultisig(newCouncil, false);

        address oldCouncil = arbitrationCouncil;
        arbitrationCouncil = newCouncil;

        _revokeRole(ARBITRATOR_ROLE, oldCouncil);
        _grantRole(ARBITRATOR_ROLE, newCouncil);

        emit ArbitrationCouncilChanged(oldCouncil, newCouncil, uint64(block.timestamp));
    }

    /**
     * @notice Updates resolution timelock delay
     * @param newDelay New delay in seconds (24-48h)
     */
    function setResolutionDelay(uint64 newDelay)
        external
        onlyArbitrationCouncil
    {
        if (newDelay < MIN_RESOLUTION_DELAY || newDelay > MAX_RESOLUTION_DELAY) {
            revert InvalidResolutionDelay(newDelay);
        }
        resolutionDelay = newDelay;
    }

    function pause(string calldata reason) external {
        if (!hasRole(EMERGENCY_ROLE, msg.sender) && msg.sender != oracleMultisig) {
            revert AccessControlUnauthorizedAccount(msg.sender, EMERGENCY_ROLE);
        }
        _pause();
        emit EmergencyPaused(msg.sender, reason, uint64(block.timestamp));
    }

    function unpause() external onlyOracleMultisig {
        _unpause();
        emit EmergencyUnpaused(msg.sender, uint64(block.timestamp));
    }

    // ============================================
    // View Functions
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

    function getArbitrationCouncilInfo()
        external
        view
        returns (ArbitrationCouncil memory)
    {
        return councilInfo;
    }

    function getContractStatus(bytes32 contractId)
        external
        view
        contractExists(contractId)
        returns (Status)
    {
        return _contracts[contractId].status;
    }

    function getFeeInfo(bytes32 contractId)
        external
        view
        contractExists(contractId)
        returns (FeeInfo memory)
    {
        return _contracts[contractId].feeInfo;
    }

    function isTransitionAllowed(Status from, Status to) external view returns (bool) {
        return _allowedTransitions[from][to];
    }

    function isTransactionProcessed(bytes32 transactionRef) external view returns (bool) {
        return _processedTransactions[transactionRef];
    }

    function getContractVersion(bytes32 contractId)
        external
        view
        contractExists(contractId)
        returns (uint32)
    {
        return _contracts[contractId].version;
    }

    // ============================================
    // UUPS Upgrade Authorization
    // ============================================

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

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
