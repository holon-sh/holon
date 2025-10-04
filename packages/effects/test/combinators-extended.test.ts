import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
  type RetryOptions,
} from '../src/index.js';

describe('Extended Combinators', () => {
  describe('parallel', () => {
    it('should execute effects in parallel', async () => {
      const effect1 = effectful(async (x: number) => {
        await new Promise(r => setTimeout(r, 10));
        return x * 2;
      }, EffectFlags.Async);

      const effect2 = effectful(async (x: number) => {
        await new Promise(r => setTimeout(r, 10));
        return x * 3;
      }, EffectFlags.Async);

      const effect3 = effectful(async (x: number) => {
        await new Promise(r => setTimeout(r, 10));
        return x * 4;
      }, EffectFlags.Async);

      const combined = parallel(effect1, effect2, effect3);
      const results = await combined(5);

      expect(results).toEqual([10, 15, 20]);
    });

    it('should handle empty effects array', async () => {
      const combined = parallel();
      const results = await combined(5);
      expect(results).toEqual([]);
    });

    it('should combine effect flags', () => {
      const effect1 = effectful(() => 1, EffectFlags.IO);
      const effect2 = effectful(() => 2, EffectFlags.Network);
      const combined = parallel(effect1, effect2);

      expect(combined.flags).toBe(EffectFlags.IO | EffectFlags.Network);
    });
  });

  describe('sequential', () => {
    it('should execute effects sequentially with value passing', async () => {
      const double = effectful((x: number) => x * 2, EffectFlags.None);
      const addTen = effectful((x: number) => x + 10, EffectFlags.None);
      const toString = effectful((x: number) => x.toString(), EffectFlags.None);

      const pipeline = sequential(double, addTen, toString);
      const result = await pipeline(5);

      expect(result).toBe('20'); // (5 * 2) + 10 = 20
    });

    it('should handle async effects in sequence', async () => {
      const effect1 = effectful(async (x: number) => {
        await new Promise(r => setTimeout(r, 10));
        return x * 2;
      }, EffectFlags.Async);

      const effect2 = effectful(async (x: number) => {
        await new Promise(r => setTimeout(r, 10));
        return x + 10;
      }, EffectFlags.Async);

      const pipeline = sequential(effect1, effect2);
      const result = await pipeline(5);

      expect(result).toBe(20);
    });

    it('should combine all effect flags', () => {
      const e1 = effectful(() => 1, EffectFlags.IO);
      const e2 = effectful(() => 2, EffectFlags.Network);
      const e3 = effectful(() => 3, EffectFlags.Random);

      const pipeline = sequential(e1, e2, e3);
      expect(pipeline.flags).toBe(
        EffectFlags.IO | EffectFlags.Network | EffectFlags.Random | EffectFlags.Async
      );
    });
  });

  describe('conditional', () => {
    it('should execute ifTrue branch when condition is true', async () => {
      const ifTrue = effectful(() => 'true branch', EffectFlags.IO);
      const ifFalse = effectful(() => 'false branch', EffectFlags.Network);

      const cond = conditional(
        (x: number) => x > 5,
        ifTrue,
        ifFalse
      );

      const result = await cond(10);
      expect(result).toBe('true branch');
    });

    it('should execute ifFalse branch when condition is false', async () => {
      const ifTrue = effectful(() => 'true branch', EffectFlags.IO);
      const ifFalse = effectful(() => 'false branch', EffectFlags.Network);

      const cond = conditional(
        (x: number) => x > 5,
        ifTrue,
        ifFalse
      );

      const result = await cond(3);
      expect(result).toBe('false branch');
    });

    it('should combine effect flags from both branches', () => {
      const ifTrue = effectful(() => 1, EffectFlags.IO);
      const ifFalse = effectful(() => 2, EffectFlags.Network);

      const cond = conditional(() => true, ifTrue, ifFalse);
      expect(cond.flags).toBe(EffectFlags.IO | EffectFlags.Network);
    });

    it('should work with async effects', async () => {
      const ifTrue = effectful(async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'async true';
      }, EffectFlags.Async);

      const ifFalse = effectful(() => 'sync false', EffectFlags.None);

      const cond = conditional((x: boolean) => x, ifTrue, ifFalse);
      const result = await cond(true);
      expect(result).toBe('async true');
    });
  });

  describe('suppress', () => {
    it('should return effect result on success', async () => {
      const effect = effectful(() => 'success', EffectFlags.None);
      const suppressed = suppress(effect, () => 'fallback');

      const result = await suppressed(null);
      expect(result).toBe('success');
    });

    it('should return fallback on error', async () => {
      const effect = effectful(() => {
        throw new Error('Test error');
      }, EffectFlags.Throw);

      const suppressed = suppress(effect, (error) => `Caught: ${error.message}`);
      const result = await suppressed(null);
      expect(result).toBe('Caught: Test error');
    });

    it('should handle async errors', async () => {
      const effect = effectful(async () => {
        await new Promise(r => setTimeout(r, 10));
        throw new Error('Async error');
      }, EffectFlags.Async | EffectFlags.Throw);

      const suppressed = suppress(effect, () => 'Handled async error');
      const result = await suppressed(null);
      expect(result).toBe('Handled async error');
    });

    it('should preserve effect flags', () => {
      const effect = effectful(() => 'test', EffectFlags.IO | EffectFlags.Network);
      const suppressed = suppress(effect, () => 'fallback');
      expect(suppressed.flags).toBe(EffectFlags.IO | EffectFlags.Network);
    });
  });

  describe('retry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const effect = effectful(() => {
        attempts++;
        return 'success';
      }, EffectFlags.None);

      const retried = retry(effect);
      const result = await retried(null);

      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const effect = effectful(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts}`);
        }
        return 'success';
      }, EffectFlags.None);

      const retried = retry(effect, { maxAttempts: 3, delay: 100 });

      const promise = retried(null);

      // Advance timers for retries
      await vi.advanceTimersByTimeAsync(100); // First retry
      await vi.advanceTimersByTimeAsync(200); // Second retry

      const result = await promise;
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max attempts', async () => {
      let attempts = 0;
      const effect = effectful(() => {
        attempts++;
        throw new Error(`Attempt ${attempts}`);
      }, EffectFlags.Throw);

      const retried = retry(effect, { maxAttempts: 2, delay: 10 });

      vi.useRealTimers();
      await expect(retried(null)).rejects.toThrow('Attempt 2');
      expect(attempts).toBe(2);
      vi.useFakeTimers();
    });

    it('should use exponential backoff', async () => {
      let attempts = 0;
      const effect = effectful(() => {
        attempts++;
        throw new Error('Always fails');
      }, EffectFlags.Throw);

      const retried = retry(effect, {
        maxAttempts: 3,
        delay: 10,
        backoff: 'exponential'
      });

      vi.useRealTimers();
      await expect(retried(null)).rejects.toThrow('Always fails');
      expect(attempts).toBe(3);
      vi.useFakeTimers();
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      let attempts = 0;

      const effect = effectful(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Error ${attempts}`);
        }
        return 'success';
      }, EffectFlags.None);

      const retried = retry(effect, {
        maxAttempts: 3,
        delay: 0,  // No delay for testing
        onRetry
      });

      vi.useRealTimers();
      const result = await retried(null);
      expect(result).toBe('success');

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error));
      vi.useFakeTimers();
    });

    it('should add async and time flags', () => {
      const effect = effectful(() => 'test', EffectFlags.IO);
      const retried = retry(effect);
      expect(retried.flags).toBe(EffectFlags.IO | EffectFlags.Async | EffectFlags.Time);
    });
  });

  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should complete within timeout', async () => {
      // Use real timers for timeout tests
      vi.useRealTimers();

      const effect = effectful(async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'success';
      }, EffectFlags.Async);

      const timed = timeout(effect, 100);
      const result = await timed(null);
      expect(result).toBe('success');

      // Re-enable fake timers
      vi.useFakeTimers();
    });

    it('should throw on timeout', async () => {
      // Don't use fake timers for this test
      vi.useRealTimers();

      const effect = effectful(async () => {
        await new Promise(r => setTimeout(r, 200));
        return 'success';
      }, EffectFlags.Async);

      const timed = timeout(effect, 100);

      await expect(timed(null)).rejects.toThrow('Effect timeout after 100ms');

      // Re-enable fake timers for other tests
      vi.useFakeTimers();
    });

    it('should add async and time flags', () => {
      const effect = effectful(() => 'test', EffectFlags.IO);
      const timed = timeout(effect, 100);
      expect(timed.flags).toBe(EffectFlags.IO | EffectFlags.Async | EffectFlags.Time);
    });
  });

  describe('analyze', () => {
    it('should analyze pure flow', () => {
      const flow = effectful(() => 42, EffectFlags.None);
      const analysis = analyze(flow);

      expect(analysis.pure).toBe(true);
      expect(analysis.effects).toBe(EffectFlags.None);
      expect(analysis.sideEffects).toEqual([]);
      expect(analysis.async).toBe(false);
    });

    it('should analyze effectful flow', () => {
      const flow = effectful(
        () => 'test',
        EffectFlags.IO | EffectFlags.Network | EffectFlags.Async
      );
      const analysis = analyze(flow);

      expect(analysis.pure).toBe(false);
      expect(analysis.effects).toBe(EffectFlags.IO | EffectFlags.Network | EffectFlags.Async);
      expect(analysis.sideEffects).toContain('io');
      expect(analysis.sideEffects).toContain('network');
      expect(analysis.async).toBe(true);
    });

    it('should include all effect types in analysis', () => {
      const flow = effectful(
        () => {},
        EffectFlags.IO | EffectFlags.Read | EffectFlags.Write |
        EffectFlags.Network | EffectFlags.Random | EffectFlags.Time |
        EffectFlags.Throw | EffectFlags.Process | EffectFlags.Memory |
        EffectFlags.State | EffectFlags.Unsafe | EffectFlags.Database |
        EffectFlags.Cache | EffectFlags.Queue | EffectFlags.Stream
      );

      const analysis = analyze(flow);

      expect(analysis.sideEffects).toContain('io');
      expect(analysis.sideEffects).toContain('read');
      expect(analysis.sideEffects).toContain('write');
      expect(analysis.sideEffects).toContain('network');
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
    });

    it('should include performance hints', () => {
      const flow = effectful(() => 42, EffectFlags.None);
      const analysis = analyze(flow);

      expect(analysis.complexity).toBe('O(n)');
      expect(analysis.performance).toEqual({
        expectedMs: 100,
        variance: 50,
      });
    });
  });

  describe('optimize', () => {
    it('should memoize pure flows', () => {
      let callCount = 0;
      const flow = effectful((x: number) => {
        callCount++;
        return x * 2;
      }, EffectFlags.None);

      const optimized = optimize(flow);

      // Call with same input multiple times
      const result1 = optimized(5);
      const result2 = optimized(5);
      const result3 = optimized(5);

      expect(result1).toBe(10);
      expect(result2).toBe(10);
      expect(result3).toBe(10);
      // Pure flow should be memoized, so called only once
      expect(callCount).toBe(1);

      // Different input should trigger new call
      const result4 = optimized(10);
      expect(result4).toBe(20);
      expect(callCount).toBe(2);
    });

    it('should not memoize impure flows', () => {
      let callCount = 0;
      const flow = effectful((x: number) => {
        callCount++;
        return x * 2;
      }, EffectFlags.Random);

      const optimized = optimize(flow);

      optimized(5);
      optimized(5);
      optimized(5);

      // Impure flow should not be memoized
      expect(callCount).toBe(3);
    });

    it('should preserve effect flags', () => {
      const flow = effectful(() => 42, EffectFlags.IO);
      const optimized = optimize(flow);
      expect(optimized.flags).toBe(EffectFlags.IO);
    });
  });

  describe('restrict', () => {
    it('should allow flows with permitted effects', () => {
      const flow = effectful(() => 'test', EffectFlags.IO | EffectFlags.Read);
      const restricted = restrict(flow, EffectFlags.IO | EffectFlags.Read | EffectFlags.Write);

      expect(restricted).toBe(flow);
    });

    it('should throw for flows with disallowed effects', () => {
      const flow = effectful(() => 'test', EffectFlags.IO | EffectFlags.Network);

      expect(() => restrict(flow, EffectFlags.IO))
        .toThrow('Flow has disallowed effects');
    });

    it('should allow pure flows with any restriction', () => {
      const flow = effectful(() => 'test', EffectFlags.None);
      const restricted = restrict(flow, EffectFlags.IO);

      expect(restricted).toBe(flow);
    });
  });
});