import { Pool } from 'pg';
import { NotFoundError } from '@tournament/shared';
import { PaymentRow, Payment, CreatePaymentInput, UpdatePaymentInput, mapPaymentRow } from './payments.types.js';

/**
 * Payments repository — parameterized queries only.
 */
export class PaymentsRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(tournamentId?: string, teamId?: string, status?: string): Promise<Payment[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (tournamentId) {
      conditions.push(`tournament_id = $${idx}`);
      values.push(tournamentId);
      idx++;
    }
    if (teamId) {
      conditions.push(`team_id = $${idx}`);
      values.push(teamId);
      idx++;
    }
    if (status) {
      conditions.push(`status = $${idx}`);
      values.push(status);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query<PaymentRow>(
      `SELECT * FROM payments ${where} ORDER BY created_at DESC`,
      values,
    );
    return result.rows.map(mapPaymentRow);
  }

  async findById(id: string): Promise<Payment> {
    const result = await this.pool.query<PaymentRow>(
      `SELECT * FROM payments WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundError('Payment', id);
    return mapPaymentRow(result.rows[0]);
  }

  async create(input: CreatePaymentInput): Promise<Payment> {
    const result = await this.pool.query<PaymentRow>(
      `INSERT INTO payments (tournament_id, team_id, amount, currency, payment_method, reference, notes, status, recorded_by, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [input.tournamentId, input.teamId, input.amount, input.currency, input.paymentMethod, input.reference, input.notes, input.status, input.recordedBy, input.paidAt],
    );
    return mapPaymentRow(result.rows[0]);
  }

  async update(id: string, input: UpdatePaymentInput): Promise<Payment> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      amount: 'amount', currency: 'currency', paymentMethod: 'payment_method',
      reference: 'reference', notes: 'notes', status: 'status', paidAt: 'paid_at',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if (key in input && (input as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = $${idx}`);
        values.push((input as Record<string, unknown>)[key]);
        idx++;
      }
    }

    values.push(id);
    const result = await this.pool.query<PaymentRow>(
      `UPDATE payments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (result.rowCount === 0) throw new NotFoundError('Payment', id);
    return mapPaymentRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    const result = await this.pool.query(`DELETE FROM payments WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError('Payment', id);
  }
}
