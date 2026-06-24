import { describe, it, expect } from 'vitest';
import {
  createMatchSchema,
  updatePeriodScoreSchema,
  registerLineupSchema,
  substitutionSchema,
  rotateTeamSchema,
  listMatchesSchema,
  periodParamsSchema,
} from './matches.schema.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const VALID_UUID_1 = '550e8400-e29b-41d4-a716-446655440001';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const VALID_UUID_3 = '550e8400-e29b-41d4-a716-446655440003';

// ── createMatchSchema ───────────────────────────────────────────────────────

describe('createMatchSchema', () => {
  it('accepts valid match creation data', () => {
    const data = {
      phaseId: VALID_UUID_1,
      homeTeamId: VALID_UUID_2,
      awayTeamId: VALID_UUID_3,
      scheduledAt: '2026-07-15T10:00:00+05:00',
    };
    const result = createMatchSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('accepts null scheduledAt', () => {
    const data = {
      phaseId: VALID_UUID_1,
      homeTeamId: VALID_UUID_2,
      awayTeamId: VALID_UUID_3,
      scheduledAt: null,
    };
    const result = createMatchSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('defaults scheduledAt to null when not provided', () => {
    const data = {
      phaseId: VALID_UUID_1,
      homeTeamId: VALID_UUID_2,
      awayTeamId: VALID_UUID_3,
    };
    const result = createMatchSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduledAt).toBeNull();
    }
  });

  it('rejects invalid UUID for phaseId', () => {
    const data = {
      phaseId: 'not-a-uuid',
      homeTeamId: VALID_UUID_2,
      awayTeamId: VALID_UUID_3,
    };
    const result = createMatchSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects same team for home and away', () => {
    const data = {
      phaseId: VALID_UUID_1,
      homeTeamId: VALID_UUID_2,
      awayTeamId: VALID_UUID_2,
    };
    const result = createMatchSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('homeTeamId and awayTeamId must be different teams');
    }
  });

  it('rejects missing required fields', () => {
    const result = createMatchSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid datetime format', () => {
    const data = {
      phaseId: VALID_UUID_1,
      homeTeamId: VALID_UUID_2,
      awayTeamId: VALID_UUID_3,
      scheduledAt: 'tomorrow',
    };
    const result = createMatchSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ── updatePeriodScoreSchema ─────────────────────────────────────────────────

describe('updatePeriodScoreSchema', () => {
  it('accepts valid scores', () => {
    const result = updatePeriodScoreSchema.safeParse({ homeScore: 25, awayScore: 20 });
    expect(result.success).toBe(true);
  });

  it('accepts zero scores', () => {
    const result = updatePeriodScoreSchema.safeParse({ homeScore: 0, awayScore: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects negative scores', () => {
    const result = updatePeriodScoreSchema.safeParse({ homeScore: -1, awayScore: 5 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer scores', () => {
    const result = updatePeriodScoreSchema.safeParse({ homeScore: 2.5, awayScore: 3 });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    const result = updatePeriodScoreSchema.safeParse({ homeScore: 10 });
    expect(result.success).toBe(false);
  });
});

// ── registerLineupSchema ────────────────────────────────────────────────────

describe('registerLineupSchema', () => {
  const validLineup = [
    { position: 1, playerId: '550e8400-e29b-41d4-a716-446655440010' },
    { position: 2, playerId: '550e8400-e29b-41d4-a716-446655440011' },
    { position: 3, playerId: '550e8400-e29b-41d4-a716-446655440012' },
    { position: 4, playerId: '550e8400-e29b-41d4-a716-446655440013' },
    { position: 5, playerId: '550e8400-e29b-41d4-a716-446655440014' },
    { position: 6, playerId: '550e8400-e29b-41d4-a716-446655440015' },
  ];

  it('accepts valid lineup with 6 unique positions and players', () => {
    const data = { teamId: VALID_UUID_1, setNumber: 1, lineup: validLineup };
    const result = registerLineupSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('rejects lineup with fewer than 6 players', () => {
    const data = { teamId: VALID_UUID_1, setNumber: 1, lineup: validLineup.slice(0, 5) };
    const result = registerLineupSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects lineup with more than 6 players', () => {
    const extraPlayer = { position: 1 as const, playerId: '550e8400-e29b-41d4-a716-446655440099' };
    const data = { teamId: VALID_UUID_1, setNumber: 1, lineup: [...validLineup, extraPlayer] };
    const result = registerLineupSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate positions', () => {
    const duplicatePos = validLineup.map((s, i) => i === 5 ? { ...s, position: 1 } : s);
    const data = { teamId: VALID_UUID_1, setNumber: 1, lineup: duplicatePos };
    const result = registerLineupSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes('position'))).toBe(true);
    }
  });

  it('rejects duplicate players', () => {
    const duplicatePlayer = validLineup.map((s, i) =>
      i === 5 ? { ...s, playerId: validLineup[0].playerId } : s,
    );
    const data = { teamId: VALID_UUID_1, setNumber: 1, lineup: duplicatePlayer };
    const result = registerLineupSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes('different'))).toBe(true);
    }
  });

  it('rejects position outside 1-6 range', () => {
    const invalidPos = validLineup.map((s, i) => i === 0 ? { ...s, position: 7 } : s);
    const data = { teamId: VALID_UUID_1, setNumber: 1, lineup: invalidPos };
    const result = registerLineupSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects setNumber less than 1', () => {
    const data = { teamId: VALID_UUID_1, setNumber: 0, lineup: validLineup };
    const result = registerLineupSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ── substitutionSchema ──────────────────────────────────────────────────────

describe('substitutionSchema', () => {
  it('accepts valid substitution', () => {
    const data = {
      teamId: VALID_UUID_1,
      periodNumber: 1,
      playerOutId: VALID_UUID_2,
      playerInId: VALID_UUID_3,
      minute: 35,
    };
    const result = substitutionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('accepts null minute', () => {
    const data = {
      teamId: VALID_UUID_1,
      periodNumber: 1,
      playerOutId: VALID_UUID_2,
      playerInId: VALID_UUID_3,
      minute: null,
    };
    const result = substitutionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('defaults minute to null when not provided', () => {
    const data = {
      teamId: VALID_UUID_1,
      periodNumber: 1,
      playerOutId: VALID_UUID_2,
      playerInId: VALID_UUID_3,
    };
    const result = substitutionSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minute).toBeNull();
    }
  });

  it('rejects same player in and out', () => {
    const data = {
      teamId: VALID_UUID_1,
      periodNumber: 1,
      playerOutId: VALID_UUID_2,
      playerInId: VALID_UUID_2,
    };
    const result = substitutionSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('playerOutId and playerInId must be different');
    }
  });

  it('rejects negative minute', () => {
    const data = {
      teamId: VALID_UUID_1,
      periodNumber: 1,
      playerOutId: VALID_UUID_2,
      playerInId: VALID_UUID_3,
      minute: -5,
    };
    const result = substitutionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects periodNumber less than 1', () => {
    const data = {
      teamId: VALID_UUID_1,
      periodNumber: 0,
      playerOutId: VALID_UUID_2,
      playerInId: VALID_UUID_3,
    };
    const result = substitutionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ── rotateTeamSchema ────────────────────────────────────────────────────────

describe('rotateTeamSchema', () => {
  it('accepts valid rotation data', () => {
    const result = rotateTeamSchema.safeParse({ teamId: VALID_UUID_1, setNumber: 2 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid teamId', () => {
    const result = rotateTeamSchema.safeParse({ teamId: 'bad', setNumber: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects setNumber less than 1', () => {
    const result = rotateTeamSchema.safeParse({ teamId: VALID_UUID_1, setNumber: 0 });
    expect(result.success).toBe(false);
  });
});

// ── listMatchesSchema ───────────────────────────────────────────────────────

describe('listMatchesSchema', () => {
  it('accepts empty query (all optional)', () => {
    const result = listMatchesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid filters', () => {
    const data = { phaseId: VALID_UUID_1, status: 'in_progress' };
    const result = listMatchesSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = listMatchesSchema.safeParse({ status: 'cancelled' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for phaseId', () => {
    const result = listMatchesSchema.safeParse({ phaseId: 'not-uuid' });
    expect(result.success).toBe(false);
  });
});

// ── periodParamsSchema ──────────────────────────────────────────────────────

describe('periodParamsSchema', () => {
  it('accepts valid id and periodNumber', () => {
    const result = periodParamsSchema.safeParse({ id: VALID_UUID_1, periodNumber: '3' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.periodNumber).toBe(3);
    }
  });

  it('coerces string periodNumber to number', () => {
    const result = periodParamsSchema.safeParse({ id: VALID_UUID_1, periodNumber: '5' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.periodNumber).toBe(5);
    }
  });

  it('rejects periodNumber less than 1', () => {
    const result = periodParamsSchema.safeParse({ id: VALID_UUID_1, periodNumber: '0' });
    expect(result.success).toBe(false);
  });
});
