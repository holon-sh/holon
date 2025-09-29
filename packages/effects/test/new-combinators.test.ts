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

describe('New Combinators - Simple Tests', () => {
  describe('parallel', () => {
    it('should combine effects in parallel', async () => {
      const e1 = effectful(() => 1, EffectFlags.None);
      const e2 = effectful(() => 2, EffectFlags.None);
      const combined = parallel(e1, e2);
      const result = await combined(null);
      expect(result).toEqual([1, 2]);
    });
  });

  describe('sequential', () => {
    it('should chain effects', async () => {
      const e1 = effectful((x: number) => x * 2, EffectFlags.None);
      const e2 = effectful((x: number) => x + 10, EffectFlags.None);
      const chain = sequential(e1, e2);
      const result = await chain(5);
      expect(result).toBe(20);
    });
  });

  describe('conditional', () => {
    it('should branch based on condition', () => {
      const ifTrue = effectful(() => 'yes', EffectFlags.None);
      const ifFalse = effectful(() => 'no', EffectFlags.None);
      const cond = conditional((x: boolean) => x, ifTrue, ifFalse);

      expect(cond(true)).toBe('yes');
      expect(cond(false)).toBe('no');
    });
  });

  describe('suppress', () => {
    it('should handle errors', async () => {
      const failing = effectful(() => {
        throw new Error('fail');
      }, EffectFlags.Throw);

      const safe = suppress(failing, () => 'fallback');
      const result = await safe(null);
      expect(result).toBe('fallback');
    });

    it('should pass through success', async () => {
      const success = effectful(() => 'ok', EffectFlags.None);
      const safe = suppress(success, () => 'fallback');
      const result = await safe(null);
      expect(result).toBe('ok');
    });
  });

  describe('retry', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const failing = effectful(() => {
        attempts++;
        if (attempts < 2) throw new Error('retry');
        return 'success';
      }, EffectFlags.None);

      const retried = retry(failing, { maxAttempts: 3, delay: 0 });
      const result = await retried(null);

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should fail after max attempts', async () => {
      const failing = effectful(() => {
        throw new Error('always fails');
      }, EffectFlags.Throw);

      const retried = retry(failing, { maxAttempts: 2, delay: 0 });

      await expect(retried(null)).rejects.toThrow('always fails');
    });

    it('should use linear backoff', async () => {
      const failing = effectful(() => {
        throw new Error('fail');
      }, EffectFlags.Throw);

      const retried = retry(failing, {
        maxAttempts: 2,
        delay: 10,
        backoff: 'linear'
      });

      await expect(retried(null)).rejects.toThrow('fail');
    });

    it('should call onRetry', async () => {
      const onRetry = vi.fn();
      const failing = effectful(() => {
        throw new Error('retry');
      }, EffectFlags.Throw);

      const retried = retry(failing, {
        maxAttempts: 2,
        delay: 0,
        onRetry
      });

      await expect(retried(null)).rejects.toThrow('retry');
      expect(onRetry).toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('should complete fast operations', async () => {
      const fast = effectful(async () => {
        return 'fast';
      }, EffectFlags.Async);

      const timed = timeout(fast, 1000);
      const result = await timed(null);
      expect(result).toBe('fast');
    });
  });

  describe('analyze', () => {
    it('should analyze pure flows', () => {
      const pure = effectful(() => 42, EffectFlags.None);
      const analysis = analyze(pure);

      expect(analysis.pure).toBe(true);
      expect(analysis.effects).toBe(EffectFlags.None);
      expect(analysis.sideEffects).toEqual([]);
      expect(analysis.async).toBe(false);
      expect(analysis.complexity).toBe('O(n)');
      expect(analysis.performance).toBeDefined();
    });

    it('should analyze effectful flows', () => {
      const impure = effectful(() => {},
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
      const analysis = analyze(impure);

      expect(analysis.pure).toBe(false);
      expect(analysis.async).toBe(true);
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
    });
  });

  describe('optimize', () => {
    it('should memoize pure flows', () => {
      let callCount = 0;
      const pure = effectful(() => {
        callCount++;
        return 42;
      }, EffectFlags.None);

      const optimized = optimize(pure);

      optimized(null);
      optimized(null);
      optimized(null);

      expect(callCount).toBe(1);
    });

    it('should not memoize impure flows', () => {
      let callCount = 0;
      const impure = effectful(() => {
        callCount++;
        return Math.random();
      }, EffectFlags.Random);

      const optimized = optimize(impure);

      optimized(null);
      optimized(null);
      optimized(null);

      expect(callCount).toBe(3);
    });
  });

  describe('restrict', () => {
    it('should allow permitted effects', () => {
      const flow = effectful(() => {}, EffectFlags.IO);
      const restricted = restrict(flow, EffectFlags.IO | EffectFlags.Read);
      expect(restricted).toBe(flow);
    });

    it('should throw for disallowed effects', () => {
      const flow = effectful(() => {}, EffectFlags.Network);
      expect(() => restrict(flow, EffectFlags.IO))
        .toThrow('Flow has disallowed effects');
    });
  });
});