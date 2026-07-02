import { describe, it, expect } from 'vitest';
import { createPaymentSchema, updatePaymentSchema, paymentIdSchema, paymentQuerySchema } from './payments.schema.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440001';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';

describe('createPaymentSchema', () => {
  it('accepts valid payment data', () => {
    const data = {
      tournamentId: VALID_UUID,
      teamId: VALID_UUID_2,
      amount: '150000',
      currency: 'COP',
      paymentMethod: 'transfer',
      reference: 'REF-001',
      notes: 'Paid via Nequi',
    };
    const result = createPaymentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('accepts minimal data (tournamentId, teamId, amount)', () => {
    const data = { tournamentId: VALID_UUID, teamId: VALID_UUID_2, amount: '50000' };
    const result = createPaymentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('accepts amount with decimals', () => {
    const data = { tournamentId: VALID_UUID, teamId: VALID_UUID_2, amount: '150000.50' };
    const result = createPaymentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('rejects missing tournamentId', () => {
    const result = createPaymentSchema.safeParse({ teamId: VALID_UUID, amount: '100' });
    expect(result.success).toBe(false);
  });

  it('rejects missing teamId', () => {
    const result = createPaymentSchema.safeParse({ tournamentId: VALID_UUID, amount: '100' });
    expect(result.success).toBe(false);
  });

  it('rejects missing amount', () => {
    const result = createPaymentSchema.safeParse({ tournamentId: VALID_UUID, teamId: VALID_UUID_2 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid amount format (letters)', () => {
    const result = createPaymentSchema.safeParse({ tournamentId: VALID_UUID, teamId: VALID_UUID_2, amount: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for tournamentId', () => {
    const result = createPaymentSchema.safeParse({ tournamentId: 'bad', teamId: VALID_UUID_2, amount: '100' });
    expect(result.success).toBe(false);
  });

  it('rejects currency not exactly 3 chars', () => {
    const result = createPaymentSchema.safeParse({ tournamentId: VALID_UUID, teamId: VALID_UUID_2, amount: '100', currency: 'LONG' });
    expect(result.success).toBe(false);
  });
});

describe('updatePaymentSchema', () => {
  it('accepts partial update with amount', () => {
    const result = updatePaymentSchema.safeParse({ amount: '200000' });
    expect(result.success).toBe(true);
  });

  it('accepts status change', () => {
    const result = updatePaymentSchema.safeParse({ status: 'refunded' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updatePaymentSchema.safeParse({ status: 'cancelled' });
    expect(result.success).toBe(false);
  });

  it('rejects empty object', () => {
    const result = updatePaymentSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('paymentIdSchema', () => {
  it('accepts valid UUID', () => {
    const result = paymentIdSchema.safeParse({ id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = paymentIdSchema.safeParse({ id: 'not-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('paymentQuerySchema', () => {
  it('accepts empty query', () => {
    const result = paymentQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts all filters', () => {
    const result = paymentQuerySchema.safeParse({ tournamentId: VALID_UUID, teamId: VALID_UUID_2, status: 'pending' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status filter', () => {
    const result = paymentQuerySchema.safeParse({ status: 'invalid' });
    expect(result.success).toBe(false);
  });
});
