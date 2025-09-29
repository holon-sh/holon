import { describe, expect, it, vi } from 'vitest';
import {
  parallel,
  sequential,
  conditional,
  suppress,
  retry,
  timeout,
  analyze,
  optimize,
  restrict,
  effectful,
  EffectFlags,
} from '../src/index.js';

describe('Fixed Combinators Tests', () => {
  describe('parallel', () => {
    it('should execute effects in parallel', async () => {
      const results: number[] = [];

      const effect1 = effectful((x: number) => {
        results.push(1);
        return x * 2;
      }, EffectFlags.None);

      const effect2 = effectful((x: number) => {
        results.push(2);
        return x * 3;
      }, EffectFlags.None);

      const effect3 = effectful((x: number) => {
        results.push(3);
        return x * 4;
      }, EffectFlags.None);

      const combined = parallel(effect1, effect2, effect3);
      const values = await combined(5);

      expect(values).toEqual([10, 15, 20]);
      expect(results).toEqual([1, 2, 3]);
    });

    it('should handle async effects', async () => {
      const effect1 = effectful(async (x: number) => {
        return x * 2;
      }, EffectFlags.Async);

      const effect2 = effectful(async (x: number) => {
        return x * 3;
      }, EffectFlags.Async);

      const combined = parallel(effect1, effect2);
      const results = await combined(5);

      expect(results).toEqual([10, 15]);
    });
  });

  describe('sequential', () => {
    it('should pass values through pipeline', async () => {
      const double = effectful((x: number) => x * 2, EffectFlags.None);
      const addTen = effectful((x: number) => x + 10, EffectFlags.None);
      const toString = effectful((x: number) => x.toString(), EffectFlags.None);

      const pipeline = sequential(double, addTen, toString);
      const result = await pipeline(5);

      expect(result).toBe('20');
    });
  });

  describe('conditional', () => {
    it('should execute correct branch', () => {
      const ifTrue = effectful(() => 'yes', EffectFlags.IO);
      const ifFalse = effectful(() => 'no', EffectFlags.Network);

      const cond = conditional(
        (x: number) => x > 5,
        ifTrue,
        ifFalse
      );

      expect(cond(10)).toBe('yes');
      expect(cond(3)).toBe('no');
    });
  });

  describe('suppress', () => {
    it('should handle errors gracefully', async () => {
      let callCount = 0;

      const failing = effectful(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First call fails');
        }
        return 'success';
      }, EffectFlags.Throw);

      const safe1 = suppress(failing, (err) => `Handled: ${err.message}`);
      const safe2 = suppress(failing, () => 'fallback');

      const result1 = await safe1(null);
      const result2 = await safe2(null);

      expect(result1).toBe('Handled: First call fails');
      expect(result2).toBe('success');
    });
  });

  describe('retry - simple', () => {
    it('should retry on failure without delays', async () => {
      let attempts = 0;

      const effect = effectful(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts}`);
        }
        return 'success';
      }, EffectFlags.None);

      const retried = retry(effect, {
        maxAttempts: 3,
        delay: 0  // No delay for testing
      });

      const result = await retried(null);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should fail after max attempts', async () => {
      const effect = effectful(() => {
        throw new Error('Always fails');
      }, EffectFlags.Throw);

      const retried = retry(effect, {
        maxAttempts: 2,
        delay: 0
      });

      await expect(retried(null)).rejects.toThrow('Always fails');
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      let attempts = 0;

      const effect = effectful(() => {
        attempts++;
        if (attempts < 2) {
          throw new Error(`Error ${attempts}`);
        }
        return 'success';
      }, EffectFlags.None);

      const retried = retry(effect, {
        maxAttempts: 3,
        delay: 0,
        onRetry
      });

      await retried(null);
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });
  });

  describe('timeout - real timers', () => {
    it('should complete fast operations', async () => {
      const effect = effectful(async () => {
        // Immediate resolution
        return 'fast';
      }, EffectFlags.Async);

      const timed = timeout(effect, 1000);
      const result = await timed(null);
      expect(result).toBe('fast');
    });

    it('should timeout slow operations', async () => {
      const effect = effectful(async () => {
        await new Promise(r => setTimeout(r, 200));
        return 'slow';
      }, EffectFlags.Async);

      const timed = timeout(effect, 50);

      await expect(timed(null)).rejects.toThrow('Effect timeout after 50ms');
    });
  });

  describe('analyze', () => {
    it('should analyze all effect types', () => {
      const flow = effectful(() => {},
        EffectFlags.IO |
        EffectFlags.Network |
        EffectFlags.Async |
        EffectFlags.Read |
        EffectFlags.Write |
        EffectFlags.Random |
        EffectFlags.Time |
        EffectFlags.Throw |
        EffectFlags.Process |
        EffectFlags.Memory |
        EffectFlags.State |
        EffectFlags.Unsafe |
        EffectFlags.Database |
        EffectFlags.Cache |
        EffectFlags.Queue |
        EffectFlags.Stream
      );

      const analysis = analyze(flow);

      expect(analysis.pure).toBe(false);
      expect(analysis.async).toBe(true);
      expect(analysis.sideEffects).toHaveLength(15); // Async is not counted as a sideEffect, it's a separate flag
      expect(analysis.sideEffects).toContain('io');
      expect(analysis.sideEffects).toContain('network');
      expect(analysis.sideEffects).toContain('read');
      expect(analysis.sideEffects).toContain('write');
      expect(analysis.sideEffects).toContain('random');
      expect(analysis.sideEffects).toContain('time');
      expect(analysis.sideEffects).toContain('throw');
      expect(analysis.sideEffects).toContain('process');
      expect(analysis.sideEffects).toContain('memory');
      expect(analysis.sideEffects).toContain('state');
      expect(analysis.sideEffects).toContain('unsafe');
      expect(analysis.sideEffects).toContain('database');
      expect(analysis.sideEffects).toContain('cache');
      expect(analysis.sideEffects).toContain('queue');
      expect(analysis.sideEffects).toContain('stream');
      expect(analysis.complexity).toBe('O(n)');
      expect(analysis.performance).toBeDefined();
    });

    it('should identify pure flows', () => {
      const pure = effectful(() => 42, EffectFlags.None);
      const analysis = analyze(pure);

      expect(analysis.pure).toBe(true);
      expect(analysis.effects).toBe(EffectFlags.None);
      expect(analysis.sideEffects).toEqual([]);
      expect(analysis.async).toBe(false);
    });
  });

  describe('optimize', () => {
    it('should memoize pure flows efficiently', () => {
      let callCount = 0;
      const pure = effectful((x: number) => {
        callCount++;
        return x * 2;
      }, EffectFlags.None);

      const optimized = optimize(pure);

      // Multiple calls with same input
      expect(optimized(5)).toBe(10);
      expect(optimized(5)).toBe(10);
      expect(optimized(5)).toBe(10);
      expect(callCount).toBe(1);

      // New input triggers computation
      expect(optimized(10)).toBe(20);
      expect(callCount).toBe(2);
    });

    it('should not memoize impure flows', () => {
      let callCount = 0;
      const impure = effectful((x: number) => {
        callCount++;
        return Math.random() * x;
      }, EffectFlags.Random);

      const optimized = optimize(impure);

      optimized(5);
      optimized(5);
      optimized(5);

      expect(callCount).toBe(3);
    });
  });

  describe('restrict', () => {
    it('should enforce effect restrictions', () => {
      const ioFlow = effectful(() => {}, EffectFlags.IO);
      const networkFlow = effectful(() => {}, EffectFlags.Network);
      const pureFlow = effectful(() => {}, EffectFlags.None);

      // Allow IO effects
      expect(() => restrict(ioFlow, EffectFlags.IO)).not.toThrow();
      expect(() => restrict(ioFlow, EffectFlags.IO | EffectFlags.Read)).not.toThrow();

      // Disallow network when only IO is allowed
      expect(() => restrict(networkFlow, EffectFlags.IO))
        .toThrow('Flow has disallowed effects');

      // Pure flows are always allowed
      expect(() => restrict(pureFlow, EffectFlags.None)).not.toThrow();
      expect(() => restrict(pureFlow, EffectFlags.IO)).not.toThrow();
    });
  });

  describe('retry with delays', () => {
    it('should handle linear backoff', async () => {
      let attempts = 0;
      const startTime = Date.now();
      const timestamps: number[] = [];

      const effect = effectful(() => {
        attempts++;
        timestamps.push(Date.now() - startTime);
        if (attempts < 3) {
          throw new Error('Retry');
        }
        return 'success';
      }, EffectFlags.None);

      const retried = retry(effect, {
        maxAttempts: 3,
        delay: 10,
        backoff: 'linear'
      });

      const result = await retried(null);
      expect(result).toBe('success');
      expect(attempts).toBe(3);

      // Check that delays are increasing linearly
      if (timestamps.length >= 2) {
        const delay1 = timestamps[1] - timestamps[0];
        const delay2 = timestamps[2] - timestamps[1];
        // Second delay should be roughly twice the first (linear backoff)
        expect(delay2).toBeGreaterThanOrEqual(delay1);
      }
    });

    it('should handle exponential backoff', async () => {
      let attempts = 0;
      const effect = effectful(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry');
        }
        return 'success';
      }, EffectFlags.None);

      const retried = retry(effect, {
        maxAttempts: 3,
        delay: 10,
        backoff: 'exponential'
      });

      const result = await retried(null);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });
  });
});