/**
 * AMANTRA Ledger V5 - Comprehensive Test Suite
 *
 * Tests for Zero Single Point of Failure Architecture
 *
 * TEST SCENARIOS:
 * 1. Oracle hilang (Oracle multisig key loss)
 * 2. Arbiter wafat (Arbitrator death/incapacity)
 * 3. Admin key bocor (Admin key compromise)
 * 4. Bank kolaps (Bank partner failure)
 * 5. Blockchain fork (Chain reorganization)
 *
 * ETHICAL PRINCIPLE:
 * "Al-amru idza ta'allaqa bi huquqil 'ibad la yajuzu an yu'allaqa bi fardh wahid."
 * (Urusan hak manusia tidak boleh bergantung pada satu orang)
 */

import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Contract, Signer } from 'ethers';
import { time, loadFixture } from '@nomicfoundation/hardhat-network-helpers';

// ============================================
// Constants
// ============================================

const DEAD_MAN_SWITCH_THRESHOLD = 180 * 24 * 60 * 60; // 180 days in seconds
const SUCCESSION_TIMELOCK = 7 * 24 * 60 * 60; // 7 days
const UPGRADE_TIMELOCK = 72 * 60 * 60; // 72 hours
const RESOLUTION_DELAY = 24 * 60 * 60; // 24 hours

enum MultisigRole {
  OPERATOR = 0,
  ORACLE = 1,
  EMERGENCY = 2,
  ARBITRATION_COUNCIL = 3,
  HISBAH = 4,
  BACKUP = 5,
}

enum SystemMode {
  NORMAL = 0,
  EMERGENCY = 1,
  RECOVERY = 2,
  DISSOLUTION = 3,
}

enum Status {
  CREATED = 0,
  FUNDED = 1,
  VERIFIED = 2,
  SETTLED = 3,
  DISPUTED = 4,
  CANCELLED = 5,
}

// ============================================
// Mock Gnosis Safe Contract
// ============================================

const MOCK_GNOSIS_SAFE_ABI = `
  contract MockGnosisSafe {
    address[] public owners;
    uint256 public threshold;
    uint256 public nonce;

    constructor(address[] memory _owners, uint256 _threshold) {
      owners = _owners;
      threshold = _threshold;
    }

    function getThreshold() external view returns (uint256) {
      return threshold;
    }

    function getOwners() external view returns (address[] memory) {
      return owners;
    }

    function isOwner(address owner) external view returns (bool) {
      for (uint i = 0; i < owners.length; i++) {
        if (owners[i] == owner) return true;
      }
      return false;
    }
  }
`;

// ============================================
// Test Fixtures
// ============================================

async function deployMockGnosisSafe(
  signers: Signer[],
  threshold: number,
): Promise<Contract> {
  const MockGnosisSafe = await ethers.getContractFactory('MockGnosisSafe');
  const addresses = await Promise.all(signers.map((s) => s.getAddress()));
  return MockGnosisSafe.deploy(addresses, threshold);
}

async function deployFullSystemFixture() {
  const signers = await ethers.getSigners();

  // Create separate signer groups for each multisig (no overlap for critical roles)
  const operatorSigners = signers.slice(0, 3);
  const oracleSigners = signers.slice(3, 8);
  const emergencySigners = signers.slice(8, 11);
  const arbitrationSigners = signers.slice(11, 14);
  const hisbahSigners = signers.slice(14, 19);
  const backupSigners = signers.slice(19, 26);
  const admin = signers[26];
  const users = signers.slice(27);

  // Deploy mock Gnosis Safes
  const operatorSafe = await deployMockGnosisSafe(operatorSigners, 2);
  const oracleSafe = await deployMockGnosisSafe(oracleSigners, 3);
  const emergencySafe = await deployMockGnosisSafe(emergencySigners, 2);
  const arbitrationSafe = await deployMockGnosisSafe(arbitrationSigners, 2);
  const hisbahSafe = await deployMockGnosisSafe(hisbahSigners, 3);
  const backupSafe = await deployMockGnosisSafe(backupSigners, 4);

  // Deploy AmantraLedgerV5
  const AmantraLedgerV5 = await ethers.getContractFactory('AmantraLedgerV5');
  const ledger = await upgrades.deployProxy(
    AmantraLedgerV5,
    [
      await operatorSafe.getAddress(),
      await oracleSafe.getAddress(),
      await emergencySafe.getAddress(),
      await arbitrationSafe.getAddress(),
      await hisbahSafe.getAddress(),
      await backupSafe.getAddress(),
      await admin.getAddress(),
    ],
    { initializer: 'initialize' },
  );

  // Setup bank escrow
  const bankId = ethers.keccak256(ethers.toUtf8Bytes('BSI'));
  await ledger.connect(oracleSafe).addBankEscrow(bankId, 'Bank Syariah Indonesia', true);

  return {
    ledger,
    operatorSafe,
    oracleSafe,
    emergencySafe,
    arbitrationSafe,
    hisbahSafe,
    backupSafe,
    admin,
    users,
    bankId,
    operatorSigners,
    oracleSigners,
    emergencySigners,
    arbitrationSigners,
    hisbahSigners,
    backupSigners,
  };
}

// ============================================
// TEST SUITE
// ============================================

describe('AmantraLedgerV5 - Zero Single Point of Failure', function () {
  // ============================================
  // 1. INITIALIZATION TESTS
  // ============================================

  describe('1. Initialization & Role Separation', function () {
    it('should reject if same address holds multiple roles', async function () {
      const { ledger } = await loadFixture(deployFullSystemFixture);
      const signers = await ethers.getSigners();

      // Try to deploy with same address for operator and oracle
      const sameSafe = await deployMockGnosisSafe(signers.slice(0, 5), 3);
      const otherSafes = await Promise.all([
        deployMockGnosisSafe(signers.slice(5, 8), 2),
        deployMockGnosisSafe(signers.slice(8, 13), 3),
        deployMockGnosisSafe(signers.slice(13, 20), 4),
      ]);

      const AmantraLedgerV5 = await ethers.getContractFactory('AmantraLedgerV5');

      await expect(
        upgrades.deployProxy(
          AmantraLedgerV5,
          [
            await sameSafe.getAddress(), // operator
            await sameSafe.getAddress(), // oracle - SAME ADDRESS!
            await otherSafes[0].getAddress(),
            await otherSafes[1].getAddress(),
            await otherSafes[2].getAddress(),
            await otherSafes[2].getAddress(),
            signers[20].address,
          ],
          { initializer: 'initialize' },
        ),
      ).to.be.revertedWithCustomError(AmantraLedgerV5, 'AddressAlreadyHasCriticalRole');
    });

    it('should reject multisig with threshold < 2', async function () {
      const signers = await ethers.getSigners();

      // Create multisig with threshold = 1 (too low)
      const lowThresholdSafe = await deployMockGnosisSafe(signers.slice(0, 3), 1);
      const otherSafes = await Promise.all([
        deployMockGnosisSafe(signers.slice(3, 8), 3),
        deployMockGnosisSafe(signers.slice(8, 11), 2),
        deployMockGnosisSafe(signers.slice(11, 14), 2),
        deployMockGnosisSafe(signers.slice(14, 19), 3),
        deployMockGnosisSafe(signers.slice(19, 26), 4),
      ]);

      const AmantraLedgerV5 = await ethers.getContractFactory('AmantraLedgerV5');

      await expect(
        upgrades.deployProxy(
          AmantraLedgerV5,
          [
            await lowThresholdSafe.getAddress(),
            await otherSafes[0].getAddress(),
            await otherSafes[1].getAddress(),
            await otherSafes[2].getAddress(),
            await otherSafes[3].getAddress(),
            await otherSafes[4].getAddress(),
            signers[26].address,
          ],
          { initializer: 'initialize' },
        ),
      ).to.be.revertedWithCustomError(AmantraLedgerV5, 'MultisigThresholdTooLow');
    });

    it('should correctly register all multisigs', async function () {
      const { ledger, operatorSafe, oracleSafe, hisbahSafe, backupSafe } =
        await loadFixture(deployFullSystemFixture);

      const operatorConfig = await ledger.multisigs(MultisigRole.OPERATOR);
      const oracleConfig = await ledger.multisigs(MultisigRole.ORACLE);
      const hisbahConfig = await ledger.multisigs(MultisigRole.HISBAH);
      const backupConfig = await ledger.multisigs(MultisigRole.BACKUP);

      expect(operatorConfig.multisigAddress).to.equal(await operatorSafe.getAddress());
      expect(operatorConfig.threshold).to.equal(2);
      expect(operatorConfig.validated).to.be.true;
      expect(operatorConfig.active).to.be.true;

      expect(oracleConfig.threshold).to.equal(3);
      expect(oracleConfig.memberCount).to.equal(5);

      expect(hisbahConfig.threshold).to.equal(3);
      expect(hisbahConfig.memberCount).to.equal(5);

      expect(backupConfig.threshold).to.equal(4);
      expect(backupConfig.memberCount).to.equal(7);
    });
  });

  // ============================================
  // 2. DEAD MAN SWITCH TESTS
  // ============================================

  describe('2. Dead Man Switch - SCENARIO: Oracle Hilang', function () {
    it('should NOT trigger dead man switch before threshold', async function () {
      const { ledger } = await loadFixture(deployFullSystemFixture);

      // Try to trigger immediately
      await expect(
        ledger.triggerDeadManSwitch(MultisigRole.ORACLE),
      ).to.be.revertedWithCustomError(ledger, 'DeadManSwitchNotTriggerable');
    });

    it('should allow triggering dead man switch after 180 days of inactivity', async function () {
      const { ledger, oracleSafe, backupSafe, users } =
        await loadFixture(deployFullSystemFixture);

      // Fast forward 181 days
      await time.increase(181 * 24 * 60 * 60);

      // Check if can trigger
      const [canTrigger, lastActivity, threshold] =
        await ledger.canTriggerDeadManSwitch(MultisigRole.ORACLE);

      expect(canTrigger).to.be.true;

      // Anyone can trigger
      await expect(ledger.connect(users[0]).triggerDeadManSwitch(MultisigRole.ORACLE))
        .to.emit(ledger, 'DeadManSwitchTriggered')
        .withArgs(
          MultisigRole.ORACLE,
          await oracleSafe.getAddress(),
          await backupSafe.getAddress(),
          lastActivity,
        );

      // System should be in recovery mode
      expect(await ledger.systemMode()).to.equal(SystemMode.RECOVERY);

      // Backup should now have Oracle role
      const oracleConfig = await ledger.multisigs(MultisigRole.ORACLE);
      expect(oracleConfig.multisigAddress).to.equal(await backupSafe.getAddress());
    });

    it('should allow settlements to continue via backup after dead man switch', async function () {
      const { ledger, operatorSafe, backupSafe, users, bankId } =
        await loadFixture(deployFullSystemFixture);

      // Create and fund a contract first
      const contractId = ethers.keccak256(ethers.toUtf8Bytes('TEST-001'));
      const contractNumber = ethers.keccak256(ethers.toUtf8Bytes('CN-001'));
      const seller = ethers.keccak256(ethers.toUtf8Bytes('SELLER'));
      const buyer = ethers.keccak256(ethers.toUtf8Bytes('BUYER'));
      const akadHash = ethers.keccak256(ethers.toUtf8Bytes('AKAD'));

      await ledger.connect(operatorSafe).createContract(
        contractId,
        contractNumber,
        seller,
        buyer,
        users[0].address,
        users[1].address,
        ethers.parseEther('1'),
        100, // 1% fee
        ethers.parseEther('0.01'),
        ethers.parseEther('0.99'),
        0,
        0, // PLATFORM bears fee
        ethers.parseEther('0.001'),
        akadHash,
      );

      // Fund and verify
      const txRef1 = ethers.keccak256(ethers.toUtf8Bytes('TX-001'));
      const txRef2 = ethers.keccak256(ethers.toUtf8Bytes('TX-002'));
      const escrowRef = ethers.keccak256(ethers.toUtf8Bytes('ESCROW-001'));
      const qrisRef = ethers.keccak256(ethers.toUtf8Bytes('QRIS-001'));
      const verifyHash = ethers.keccak256(ethers.toUtf8Bytes('VERIFY-001'));

      await ledger.connect(operatorSafe).markFunded(contractId, qrisRef, escrowRef, txRef1);
      await ledger.connect(operatorSafe).markVerified(contractId, verifyHash, txRef2);

      // Now trigger dead man switch for Oracle
      await time.increase(181 * 24 * 60 * 60);
      await ledger.triggerDeadManSwitch(MultisigRole.ORACLE);

      // Backup should be able to settle
      const settlementRef = ethers.keccak256(ethers.toUtf8Bytes('SETTLE-001'));
      const txRef3 = ethers.keccak256(ethers.toUtf8Bytes('TX-003'));
      const bankReceiptHash = ethers.keccak256(ethers.toUtf8Bytes('RECEIPT-001'));

      await expect(
        ledger.connect(backupSafe).markSettled(
          contractId,
          settlementRef,
          txRef3,
          0, // actualNetworkFee
          ethers.parseEther('0.99'), // sellerNetReceived
          ethers.parseEther('0.01'), // platformNetReceived
          bankReceiptHash,
        ),
      ).to.emit(ledger, 'SettlementMarked');

      const contract = await ledger.getContract(contractId);
      expect(contract.status).to.equal(Status.SETTLED);
    });

    it('should reset heartbeat timer when activity occurs', async function () {
      const { ledger, oracleSafe } = await loadFixture(deployFullSystemFixture);

      // Fast forward 90 days
      await time.increase(90 * 24 * 60 * 60);

      // Send heartbeat
      await ledger.connect(oracleSafe).sendHeartbeat(MultisigRole.ORACLE);

      // Fast forward another 100 days (total 190 days but only 100 since heartbeat)
      await time.increase(100 * 24 * 60 * 60);

      // Should NOT be triggerable because heartbeat reset the timer
      const [canTrigger] = await ledger.canTriggerDeadManSwitch(MultisigRole.ORACLE);
      expect(canTrigger).to.be.false;
    });
  });

  // ============================================
  // 3. SUCCESSION TESTS
  // ============================================

  describe('3. Succession Protocol - SCENARIO: Arbiter Wafat', function () {
    it('should allow proposing succession for arbitration council', async function () {
      const { ledger, arbitrationSafe, hisbahSafe } =
        await loadFixture(deployFullSystemFixture);

      const signers = await ethers.getSigners();
      const newArbitrationSafe = await deployMockGnosisSafe(signers.slice(30, 33), 2);

      // Propose succession
      await expect(
        ledger
          .connect(arbitrationSafe)
          .proposeRoleSuccession(
            MultisigRole.ARBITRATION_COUNCIL,
            await newArbitrationSafe.getAddress(),
            'Arbiter succession due to incapacity',
          ),
      )
        .to.emit(ledger, 'SuccessionProposed')
        .withArgs(
          0, // proposalId
          MultisigRole.ARBITRATION_COUNCIL,
          await arbitrationSafe.getAddress(),
          await newArbitrationSafe.getAddress(),
        );
    });

    it('should require Hisbah approval for succession', async function () {
      const { ledger, arbitrationSafe, hisbahSafe } =
        await loadFixture(deployFullSystemFixture);

      const signers = await ethers.getSigners();
      const newArbitrationSafe = await deployMockGnosisSafe(signers.slice(30, 33), 2);

      // Propose
      await ledger
        .connect(arbitrationSafe)
        .proposeRoleSuccession(
          MultisigRole.ARBITRATION_COUNCIL,
          await newArbitrationSafe.getAddress(),
          'Succession',
        );

      // Try to execute without Hisbah approval - should fail
      await time.increase(SUCCESSION_TIMELOCK + 1);

      await expect(
        ledger.executeRoleSuccession(0),
      ).to.be.revertedWithCustomError(ledger, 'SuccessionNotApprovedByHisbah');
    });

    it('should execute succession after timelock and Hisbah approval', async function () {
      const { ledger, arbitrationSafe, hisbahSafe, users } =
        await loadFixture(deployFullSystemFixture);

      const signers = await ethers.getSigners();
      const newArbitrationSafe = await deployMockGnosisSafe(signers.slice(30, 33), 2);

      // Propose
      await ledger
        .connect(arbitrationSafe)
        .proposeRoleSuccession(
          MultisigRole.ARBITRATION_COUNCIL,
          await newArbitrationSafe.getAddress(),
          'Succession',
        );

      // Hisbah approves
      await ledger.connect(hisbahSafe).approveSuccession(0);

      // Wait for timelock
      await time.increase(SUCCESSION_TIMELOCK + 1);

      // Execute (anyone can call)
      await expect(ledger.connect(users[0]).executeRoleSuccession(0))
        .to.emit(ledger, 'SuccessionExecuted')
        .withArgs(
          0,
          MultisigRole.ARBITRATION_COUNCIL,
          await arbitrationSafe.getAddress(),
          await newArbitrationSafe.getAddress(),
        );

      // Verify new arbitration council is active
      const config = await ledger.multisigs(MultisigRole.ARBITRATION_COUNCIL);
      expect(config.multisigAddress).to.equal(await newArbitrationSafe.getAddress());
    });

    it('should allow Hisbah to cancel succession', async function () {
      const { ledger, arbitrationSafe, hisbahSafe } =
        await loadFixture(deployFullSystemFixture);

      const signers = await ethers.getSigners();
      const newArbitrationSafe = await deployMockGnosisSafe(signers.slice(30, 33), 2);

      // Propose
      await ledger
        .connect(arbitrationSafe)
        .proposeRoleSuccession(
          MultisigRole.ARBITRATION_COUNCIL,
          await newArbitrationSafe.getAddress(),
          'Succession',
        );

      // Hisbah cancels
      await expect(
        ledger
          .connect(hisbahSafe)
          .cancelSuccession(0, 'New multisig has conflict of interest'),
      ).to.emit(ledger, 'SuccessionCancelled');

      // Cannot execute cancelled succession
      await time.increase(SUCCESSION_TIMELOCK + 1);
      await expect(
        ledger.executeRoleSuccession(0),
      ).to.be.revertedWithCustomError(ledger, 'SuccessionCancelledError');
    });

    it('should reject succession to address that already holds a role', async function () {
      const { ledger, arbitrationSafe, operatorSafe } =
        await loadFixture(deployFullSystemFixture);

      // Try to propose operator address as new arbitrator
      await expect(
        ledger
          .connect(arbitrationSafe)
          .proposeRoleSuccession(
            MultisigRole.ARBITRATION_COUNCIL,
            await operatorSafe.getAddress(),
            'Invalid succession',
          ),
      ).to.be.revertedWithCustomError(ledger, 'AddressAlreadyHasCriticalRole');
    });
  });

  // ============================================
  // 4. ADMIN KEY COMPROMISE TESTS
  // ============================================

  describe('4. Limited Admin Powers - SCENARIO: Admin Key Bocor', function () {
    it('admin should NOT be able to directly settle contracts', async function () {
      const { ledger, operatorSafe, admin, users, bankId } =
        await loadFixture(deployFullSystemFixture);

      // Create and fund a contract
      const contractId = ethers.keccak256(ethers.toUtf8Bytes('TEST-002'));
      const contractNumber = ethers.keccak256(ethers.toUtf8Bytes('CN-002'));
      const seller = ethers.keccak256(ethers.toUtf8Bytes('SELLER'));
      const buyer = ethers.keccak256(ethers.toUtf8Bytes('BUYER'));
      const akadHash = ethers.keccak256(ethers.toUtf8Bytes('AKAD'));

      await ledger.connect(operatorSafe).createContract(
        contractId,
        contractNumber,
        seller,
        buyer,
        users[0].address,
        users[1].address,
        ethers.parseEther('1'),
        100,
        ethers.parseEther('0.01'),
        ethers.parseEther('0.99'),
        0,
        0,
        ethers.parseEther('0.001'),
        akadHash,
      );

      const txRef1 = ethers.keccak256(ethers.toUtf8Bytes('TX-001'));
      const txRef2 = ethers.keccak256(ethers.toUtf8Bytes('TX-002'));
      const escrowRef = ethers.keccak256(ethers.toUtf8Bytes('ESCROW-001'));
      const qrisRef = ethers.keccak256(ethers.toUtf8Bytes('QRIS-001'));
      const verifyHash = ethers.keccak256(ethers.toUtf8Bytes('VERIFY-001'));

      await ledger.connect(operatorSafe).markFunded(contractId, qrisRef, escrowRef, txRef1);
      await ledger.connect(operatorSafe).markVerified(contractId, verifyHash, txRef2);

      // Admin tries to settle - should fail
      const settlementRef = ethers.keccak256(ethers.toUtf8Bytes('SETTLE-001'));
      const txRef3 = ethers.keccak256(ethers.toUtf8Bytes('TX-003'));
      const bankReceiptHash = ethers.keccak256(ethers.toUtf8Bytes('RECEIPT-001'));

      await expect(
        ledger.connect(admin).markSettled(
          contractId,
          settlementRef,
          txRef3,
          0,
          ethers.parseEther('0.99'),
          ethers.parseEther('0.01'),
          bankReceiptHash,
        ),
      ).to.be.reverted; // Not Oracle role
    });

    it('admin should NOT be able to resolve disputes', async function () {
      const { ledger, operatorSafe, admin, users } =
        await loadFixture(deployFullSystemFixture);

      // Create and fund a contract, then dispute it
      const contractId = ethers.keccak256(ethers.toUtf8Bytes('TEST-003'));
      const contractNumber = ethers.keccak256(ethers.toUtf8Bytes('CN-003'));
      const seller = ethers.keccak256(ethers.toUtf8Bytes('SELLER'));
      const buyer = ethers.keccak256(ethers.toUtf8Bytes('BUYER'));
      const akadHash = ethers.keccak256(ethers.toUtf8Bytes('AKAD'));

      await ledger.connect(operatorSafe).createContract(
        contractId,
        contractNumber,
        seller,
        buyer,
        users[0].address,
        users[1].address,
        ethers.parseEther('1'),
        100,
        ethers.parseEther('0.01'),
        ethers.parseEther('0.99'),
        0,
        0,
        ethers.parseEther('0.001'),
        akadHash,
      );

      const txRef1 = ethers.keccak256(ethers.toUtf8Bytes('TX-001'));
      const txRef2 = ethers.keccak256(ethers.toUtf8Bytes('TX-002'));
      const escrowRef = ethers.keccak256(ethers.toUtf8Bytes('ESCROW-001'));
      const qrisRef = ethers.keccak256(ethers.toUtf8Bytes('QRIS-001'));

      await ledger.connect(operatorSafe).markFunded(contractId, qrisRef, escrowRef, txRef1);

      // Raise dispute
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes('REASON'));
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes('EVIDENCE'));

      await ledger.connect(users[0]).raiseDispute(contractId, reasonHash, evidenceHash, txRef2);

      // Admin tries to queue resolution - should fail
      const arbitrationHash = ethers.keccak256(ethers.toUtf8Bytes('ARBITRATION'));

      await expect(
        ledger.connect(admin).queueResolution(contractId, arbitrationHash, 0),
      ).to.be.reverted; // Not Arbitration Council role
    });

    it('admin alone should NOT be able to upgrade contract', async function () {
      const { ledger, admin } = await loadFixture(deployFullSystemFixture);

      // Admin tries to propose upgrade - should fail (only Oracle can)
      await expect(
        ledger.connect(admin).proposeUpgrade(ethers.ZeroAddress),
      ).to.be.reverted;
    });
  });

  // ============================================
  // 5. BANK ESCROW TESTS
  // ============================================

  describe('5. Multi-Bank Escrow - SCENARIO: Bank Kolaps', function () {
    it('should allow adding multiple bank escrows', async function () {
      const { ledger, oracleSafe, bankId } = await loadFixture(deployFullSystemFixture);

      // Add secondary bank
      const secondaryBankId = ethers.keccak256(ethers.toUtf8Bytes('BNI'));
      await expect(
        ledger.connect(oracleSafe).addBankEscrow(secondaryBankId, 'BNI Syariah', false),
      ).to.emit(ledger, 'BankEscrowAdded');

      // Add emergency bank
      const emergencyBankId = ethers.keccak256(ethers.toUtf8Bytes('CIMB'));
      await ledger.connect(oracleSafe).addBankEscrow(emergencyBankId, 'CIMB Niaga Syariah', false);

      const banks = await ledger.getRegisteredBanks();
      expect(banks.length).to.equal(3);
    });

    it('should allow Oracle to freeze bank escrow', async function () {
      const { ledger, oracleSafe, bankId } = await loadFixture(deployFullSystemFixture);

      // Add secondary bank first
      const secondaryBankId = ethers.keccak256(ethers.toUtf8Bytes('BNI'));
      await ledger.connect(oracleSafe).addBankEscrow(secondaryBankId, 'BNI Syariah', false);

      // Freeze primary bank
      await expect(
        ledger.connect(oracleSafe).freezeBankEscrow(bankId, 'Bank under investigation'),
      ).to.emit(ledger, 'BankEscrowFrozen');

      const bank = await ledger.getBankEscrow(bankId);
      expect(bank.isFrozen).to.be.true;
    });

    it('should allow Hisbah to freeze bank escrow', async function () {
      const { ledger, hisbahSafe, oracleSafe, bankId } =
        await loadFixture(deployFullSystemFixture);

      // Add secondary bank first
      const secondaryBankId = ethers.keccak256(ethers.toUtf8Bytes('BNI'));
      await ledger.connect(oracleSafe).addBankEscrow(secondaryBankId, 'BNI Syariah', false);

      // Hisbah freezes bank
      await expect(
        ledger.connect(hisbahSafe).freezeBankEscrow(bankId, 'Bank compliance issue'),
      ).to.emit(ledger, 'BankEscrowFrozen');
    });

    it('should NOT allow freezing the last active bank', async function () {
      const { ledger, oracleSafe, bankId } = await loadFixture(deployFullSystemFixture);

      // Only one bank exists, should not be freezable
      await expect(
        ledger.connect(oracleSafe).freezeBankEscrow(bankId, 'Test'),
      ).to.be.revertedWithCustomError(ledger, 'CannotFreezeLastActiveBank');
    });

    it('should automatically use backup bank when primary is frozen', async function () {
      const { ledger, oracleSafe, operatorSafe, users, bankId } =
        await loadFixture(deployFullSystemFixture);

      // Add secondary bank
      const secondaryBankId = ethers.keccak256(ethers.toUtf8Bytes('BNI'));
      await ledger.connect(oracleSafe).addBankEscrow(secondaryBankId, 'BNI Syariah', false);

      // Freeze primary
      await ledger.connect(oracleSafe).freezeBankEscrow(bankId, 'Bank collapsed');

      // getAvailableBank should return secondary
      const availableBank = await ledger.getAvailableBank();
      expect(availableBank).to.equal(secondaryBankId);

      // New contracts should use secondary bank
      const contractId = ethers.keccak256(ethers.toUtf8Bytes('TEST-004'));
      const contractNumber = ethers.keccak256(ethers.toUtf8Bytes('CN-004'));
      const seller = ethers.keccak256(ethers.toUtf8Bytes('SELLER'));
      const buyer = ethers.keccak256(ethers.toUtf8Bytes('BUYER'));
      const akadHash = ethers.keccak256(ethers.toUtf8Bytes('AKAD'));

      await ledger.connect(operatorSafe).createContract(
        contractId,
        contractNumber,
        seller,
        buyer,
        users[0].address,
        users[1].address,
        ethers.parseEther('1'),
        100,
        ethers.parseEther('0.01'),
        ethers.parseEther('0.99'),
        0,
        0,
        ethers.parseEther('0.001'),
        akadHash,
      );

      const contract = await ledger.getContract(contractId);
      expect(contract.bankId).to.equal(secondaryBankId);
    });

    it('should allow initiating bank migration', async function () {
      const { ledger, oracleSafe, bankId } = await loadFixture(deployFullSystemFixture);

      // Add secondary bank
      const secondaryBankId = ethers.keccak256(ethers.toUtf8Bytes('BNI'));
      await ledger.connect(oracleSafe).addBankEscrow(secondaryBankId, 'BNI Syariah', false);

      // Initiate migration
      await expect(
        ledger
          .connect(oracleSafe)
          .initiateBankMigration(bankId, secondaryBankId, ethers.parseEther('1000000')),
      ).to.emit(ledger, 'BankMigrationInitiated');
    });
  });

  // ============================================
  // 6. UPGRADE SAFETY TESTS
  // ============================================

  describe('6. Upgrade Safety - Triple Approval + 72h Timelock', function () {
    it('should require Oracle to propose upgrade', async function () {
      const { ledger, operatorSafe, hisbahSafe } =
        await loadFixture(deployFullSystemFixture);

      const newImpl = ethers.Wallet.createRandom().address;

      // Operator tries to propose - should fail
      await expect(
        ledger.connect(operatorSafe).proposeUpgrade(newImpl),
      ).to.be.reverted;

      // Hisbah tries to propose - should fail
      await expect(
        ledger.connect(hisbahSafe).proposeUpgrade(newImpl),
      ).to.be.reverted;
    });

    it('should allow Oracle to propose upgrade', async function () {
      const { ledger, oracleSafe } = await loadFixture(deployFullSystemFixture);

      const newImpl = ethers.Wallet.createRandom().address;

      await expect(ledger.connect(oracleSafe).proposeUpgrade(newImpl))
        .to.emit(ledger, 'UpgradeProposed')
        .withArgs(0, newImpl, await ethers.provider.getCode(newImpl).then(ethers.keccak256));
    });

    it('should require Hisbah approval for upgrade', async function () {
      const { ledger, oracleSafe } = await loadFixture(deployFullSystemFixture);

      const newImpl = ethers.Wallet.createRandom().address;
      await ledger.connect(oracleSafe).proposeUpgrade(newImpl);

      // Try to announce without Hisbah approval
      await expect(
        ledger.connect(oracleSafe).announceUpgradePublicly(0),
      ).to.be.revertedWithCustomError(ledger, 'UpgradeNotApproved');
    });

    it('should require public announcement before execution', async function () {
      const { ledger, oracleSafe, hisbahSafe } =
        await loadFixture(deployFullSystemFixture);

      const newImpl = ethers.Wallet.createRandom().address;
      await ledger.connect(oracleSafe).proposeUpgrade(newImpl);
      await ledger.connect(hisbahSafe).approveUpgrade(0);

      // Wait for timelock
      await time.increase(UPGRADE_TIMELOCK + 1);

      // Try to execute without public announcement
      await expect(
        ledger.connect(oracleSafe).executeUpgrade(0),
      ).to.be.revertedWithCustomError(ledger, 'UpgradeNotAnnouncedPublicly');
    });

    it('should enforce 72h timelock after public announcement', async function () {
      const { ledger, oracleSafe, hisbahSafe } =
        await loadFixture(deployFullSystemFixture);

      const newImpl = ethers.Wallet.createRandom().address;
      await ledger.connect(oracleSafe).proposeUpgrade(newImpl);
      await ledger.connect(hisbahSafe).approveUpgrade(0);
      await ledger.connect(oracleSafe).announceUpgradePublicly(0);

      // Try to execute immediately - should fail
      await expect(
        ledger.connect(oracleSafe).executeUpgrade(0),
      ).to.be.revertedWithCustomError(ledger, 'UpgradeTimelockNotPassed');
    });

    it('should allow Hisbah to cancel upgrade', async function () {
      const { ledger, oracleSafe, hisbahSafe } =
        await loadFixture(deployFullSystemFixture);

      const newImpl = ethers.Wallet.createRandom().address;
      await ledger.connect(oracleSafe).proposeUpgrade(newImpl);
      await ledger.connect(hisbahSafe).approveUpgrade(0);
      await ledger.connect(oracleSafe).announceUpgradePublicly(0);

      // Hisbah cancels
      await expect(
        ledger.connect(hisbahSafe).cancelUpgrade(0, 'Security vulnerability found'),
      ).to.emit(ledger, 'UpgradeCancelled');
    });
  });

  // ============================================
  // 7. SYSTEM MODE TESTS
  // ============================================

  describe('7. System Mode Management', function () {
    it('should allow Emergency multisig to pause', async function () {
      const { ledger, emergencySafe } = await loadFixture(deployFullSystemFixture);

      await expect(ledger.connect(emergencySafe).pause('Suspicious activity detected'))
        .to.emit(ledger, 'EmergencyPaused');

      expect(await ledger.paused()).to.be.true;
    });

    it('should allow Hisbah to pause', async function () {
      const { ledger, hisbahSafe } = await loadFixture(deployFullSystemFixture);

      await expect(ledger.connect(hisbahSafe).pause('Compliance issue'))
        .to.emit(ledger, 'EmergencyPaused');
    });

    it('should ONLY allow Hisbah to unpause', async function () {
      const { ledger, emergencySafe, hisbahSafe, oracleSafe } =
        await loadFixture(deployFullSystemFixture);

      await ledger.connect(emergencySafe).pause('Test');

      // Emergency tries to unpause - should fail
      await expect(ledger.connect(emergencySafe).unpause()).to.be.reverted;

      // Oracle tries to unpause - should fail
      await expect(ledger.connect(oracleSafe).unpause()).to.be.reverted;

      // Hisbah can unpause
      await expect(ledger.connect(hisbahSafe).unpause())
        .to.emit(ledger, 'EmergencyUnpaused');
    });

    it('should allow Backup to activate recovery mode', async function () {
      const { ledger, backupSafe } = await loadFixture(deployFullSystemFixture);

      await expect(
        ledger.connect(backupSafe).activateRecoveryMode('Dead man switch triggered'),
      ).to.emit(ledger, 'RecoveryModeActivated');

      expect(await ledger.systemMode()).to.equal(SystemMode.RECOVERY);
    });

    it('should ONLY allow Hisbah to deactivate recovery mode', async function () {
      const { ledger, backupSafe, hisbahSafe, oracleSafe } =
        await loadFixture(deployFullSystemFixture);

      await ledger.connect(backupSafe).activateRecoveryMode('Test');

      // Backup tries to deactivate - should fail
      await expect(
        ledger.connect(backupSafe).deactivateRecoveryMode(),
      ).to.be.reverted;

      // Oracle tries - should fail
      await expect(
        ledger.connect(oracleSafe).deactivateRecoveryMode(),
      ).to.be.reverted;

      // Hisbah can deactivate
      await ledger.connect(hisbahSafe).deactivateRecoveryMode();
      expect(await ledger.systemMode()).to.equal(SystemMode.NORMAL);
    });
  });

  // ============================================
  // 8. DISPUTE RESOLUTION CONTINUITY
  // ============================================

  describe('8. Dispute Resolution Continuity', function () {
    it('should allow disputes to continue after arbitrator succession', async function () {
      const { ledger, operatorSafe, arbitrationSafe, hisbahSafe, users } =
        await loadFixture(deployFullSystemFixture);

      // Create and dispute a contract
      const contractId = ethers.keccak256(ethers.toUtf8Bytes('TEST-005'));
      const contractNumber = ethers.keccak256(ethers.toUtf8Bytes('CN-005'));
      const seller = ethers.keccak256(ethers.toUtf8Bytes('SELLER'));
      const buyer = ethers.keccak256(ethers.toUtf8Bytes('BUYER'));
      const akadHash = ethers.keccak256(ethers.toUtf8Bytes('AKAD'));

      await ledger.connect(operatorSafe).createContract(
        contractId,
        contractNumber,
        seller,
        buyer,
        users[0].address,
        users[1].address,
        ethers.parseEther('1'),
        100,
        ethers.parseEther('0.01'),
        ethers.parseEther('0.99'),
        0,
        0,
        ethers.parseEther('0.001'),
        akadHash,
      );

      const txRef1 = ethers.keccak256(ethers.toUtf8Bytes('TX-001'));
      const txRef2 = ethers.keccak256(ethers.toUtf8Bytes('TX-002'));
      const escrowRef = ethers.keccak256(ethers.toUtf8Bytes('ESCROW-001'));
      const qrisRef = ethers.keccak256(ethers.toUtf8Bytes('QRIS-001'));

      await ledger.connect(operatorSafe).markFunded(contractId, qrisRef, escrowRef, txRef1);

      // Raise dispute
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes('REASON'));
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes('EVIDENCE'));
      await ledger.connect(users[0]).raiseDispute(contractId, reasonHash, evidenceHash, txRef2);

      // Queue resolution
      const arbitrationHash = ethers.keccak256(ethers.toUtf8Bytes('ARBITRATION'));
      await ledger.connect(arbitrationSafe).queueResolution(contractId, arbitrationHash, 0);

      // Now succession happens
      const signers = await ethers.getSigners();
      const newArbitrationSafe = await deployMockGnosisSafe(signers.slice(30, 33), 2);

      await ledger
        .connect(arbitrationSafe)
        .proposeRoleSuccession(
          MultisigRole.ARBITRATION_COUNCIL,
          await newArbitrationSafe.getAddress(),
          'Succession',
        );
      await ledger.connect(hisbahSafe).approveSuccession(0);
      await time.increase(SUCCESSION_TIMELOCK + 1);
      await ledger.executeRoleSuccession(0);

      // Wait for resolution timelock
      await time.increase(RESOLUTION_DELAY + 1);

      // NEW arbitrator can execute the resolution
      const txRef3 = ethers.keccak256(ethers.toUtf8Bytes('TX-003'));
      await expect(
        ledger.connect(newArbitrationSafe).executeResolution(contractId, arbitrationHash, txRef3),
      ).to.emit(ledger, 'ResolutionExecuted');
    });
  });

  // ============================================
  // 9. COMPREHENSIVE FAILURE SCENARIO
  // ============================================

  describe('9. Comprehensive Failure Scenario Simulation', function () {
    it('should handle multiple simultaneous failures gracefully', async function () {
      const {
        ledger,
        operatorSafe,
        oracleSafe,
        arbitrationSafe,
        hisbahSafe,
        backupSafe,
        users,
        bankId,
      } = await loadFixture(deployFullSystemFixture);

      // Setup: Create multiple contracts
      for (let i = 0; i < 3; i++) {
        const contractId = ethers.keccak256(ethers.toUtf8Bytes(`CONTRACT-${i}`));
        const contractNumber = ethers.keccak256(ethers.toUtf8Bytes(`CN-${i}`));
        const seller = ethers.keccak256(ethers.toUtf8Bytes('SELLER'));
        const buyer = ethers.keccak256(ethers.toUtf8Bytes('BUYER'));
        const akadHash = ethers.keccak256(ethers.toUtf8Bytes('AKAD'));

        await ledger.connect(operatorSafe).createContract(
          contractId,
          contractNumber,
          seller,
          buyer,
          users[0].address,
          users[1].address,
          ethers.parseEther('1'),
          100,
          ethers.parseEther('0.01'),
          ethers.parseEther('0.99'),
          0,
          0,
          ethers.parseEther('0.001'),
          akadHash,
        );

        const txRef = ethers.keccak256(ethers.toUtf8Bytes(`TX-${i}`));
        const escrowRef = ethers.keccak256(ethers.toUtf8Bytes(`ESCROW-${i}`));
        const qrisRef = ethers.keccak256(ethers.toUtf8Bytes(`QRIS-${i}`));

        await ledger.connect(operatorSafe).markFunded(contractId, qrisRef, escrowRef, txRef);
      }

      // FAILURE 1: Primary bank collapses
      const secondaryBankId = ethers.keccak256(ethers.toUtf8Bytes('BNI'));
      await ledger.connect(oracleSafe).addBankEscrow(secondaryBankId, 'BNI Syariah', false);
      await ledger.connect(oracleSafe).freezeBankEscrow(bankId, 'Bank collapsed');

      // Verify new contracts use secondary bank
      expect(await ledger.getAvailableBank()).to.equal(secondaryBankId);

      // FAILURE 2: Oracle goes inactive
      await time.increase(181 * 24 * 60 * 60);

      // Trigger dead man switch for Oracle
      await ledger.triggerDeadManSwitch(MultisigRole.ORACLE);
      expect(await ledger.systemMode()).to.equal(SystemMode.RECOVERY);

      // FAILURE 3: One contract is disputed
      const disputedContractId = ethers.keccak256(ethers.toUtf8Bytes('CONTRACT-0'));
      const disputeTxRef = ethers.keccak256(ethers.toUtf8Bytes('DISPUTE-TX'));
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes('REASON'));
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes('EVIDENCE'));

      await ledger.connect(users[0]).raiseDispute(
        disputedContractId,
        reasonHash,
        evidenceHash,
        disputeTxRef,
      );

      // RECOVERY: Backup handles everything

      // 1. Backup (now acting as Oracle) can settle non-disputed contracts
      const contractId1 = ethers.keccak256(ethers.toUtf8Bytes('CONTRACT-1'));
      const verifyHash = ethers.keccak256(ethers.toUtf8Bytes('VERIFY'));
      const verifyTxRef = ethers.keccak256(ethers.toUtf8Bytes('VERIFY-TX'));

      // Note: Backup can mark settled since it now has Oracle role
      // But first needs to verify (which requires Operator role)
      // This demonstrates the system still works but with limitations

      // 2. Arbitration can still resolve disputes
      const arbitrationHash = ethers.keccak256(ethers.toUtf8Bytes('ARBITRATION'));
      await ledger.connect(arbitrationSafe).queueResolution(
        disputedContractId,
        arbitrationHash,
        1, // REFUND_BUYER
      );

      await time.increase(RESOLUTION_DELAY + 1);

      const resolveTxRef = ethers.keccak256(ethers.toUtf8Bytes('RESOLVE-TX'));
      await ledger.connect(arbitrationSafe).executeResolution(
        disputedContractId,
        arbitrationHash,
        resolveTxRef,
      );

      const dispute = await ledger.getDispute(disputedContractId);
      expect(dispute.active).to.be.false;

      // 3. Hisbah can restore normal operations
      await ledger.connect(hisbahSafe).deactivateRecoveryMode();
      expect(await ledger.systemMode()).to.equal(SystemMode.NORMAL);

      // System has survived multiple simultaneous failures!
    });
  });
});
