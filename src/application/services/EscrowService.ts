/**
 * AMANTRA - Escrow Service Interface
 *
 * Service untuk interaksi dengan Bank Escrow API.
 * Dana SELALU berada di bank, bukan di blockchain.
 */

export interface CreateEscrowAccountParams {
  contractId: string;
  amount: number;
  currency: string;
  sourceReference: string; // QRIS reference
}

export interface EscrowAccount {
  accountId: string;
  contractId: string;
  balance: number;
  currency: string;
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED';
  createdAt: Date;
}

export interface TransferRequest {
  fromAccountId: string;
  toAccountNumber: string;
  amount: number;
  currency: string;
  description: string;
  reference: string;
}

export interface TransferResult {
  success: boolean;
  reference: string;
  bankReference?: string;
  timestamp: Date;
  error?: string;
}

export interface EscrowService {
  /**
   * Membuat rekening escrow baru untuk kontrak
   */
  createEscrowAccount(params: CreateEscrowAccountParams): Promise<EscrowAccount>;

  /**
   * Mendapatkan saldo escrow
   */
  getBalance(escrowAccountId: string): Promise<number>;

  /**
   * Mendapatkan detail escrow account
   */
  getEscrowAccount(escrowAccountId: string): Promise<EscrowAccount | null>;

  /**
   * Eksekusi transfer dari escrow ke rekening tujuan
   */
  executeTransfer(request: TransferRequest): Promise<TransferResult>;

  /**
   * Eksekusi multiple transfers (untuk settlement)
   * Harus atomik - semua berhasil atau semua gagal
   */
  executeTransfers(requests: TransferRequest[]): Promise<TransferResult[]>;

  /**
   * Membekukan escrow (untuk kasus sengketa)
   */
  freezeEscrowAccount(escrowAccountId: string, reason: string): Promise<void>;

  /**
   * Membuka pembekuan escrow
   */
  unfreezeEscrowAccount(escrowAccountId: string): Promise<void>;

  /**
   * Menutup escrow account setelah settlement
   */
  closeEscrowAccount(escrowAccountId: string): Promise<void>;

  /**
   * Refund dari escrow ke pembeli
   */
  refundToBuyer(params: {
    escrowAccountId: string;
    buyerAccountNumber: string;
    amount: number;
    reason: string;
    reference: string;
  }): Promise<TransferResult>;

  /**
   * Mendapatkan history transaksi escrow
   */
  getTransactionHistory(escrowAccountId: string): Promise<EscrowTransaction[]>;
}

export interface EscrowTransaction {
  id: string;
  escrowAccountId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  balanceAfter: number;
  reference: string;
  description: string;
  timestamp: Date;
}
