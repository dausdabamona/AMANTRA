/**
 * AMANTRA - Contract Repository Interface
 *
 * Repository pattern untuk abstraksi akses data.
 * Implementasi konkret ada di infrastructure layer.
 */

import { Contract } from '../entities/Contract';
import { ContractStatus } from '../value-objects/ContractStatus';

export interface ContractSearchCriteria {
  status?: ContractStatus | ContractStatus[];
  sellerId?: string;
  buyerId?: string;
  mediatorId?: string;
  contractNumber?: string;
  createdFrom?: Date;
  createdTo?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ContractRepository {
  /**
   * Menyimpan contract baru atau update existing
   */
  save(contract: Contract): Promise<void>;

  /**
   * Mencari contract berdasarkan ID
   */
  findById(id: string): Promise<Contract | null>;

  /**
   * Mencari contract berdasarkan contract number
   */
  findByContractNumber(contractNumber: string): Promise<Contract | null>;

  /**
   * Mencari contracts dengan kriteria tertentu
   */
  findByCriteria(
    criteria: ContractSearchCriteria,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<Contract>>;

  /**
   * Mencari semua contracts untuk seller tertentu
   */
  findBySellerId(sellerId: string, pagination: PaginationOptions): Promise<PaginatedResult<Contract>>;

  /**
   * Mencari semua contracts untuk buyer tertentu
   */
  findByBuyerId(buyerId: string, pagination: PaginationOptions): Promise<PaginatedResult<Contract>>;

  /**
   * Mencari contracts yang aktif (butuh tindakan)
   */
  findActiveContracts(pagination: PaginationOptions): Promise<PaginatedResult<Contract>>;

  /**
   * Mencari contracts yang overdue (melewati deadline)
   */
  findOverdueContracts(): Promise<Contract[]>;

  /**
   * Menghitung total contracts berdasarkan status
   */
  countByStatus(status: ContractStatus): Promise<number>;

  /**
   * Mendapatkan statistik contracts
   */
  getStatistics(fromDate: Date, toDate: Date): Promise<ContractStatistics>;

  /**
   * Lock contract untuk update (pessimistic locking)
   */
  lockForUpdate(id: string): Promise<Contract | null>;

  /**
   * Cek apakah contract number sudah ada
   */
  existsByContractNumber(contractNumber: string): Promise<boolean>;
}

export interface ContractStatistics {
  totalContracts: number;
  byStatus: Record<ContractStatus, number>;
  totalValue: number;
  settledValue: number;
  disputedCount: number;
  averageSettlementTime: number; // dalam jam
}
