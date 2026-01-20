// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/**
 * @title AMANTRA Smart Contract Ledger
 * @notice Digital notary untuk kontrak perdagangan
 * @dev Smart contract ini HANYA menyimpan:
 *      - Kontrak digital (hash & metadata)
 *      - Status state machine
 *      - Fee structure yang disepakati
 *
 *      Dana TIDAK disimpan di sini - escrow ada di bank!
 */

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract AmantraContract is AccessControl, ReentrancyGuard, Pausable {
    // ============================================
    // Roles
    // ============================================

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    // ============================================
    // Enums
    // ============================================

    enum ContractStatus {
        CREATED,    // 0 - Kontrak baru, menunggu pembayaran
        FUNDED,     // 1 - Dana diterima di escrow bank
        VERIFIED,   // 2 - Barang diterima & lulus QC
        SETTLED,    // 3 - Dana dicairkan (terminal)
        DISPUTED,   // 4 - Dalam sengketa
        CANCELLED   // 5 - Dibatalkan (terminal)
    }

    // ============================================
    // Structs
    // ============================================

    struct FeeStructure {
        uint16 platformFeeBps;      // Basis points (100 = 1%)
        uint16 mediatorFeeBps;      // Basis points untuk mediator
        uint256 platformFixedFee;   // Fee tetap (dalam wei)
        uint256 minimumPlatformFee; // Minimum fee
        uint256 maximumPlatformFee; // Maximum fee (cap)
    }

    struct ContractData {
        bytes32 contractId;         // UUID dari backend
        string contractNumber;      // Nomor kontrak readable
        address seller;             // Wallet seller
        address buyer;              // Wallet buyer
        address mediator;           // Wallet mediator (optional)
        uint256 totalAmount;        // Total dalam satuan terkecil
        bytes32 termsHash;          // Hash dari terms lengkap (off-chain)
        FeeStructure feeStructure;
        ContractStatus status;
        uint256 createdAt;
        uint256 fundedAt;
        uint256 verifiedAt;
        uint256 settledAt;
        uint256 disputedAt;
        uint256 cancelledAt;
    }

    struct StateTransition {
        ContractStatus fromStatus;
        ContractStatus toStatus;
        address initiatedBy;
        string reason;
        bytes32 evidenceHash;
        uint256 timestamp;
    }

    // ============================================
    // State Variables
    // ============================================

    // Contract storage
    mapping(bytes32 => ContractData) public contracts;
    mapping(bytes32 => StateTransition[]) public stateHistory;
    mapping(bytes32 => bool) public contractExists;

    // Counters
    uint256 public totalContracts;
    uint256 public totalSettled;
    uint256 public totalDisputed;

    // Idempotency tracking
    mapping(bytes32 => bool) public processedTransactions;

    // ============================================
    // Events
    // ============================================

    event ContractCreated(
        bytes32 indexed contractId,
        string contractNumber,
        address indexed seller,
        address indexed buyer,
        uint256 totalAmount,
        bytes32 termsHash
    );

    event ContractFunded(
        bytes32 indexed contractId,
        uint256 amount,
        string bankReference
    );

    event ContractVerified(
        bytes32 indexed contractId,
        address verifiedBy,
        bytes32 evidenceHash
    );

    event ContractSettled(
        bytes32 indexed contractId,
        uint256 sellerAmount,
        uint256 platformFee,
        uint256 mediatorFee,
        string settlementReference
    );

    event ContractDisputed(
        bytes32 indexed contractId,
        address disputedBy,
        string reason
    );

    event ContractCancelled(
        bytes32 indexed contractId,
        string reason,
        bool refundRequired
    );

    event StateChanged(
        bytes32 indexed contractId,
        ContractStatus fromStatus,
        ContractStatus toStatus,
        address initiatedBy
    );

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyExistingContract(bytes32 _contractId) {
        require(contractExists[_contractId], "Contract does not exist");
        _;
    }

    modifier idempotent(bytes32 _transactionId) {
        require(!processedTransactions[_transactionId], "Transaction already processed");
        processedTransactions[_transactionId] = true;
        _;
    }

    modifier validTransition(bytes32 _contractId, ContractStatus _targetStatus) {
        ContractStatus currentStatus = contracts[_contractId].status;
        require(
            _canTransition(currentStatus, _targetStatus),
            "Invalid state transition"
        );
        _;
    }

    // ============================================
    // Constructor
    // ============================================

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    // ============================================
    // Contract Lifecycle Functions
    // ============================================

    /**
     * @notice Mendaftarkan kontrak baru ke blockchain
     * @dev Hanya Oracle yang bisa memanggil
     */
    function createContract(
        bytes32 _contractId,
        string calldata _contractNumber,
        address _seller,
        address _buyer,
        address _mediator,
        uint256 _totalAmount,
        bytes32 _termsHash,
        FeeStructure calldata _feeStructure,
        bytes32 _transactionId
    )
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        idempotent(_transactionId)
    {
        require(!contractExists[_contractId], "Contract already exists");
        require(_seller != address(0), "Invalid seller address");
        require(_buyer != address(0), "Invalid buyer address");
        require(_seller != _buyer, "Seller and buyer must be different");
        require(_totalAmount > 0, "Amount must be positive");
        require(_feeStructure.platformFeeBps <= 10000, "Invalid fee percentage");

        contracts[_contractId] = ContractData({
            contractId: _contractId,
            contractNumber: _contractNumber,
            seller: _seller,
            buyer: _buyer,
            mediator: _mediator,
            totalAmount: _totalAmount,
            termsHash: _termsHash,
            feeStructure: _feeStructure,
            status: ContractStatus.CREATED,
            createdAt: block.timestamp,
            fundedAt: 0,
            verifiedAt: 0,
            settledAt: 0,
            disputedAt: 0,
            cancelledAt: 0
        });

        contractExists[_contractId] = true;
        totalContracts++;

        _recordStateTransition(
            _contractId,
            ContractStatus.CREATED,
            ContractStatus.CREATED,
            msg.sender,
            "Contract created",
            _termsHash
        );

        emit ContractCreated(
            _contractId,
            _contractNumber,
            _seller,
            _buyer,
            _totalAmount,
            _termsHash
        );
    }

    /**
     * @notice Mencatat bahwa dana telah masuk ke escrow bank
     * @dev Dipanggil Oracle setelah QRIS payment confirmed
     */
    function recordFunding(
        bytes32 _contractId,
        uint256 _amount,
        string calldata _bankReference,
        bytes32 _transactionId
    )
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        onlyExistingContract(_contractId)
        validTransition(_contractId, ContractStatus.FUNDED)
        idempotent(_transactionId)
    {
        ContractData storage c = contracts[_contractId];
        require(_amount == c.totalAmount, "Amount mismatch");

        ContractStatus oldStatus = c.status;
        c.status = ContractStatus.FUNDED;
        c.fundedAt = block.timestamp;

        _recordStateTransition(
            _contractId,
            oldStatus,
            ContractStatus.FUNDED,
            msg.sender,
            _bankReference,
            bytes32(0)
        );

        emit ContractFunded(_contractId, _amount, _bankReference);
        emit StateChanged(_contractId, oldStatus, ContractStatus.FUNDED, msg.sender);
    }

    /**
     * @notice Mencatat verifikasi barang (QC passed)
     */
    function recordVerification(
        bytes32 _contractId,
        bytes32 _evidenceHash,
        bytes32 _transactionId
    )
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        onlyExistingContract(_contractId)
        validTransition(_contractId, ContractStatus.VERIFIED)
        idempotent(_transactionId)
    {
        ContractData storage c = contracts[_contractId];

        ContractStatus oldStatus = c.status;
        c.status = ContractStatus.VERIFIED;
        c.verifiedAt = block.timestamp;

        _recordStateTransition(
            _contractId,
            oldStatus,
            ContractStatus.VERIFIED,
            msg.sender,
            "Verification passed",
            _evidenceHash
        );

        emit ContractVerified(_contractId, msg.sender, _evidenceHash);
        emit StateChanged(_contractId, oldStatus, ContractStatus.VERIFIED, msg.sender);
    }

    /**
     * @notice Mencatat settlement (pencairan dana)
     */
    function recordSettlement(
        bytes32 _contractId,
        uint256 _sellerAmount,
        uint256 _platformFee,
        uint256 _mediatorFee,
        string calldata _settlementReference,
        bytes32 _transactionId
    )
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        onlyExistingContract(_contractId)
        validTransition(_contractId, ContractStatus.SETTLED)
        idempotent(_transactionId)
    {
        ContractData storage c = contracts[_contractId];

        // Validasi jumlah
        require(
            _sellerAmount + _platformFee + _mediatorFee == c.totalAmount,
            "Amount breakdown mismatch"
        );

        ContractStatus oldStatus = c.status;
        c.status = ContractStatus.SETTLED;
        c.settledAt = block.timestamp;
        totalSettled++;

        _recordStateTransition(
            _contractId,
            oldStatus,
            ContractStatus.SETTLED,
            msg.sender,
            _settlementReference,
            bytes32(0)
        );

        emit ContractSettled(
            _contractId,
            _sellerAmount,
            _platformFee,
            _mediatorFee,
            _settlementReference
        );
        emit StateChanged(_contractId, oldStatus, ContractStatus.SETTLED, msg.sender);
    }

    /**
     * @notice Mencatat sengketa
     */
    function recordDispute(
        bytes32 _contractId,
        address _disputedBy,
        string calldata _reason,
        bytes32 _transactionId
    )
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        onlyExistingContract(_contractId)
        validTransition(_contractId, ContractStatus.DISPUTED)
        idempotent(_transactionId)
    {
        ContractData storage c = contracts[_contractId];

        // Validasi pihak yang bersengketa
        require(
            _disputedBy == c.seller || _disputedBy == c.buyer,
            "Only seller or buyer can dispute"
        );

        ContractStatus oldStatus = c.status;
        c.status = ContractStatus.DISPUTED;
        c.disputedAt = block.timestamp;
        totalDisputed++;

        _recordStateTransition(
            _contractId,
            oldStatus,
            ContractStatus.DISPUTED,
            _disputedBy,
            _reason,
            bytes32(0)
        );

        emit ContractDisputed(_contractId, _disputedBy, _reason);
        emit StateChanged(_contractId, oldStatus, ContractStatus.DISPUTED, msg.sender);
    }

    /**
     * @notice Mencatat pembatalan kontrak
     */
    function recordCancellation(
        bytes32 _contractId,
        string calldata _reason,
        bool _refundRequired,
        bytes32 _transactionId
    )
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        onlyExistingContract(_contractId)
        validTransition(_contractId, ContractStatus.CANCELLED)
        idempotent(_transactionId)
    {
        ContractData storage c = contracts[_contractId];

        ContractStatus oldStatus = c.status;
        c.status = ContractStatus.CANCELLED;
        c.cancelledAt = block.timestamp;

        _recordStateTransition(
            _contractId,
            oldStatus,
            ContractStatus.CANCELLED,
            msg.sender,
            _reason,
            bytes32(0)
        );

        emit ContractCancelled(_contractId, _reason, _refundRequired);
        emit StateChanged(_contractId, oldStatus, ContractStatus.CANCELLED, msg.sender);
    }

    // ============================================
    // View Functions
    // ============================================

    function getContract(bytes32 _contractId)
        external
        view
        returns (ContractData memory)
    {
        require(contractExists[_contractId], "Contract does not exist");
        return contracts[_contractId];
    }

    function getContractStatus(bytes32 _contractId)
        external
        view
        returns (ContractStatus)
    {
        require(contractExists[_contractId], "Contract does not exist");
        return contracts[_contractId].status;
    }

    function getStateHistory(bytes32 _contractId)
        external
        view
        returns (StateTransition[] memory)
    {
        return stateHistory[_contractId];
    }

    function getFeeStructure(bytes32 _contractId)
        external
        view
        returns (FeeStructure memory)
    {
        require(contractExists[_contractId], "Contract does not exist");
        return contracts[_contractId].feeStructure;
    }

    function isTransactionProcessed(bytes32 _transactionId)
        external
        view
        returns (bool)
    {
        return processedTransactions[_transactionId];
    }

    // ============================================
    // Admin Functions
    // ============================================

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function grantOracleRole(address _oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(ORACLE_ROLE, _oracle);
    }

    function revokeOracleRole(address _oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(ORACLE_ROLE, _oracle);
    }

    // ============================================
    // Internal Functions
    // ============================================

    function _canTransition(ContractStatus _from, ContractStatus _to)
        internal
        pure
        returns (bool)
    {
        // CREATED -> FUNDED, CANCELLED
        if (_from == ContractStatus.CREATED) {
            return _to == ContractStatus.FUNDED || _to == ContractStatus.CANCELLED;
        }

        // FUNDED -> VERIFIED, DISPUTED, CANCELLED
        if (_from == ContractStatus.FUNDED) {
            return _to == ContractStatus.VERIFIED ||
                   _to == ContractStatus.DISPUTED ||
                   _to == ContractStatus.CANCELLED;
        }

        // VERIFIED -> SETTLED, DISPUTED
        if (_from == ContractStatus.VERIFIED) {
            return _to == ContractStatus.SETTLED || _to == ContractStatus.DISPUTED;
        }

        // SETTLED -> (terminal, no transitions)
        if (_from == ContractStatus.SETTLED) {
            return false;
        }

        // DISPUTED -> SETTLED, CANCELLED
        if (_from == ContractStatus.DISPUTED) {
            return _to == ContractStatus.SETTLED || _to == ContractStatus.CANCELLED;
        }

        // CANCELLED -> (terminal, no transitions)
        if (_from == ContractStatus.CANCELLED) {
            return false;
        }

        return false;
    }

    function _recordStateTransition(
        bytes32 _contractId,
        ContractStatus _fromStatus,
        ContractStatus _toStatus,
        address _initiatedBy,
        string memory _reason,
        bytes32 _evidenceHash
    ) internal {
        stateHistory[_contractId].push(StateTransition({
            fromStatus: _fromStatus,
            toStatus: _toStatus,
            initiatedBy: _initiatedBy,
            reason: _reason,
            evidenceHash: _evidenceHash,
            timestamp: block.timestamp
        }));
    }
}
