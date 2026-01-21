'use client';

import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { AMANTRA_LEDGER_ABI, getContractAddress, SUPPORTED_CHAINS } from '@/config/contracts';
import { useWalletStore } from '@/store/wallet';
import { Contract, ContractStatus, SystemMode } from '@/types';

// Hook for reading contract data
export function useContractRead() {
  const { chainId, isConnected } = useWalletStore();
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum && isConnected && chainId) {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      const contractAddress = getContractAddress(chainId);
      if (contractAddress) {
        const contractInstance = new ethers.Contract(
          contractAddress,
          AMANTRA_LEDGER_ABI,
          browserProvider
        );
        setContract(contractInstance);
      }
    }
  }, [isConnected, chainId]);

  const getSystemMode = useCallback(async (): Promise<SystemMode | null> => {
    if (!contract) return null;
    try {
      const mode = await contract.systemMode();
      return mode as SystemMode;
    } catch (error) {
      console.error('Failed to get system mode:', error);
      return null;
    }
  }, [contract]);

  const getContract = useCallback(async (contractId: string) => {
    if (!contract) return null;
    try {
      const data = await contract.getContract(contractId);
      return {
        id: contractId,
        buyer: data.buyer,
        seller: data.seller,
        amount: ethers.formatEther(data.amount),
        status: data.status as ContractStatus,
        createdAt: Number(data.createdAt),
        deadline: Number(data.deadline),
        title: data.title || '',
        description: data.description || '',
        akadType: data.akadType || '',
        evidenceHashes: data.evidenceHashes || [],
      };
    } catch (error) {
      console.error('Failed to get contract:', error);
      return null;
    }
  }, [contract]);

  const getContractsByUser = useCallback(async (userAddress: string): Promise<string[]> => {
    if (!contract) return [];
    try {
      const contractIds = await contract.getContractsByUser(userAddress);
      return contractIds;
    } catch (error) {
      console.error('Failed to get user contracts:', error);
      return [];
    }
  }, [contract]);

  const getMultisigConfig = useCallback(async () => {
    if (!contract) return null;
    try {
      const config = await contract.getMultisigConfig();
      return {
        operationalSafe: config.operationalSafe,
        majelisSafe: config.majelisSafe,
        hisbahSafe: config.hisbahSafe,
        waqfSafe: config.waqfSafe,
        recoverySafe: config.recoverySafe,
        requiredSignatures: Number(config.requiredSignatures),
      };
    } catch (error) {
      console.error('Failed to get multisig config:', error);
      return null;
    }
  }, [contract]);

  const getLastHeartbeat = useCallback(async (signer: string): Promise<Date | null> => {
    if (!contract) return null;
    try {
      const timestamp = await contract.lastHeartbeat(signer);
      return new Date(Number(timestamp) * 1000);
    } catch (error) {
      console.error('Failed to get heartbeat:', error);
      return null;
    }
  }, [contract]);

  return {
    provider,
    contract,
    getSystemMode,
    getContract,
    getContractsByUser,
    getMultisigConfig,
    getLastHeartbeat,
  };
}

// Hook for writing to contract
export function useContractWrite() {
  const { chainId, isConnected, address } = useWalletStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const getSignerAndContract = useCallback(async () => {
    if (!window.ethereum || !isConnected || !chainId) {
      throw new Error('Wallet not connected');
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contractAddress = getContractAddress(chainId);

    if (!contractAddress) {
      throw new Error('Contract not deployed on this chain');
    }

    const contract = new ethers.Contract(
      contractAddress,
      AMANTRA_LEDGER_ABI,
      signer
    );

    return { signer, contract };
  }, [isConnected, chainId]);

  const createContract = useCallback(async (
    seller: string,
    title: string,
    description: string,
    akadType: string,
    amount: string,
    deadline: Date
  ) => {
    setIsLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const { contract } = await getSignerAndContract();
      const deadlineTimestamp = Math.floor(deadline.getTime() / 1000);
      const amountWei = ethers.parseEther(amount);

      const tx = await contract.createContract(
        seller,
        title,
        description,
        akadType,
        deadlineTimestamp,
        { value: amountWei }
      );

      setTxHash(tx.hash);
      const receipt = await tx.wait();
      return receipt;
    } catch (err: any) {
      setError(err.message || 'Transaction failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getSignerAndContract]);

  const confirmDelivery = useCallback(async (contractId: string) => {
    setIsLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const { contract } = await getSignerAndContract();
      const tx = await contract.confirmDelivery(contractId);
      setTxHash(tx.hash);
      const receipt = await tx.wait();
      return receipt;
    } catch (err: any) {
      setError(err.message || 'Transaction failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getSignerAndContract]);

  const raiseDispute = useCallback(async (
    contractId: string,
    reason: string,
    evidenceHash: string
  ) => {
    setIsLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const { contract } = await getSignerAndContract();
      const tx = await contract.raiseDispute(contractId, reason, evidenceHash);
      setTxHash(tx.hash);
      const receipt = await tx.wait();
      return receipt;
    } catch (err: any) {
      setError(err.message || 'Transaction failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getSignerAndContract]);

  const submitEvidence = useCallback(async (
    contractId: string,
    evidenceHash: string,
    description: string
  ) => {
    setIsLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const { contract } = await getSignerAndContract();
      const tx = await contract.submitEvidence(contractId, evidenceHash, description);
      setTxHash(tx.hash);
      const receipt = await tx.wait();
      return receipt;
    } catch (err: any) {
      setError(err.message || 'Transaction failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getSignerAndContract]);

  const sendHeartbeat = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const { contract } = await getSignerAndContract();
      const tx = await contract.heartbeat();
      setTxHash(tx.hash);
      const receipt = await tx.wait();
      return receipt;
    } catch (err: any) {
      setError(err.message || 'Transaction failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getSignerAndContract]);

  return {
    isLoading,
    error,
    txHash,
    createContract,
    confirmDelivery,
    raiseDispute,
    submitEvidence,
    sendHeartbeat,
  };
}

// Hook for contract events
export function useContractEvents() {
  const { chainId, isConnected } = useWalletStore();
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!window.ethereum || !isConnected || !chainId) return;

    const provider = new ethers.BrowserProvider(window.ethereum);
    const contractAddress = getContractAddress(chainId);

    if (!contractAddress) return;

    const contract = new ethers.Contract(
      contractAddress,
      AMANTRA_LEDGER_ABI,
      provider
    );

    // Listen for events
    const handleContractCreated = (contractId: string, buyer: string, seller: string, amount: bigint) => {
      setEvents((prev) => [
        ...prev,
        {
          type: 'ContractCreated',
          contractId,
          buyer,
          seller,
          amount: ethers.formatEther(amount),
          timestamp: new Date(),
        },
      ]);
    };

    const handleDisputeRaised = (contractId: string, raiser: string, reason: string) => {
      setEvents((prev) => [
        ...prev,
        {
          type: 'DisputeRaised',
          contractId,
          raiser,
          reason,
          timestamp: new Date(),
        },
      ]);
    };

    const handleResolutionExecuted = (contractId: string, resolutionType: number, buyerAmount: bigint, sellerAmount: bigint) => {
      setEvents((prev) => [
        ...prev,
        {
          type: 'ResolutionExecuted',
          contractId,
          resolutionType,
          buyerAmount: ethers.formatEther(buyerAmount),
          sellerAmount: ethers.formatEther(sellerAmount),
          timestamp: new Date(),
        },
      ]);
    };

    contract.on('ContractCreated', handleContractCreated);
    contract.on('DisputeRaised', handleDisputeRaised);
    contract.on('ResolutionExecuted', handleResolutionExecuted);

    return () => {
      contract.off('ContractCreated', handleContractCreated);
      contract.off('DisputeRaised', handleDisputeRaised);
      contract.off('ResolutionExecuted', handleResolutionExecuted);
    };
  }, [isConnected, chainId]);

  return { events };
}

// Hook for governance operations
export function useGovernance() {
  const { chainId, isConnected } = useWalletStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSignerAndContract = useCallback(async () => {
    if (!window.ethereum || !isConnected || !chainId) {
      throw new Error('Wallet not connected');
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contractAddress = getContractAddress(chainId);

    if (!contractAddress) {
      throw new Error('Contract not deployed on this chain');
    }

    const contract = new ethers.Contract(
      contractAddress,
      AMANTRA_LEDGER_ABI,
      signer
    );

    return { signer, contract };
  }, [isConnected, chainId]);

  const proposeSuccession = useCallback(async (
    targetRole: string,
    currentHolder: string,
    proposedSuccessor: string,
    reason: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const { contract } = await getSignerAndContract();
      const tx = await contract.proposeSuccession(
        targetRole,
        currentHolder,
        proposedSuccessor,
        reason
      );
      const receipt = await tx.wait();
      return receipt;
    } catch (err: any) {
      setError(err.message || 'Proposal failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getSignerAndContract]);

  const voteOnSuccession = useCallback(async (proposalId: string, approve: boolean) => {
    setIsLoading(true);
    setError(null);

    try {
      const { contract } = await getSignerAndContract();
      const tx = await contract.voteOnSuccession(proposalId, approve);
      const receipt = await tx.wait();
      return receipt;
    } catch (err: any) {
      setError(err.message || 'Vote failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getSignerAndContract]);

  const executeSuccession = useCallback(async (proposalId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { contract } = await getSignerAndContract();
      const tx = await contract.executeSuccession(proposalId);
      const receipt = await tx.wait();
      return receipt;
    } catch (err: any) {
      setError(err.message || 'Execution failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getSignerAndContract]);

  const triggerEmergencyMode = useCallback(async (reason: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { contract } = await getSignerAndContract();
      const tx = await contract.triggerEmergencyMode(reason);
      const receipt = await tx.wait();
      return receipt;
    } catch (err: any) {
      setError(err.message || 'Emergency mode trigger failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getSignerAndContract]);

  return {
    isLoading,
    error,
    proposeSuccession,
    voteOnSuccession,
    executeSuccession,
    triggerEmergencyMode,
  };
}
