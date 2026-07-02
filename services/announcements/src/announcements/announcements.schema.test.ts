import { describe, it, expect } from 'vitest';
import { createAnnouncementSchema, updateAnnouncementSchema, announcementIdSchema, announcementQuerySchema } from './announcements.schema.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440001';

describe('createAnnouncementSchema', () => {
  it('accepts valid announcement data', () => {
    const data = {
      tournamentId: VALID_UUID,
      title: 'Cambio de horario',
      content: 'El partido se reprograma para las 3pm.',
      priority: 'high',
      isPinned: true,
    };
    const result = createAnnouncementSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('accepts minimal data (tournamentId, title, content)', () => {
    const data = { tournamentId: VALID_UUID, title: 'Test', content: 'Content here' };
    const result = createAnnouncementSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('normal');
      expect(result.data.isPinned).toBe(false);
    }
  });

  it('rejects missing tournamentId', () => {
    const result = createAnnouncementSchema.safeParse({ title: 'Test', content: 'Body' });
    expect(result.success).toBe(false);
  });

  it('rejects missing title', () => {
    const result = createAnnouncementSchema.safeParse({ tournamentId: VALID_UUID, content: 'Body' });
    expect(result.success).toBe(false);
  });

  it('rejects missing content', () => {
    const result = createAnnouncementSchema.safeParse({ tournamentId: VALID_UUID, title: 'Title' });
    expect(result.success).toBe(false);
  });

  it('rejects title shorter than 2 chars', () => {
    const result = createAnnouncementSchema.safeParse({ tournamentId: VALID_UUID, title: 'A', content: 'Body' });
    expect(result.success).toBe(false);
  });

  it('rejects title longer than 200 chars', () => {
    const result = createAnnouncementSchema.safeParse({ tournamentId: VALID_UUID, title: 'X'.repeat(201), content: 'Body' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid priority value', () => {
    const result = createAnnouncementSchema.safeParse({ tournamentId: VALID_UUID, title: 'Test', content: 'Body', priority: 'critical' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid priorities', () => {
    for (const priority of ['low', 'normal', 'high', 'urgent']) {
      const result = createAnnouncementSchema.safeParse({ tournamentId: VALID_UUID, title: 'Test', content: 'Body', priority });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid UUID for tournamentId', () => {
    const result = createAnnouncementSchema.safeParse({ tournamentId: 'bad-id', title: 'Test', content: 'Body' });
    expect(result.success).toBe(false);
  });
});

describe('updateAnnouncementSchema', () => {
  it('accepts partial update with title', () => {
    const result = updateAnnouncementSchema.safeParse({ title: 'Updated Title' });
    expect(result.success).toBe(true);
  });

  it('accepts priority change', () => {
    const result = updateAnnouncementSchema.safeParse({ priority: 'urgent' });
    expect(result.success).toBe(true);
  });

  it('accepts isPinned change', () => {
    const result = updateAnnouncementSchema.safeParse({ isPinned: true });
    expect(result.success).toBe(true);
  });

  it('rejects empty object', () => {
    const result = updateAnnouncementSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid priority', () => {
    const result = updateAnnouncementSchema.safeParse({ priority: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('announcementIdSchema', () => {
  it('accepts valid UUID', () => {
    const result = announcementIdSchema.safeParse({ id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = announcementIdSchema.safeParse({ id: 'not-valid' });
    expect(result.success).toBe(false);
  });
});

describe('announcementQuerySchema', () => {
  it('accepts empty query', () => {
    const result = announcementQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts tournamentId filter', () => {
    const result = announcementQuerySchema.safeParse({ tournamentId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('accepts priority filter', () => {
    const result = announcementQuerySchema.safeParse({ priority: 'urgent' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid priority filter', () => {
    const result = announcementQuerySchema.safeParse({ priority: 'critical' });
    expect(result.success).toBe(false);
  });
});
