/**
 * AMANTRA - Audit Trail Value Object
 *
 * Immutable audit trail untuk mencatat setiap perubahan pada entitas.
 * Setiap entri berisi informasi lengkap untuk keperluan audit.
 */

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  performedBy: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditTrail {
  private readonly entries: ReadonlyArray<AuditEntry>;

  private constructor(entries: AuditEntry[]) {
    this.entries = Object.freeze([...entries]);
  }

  // ============================================
  // Factory Methods
  // ============================================

  static create(): AuditTrail {
    return new AuditTrail([]);
  }

  static fromEntries(entries: AuditEntry[]): AuditTrail {
    return new AuditTrail(entries);
  }

  // ============================================
  // Operations (menghasilkan AuditTrail baru)
  // ============================================

  /**
   * Menambahkan entry baru ke audit trail
   * Mengembalikan AuditTrail baru (immutable)
   */
  addEntry(entry: AuditEntry): AuditTrail {
    return new AuditTrail([...this.entries, entry]);
  }

  // ============================================
  // Query Methods
  // ============================================

  /**
   * Mendapatkan semua entries
   */
  getEntries(): ReadonlyArray<AuditEntry> {
    return this.entries;
  }

  /**
   * Mendapatkan entry terakhir
   */
  getLastEntry(): AuditEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /**
   * Mendapatkan entries berdasarkan action
   */
  getEntriesByAction(action: string): AuditEntry[] {
    return this.entries.filter(e => e.action === action);
  }

  /**
   * Mendapatkan entries berdasarkan performer
   */
  getEntriesByPerformer(performedBy: string): AuditEntry[] {
    return this.entries.filter(e => e.performedBy === performedBy);
  }

  /**
   * Mendapatkan entries dalam rentang waktu
   */
  getEntriesInRange(startDate: Date, endDate: Date): AuditEntry[] {
    return this.entries.filter(
      e => e.timestamp >= startDate && e.timestamp <= endDate
    );
  }

  /**
   * Mendapatkan jumlah entries
   */
  get count(): number {
    return this.entries.length;
  }

  /**
   * Cek apakah audit trail kosong
   */
  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  // ============================================
  // Serialization
  // ============================================

  toJSON(): AuditEntry[] {
    return this.entries.map(entry => ({
      ...entry,
      timestamp: entry.timestamp,
    }));
  }

  static fromJSON(json: AuditEntry[]): AuditTrail {
    return new AuditTrail(
      json.map(entry => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      }))
    );
  }

  /**
   * Format untuk laporan audit
   */
  toReport(): string {
    const lines = this.entries.map(entry => {
      const timestamp = entry.timestamp.toISOString();
      const details = JSON.stringify(entry.details);
      return `[${timestamp}] ${entry.action} by ${entry.performedBy}: ${details}`;
    });
    return lines.join('\n');
  }
}
