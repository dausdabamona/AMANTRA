/**
 * AMANTRA - AmantraLedgerV2 Upgrade Script
 *
 * Upgrades the UUPS proxy to a new implementation.
 *
 * Usage:
 *   npx hardhat run scripts/upgrade-v2.ts --network <network>
 *
 * Environment Variables:
 *   PROXY_ADDRESS - Current proxy address
 */

import { ethers, upgrades } from "hardhat";

async function main() {
  console.log("🔄 Starting AmantraLedgerV2 Upgrade...\n");

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("📍 Upgrader address:", deployer.address);

  // Get proxy address
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) {
    throw new Error("PROXY_ADDRESS environment variable is required");
  }

  console.log("📦 Proxy Address:", proxyAddress);

  // Get current implementation
  const currentImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("📋 Current Implementation:", currentImplementation);

  // Load current contract to verify access
  const currentContract = await ethers.getContractAt("AmantraLedgerV2", proxyAddress);

  // Verify caller is oracle multisig
  const oracleMultisig = await currentContract.oracleMultisig();
  console.log("🔐 Oracle Multisig:", oracleMultisig);

  if (deployer.address.toLowerCase() !== oracleMultisig.toLowerCase()) {
    console.log("\n⚠️  WARNING: Deployer is not the oracle multisig.");
    console.log("   This upgrade must be executed through the Gnosis Safe.");
    console.log("   Use the following steps:");
    console.log("   1. Deploy new implementation manually");
    console.log("   2. Create upgrade transaction in Gnosis Safe");
    console.log("   3. Collect required signatures");
    console.log("   4. Execute the upgrade");

    // Deploy new implementation without upgrading
    console.log("\n📦 Deploying new implementation (not upgrading yet)...");

    const AmantraLedgerV2Factory = await ethers.getContractFactory("AmantraLedgerV2");
    const newImplementation = await AmantraLedgerV2Factory.deploy();
    await newImplementation.waitForDeployment();

    const newImplAddress = await newImplementation.getAddress();
    console.log("✅ New Implementation deployed at:", newImplAddress);

    console.log("\n📋 Gnosis Safe Transaction Data:");
    console.log("   To:", proxyAddress);
    console.log("   Function: upgradeToAndCall(address,bytes)");
    console.log("   New Implementation:", newImplAddress);
    console.log("   Data: 0x (empty, no migration needed)");

    // Generate calldata
    const upgradeCalldata = currentContract.interface.encodeFunctionData(
      "upgradeToAndCall",
      [newImplAddress, "0x"]
    );
    console.log("   Full Calldata:", upgradeCalldata);

    return;
  }

  // Direct upgrade (only if caller is multisig)
  console.log("\n🔄 Upgrading contract...");

  const AmantraLedgerV2Factory = await ethers.getContractFactory("AmantraLedgerV2");

  const upgraded = await upgrades.upgradeProxy(proxyAddress, AmantraLedgerV2Factory, {
    kind: "uups",
  });

  await upgraded.waitForDeployment();

  // Get new implementation
  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("✅ New Implementation:", newImplementation);

  // Verify upgrade
  const version = await upgraded.VERSION();
  console.log("📋 Contract Version:", version);

  console.log("\n🎉 Upgrade complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Upgrade failed:", error);
    process.exit(1);
  });
