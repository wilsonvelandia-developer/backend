import { describe, it, expect, beforeEach } from 'vitest';
import {
  isLockedOut,
  recordFailedAttempt,
  resetAttempts,
} from './login-rate-limit.middleware.js';

describe('Login Rate Limit — Brute-force protection', () => {
  const email = 'test@example.com';

  beforeEach(() => {
    // Reset state between tests
    resetAttempts(email);
  });

  describe('recordFailedAttempt', () => {
    it('should return false for the first failed attempt', () => {
      const locked = recordFailedAttempt(email);
      expect(locked).toBe(false);
    });

    it('should return false for attempts below threshold (5)', () => {
      for (let i = 0; i < 4; i++) {
        expect(recordFailedAttempt(email)).toBe(false);
      }
    });

    it('should return true and lock account on 5th failed attempt', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt(email);
      }
      const locked = recordFailedAttempt(email);
      expect(locked).toBe(true);
    });

    it('should be case-insensitive for email', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt('User@Example.COM');
      }
      const locked = recordFailedAttempt('user@example.com');
      expect(locked).toBe(true);
    });
  });

  describe('isLockedOut', () => {
    it('should return 0 when no attempts have been made', () => {
      expect(isLockedOut(email)).toBe(0);
    });

    it('should return 0 when below threshold', () => {
      recordFailedAttempt(email);
      recordFailedAttempt(email);
      expect(isLockedOut(email)).toBe(0);
    });

    it('should return remaining lockout seconds after being locked', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(email);
      }
      const remaining = isLockedOut(email);
      // Should be close to 15 minutes (900 seconds)
      expect(remaining).toBeGreaterThan(890);
      expect(remaining).toBeLessThanOrEqual(900);
    });

    it('should be case-insensitive', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('Test@Example.com');
      }
      expect(isLockedOut('test@example.com')).toBeGreaterThan(0);
    });
  });

  describe('resetAttempts', () => {
    it('should clear failed attempts counter', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt(email);
      }
      resetAttempts(email);
      // After reset, next failure should be treated as first attempt
      expect(recordFailedAttempt(email)).toBe(false);
    });

    it('should unlock a locked account', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(email);
      }
      expect(isLockedOut(email)).toBeGreaterThan(0);
      resetAttempts(email);
      expect(isLockedOut(email)).toBe(0);
    });

    it('should be case-insensitive', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('TEST@example.com');
      }
      resetAttempts('test@EXAMPLE.COM');
      expect(isLockedOut('test@example.com')).toBe(0);
    });
  });
});
