// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title AmantraLedgerV6
 * @notice Hybrid Custodial Syariah - Blockchain sebagai Notaris & Hakim Digital
 * @dev Smart contract untuk mencatat hash akad, milestone, persetujuan, dan keputusan
 *      Dana dikelola off-chain di rekening escrow PT, blockchain hanya sebagai pencatat
 */
contract AmantraLedgerV6 is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // ============ ROLES ============
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    bytes32 public constant HISBAH_ROLE = keccak256("HISBAH_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ============ ENUMS ============
    enum AkadStatus {
        DRAFT,              // 0 - Masih draft
        PENDING_PAYMENT,    // 1 - Menunggu pembayaran
        FUNDED,             // 2 - Dana sudah masuk escrow
        IN_PROGRESS,        // 3 - Dalam pengerjaan
        PENDING_RELEASE,    // 4 - Menunggu pencairan
        COMPLETED,          // 5 - Selesai
        DISPUTED,           // 6 - Ada sengketa
        FROZEN,             // 7 - Dibekukan oleh hisbah
        CANCELLED           // 8 - Dibatalkan
    }

    enum MilestoneStatus {
        PENDING,            // 0 - Belum dimulai
        IN_PROGRESS,        // 1 - Dalam pengerjaan
        SUBMITTED,          // 2 - Disubmit penjual
        WITNESS_APPROVED,   // 3 - Disetujui saksi
        BUYER_APPROVED,     // 4 - Disetujui pembeli
        DISPUTED,           // 5 - Disengketakan
        RELEASED,           // 6 - Dana dicairkan
        CANCELLED           // 7 - Dibatalkan
    }

    enum DisputeResolution {
        PENDING,            // 0 - Belum diputuskan
        FAVOR_BUYER,        // 1 - Menang pembeli
        FAVOR_SELLER,       // 2 - Menang penjual
        SPLIT,              // 3 - Dibagi
        WITHDRAWN           // 4 - Dicabut
    }

    // ============ STRUCTS ============

    /**
     * @notice Catatan akad di blockchain
     */
    struct AkadRecord {
        bytes32 akadHash;           // SHA256(akad data)
        bytes32 buyerHash;          // SHA256(buyer identifier)
        bytes32 sellerHash;         // SHA256(seller identifier)
        uint256 amount;             // Nilai dalam wei (untuk referensi)
        AkadStatus status;
        uint256 createdAt;
        uint256 fundedAt;
        uint256 completedAt;
        uint8 milestoneCount;
        bool isFrozen;
    }

    /**
     * @notice Catatan milestone di blockchain
     */
    struct MilestoneRecord {
        bytes32 milestoneHash;      // SHA256(milestone data)
        uint8 sequenceNumber;
        uint16 percentageBps;       // Basis points (10000 = 100%)
        MilestoneStatus status;
        uint256 submittedAt;
        uint256 approvedAt;
        uint256 releasedAt;
        bytes32 witnessApprovalHash;
        bytes32 buyerApprovalHash;
    }

    /**
     * @notice Catatan sengketa di blockchain
     */
    struct DisputeRecord {
        bytes32 disputeHash;        // SHA256(dispute data)
        bytes32 akadId;
        uint8 milestoneIndex;
        DisputeResolution resolution;
        uint256 raisedAt;
        uint256 resolvedAt;
        bytes32 resolutionHash;     // SHA256(resolution details)
    }

    /**
     * @notice Catatan aksi hisbah di blockchain
     */
    struct HisbahAction {
        bytes32 actionHash;         // SHA256(action data)
        bytes32 akadId;
        uint8 actionType;           // 0=freeze, 1=unfreeze, 2=veto
        uint256 performedAt;
        bytes32 reasonHash;
    }

    // ============ STATE ============

    // Akad storage
    mapping(bytes32 => AkadRecord) public akadRecords;
    mapping(bytes32 => MilestoneRecord[]) public milestoneRecords;
    mapping(bytes32 => DisputeRecord) public disputeRecords;

    // Hisbah actions
    HisbahAction[] public hisbahActions;
    mapping(bytes32 => uint256[]) public akadHisbahActions; // akadId => action indices

    // Arbitration votes
    mapping(bytes32 => mapping(address => uint8)) public arbitratorVotes; // disputeId => arbitrator => vote
    mapping(bytes32 => address[3]) public disputeArbitrators;

    // Counters
    uint256 public totalAkadCount;
    uint256 public totalDisputeCount;
    uint256 public totalReleasedValue;

    // ============ EVENTS ============

    event AkadRegistered(
        bytes32 indexed akadId,
        bytes32 akadHash,
        uint256 amount,
        uint256 timestamp
    );

    event AkadStatusChanged(
        bytes32 indexed akadId,
        AkadStatus oldStatus,
        AkadStatus newStatus,
        uint256 timestamp
    );

    event MilestoneAdded(
        bytes32 indexed akadId,
        uint8 sequenceNumber,
        bytes32 milestoneHash,
        uint16 percentageBps
    );

    event MilestoneStatusChanged(
        bytes32 indexed akadId,
        uint8 milestoneIndex,
        MilestoneStatus oldStatus,
        MilestoneStatus newStatus,
        uint256 timestamp
    );

    event WitnessApproved(
        bytes32 indexed akadId,
        uint8 milestoneIndex,
        bytes32 approvalHash,
        uint256 timestamp
    );

    event BuyerApproved(
        bytes32 indexed akadId,
        uint8 milestoneIndex,
        bytes32 approvalHash,
        uint256 timestamp
    );

    event EscrowReleased(
        bytes32 indexed akadId,
        uint8 milestoneIndex,
        uint256 amount,
        bytes32 releaseHash,
        uint256 timestamp
    );

    event DisputeRaised(
        bytes32 indexed disputeId,
        bytes32 indexed akadId,
        bytes32 disputeHash,
        uint256 timestamp
    );

    event DisputeResolved(
        bytes32 indexed disputeId,
        DisputeResolution resolution,
        bytes32 resolutionHash,
        uint256 timestamp
    );

    event ArbitratorVoted(
        bytes32 indexed disputeId,
        address indexed arbitrator,
        uint8 vote,
        uint256 timestamp
    );

    event HisbahFroze(
        bytes32 indexed akadId,
        bytes32 actionHash,
        bytes32 reasonHash,
        uint256 timestamp
    );

    event HisbahUnfroze(
        bytes32 indexed akadId,
        bytes32 actionHash,
        uint256 timestamp
    );

    event HisbahVetoed(
        bytes32 indexed akadId,
        uint8 milestoneIndex,
        bytes32 actionHash,
        uint256 timestamp
    );

    // ============ INITIALIZER ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    // ============ AKAD FUNCTIONS ============

    /**
     * @notice Register hash akad baru di blockchain
     * @param akadId Unique identifier for the akad
     * @param akadHash SHA256 hash of akad data
     * @param buyerHash SHA256 hash of buyer identifier
     * @param sellerHash SHA256 hash of seller identifier
     * @param amount Value in wei (for reference)
     * @param milestoneHashes Array of milestone hashes
     * @param milestonePercentages Array of milestone percentages in bps
     */
    function registerAkadHash(
        bytes32 akadId,
        bytes32 akadHash,
        bytes32 buyerHash,
        bytes32 sellerHash,
        uint256 amount,
        bytes32[] calldata milestoneHashes,
        uint16[] calldata milestonePercentages
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        require(akadRecords[akadId].createdAt == 0, "Akad already exists");
        require(milestoneHashes.length == milestonePercentages.length, "Array length mismatch");
        require(milestoneHashes.length > 0 && milestoneHashes.length <= 10, "Invalid milestone count");

        // Validate total percentage = 100%
        uint256 totalPercentage;
        for (uint256 i = 0; i < milestonePercentages.length; i++) {
            totalPercentage += milestonePercentages[i];
        }
        require(totalPercentage == 10000, "Percentages must total 100%");

        // Create akad record
        akadRecords[akadId] = AkadRecord({
            akadHash: akadHash,
            buyerHash: buyerHash,
            sellerHash: sellerHash,
            amount: amount,
            status: AkadStatus.PENDING_PAYMENT,
            createdAt: block.timestamp,
            fundedAt: 0,
            completedAt: 0,
            milestoneCount: uint8(milestoneHashes.length),
            isFrozen: false
        });

        // Create milestone records
        for (uint256 i = 0; i < milestoneHashes.length; i++) {
            milestoneRecords[akadId].push(MilestoneRecord({
                milestoneHash: milestoneHashes[i],
                sequenceNumber: uint8(i + 1),
                percentageBps: milestonePercentages[i],
                status: MilestoneStatus.PENDING,
                submittedAt: 0,
                approvedAt: 0,
                releasedAt: 0,
                witnessApprovalHash: bytes32(0),
                buyerApprovalHash: bytes32(0)
            }));

            emit MilestoneAdded(akadId, uint8(i + 1), milestoneHashes[i], milestonePercentages[i]);
        }

        totalAkadCount++;
        emit AkadRegistered(akadId, akadHash, amount, block.timestamp);
    }

    /**
     * @notice Update status akad setelah pembayaran dikonfirmasi
     */
    function confirmPayment(bytes32 akadId, bytes32 paymentHash)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
    {
        AkadRecord storage akad = akadRecords[akadId];
        require(akad.createdAt > 0, "Akad not found");
        require(akad.status == AkadStatus.PENDING_PAYMENT, "Invalid status");
        require(!akad.isFrozen, "Akad is frozen");

        AkadStatus oldStatus = akad.status;
        akad.status = AkadStatus.FUNDED;
        akad.fundedAt = block.timestamp;

        // Start first milestone
        if (milestoneRecords[akadId].length > 0) {
            milestoneRecords[akadId][0].status = MilestoneStatus.IN_PROGRESS;
            emit MilestoneStatusChanged(akadId, 0, MilestoneStatus.PENDING, MilestoneStatus.IN_PROGRESS, block.timestamp);
        }

        emit AkadStatusChanged(akadId, oldStatus, AkadStatus.FUNDED, block.timestamp);
    }

    /**
     * @notice Record milestone submission by seller
     */
    function submitMilestone(
        bytes32 akadId,
        uint8 milestoneIndex,
        bytes32 evidenceHash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        AkadRecord storage akad = akadRecords[akadId];
        require(akad.createdAt > 0, "Akad not found");
        require(!akad.isFrozen, "Akad is frozen");
        require(milestoneIndex < milestoneRecords[akadId].length, "Invalid milestone index");

        MilestoneRecord storage milestone = milestoneRecords[akadId][milestoneIndex];
        require(
            milestone.status == MilestoneStatus.IN_PROGRESS,
            "Milestone not in progress"
        );

        MilestoneStatus oldStatus = milestone.status;
        milestone.status = MilestoneStatus.SUBMITTED;
        milestone.submittedAt = block.timestamp;
        milestone.milestoneHash = evidenceHash; // Update with evidence hash

        emit MilestoneStatusChanged(akadId, milestoneIndex, oldStatus, MilestoneStatus.SUBMITTED, block.timestamp);
    }

    /**
     * @notice Record witness approval for milestone
     */
    function approveMilestoneByWitness(
        bytes32 akadId,
        uint8 milestoneIndex,
        bytes32 approvalHash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        AkadRecord storage akad = akadRecords[akadId];
        require(akad.createdAt > 0, "Akad not found");
        require(!akad.isFrozen, "Akad is frozen");
        require(milestoneIndex < milestoneRecords[akadId].length, "Invalid milestone index");

        MilestoneRecord storage milestone = milestoneRecords[akadId][milestoneIndex];
        require(milestone.status == MilestoneStatus.SUBMITTED, "Milestone not submitted");

        MilestoneStatus oldStatus = milestone.status;
        milestone.status = MilestoneStatus.WITNESS_APPROVED;
        milestone.witnessApprovalHash = approvalHash;

        emit WitnessApproved(akadId, milestoneIndex, approvalHash, block.timestamp);
        emit MilestoneStatusChanged(akadId, milestoneIndex, oldStatus, MilestoneStatus.WITNESS_APPROVED, block.timestamp);
    }

    /**
     * @notice Record buyer approval for milestone (triggers release countdown)
     */
    function approveMilestoneByBuyer(
        bytes32 akadId,
        uint8 milestoneIndex,
        bytes32 approvalHash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        AkadRecord storage akad = akadRecords[akadId];
        require(akad.createdAt > 0, "Akad not found");
        require(!akad.isFrozen, "Akad is frozen");
        require(milestoneIndex < milestoneRecords[akadId].length, "Invalid milestone index");

        MilestoneRecord storage milestone = milestoneRecords[akadId][milestoneIndex];
        require(
            milestone.status == MilestoneStatus.WITNESS_APPROVED ||
            milestone.status == MilestoneStatus.SUBMITTED, // Allow direct approval if no witness required
            "Invalid milestone status"
        );

        MilestoneStatus oldStatus = milestone.status;
        milestone.status = MilestoneStatus.BUYER_APPROVED;
        milestone.buyerApprovalHash = approvalHash;
        milestone.approvedAt = block.timestamp;

        emit BuyerApproved(akadId, milestoneIndex, approvalHash, block.timestamp);
        emit MilestoneStatusChanged(akadId, milestoneIndex, oldStatus, MilestoneStatus.BUYER_APPROVED, block.timestamp);
    }

    /**
     * @notice Record escrow release for milestone
     * @dev Called after off-chain fund transfer is confirmed
     */
    function recordEscrowRelease(
        bytes32 akadId,
        uint8 milestoneIndex,
        uint256 amount,
        bytes32 releaseHash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        AkadRecord storage akad = akadRecords[akadId];
        require(akad.createdAt > 0, "Akad not found");
        require(!akad.isFrozen, "Akad is frozen");
        require(milestoneIndex < milestoneRecords[akadId].length, "Invalid milestone index");

        MilestoneRecord storage milestone = milestoneRecords[akadId][milestoneIndex];
        require(milestone.status == MilestoneStatus.BUYER_APPROVED, "Milestone not approved");

        MilestoneStatus oldStatus = milestone.status;
        milestone.status = MilestoneStatus.RELEASED;
        milestone.releasedAt = block.timestamp;

        totalReleasedValue += amount;

        emit EscrowReleased(akadId, milestoneIndex, amount, releaseHash, block.timestamp);
        emit MilestoneStatusChanged(akadId, milestoneIndex, oldStatus, MilestoneStatus.RELEASED, block.timestamp);

        // Check if all milestones are released
        bool allReleased = true;
        for (uint256 i = 0; i < milestoneRecords[akadId].length; i++) {
            if (milestoneRecords[akadId][i].status != MilestoneStatus.RELEASED) {
                allReleased = false;
                // Start next milestone if current was just released
                if (i > 0 &&
                    milestoneRecords[akadId][i-1].status == MilestoneStatus.RELEASED &&
                    milestoneRecords[akadId][i].status == MilestoneStatus.PENDING) {
                    milestoneRecords[akadId][i].status = MilestoneStatus.IN_PROGRESS;
                    emit MilestoneStatusChanged(akadId, uint8(i), MilestoneStatus.PENDING, MilestoneStatus.IN_PROGRESS, block.timestamp);
                }
                break;
            }
        }

        if (allReleased) {
            AkadStatus oldAkadStatus = akad.status;
            akad.status = AkadStatus.COMPLETED;
            akad.completedAt = block.timestamp;
            emit AkadStatusChanged(akadId, oldAkadStatus, AkadStatus.COMPLETED, block.timestamp);
        }
    }

    // ============ DISPUTE FUNCTIONS ============

    /**
     * @notice Record dispute raised
     */
    function raiseDispute(
        bytes32 disputeId,
        bytes32 akadId,
        uint8 milestoneIndex,
        bytes32 disputeHash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        AkadRecord storage akad = akadRecords[akadId];
        require(akad.createdAt > 0, "Akad not found");
        require(disputeRecords[disputeId].raisedAt == 0, "Dispute already exists");

        // Update akad status
        AkadStatus oldStatus = akad.status;
        akad.status = AkadStatus.DISPUTED;

        // Update milestone status
        if (milestoneIndex < milestoneRecords[akadId].length) {
            MilestoneStatus oldMilestoneStatus = milestoneRecords[akadId][milestoneIndex].status;
            milestoneRecords[akadId][milestoneIndex].status = MilestoneStatus.DISPUTED;
            emit MilestoneStatusChanged(akadId, milestoneIndex, oldMilestoneStatus, MilestoneStatus.DISPUTED, block.timestamp);
        }

        // Create dispute record
        disputeRecords[disputeId] = DisputeRecord({
            disputeHash: disputeHash,
            akadId: akadId,
            milestoneIndex: milestoneIndex,
            resolution: DisputeResolution.PENDING,
            raisedAt: block.timestamp,
            resolvedAt: 0,
            resolutionHash: bytes32(0)
        });

        totalDisputeCount++;
        emit DisputeRaised(disputeId, akadId, disputeHash, block.timestamp);
        emit AkadStatusChanged(akadId, oldStatus, AkadStatus.DISPUTED, block.timestamp);
    }

    /**
     * @notice Assign arbitrators to dispute
     */
    function assignArbitrators(
        bytes32 disputeId,
        address[3] calldata arbitrators
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        require(disputeRecords[disputeId].raisedAt > 0, "Dispute not found");
        require(disputeRecords[disputeId].resolution == DisputeResolution.PENDING, "Dispute already resolved");

        // Verify all are arbitrators
        for (uint256 i = 0; i < 3; i++) {
            require(hasRole(ARBITRATOR_ROLE, arbitrators[i]), "Not an arbitrator");
        }

        disputeArbitrators[disputeId] = arbitrators;
    }

    /**
     * @notice Record arbitrator vote
     */
    function voteOnDispute(
        bytes32 disputeId,
        uint8 vote // 1=favor_buyer, 2=favor_seller, 3=split
    ) external onlyRole(ARBITRATOR_ROLE) whenNotPaused {
        require(disputeRecords[disputeId].raisedAt > 0, "Dispute not found");
        require(disputeRecords[disputeId].resolution == DisputeResolution.PENDING, "Dispute already resolved");
        require(vote >= 1 && vote <= 3, "Invalid vote");

        // Verify caller is assigned arbitrator
        bool isAssigned = false;
        for (uint256 i = 0; i < 3; i++) {
            if (disputeArbitrators[disputeId][i] == msg.sender) {
                isAssigned = true;
                break;
            }
        }
        require(isAssigned, "Not assigned to this dispute");
        require(arbitratorVotes[disputeId][msg.sender] == 0, "Already voted");

        arbitratorVotes[disputeId][msg.sender] = vote;
        emit ArbitratorVoted(disputeId, msg.sender, vote, block.timestamp);
    }

    /**
     * @notice Finalize dispute with majority decision
     */
    function resolveDispute(
        bytes32 disputeId,
        DisputeResolution resolution,
        bytes32 resolutionHash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        DisputeRecord storage dispute = disputeRecords[disputeId];
        require(dispute.raisedAt > 0, "Dispute not found");
        require(dispute.resolution == DisputeResolution.PENDING, "Already resolved");

        dispute.resolution = resolution;
        dispute.resolvedAt = block.timestamp;
        dispute.resolutionHash = resolutionHash;

        // Update akad status
        AkadRecord storage akad = akadRecords[dispute.akadId];
        AkadStatus oldStatus = akad.status;

        if (resolution == DisputeResolution.FAVOR_BUYER || resolution == DisputeResolution.SPLIT) {
            // Milestone remains disputed, needs resolution
            akad.status = AkadStatus.IN_PROGRESS;
        } else if (resolution == DisputeResolution.FAVOR_SELLER) {
            akad.status = AkadStatus.IN_PROGRESS;
            // Re-approve milestone
            if (dispute.milestoneIndex < milestoneRecords[dispute.akadId].length) {
                milestoneRecords[dispute.akadId][dispute.milestoneIndex].status = MilestoneStatus.BUYER_APPROVED;
            }
        }

        emit DisputeResolved(disputeId, resolution, resolutionHash, block.timestamp);
        emit AkadStatusChanged(dispute.akadId, oldStatus, akad.status, block.timestamp);
    }

    // ============ HISBAH FUNCTIONS ============

    /**
     * @notice Freeze an akad (Hisbah action)
     */
    function freezeByHisbah(
        bytes32 akadId,
        bytes32 reasonHash
    ) external onlyRole(HISBAH_ROLE) whenNotPaused {
        AkadRecord storage akad = akadRecords[akadId];
        require(akad.createdAt > 0, "Akad not found");
        require(!akad.isFrozen, "Already frozen");

        akad.isFrozen = true;
        AkadStatus oldStatus = akad.status;
        akad.status = AkadStatus.FROZEN;

        bytes32 actionHash = keccak256(abi.encodePacked(akadId, reasonHash, block.timestamp));

        HisbahAction memory action = HisbahAction({
            actionHash: actionHash,
            akadId: akadId,
            actionType: 0, // freeze
            performedAt: block.timestamp,
            reasonHash: reasonHash
        });

        hisbahActions.push(action);
        akadHisbahActions[akadId].push(hisbahActions.length - 1);

        emit HisbahFroze(akadId, actionHash, reasonHash, block.timestamp);
        emit AkadStatusChanged(akadId, oldStatus, AkadStatus.FROZEN, block.timestamp);
    }

    /**
     * @notice Unfreeze an akad (Hisbah action)
     */
    function unfreezeByHisbah(bytes32 akadId) external onlyRole(HISBAH_ROLE) whenNotPaused {
        AkadRecord storage akad = akadRecords[akadId];
        require(akad.createdAt > 0, "Akad not found");
        require(akad.isFrozen, "Not frozen");

        akad.isFrozen = false;
        AkadStatus oldStatus = akad.status;
        akad.status = AkadStatus.IN_PROGRESS; // Return to previous state

        bytes32 actionHash = keccak256(abi.encodePacked(akadId, block.timestamp));

        HisbahAction memory action = HisbahAction({
            actionHash: actionHash,
            akadId: akadId,
            actionType: 1, // unfreeze
            performedAt: block.timestamp,
            reasonHash: bytes32(0)
        });

        hisbahActions.push(action);
        akadHisbahActions[akadId].push(hisbahActions.length - 1);

        emit HisbahUnfroze(akadId, actionHash, block.timestamp);
        emit AkadStatusChanged(akadId, oldStatus, akad.status, block.timestamp);
    }

    /**
     * @notice Veto a milestone release (Hisbah action)
     */
    function vetoReleaseByHisbah(
        bytes32 akadId,
        uint8 milestoneIndex,
        bytes32 reasonHash
    ) external onlyRole(HISBAH_ROLE) whenNotPaused {
        AkadRecord storage akad = akadRecords[akadId];
        require(akad.createdAt > 0, "Akad not found");
        require(milestoneIndex < milestoneRecords[akadId].length, "Invalid milestone");

        MilestoneRecord storage milestone = milestoneRecords[akadId][milestoneIndex];
        require(milestone.status == MilestoneStatus.BUYER_APPROVED, "Cannot veto");

        MilestoneStatus oldStatus = milestone.status;
        milestone.status = MilestoneStatus.DISPUTED;

        bytes32 actionHash = keccak256(abi.encodePacked(akadId, milestoneIndex, reasonHash, block.timestamp));

        HisbahAction memory action = HisbahAction({
            actionHash: actionHash,
            akadId: akadId,
            actionType: 2, // veto
            performedAt: block.timestamp,
            reasonHash: reasonHash
        });

        hisbahActions.push(action);
        akadHisbahActions[akadId].push(hisbahActions.length - 1);

        emit HisbahVetoed(akadId, milestoneIndex, actionHash, block.timestamp);
        emit MilestoneStatusChanged(akadId, milestoneIndex, oldStatus, MilestoneStatus.DISPUTED, block.timestamp);
    }

    // ============ VIEW FUNCTIONS ============

    function getAkad(bytes32 akadId) external view returns (AkadRecord memory) {
        return akadRecords[akadId];
    }

    function getMilestones(bytes32 akadId) external view returns (MilestoneRecord[] memory) {
        return milestoneRecords[akadId];
    }

    function getDispute(bytes32 disputeId) external view returns (DisputeRecord memory) {
        return disputeRecords[disputeId];
    }

    function getArbitratorVote(bytes32 disputeId, address arbitrator) external view returns (uint8) {
        return arbitratorVotes[disputeId][arbitrator];
    }

    function getHisbahActionsForAkad(bytes32 akadId) external view returns (uint256[] memory) {
        return akadHisbahActions[akadId];
    }

    function getHisbahAction(uint256 index) external view returns (HisbahAction memory) {
        return hisbahActions[index];
    }

    // ============ ADMIN FUNCTIONS ============

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
