import { describe, expect, it, vi } from 'vitest';
import { fallback, flow, maybe, result, retry, timeout } from '../../src/flow.js';
import type { Result } from '../../src/types.js';

describe('C.2 Error Handling Patterns', () => {
  describe('Try-Catch Pattern', () => {
    it('should handle errors within flow', async () => {
      const riskyFlow = flow(async (x: number) => {
        if (x < 0) throw new Error('Negative number');
        return Math.sqrt(x);
      });

      const safeFlow = flow(async (x: number) => {
        try {
          return await riskyFlow(x);
        } catch (error) {
          return 0; // default value on error
        }
      });

      expect(await safeFlow(9)).toBe(3);
      expect(await safeFlow(-1)).toBe(0);
    });

    it('should propagate specific errors', async () => {
      class AuthError extends Error {}
      class ValidationError extends Error {}

      const authFlow = flow(async (token: string) => {
        if (!token) throw new AuthError('No token');
        if (token === 'invalid') throw new ValidationError('Invalid token');
        return { userId: 123 };
      });

      const handleAuth = flow(async (token: string) => {
        try {
          return await authFlow(token);
        } catch (error) {
          if (error instanceof AuthError) {
            return { userId: 0, guest: true };
          }
          throw error; // re-throw other errors
        }
      });

      expect(await handleAuth('')).toEqual({ userId: 0, guest: true });
      await expect(handleAuth('invalid')).rejects.toThrow(ValidationError);
      expect(await handleAuth('valid')).toEqual({ userId: 123 });
    });
  });

  describe('Result Pattern', () => {
    it('should wrap success and failure in Result type', async () => {
      const divide = flow((input: { a: number; b: number }): Result<number, string> => {
        if (input.b === 0) {
          return { ok: false, error: 'Division by zero' };
        }
        return { ok: true, value: input.a / input.b };
      });

      const resultFlow = result(divide);

      const success = await resultFlow({ ok: true, value: { a: 10, b: 2 } });
      expect(success).toEqual({ ok: true, value: { ok: true, value: 5 } });

      const failure = await resultFlow({ ok: true, value: { a: 10, b: 0 } });
      expect(failure).toEqual({ ok: true, value: { ok: false, error: 'Division by zero' } });
    });

    it('should chain Result operations', async () => {
      const parseNumber = flow((s: string): Result<number, string> => {
        const n = parseFloat(s);
        if (isNaN(n)) return { ok: false, error: 'Not a number' };
        return { ok: true, value: n };
      });

      const double = flow((n: number): Result<number, string> => {
        return { ok: true, value: n * 2 };
      });

      const chain = flow(async (s: string) => {
        const parsed = await parseNumber(s);
        if (!parsed.ok) return parsed;
        return await double(parsed.value);
      });

      expect(await chain('5')).toEqual({ ok: true, value: 10 });
      expect(await chain('abc')).toEqual({ ok: false, error: 'Not a number' });
    });

    it('should handle async Result operations', async () => {
      const fetchUser = flow(
        async (id: number): Promise<Result<{ id: number; name: string }, string>> => {
          if (id < 0) return { ok: false, error: 'Invalid ID' };
          // Simulate API call
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { ok: true, value: { id, name: `User${id}` } };
        },
      );

      const getUserName = flow(
        async (id: number): Promise<Result<string, string>> => {
          const userResult = await fetchUser(id);
          if (!userResult.ok) return userResult;
          return { ok: true, value: userResult.value.name };
        },
      );

      expect(await getUserName(42)).toEqual({ ok: true, value: 'User42' });
      expect(await getUserName(-1)).toEqual({ ok: false, error: 'Invalid ID' });
    });
  });

  describe('Retry Pattern', () => {
    it('should retry on failure with exponential backoff', async () => {
      let attempts = 0;
      const flakeyFlow = flow(async (x: number) => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return x * 2;
      });

      const retryFlow = retry(flakeyFlow, 3, 10);
      const result = await retryFlow(5);

      expect(result).toBe(10);
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      let attempts = 0;
      const alwaysFailFlow = flow(async (x: number) => {
        attempts++;
        throw new Error(`Attempt ${attempts} failed`);
      });

      const retryFlow = retry(alwaysFailFlow, 3, 10);

      await expect(retryFlow(5)).rejects.toThrow('Attempt 4 failed');
      expect(attempts).toBe(4); // initial + 3 retries
    });

    it('should support custom retry logic', async () => {
      let attempts = 0;

      const retryWithBackoff = <In, Out>(
        targetFlow: Flow<In, Out>,
        maxRetries: number,
        shouldRetry?: (error: Error, attempt: number) => boolean,
      ): Flow<In, Out> => {
        return flow(async (input: In) => {
          let lastError: Error;
          for (let i = 0; i <= maxRetries; i++) {
            try {
              return await targetFlow(input);
            } catch (error) {
              lastError = error as Error;
              if (i < maxRetries && (!shouldRetry || shouldRetry(lastError, i))) {
                const delay = Math.pow(2, i) * 100; // exponential backoff
                await new Promise((resolve) => setTimeout(resolve, delay));
              } else {
                throw lastError;
              }
            }
          }
          throw lastError!;
        });
      };

      const networkFlow = flow(async (url: string) => {
        attempts++;
        if (attempts < 2) throw new Error('Network timeout');
        if (attempts < 3) throw new Error('Server error');
        return `Response from ${url}`;
      });

      const shouldRetry = (error: Error, attempt: number) => {
        return error.message === 'Network timeout' || (error.message === 'Server error' && attempt < 2);
      };

      const robustFlow = retryWithBackoff(networkFlow, 3, shouldRetry);
      const result = await robustFlow('https://api.example.com');

      expect(result).toBe('Response from https://api.example.com');
      expect(attempts).toBe(3);
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should open circuit after threshold failures', async () => {
      const createCircuitBreaker = <In, Out>(
        targetFlow: Flow<In, Out>,
        options: {
          failureThreshold: number;
          resetTimeout: number;
          halfOpenRequests: number;
        },
      ): Flow<In, Out> => {
        let failureCount = 0;
        let lastFailureTime = 0;
        let state: 'closed' | 'open' | 'half-open' = 'closed';
        let halfOpenAttempts = 0;

        return flow(async (input: In) => {
          const now = Date.now();

          // Check if circuit should be reset
          if (state === 'open' && now - lastFailureTime > options.resetTimeout) {
            state = 'half-open';
            halfOpenAttempts = 0;
          }

          if (state === 'open') {
            throw new Error('Circuit breaker is open');
          }

          try {
            const result = await targetFlow(input);

            // Success in half-open state closes the circuit
            if (state === 'half-open') {
              halfOpenAttempts++;
              if (halfOpenAttempts >= options.halfOpenRequests) {
                state = 'closed';
                failureCount = 0;
              }
            } else if (state === 'closed') {
              failureCount = Math.max(0, failureCount - 1);
            }

            return result;
          } catch (error) {
            failureCount++;
            lastFailureTime = now;

            if (failureCount >= options.failureThreshold) {
              state = 'open';
            }

            throw error;
          }
        });
      };

      let callCount = 0;
      const unreliableService = flow(async (x: number) => {
        callCount++;
        if (callCount <= 3) {
          throw new Error('Service unavailable');
        }
        return x * 2;
      });

      const protectedFlow = createCircuitBreaker(unreliableService, {
        failureThreshold: 3,
        resetTimeout: 100,
        halfOpenRequests: 1,
      });

      // First 3 calls fail and open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(protectedFlow(5)).rejects.toThrow('Service unavailable');
      }

      // Circuit is now open
      await expect(protectedFlow(5)).rejects.toThrow('Circuit breaker is open');
      expect(callCount).toBe(3); // No additional calls made

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Circuit is half-open, next call succeeds and closes circuit
      const result = await protectedFlow(5);
      expect(result).toBe(10);
      expect(callCount).toBe(4);
    });
  });

  describe('Timeout Pattern', () => {
    it('should timeout long-running operations', async () => {
      const slowFlow = flow(
        async (x: number) =>
          new Promise<number>((resolve) => setTimeout(() => resolve(x * 2), 200)),
      );

      const timeoutFlow = timeout(slowFlow, 100);

      await expect(timeoutFlow(5)).rejects.toThrow('Timeout');
    });

    it('should complete before timeout', async () => {
      const fastFlow = flow(
        async (x: number) =>
          new Promise<number>((resolve) => setTimeout(() => resolve(x * 2), 50)),
      );

      const timeoutFlow = timeout(fastFlow, 100);
      const result = await timeoutFlow(5);
      expect(result).toBe(10);
    });
  });

  describe('Maybe Pattern', () => {
    it('should handle nullable values', async () => {
      const divide = flow((x: number) => (x === 0 ? null : 10 / x));
      const maybeFlow = maybe(divide);

      expect(await maybeFlow(2)).toBe(5);
      expect(await maybeFlow(null)).toBe(null);
      expect(await maybeFlow(undefined)).toBe(undefined);
    });

    it('should chain Maybe operations', async () => {
      const safeDivide = flow((x: number | null | undefined) => {
        if (x === null || x === undefined || x === 0) return null;
        return 10 / x;
      });

      const safeDouble = flow((x: number | null | undefined) => {
        if (x === null || x === undefined) return null;
        return x * 2;
      });

      const maybeDivide = maybe(safeDivide);
      const maybeDouble = maybe(safeDouble);

      const chain = flow(async (x: number | null | undefined) => {
        const divided = await maybeDivide(x);
        return await maybeDouble(divided);
      });

      expect(await chain(2)).toBe(10); // (10/2) * 2 = 10
      expect(await chain(0)).toBe(null);
      expect(await chain(null)).toBe(null);
    });
  });

  describe('Fallback Pattern', () => {
    it('should cascade through multiple fallbacks', async () => {
      const primary = flow((x: number) => {
        if (x < 10) throw new Error('Too small for primary');
        return `primary: ${x}`;
      });

      const secondary = flow((x: number) => {
        if (x < 5) throw new Error('Too small for secondary');
        return `secondary: ${x}`;
      });

      const tertiary = flow((x: number) => `tertiary: ${x}`);

      // Chain fallbacks
      const cascadeFlow = fallback(fallback(primary, secondary), tertiary);

      expect(await cascadeFlow(15)).toBe('primary: 15');
      expect(await cascadeFlow(7)).toBe('secondary: 7');
      expect(await cascadeFlow(2)).toBe('tertiary: 2');
    });

    it('should handle async fallbacks', async () => {
      const fetchFromPrimary = flow(async (id: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (id < 100) throw new Error('Not in primary');
        return { id, source: 'primary' };
      });

      const fetchFromCache = flow(async (id: number) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id, source: 'cache' };
      });

      const resilientFetch = fallback(fetchFromPrimary, fetchFromCache);

      expect(await resilientFetch(200)).toEqual({ id: 200, source: 'primary' });
      expect(await resilientFetch(50)).toEqual({ id: 50, source: 'cache' });
    });
  });
});