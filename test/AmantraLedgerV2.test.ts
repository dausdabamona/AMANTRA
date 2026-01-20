/**
 * AMANTRA - AmantraLedgerV2 Test Suite
 *
 * Comprehensive tests for the production-grade digital contract ledger.
 *
 * Test Categories:
 * 1. Initialization & Deployment
 * 2. Contract Creation
 * 3. State Machine Transitions
 * 4. Fee Immutability
 * 5. Dispute Resolution
 * 6. Access Control & Governance
 * 7. Emergency Circuit Breaker
 * 8. Idempotency Guards
 * 9. Upgrade Mechanism
 * 10. Attack Simulations
 */

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { AmantraLedgerV2 } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AmantraLedgerV2", function () {
  // Contracts
  let ledger: AmantraLedgerV2;

  // Signers
  let deployer: SignerWithAddress;
  let oracleMultisig: SignerWithAddress;
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let seller: SignerWithAddress;
  let buyer: SignerWithAddress;
  let attacker: SignerWithAddress;

  // Constants
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
  const EMERGENCY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EMERGENCY_ROLE"));

  // Test data
  const contractId = ethers.keccak256(ethers.toUtf8Bytes("CONTRACT-001"));
  const contractNumber = ethers.keccak256(ethers.toUtf8Bytes("AMT-2024-000001"));
  const sellerHash = ethers.keccak256(ethers.toUtf8Bytes("SELLER-001"));
  const buyerHash = ethers.keccak256(ethers.toUtf8Bytes("BUYER-001"));
  const totalAmount = ethers.parseUnits("10000000", 0); // 10,000,000 IDR
  const feeBps = 250; // 2.5%
  const platformFee = ethers.parseUnits("250000", 0); // 250,000 IDR
  const sellerAmount = ethers.parseUnits("9750000", 0); // 9,750,000 IDR
  const mediatorFee = ethers.parseUnits("0", 0);

  // Status enum
  enum Status {
    CREATED = 0,
    FUNDED = 1,
    VERIFIED = 2,
    SETTLED = 3,
    DISPUTED = 4,
    CANCELLED = 5,
  }

  // Helper to generate unique transaction refs
  let txCounter = 0;
  const getTransactionRef = () => ethers.keccak256(ethers.toUtf8Bytes(`TX-${++txCounter}`));

  beforeEach(async function () {
    // Get signers
    [deployer, oracleMultisig, admin, operator, seller, buyer, attacker] =
      await ethers.getSigners();

    // Deploy contract
    const AmantraLedgerV2Factory = await ethers.getContractFactory("AmantraLedgerV2");

    ledger = (await upgrades.deployProxy(
      AmantraLedgerV2Factory,
      [oracleMultisig.address, admin.address],
      { kind: "uups", initializer: "initialize" }
    )) as unknown as AmantraLedgerV2;

    await ledger.waitForDeployment();

    // Grant operator role
    await ledger.connect(admin).grantRole(OPERATOR_ROLE, operator.address);

    // Reset counter
    txCounter = 0;
  });

  // ============================================
  // 1. Initialization & Deployment
  // ============================================

  describe("1. Initialization & Deployment", function () {
    it("should initialize with correct values", async function () {
      expect(await ledger.VERSION()).to.equal("2.0.0");
      expect(await ledger.MAX_FEE_BPS()).to.equal(500);
      expect(await ledger.oracleMultisig()).to.equal(oracleMultisig.address);
      expect(await ledger.totalContracts()).to.equal(0);
      expect(await ledger.paused()).to.equal(false);
    });

    it("should not allow re-initialization", async function () {
      await expect(
        ledger.initialize(attacker.address, attacker.address)
      ).to.be.revertedWithCustomError(ledger, "InvalidInitialization");
    });

    it("should reject zero address for multisig", async function () {
      const Factory = await ethers.getContractFactory("AmantraLedgerV2");
      await expect(
        upgrades.deployProxy(Factory, [ethers.ZeroAddress, admin.address], {
          kind: "uups",
          initializer: "initialize",
        })
      ).to.be.revertedWithCustomError(ledger, "ZeroAddressNotAllowed");
    });

    it("should setup correct state transition matrix", async function () {
      // Allowed transitions
      expect(await ledger.isTransitionAllowed(Status.CREATED, Status.FUNDED)).to.be.true;
      expect(await ledger.isTransitionAllowed(Status.CREATED, Status.CANCELLED)).to.be.true;
      expect(await ledger.isTransitionAllowed(Status.FUNDED, Status.VERIFIED)).to.be.true;
      expect(await ledger.isTransitionAllowed(Status.FUNDED, Status.DISPUTED)).to.be.true;
      expect(await ledger.isTransitionAllowed(Status.VERIFIED, Status.SETTLED)).to.be.true;
      expect(await ledger.isTransitionAllowed(Status.DISPUTED, Status.VERIFIED)).to.be.true;
      expect(await ledger.isTransitionAllowed(Status.DISPUTED, Status.CANCELLED)).to.be.true;

      // Disallowed transitions
      expect(await ledger.isTransitionAllowed(Status.CREATED, Status.VERIFIED)).to.be.false;
      expect(await ledger.isTransitionAllowed(Status.CREATED, Status.SETTLED)).to.be.false;
      expect(await ledger.isTransitionAllowed(Status.FUNDED, Status.SETTLED)).to.be.false;
      expect(await ledger.isTransitionAllowed(Status.VERIFIED, Status.FUNDED)).to.be.false;
      expect(await ledger.isTransitionAllowed(Status.SETTLED, Status.CREATED)).to.be.false;
      expect(await ledger.isTransitionAllowed(Status.CANCELLED, Status.CREATED)).to.be.false;
    });
  });

  // ============================================
  // 2. Contract Creation
  // ============================================

  describe("2. Contract Creation", function () {
    it("should create contract with correct values", async function () {
      await ledger.connect(operator).createContract(
        contractId,
        contractNumber,
        sellerHash,
        buyerHash,
        totalAmount,
        feeBps,
        platformFee,
        sellerAmount,
        mediatorFee
      );

      const contract = await ledger.getContract(contractId);
      expect(contract.id).to.equal(contractId);
      expect(contract.contractNumber).to.equal(contractNumber);
      expect(contract.seller).to.equal(sellerHash);
      expect(contract.buyer).to.equal(buyerHash);
      expect(contract.totalAmount).to.equal(totalAmount);
      expect(contract.status).to.equal(Status.CREATED);
      expect(contract.version).to.equal(1);
    });

    it("should emit ContractCreated event", async function () {
      await expect(
        ledger.connect(operator).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          mediatorFee
        )
      )
        .to.emit(ledger, "ContractCreated")
        .withArgs(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          expect.anything() // timestamp
        );
    });

    it("should reject duplicate contract ID", async function () {
      await ledger.connect(operator).createContract(
        contractId,
        contractNumber,
        sellerHash,
        buyerHash,
        totalAmount,
        feeBps,
        platformFee,
        sellerAmount,
        mediatorFee
      );

      const newContractNumber = ethers.keccak256(ethers.toUtf8Bytes("AMT-2024-000002"));

      await expect(
        ledger.connect(operator).createContract(
          contractId, // Same ID
          newContractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          mediatorFee
        )
      ).to.be.revertedWithCustomError(ledger, "ContractAlreadyExists");
    });

    it("should reject fee exceeding maximum", async function () {
      const excessiveFeeBps = 501; // > 500
      const badPlatformFee = ethers.parseUnits("501000", 0);
      const badSellerAmount = ethers.parseUnits("9499000", 0);

      await expect(
        ledger.connect(operator).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          excessiveFeeBps,
          badPlatformFee,
          badSellerAmount,
          mediatorFee
        )
      ).to.be.revertedWithCustomError(ledger, "FeeExceedsMaximum");
    });

    it("should reject invalid fee calculation", async function () {
      const wrongSellerAmount = ethers.parseUnits("9000000", 0); // Doesn't add up

      await expect(
        ledger.connect(operator).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          wrongSellerAmount,
          mediatorFee
        )
      ).to.be.revertedWithCustomError(ledger, "InvalidFeeCalculation");
    });

    it("should reject zero amount", async function () {
      await expect(
        ledger.connect(operator).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          0, // Zero amount
          feeBps,
          0,
          0,
          0
        )
      ).to.be.revertedWithCustomError(ledger, "InvalidAmount");
    });

    it("should reject creation by non-operator", async function () {
      await expect(
        ledger.connect(attacker).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          mediatorFee
        )
      ).to.be.reverted;
    });

    it("should increment totalContracts", async function () {
      expect(await ledger.totalContracts()).to.equal(0);

      await ledger.connect(operator).createContract(
        contractId,
        contractNumber,
        sellerHash,
        buyerHash,
        totalAmount,
        feeBps,
        platformFee,
        sellerAmount,
        mediatorFee
      );

      expect(await ledger.totalContracts()).to.equal(1);
    });
  });

  // ============================================
  // 3. State Machine Transitions
  // ============================================

  describe("3. State Machine Transitions", function () {
    beforeEach(async function () {
      // Create a contract for state transition tests
      await ledger.connect(operator).createContract(
        contractId,
        contractNumber,
        sellerHash,
        buyerHash,
        totalAmount,
        feeBps,
        platformFee,
        sellerAmount,
        mediatorFee
      );
    });

    describe("CREATED -> FUNDED", function () {
      it("should mark as funded", async function () {
        const qrisRef = ethers.keccak256(ethers.toUtf8Bytes("QRIS-001"));
        const escrowRef = ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001"));
        const txRef = getTransactionRef();

        await ledger.connect(operator).markFunded(contractId, qrisRef, escrowRef, txRef);

        const contract = await ledger.getContract(contractId);
        expect(contract.status).to.equal(Status.FUNDED);
        expect(contract.escrowReference).to.equal(escrowRef);
        expect(contract.version).to.equal(2);
      });

      it("should emit StatusTransition and PaymentMarked events", async function () {
        const qrisRef = ethers.keccak256(ethers.toUtf8Bytes("QRIS-001"));
        const escrowRef = ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001"));
        const txRef = getTransactionRef();

        await expect(ledger.connect(operator).markFunded(contractId, qrisRef, escrowRef, txRef))
          .to.emit(ledger, "StatusTransition")
          .withArgs(
            contractId,
            Status.CREATED,
            Status.FUNDED,
            operator.address,
            txRef,
            expect.anything(),
            2
          )
          .and.to.emit(ledger, "PaymentMarked");
      });
    });

    describe("FUNDED -> VERIFIED", function () {
      beforeEach(async function () {
        const qrisRef = ethers.keccak256(ethers.toUtf8Bytes("QRIS-001"));
        const escrowRef = ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001"));
        await ledger.connect(operator).markFunded(contractId, qrisRef, escrowRef, getTransactionRef());
      });

      it("should mark as verified", async function () {
        const verificationHash = ethers.keccak256(ethers.toUtf8Bytes("QC-PASS"));
        const txRef = getTransactionRef();

        await ledger.connect(operator).markVerified(contractId, verificationHash, txRef);

        const contract = await ledger.getContract(contractId);
        expect(contract.status).to.equal(Status.VERIFIED);
      });
    });

    describe("VERIFIED -> SETTLED", function () {
      beforeEach(async function () {
        await ledger.connect(operator).markFunded(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("QRIS-001")),
          ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001")),
          getTransactionRef()
        );
        await ledger.connect(operator).markVerified(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("QC-PASS")),
          getTransactionRef()
        );
      });

      it("should mark as settled by oracle multisig", async function () {
        const settlementRef = ethers.keccak256(ethers.toUtf8Bytes("SETTLE-001"));
        const txRef = getTransactionRef();

        await ledger.connect(oracleMultisig).markSettled(contractId, settlementRef, txRef);

        const contract = await ledger.getContract(contractId);
        expect(contract.status).to.equal(Status.SETTLED);
      });

      it("should reject settlement by non-multisig", async function () {
        const settlementRef = ethers.keccak256(ethers.toUtf8Bytes("SETTLE-001"));
        const txRef = getTransactionRef();

        await expect(
          ledger.connect(operator).markSettled(contractId, settlementRef, txRef)
        ).to.be.reverted;
      });

      it("should update totalSettledValue", async function () {
        const before = await ledger.totalSettledValue();

        await ledger.connect(oracleMultisig).markSettled(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("SETTLE-001")),
          getTransactionRef()
        );

        const after = await ledger.totalSettledValue();
        expect(after - before).to.equal(totalAmount);
      });
    });

    describe("Invalid Transitions", function () {
      it("should reject CREATED -> VERIFIED", async function () {
        const verificationHash = ethers.keccak256(ethers.toUtf8Bytes("QC-PASS"));

        await expect(
          ledger.connect(operator).markVerified(contractId, verificationHash, getTransactionRef())
        ).to.be.revertedWithCustomError(ledger, "InvalidStateTransition");
      });

      it("should reject CREATED -> SETTLED", async function () {
        const settlementRef = ethers.keccak256(ethers.toUtf8Bytes("SETTLE-001"));

        await expect(
          ledger.connect(oracleMultisig).markSettled(contractId, settlementRef, getTransactionRef())
        ).to.be.revertedWithCustomError(ledger, "InvalidStateTransition");
      });

      it("should reject FUNDED -> SETTLED (skip VERIFIED)", async function () {
        await ledger.connect(operator).markFunded(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("QRIS-001")),
          ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001")),
          getTransactionRef()
        );

        await expect(
          ledger.connect(oracleMultisig).markSettled(
            contractId,
            ethers.keccak256(ethers.toUtf8Bytes("SETTLE-001")),
            getTransactionRef()
          )
        ).to.be.revertedWithCustomError(ledger, "InvalidStateTransition");
      });
    });
  });

  // ============================================
  // 4. Fee Immutability
  // ============================================

  describe("4. Fee Immutability", function () {
    it("should store immutable fee structure", async function () {
      await ledger.connect(operator).createContract(
        contractId,
        contractNumber,
        sellerHash,
        buyerHash,
        totalAmount,
        feeBps,
        platformFee,
        sellerAmount,
        mediatorFee
      );

      const feeInfo = await ledger.getFeeInfo(contractId);
      expect(feeInfo.bps).to.equal(feeBps);
      expect(feeInfo.platformFee).to.equal(platformFee);
      expect(feeInfo.sellerAmount).to.equal(sellerAmount);
      expect(feeInfo.mediatorFee).to.equal(mediatorFee);
    });

    it("should not have any fee setter function", async function () {
      // Verify no setter exists by checking the ABI
      const fragment = ledger.interface.getFunction("setFee");
      expect(fragment).to.be.null;
    });

    it("should preserve fee through state transitions", async function () {
      await ledger.connect(operator).createContract(
        contractId,
        contractNumber,
        sellerHash,
        buyerHash,
        totalAmount,
        feeBps,
        platformFee,
        sellerAmount,
        mediatorFee
      );

      const feeBeforeTransition = await ledger.getFeeInfo(contractId);

      // Transition through states
      await ledger.connect(operator).markFunded(
        contractId,
        ethers.keccak256(ethers.toUtf8Bytes("QRIS-001")),
        ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001")),
        getTransactionRef()
      );

      await ledger.connect(operator).markVerified(
        contractId,
        ethers.keccak256(ethers.toUtf8Bytes("QC-PASS")),
        getTransactionRef()
      );

      await ledger.connect(oracleMultisig).markSettled(
        contractId,
        ethers.keccak256(ethers.toUtf8Bytes("SETTLE-001")),
        getTransactionRef()
      );

      const feeAfterSettlement = await ledger.getFeeInfo(contractId);

      // Fee should be unchanged
      expect(feeAfterSettlement.bps).to.equal(feeBeforeTransition.bps);
      expect(feeAfterSettlement.platformFee).to.equal(feeBeforeTransition.platformFee);
      expect(feeAfterSettlement.sellerAmount).to.equal(feeBeforeTransition.sellerAmount);
    });
  });

  // ============================================
  // 5. Dispute Resolution
  // ============================================

  describe("5. Dispute Resolution", function () {
    beforeEach(async function () {
      await ledger.connect(operator).createContract(
        contractId,
        contractNumber,
        sellerHash,
        buyerHash,
        totalAmount,
        feeBps,
        platformFee,
        sellerAmount,
        mediatorFee
      );

      await ledger.connect(operator).markFunded(
        contractId,
        ethers.keccak256(ethers.toUtf8Bytes("QRIS-001")),
        ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001")),
        getTransactionRef()
      );
    });

    it("should raise dispute", async function () {
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("DEFECTIVE_GOODS"));

      await ledger.connect(operator).raiseDispute(contractId, reasonHash, getTransactionRef());

      const contract = await ledger.getContract(contractId);
      expect(contract.status).to.equal(Status.DISPUTED);

      const dispute = await ledger.getDispute(contractId);
      expect(dispute.active).to.be.true;
      expect(dispute.reason).to.equal(reasonHash);
    });

    it("should emit DisputeOpened event", async function () {
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("DEFECTIVE_GOODS"));
      const txRef = getTransactionRef();

      await expect(ledger.connect(operator).raiseDispute(contractId, reasonHash, txRef))
        .to.emit(ledger, "DisputeOpened")
        .withArgs(contractId, reasonHash, operator.address, expect.anything());
    });

    it("should resolve dispute to VERIFIED", async function () {
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("DEFECTIVE_GOODS"));
      await ledger.connect(operator).raiseDispute(contractId, reasonHash, getTransactionRef());

      const arbitrationHash = ethers.keccak256(ethers.toUtf8Bytes("ARBITRATION_DOC_SIGNED"));

      await ledger.connect(oracleMultisig).resolveDispute(
        contractId,
        arbitrationHash,
        Status.VERIFIED,
        getTransactionRef()
      );

      const contract = await ledger.getContract(contractId);
      expect(contract.status).to.equal(Status.VERIFIED);

      const dispute = await ledger.getDispute(contractId);
      expect(dispute.active).to.be.false;
      expect(dispute.arbitrationHash).to.equal(arbitrationHash);
    });

    it("should resolve dispute to CANCELLED", async function () {
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("FRAUD"));
      await ledger.connect(operator).raiseDispute(contractId, reasonHash, getTransactionRef());

      const arbitrationHash = ethers.keccak256(ethers.toUtf8Bytes("REFUND_ORDERED"));

      await ledger.connect(oracleMultisig).resolveDispute(
        contractId,
        arbitrationHash,
        Status.CANCELLED,
        getTransactionRef()
      );

      const contract = await ledger.getContract(contractId);
      expect(contract.status).to.equal(Status.CANCELLED);
    });

    it("should reject dispute resolution by non-multisig", async function () {
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("DEFECTIVE"));
      await ledger.connect(operator).raiseDispute(contractId, reasonHash, getTransactionRef());

      await expect(
        ledger.connect(operator).resolveDispute(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("DECISION")),
          Status.VERIFIED,
          getTransactionRef()
        )
      ).to.be.reverted;
    });

    it("should reject duplicate dispute", async function () {
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("DEFECTIVE"));
      await ledger.connect(operator).raiseDispute(contractId, reasonHash, getTransactionRef());

      await expect(
        ledger.connect(operator).raiseDispute(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("ANOTHER_REASON")),
          getTransactionRef()
        )
      ).to.be.revertedWithCustomError(ledger, "DisputeAlreadyActive");
    });

    it("should reject invalid resolution status", async function () {
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("DEFECTIVE"));
      await ledger.connect(operator).raiseDispute(contractId, reasonHash, getTransactionRef());

      // Cannot resolve to SETTLED directly
      await expect(
        ledger.connect(oracleMultisig).resolveDispute(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("DECISION")),
          Status.SETTLED,
          getTransactionRef()
        )
      ).to.be.revertedWithCustomError(ledger, "InvalidStateTransition");
    });
  });

  // ============================================
  // 6. Access Control & Governance
  // ============================================

  describe("6. Access Control & Governance", function () {
    it("should only allow oracle multisig to change multisig address", async function () {
      const newMultisig = buyer.address;

      await expect(
        ledger.connect(attacker).setOracleMultisig(newMultisig)
      ).to.be.reverted;

      await ledger.connect(oracleMultisig).setOracleMultisig(newMultisig);
      expect(await ledger.oracleMultisig()).to.equal(newMultisig);
    });

    it("should emit OracleMultisigChanged event", async function () {
      const newMultisig = buyer.address;

      await expect(ledger.connect(oracleMultisig).setOracleMultisig(newMultisig))
        .to.emit(ledger, "OracleMultisigChanged")
        .withArgs(oracleMultisig.address, newMultisig, expect.anything());
    });

    it("should transfer roles when changing multisig", async function () {
      const newMultisig = buyer.address;

      await ledger.connect(oracleMultisig).setOracleMultisig(newMultisig);

      // Old multisig should lose roles
      expect(await ledger.hasRole(OPERATOR_ROLE, oracleMultisig.address)).to.be.false;

      // New multisig should have roles
      expect(await ledger.hasRole(OPERATOR_ROLE, newMultisig)).to.be.true;
    });

    it("should reject zero address for new multisig", async function () {
      await expect(
        ledger.connect(oracleMultisig).setOracleMultisig(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(ledger, "ZeroAddressNotAllowed");
    });
  });

  // ============================================
  // 7. Emergency Circuit Breaker
  // ============================================

  describe("7. Emergency Circuit Breaker", function () {
    it("should allow pause by emergency role", async function () {
      await ledger.connect(admin).grantRole(EMERGENCY_ROLE, operator.address);

      await ledger.connect(operator).pause("Security incident detected");
      expect(await ledger.paused()).to.be.true;
    });

    it("should emit EmergencyPaused event", async function () {
      await expect(ledger.connect(oracleMultisig).pause("Test pause"))
        .to.emit(ledger, "EmergencyPaused")
        .withArgs(oracleMultisig.address, "Test pause", expect.anything());
    });

    it("should block all operations when paused", async function () {
      await ledger.connect(oracleMultisig).pause("Maintenance");

      await expect(
        ledger.connect(operator).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          mediatorFee
        )
      ).to.be.revertedWithCustomError(ledger, "EnforcedPause");
    });

    it("should only allow oracle multisig to unpause", async function () {
      await ledger.connect(oracleMultisig).pause("Test");

      await expect(
        ledger.connect(operator).unpause()
      ).to.be.reverted;

      await ledger.connect(oracleMultisig).unpause();
      expect(await ledger.paused()).to.be.false;
    });

    it("should emit EmergencyUnpaused event", async function () {
      await ledger.connect(oracleMultisig).pause("Test");

      await expect(ledger.connect(oracleMultisig).unpause())
        .to.emit(ledger, "EmergencyUnpaused")
        .withArgs(oracleMultisig.address, expect.anything());
    });
  });

  // ============================================
  // 8. Idempotency Guards
  // ============================================

  describe("8. Idempotency Guards", function () {
    beforeEach(async function () {
      await ledger.connect(operator).createContract(
        contractId,
        contractNumber,
        sellerHash,
        buyerHash,
        totalAmount,
        feeBps,
        platformFee,
        sellerAmount,
        mediatorFee
      );
    });

    it("should reject duplicate transaction reference", async function () {
      const txRef = getTransactionRef();
      const qrisRef = ethers.keccak256(ethers.toUtf8Bytes("QRIS-001"));
      const escrowRef = ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001"));

      await ledger.connect(operator).markFunded(contractId, qrisRef, escrowRef, txRef);

      // Create another contract to try the same txRef
      const contractId2 = ethers.keccak256(ethers.toUtf8Bytes("CONTRACT-002"));
      const contractNumber2 = ethers.keccak256(ethers.toUtf8Bytes("AMT-2024-000002"));

      await ledger.connect(operator).createContract(
        contractId2,
        contractNumber2,
        sellerHash,
        buyerHash,
        totalAmount,
        feeBps,
        platformFee,
        sellerAmount,
        mediatorFee
      );

      await expect(
        ledger.connect(operator).markFunded(contractId2, qrisRef, escrowRef, txRef)
      ).to.be.revertedWithCustomError(ledger, "TransactionAlreadyProcessed");
    });

    it("should track processed transactions", async function () {
      const txRef = getTransactionRef();

      expect(await ledger.isTransactionProcessed(txRef)).to.be.false;

      await ledger.connect(operator).markFunded(
        contractId,
        ethers.keccak256(ethers.toUtf8Bytes("QRIS-001")),
        ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001")),
        txRef
      );

      expect(await ledger.isTransactionProcessed(txRef)).to.be.true;
    });
  });

  // ============================================
  // 9. Upgrade Mechanism
  // ============================================

  describe("9. Upgrade Mechanism", function () {
    it("should only allow oracle multisig to upgrade", async function () {
      const AmantraLedgerV2Factory = await ethers.getContractFactory("AmantraLedgerV2");
      const newImplementation = await AmantraLedgerV2Factory.deploy();
      await newImplementation.waitForDeployment();

      await expect(
        ledger.connect(attacker).upgradeToAndCall(await newImplementation.getAddress(), "0x")
      ).to.be.reverted;
    });

    it("should emit ContractUpgraded event on upgrade", async function () {
      const proxyAddress = await ledger.getAddress();

      // Upgrade via upgrades plugin (uses the oracle multisig)
      const AmantraLedgerV2Factory = await ethers.getContractFactory(
        "AmantraLedgerV2",
        oracleMultisig
      );

      // We need to use the oracle multisig for upgrade
      // For this test, we'll deploy a new implementation and call upgradeToAndCall
      const newImpl = await AmantraLedgerV2Factory.deploy();
      await newImpl.waitForDeployment();

      await expect(
        ledger.connect(oracleMultisig).upgradeToAndCall(await newImpl.getAddress(), "0x")
      )
        .to.emit(ledger, "ContractUpgraded")
        .withArgs(await newImpl.getAddress(), oracleMultisig.address, expect.anything());
    });

    it("should preserve state after upgrade", async function () {
      // Create a contract
      await ledger.connect(operator).createContract(
        contractId,
        contractNumber,
        sellerHash,
        buyerHash,
        totalAmount,
        feeBps,
        platformFee,
        sellerAmount,
        mediatorFee
      );

      const contractBefore = await ledger.getContract(contractId);

      // Upgrade
      const AmantraLedgerV2Factory = await ethers.getContractFactory(
        "AmantraLedgerV2",
        oracleMultisig
      );
      const newImpl = await AmantraLedgerV2Factory.deploy();
      await newImpl.waitForDeployment();
      await ledger.connect(oracleMultisig).upgradeToAndCall(await newImpl.getAddress(), "0x");

      // Verify state is preserved
      const contractAfter = await ledger.getContract(contractId);
      expect(contractAfter.id).to.equal(contractBefore.id);
      expect(contractAfter.totalAmount).to.equal(contractBefore.totalAmount);
      expect(contractAfter.status).to.equal(contractBefore.status);
    });
  });

  // ============================================
  // 10. Attack Simulations
  // ============================================

  describe("10. Attack Simulations", function () {
    describe("Double Settlement Attack", function () {
      it("should prevent double settlement via state machine", async function () {
        await ledger.connect(operator).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          mediatorFee
        );

        await ledger.connect(operator).markFunded(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("QRIS-001")),
          ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001")),
          getTransactionRef()
        );

        await ledger.connect(operator).markVerified(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("QC-PASS")),
          getTransactionRef()
        );

        // First settlement
        await ledger.connect(oracleMultisig).markSettled(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("SETTLE-001")),
          getTransactionRef()
        );

        // Second settlement attempt
        await expect(
          ledger.connect(oracleMultisig).markSettled(
            contractId,
            ethers.keccak256(ethers.toUtf8Bytes("SETTLE-002")),
            getTransactionRef()
          )
        ).to.be.revertedWithCustomError(ledger, "InvalidStateTransition");
      });
    });

    describe("Replay Attack", function () {
      it("should prevent replay via idempotency", async function () {
        await ledger.connect(operator).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          mediatorFee
        );

        const txRef = getTransactionRef();

        await ledger.connect(operator).markFunded(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("QRIS-001")),
          ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001")),
          txRef
        );

        // Replay same transaction
        await expect(
          ledger.connect(operator).markFunded(
            contractId,
            ethers.keccak256(ethers.toUtf8Bytes("QRIS-001")),
            ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001")),
            txRef
          )
        ).to.be.revertedWithCustomError(ledger, "TransactionAlreadyProcessed");
      });
    });

    describe("Role Hijack Attack", function () {
      it("should prevent unauthorized role escalation", async function () {
        // Attacker tries to grant themselves operator role
        await expect(
          ledger.connect(attacker).grantRole(OPERATOR_ROLE, attacker.address)
        ).to.be.reverted;

        // Attacker tries to set themselves as multisig
        await expect(
          ledger.connect(attacker).setOracleMultisig(attacker.address)
        ).to.be.reverted;
      });
    });

    describe("State Skip Attack", function () {
      it("should prevent skipping FUNDED state", async function () {
        await ledger.connect(operator).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          mediatorFee
        );

        // Try to skip directly to VERIFIED
        await expect(
          ledger.connect(operator).markVerified(
            contractId,
            ethers.keccak256(ethers.toUtf8Bytes("QC-PASS")),
            getTransactionRef()
          )
        ).to.be.revertedWithCustomError(ledger, "InvalidStateTransition");
      });

      it("should prevent skipping VERIFIED state", async function () {
        await ledger.connect(operator).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          mediatorFee
        );

        await ledger.connect(operator).markFunded(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("QRIS-001")),
          ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001")),
          getTransactionRef()
        );

        // Try to skip directly to SETTLED
        await expect(
          ledger.connect(oracleMultisig).markSettled(
            contractId,
            ethers.keccak256(ethers.toUtf8Bytes("SETTLE-001")),
            getTransactionRef()
          )
        ).to.be.revertedWithCustomError(ledger, "InvalidStateTransition");
      });
    });

    describe("Fee Manipulation Attack", function () {
      it("should prevent fee manipulation after creation", async function () {
        await ledger.connect(operator).createContract(
          contractId,
          contractNumber,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          mediatorFee
        );

        const feeInfo = await ledger.getFeeInfo(contractId);

        // No setter function exists, so we verify the fee is read-only
        // by checking it remains constant after transitions
        await ledger.connect(operator).markFunded(
          contractId,
          ethers.keccak256(ethers.toUtf8Bytes("QRIS-001")),
          ethers.keccak256(ethers.toUtf8Bytes("ESCROW-001")),
          getTransactionRef()
        );

        const feeInfoAfter = await ledger.getFeeInfo(contractId);
        expect(feeInfoAfter.platformFee).to.equal(feeInfo.platformFee);
        expect(feeInfoAfter.sellerAmount).to.equal(feeInfo.sellerAmount);
      });
    });
  });

  // ============================================
  // Batch Operations
  // ============================================

  describe("Batch Operations", function () {
    it("should retrieve multiple contracts", async function () {
      const ids: string[] = [];

      for (let i = 0; i < 5; i++) {
        const id = ethers.keccak256(ethers.toUtf8Bytes(`CONTRACT-${i}`));
        const num = ethers.keccak256(ethers.toUtf8Bytes(`AMT-2024-00000${i}`));
        ids.push(id);

        await ledger.connect(operator).createContract(
          id,
          num,
          sellerHash,
          buyerHash,
          totalAmount,
          feeBps,
          platformFee,
          sellerAmount,
          mediatorFee
        );
      }

      const contracts = await ledger.getContracts(ids);
      expect(contracts.length).to.equal(5);

      for (let i = 0; i < 5; i++) {
        expect(contracts[i].id).to.equal(ids[i]);
      }
    });
  });
});
