import { Pool } from 'pg';

/**
 * Audit action types.
 */
export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Parameters for recording an audit log entry.
 */
export interface AuditEntry {
  tableName:   string;
  recordId:    string;
  action:      AuditAction;
  performedBy: string | null;
  oldData?:    Record<string, unknown> | null;
  newData?:    Record<string, unknown> | null;
  metadata?:   Record<string, unknown> | null;
}

/**
 * Audit service — records changes to critical tables in the audit_log table.
 *
 * Usage:
 *   const audit = new AuditService(pool);
 *   await audit.log({
 *     tableName: 'tournaments',
 *     recordId: tournament.id,
 *     action: 'UPDATE',
 *     performedBy: req.user.sub,
 *     oldData: previousTournament,
 *     newData: updatedTournament,
 *   });
 *
 * Audit logging is non-blocking: failures are logged but don't break the operation.
 */
export class AuditService {
  constructor(private readonly pool: Pool) {}

  /**
   * Records an audit log entry.
   * Non-critical: swallows errors silently to avoid blocking business operations.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO audit_log (table_name, record_id, action, performed_by, old_data, new_data, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.tableName,
          entry.recordId,
          entry.action,
          entry.performedBy,
          entry.oldData ? JSON.stringify(entry.oldData) : null,
          entry.newData ? JSON.stringify(entry.newData) : null,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
        ],
      );
    } catch {
      // Non-critical: audit failure should not break the operation
    }
  }

  /**
   * Records multiple audit entries in a batch.
   */
  async logBatch(entries: AuditEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.log(entry);
    }
  }
}
