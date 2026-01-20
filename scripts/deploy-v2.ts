/**
 * AMANTRA - AmantraLedgerV2 Deployment Script
 *
 * Deploys the UUPS upgradeable AmantraLedgerV2 contract.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-v2.ts --network <network>
 *
 * Environment Variables:
 *   ORACLE_MULTISIG - Gnosis Safe multisig address
 *   ADMIN_ADDRESS - Admin address for initial setup
 */

import { ethers, upgrades } from "hardhat";
import { AmantraLedgerV2 } from "../typechain-types";

interface DeploymentResult {
  proxyAddress: string;
  implementationAddress: string;
  adminAddress: string;
  oracleMultisig: string;
  deploymentTx: string;
  blockNumber: number;
  timestamp: number;
  network: string;
  chainId: number;
}

async function main(): Promise<DeploymentResult> {
  console.log("🚀 Starting AmantraLedgerV2 Deployment...\n");

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer address:", deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Network:", network.name);
  console.log("🔗 Chain ID:", network.chainId.toString());

  // Configuration
  const oracleMultisig = process.env.ORACLE_MULTISIG || deployer.address;
  const adminAddress = process.env.ADMIN_ADDRESS || deployer.address;

  console.log("\n📋 Configuration:");
  console.log("   Oracle Multisig:", oracleMultisig);
  console.log("   Admin Address:", adminAddress);

  // Validate addresses
  if (!ethers.isAddress(oracleMultisig)) {
    throw new Error(`Invalid ORACLE_MULTISIG address: ${oracleMultisig}`);
  }
  if (!ethers.isAddress(adminAddress)) {
    throw new Error(`Invalid ADMIN_ADDRESS address: ${adminAddress}`);
  }

  // Warning for production
  if (oracleMultisig === deployer.address) {
    console.log("\n⚠️  WARNING: Using deployer as oracleMultisig. This is only acceptable for testing!");
  }

  // Deploy contract
  console.log("\n📦 Deploying AmantraLedgerV2 (UUPS Proxy)...");

  const AmantraLedgerV2Factory = await ethers.getContractFactory("AmantraLedgerV2");

  const proxy = await upgrades.deployProxy(
    AmantraLedgerV2Factory,
    [oracleMultisig, adminAddress],
    {
      kind: "uups",
      initializer: "initialize",
    }
  ) as unknown as AmantraLedgerV2;

  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  const deploymentTx = proxy.deploymentTransaction()?.hash || "";

  console.log("\n✅ Deployment Successful!");
  console.log("   Proxy Address:", proxyAddress);
  console.log("   Implementation Address:", implementationAddress);
  console.log("   Transaction Hash:", deploymentTx);

  // Verify deployment
  console.log("\n🔍 Verifying deployment...");

  const version = await proxy.VERSION();
  const maxFeeBps = await proxy.MAX_FEE_BPS();
  const storedMultisig = await proxy.oracleMultisig();
  const totalContracts = await proxy.totalContracts();
  const isPaused = await proxy.paused();

  console.log("   Contract Version:", version);
  console.log("   Max Fee BPS:", maxFeeBps.toString());
  console.log("   Oracle Multisig:", storedMultisig);
  console.log("   Total Contracts:", totalContracts.toString());
  console.log("   Is Paused:", isPaused);

  // Verify state transitions
  console.log("\n📊 Verifying state transition matrix...");

  const transitions = [
    { from: 0, to: 1, expected: true, name: "CREATED -> FUNDED" },
    { from: 0, to: 5, expected: true, name: "CREATED -> CANCELLED" },
    { from: 1, to: 2, expected: true, name: "FUNDED -> VERIFIED" },
    { from: 1, to: 4, expected: true, name: "FUNDED -> DISPUTED" },
    { from: 2, to: 3, expected: true, name: "VERIFIED -> SETTLED" },
    { from: 4, to: 2, expected: true, name: "DISPUTED -> VERIFIED" },
    { from: 4, to: 5, expected: true, name: "DISPUTED -> CANCELLED" },
    { from: 0, to: 3, expected: false, name: "CREATED -> SETTLED (invalid)" },
    { from: 3, to: 0, expected: false, name: "SETTLED -> CREATED (invalid)" },
  ];

  for (const t of transitions) {
    const allowed = await proxy.isTransitionAllowed(t.from, t.to);
    const status = allowed === t.expected ? "✅" : "❌";
    console.log(`   ${status} ${t.name}: ${allowed}`);
    if (allowed !== t.expected) {
      throw new Error(`State transition verification failed: ${t.name}`);
    }
  }

  // Get block info
  const block = await ethers.provider.getBlock("latest");

  const result: DeploymentResult = {
    proxyAddress,
    implementationAddress,
    adminAddress,
    oracleMultisig,
    deploymentTx,
    blockNumber: block?.number || 0,
    timestamp: block?.timestamp || 0,
    network: network.name,
    chainId: Number(network.chainId),
  };

  // Save deployment info
  console.log("\n📄 Deployment Summary:");
  console.log(JSON.stringify(result, null, 2));

  console.log("\n🎉 AmantraLedgerV2 deployment complete!");
  console.log("\n📌 Next Steps:");
  console.log("   1. Verify contract on block explorer");
  console.log("   2. Transfer admin role to multisig if needed");
  console.log("   3. Update backend with new contract address");
  console.log("   4. Run integration tests");

  return result;
}

main()
  .then((result) => {
    console.log("\n✨ Deployment finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
