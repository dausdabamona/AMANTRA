import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WalletState {
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  chainId: number | null;
  balance: string | null;
  error: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  setAddress: (address: string | null) => void;
  setChainId: (chainId: number | null) => void;
  setBalance: (balance: string | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  isConnecting: false,
  address: null,
  chainId: null,
  balance: null,
  error: null,
};

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      ...initialState,

      connect: async () => {
        set({ isConnecting: true, error: null });

        try {
          // Check if window.ethereum exists
          if (typeof window !== 'undefined' && window.ethereum) {
            // Request accounts
            const accounts = await window.ethereum.request({
              method: 'eth_requestAccounts',
            });

            if (accounts && accounts.length > 0) {
              const address = accounts[0];

              // Get chain ID
              const chainIdHex = await window.ethereum.request({
                method: 'eth_chainId',
              });
              const chainId = parseInt(chainIdHex, 16);

              // Get balance
              const balanceHex = await window.ethereum.request({
                method: 'eth_getBalance',
                params: [address, 'latest'],
              });
              const balance = (parseInt(balanceHex, 16) / 1e18).toFixed(4);

              set({
                isConnected: true,
                isConnecting: false,
                address,
                chainId,
                balance,
                error: null,
              });

              // Setup event listeners
              window.ethereum.on('accountsChanged', (accounts: string[]) => {
                if (accounts.length === 0) {
                  get().disconnect();
                } else {
                  set({ address: accounts[0] });
                }
              });

              window.ethereum.on('chainChanged', (chainIdHex: string) => {
                set({ chainId: parseInt(chainIdHex, 16) });
              });
            }
          } else {
            set({
              isConnecting: false,
              error: 'Please install MetaMask or another Web3 wallet',
            });
          }
        } catch (error) {
          set({
            isConnecting: false,
            error: error instanceof Error ? error.message : 'Failed to connect wallet',
          });
        }
      },

      disconnect: () => {
        set(initialState);
      },

      setAddress: (address) => set({ address }),
      setChainId: (chainId) => set({ chainId }),
      setBalance: (balance) => set({ balance }),
      setError: (error) => set({ error }),
      reset: () => set(initialState),
    }),
    {
      name: 'amantra-wallet',
      partialize: (state) => ({
        address: state.address,
        chainId: state.chainId,
      }),
    }
  )
);

// Type augmentation for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}
