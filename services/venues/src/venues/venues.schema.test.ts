import { describe, it, expect } from 'vitest';
import { createVenueSchema, updateVenueSchema, venueIdSchema, venueQuerySchema } from './venues.schema.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440001';

describe('createVenueSchema', () => {
  it('accepts valid venue data with all fields', () => {
    const data = {
      tournamentId: VALID_UUID,
      name: 'Coliseo Municipal',
      address: 'Calle 10 # 5-20',
      locationUrl: 'https://maps.google.com/test',
      capacity: 500,
      surfaceType: 'synthetic',
    };
    const result = createVenueSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('accepts minimal venue data (only name)', () => {
    const data = { name: 'Cancha 1' };
    const result = createVenueSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tournamentId).toBeNull();
      expect(result.data.address).toBeNull();
      expect(result.data.capacity).toBeNull();
    }
  });

  it('rejects name shorter than 2 chars', () => {
    const result = createVenueSchema.safeParse({ name: 'A' });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 200 chars', () => {
    const result = createVenueSchema.safeParse({ name: 'X'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = createVenueSchema.safeParse({ address: 'Some address' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid tournamentId (non-UUID)', () => {
    const result = createVenueSchema.safeParse({ name: 'Cancha', tournamentId: 'bad-id' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid locationUrl (not a URL)', () => {
    const result = createVenueSchema.safeParse({ name: 'Cancha', locationUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects capacity less than 1', () => {
    const result = createVenueSchema.safeParse({ name: 'Cancha', capacity: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer capacity', () => {
    const result = createVenueSchema.safeParse({ name: 'Cancha', capacity: 5.5 });
    expect(result.success).toBe(false);
  });

  it('trims whitespace from name', () => {
    const result = createVenueSchema.safeParse({ name: '  Cancha Norte  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Cancha Norte');
  });
});

describe('updateVenueSchema', () => {
  it('accepts partial update with name only', () => {
    const result = updateVenueSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts isActive boolean', () => {
    const result = updateVenueSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it('rejects empty object (no fields)', () => {
    const result = updateVenueSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts null for nullable fields', () => {
    const result = updateVenueSchema.safeParse({ address: null, capacity: null });
    expect(result.success).toBe(true);
  });
});

describe('venueIdSchema', () => {
  it('accepts valid UUID', () => {
    const result = venueIdSchema.safeParse({ id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = venueIdSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('venueQuerySchema', () => {
  it('accepts empty query', () => {
    const result = venueQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid tournamentId filter', () => {
    const result = venueQuerySchema.safeParse({ tournamentId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('accepts search string', () => {
    const result = venueQuerySchema.safeParse({ search: 'coliseo' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID for tournamentId', () => {
    const result = venueQuerySchema.safeParse({ tournamentId: 'bad' });
    expect(result.success).toBe(false);
  });
});
