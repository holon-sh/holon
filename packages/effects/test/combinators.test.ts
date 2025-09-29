import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  batch,
  combineEffects,
  debounceEffect,
  effectful,
  EffectFlags,
  parallelLimit,
  raceTimeout,
  throttleEffect,
} from '../src/index.js';

describe('Effect Combinators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('parallelLimit', () => {
    it('should limit parallel execution', async () => {
      let running = 0;
      let maxRunning = 0;

      const createEffect = (id: number) =>
        effectful(async (input: number) => {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await new Promise((resolve) => setTimeout(resolve, 10));
          running--;
          return input * id;
        }, EffectFlags.Async);

      const effects = Array.from({ length: 5 }, (_, i) => createEffect(i + 1));
      const limited = parallelLimit(2, ...effects);

      const result = await limited(10);

      expect(result).toHaveLength(5);
      expect(maxRunning).toBeLessThanOrEqual(2);
      expect(result).toEqual([10, 20, 30, 40, 50]);
    });

    it('should combine effect flags', () => {
      const effect1 = effectful(async (x: number) => x * 2, EffectFlags.Async);
      const effect2 = effectful((x: number) => x + 1, EffectFlags.Pure);
      const effect3 = effectful(async (x: number) => x / 2, EffectFlags.Async | EffectFlags.IO);

      const combined = parallelLimit(2, effect1, effect2, effect3);
      expect(combined.flags).toBe(EffectFlags.Async | EffectFlags.IO);
    });
  });

  describe('raceTimeout', () => {
    it('should complete before timeout', async () => {
      const effect = effectful(async (x: number) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return x * 2;
      }, EffectFlags.Async);

      const withTimeout = raceTimeout(effect, 100);
      const result = await withTimeout(5);
      expect(result).toBe(10);
    });

    it('should timeout with fallback', async () => {
      const effect = effectful(async (x: number) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return x * 2;
      }, EffectFlags.Async);

      const withTimeout = raceTimeout(effect, 50, 999);
      const result = await withTimeout(5);
      expect(result).toBe(999);
    });

    it('should timeout with error', async () => {
      const effect = effectful(async (x: number) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return x * 2;
      }, EffectFlags.Async);

      const withTimeout = raceTimeout(effect, 50);
      await expect(withTimeout(5)).rejects.toThrow('Effect timeout after 50ms');
    });

    it('should add Time flag', () => {
      const effect = effectful((x: number) => x * 2, EffectFlags.Pure);
      const withTimeout = raceTimeout(effect, 100);
      expect(withTimeout.flags & EffectFlags.Time).toBeTruthy();
    });
  });

  describe('batch', () => {
    it('should batch multiple calls', async () => {
      let callCount = 0;
      const batchEffect = effectful(async (inputs: number[]) => {
        callCount++;
        return inputs.map((x) => x * 2);
      }, EffectFlags.Async);

      const batched = batch(batchEffect, { size: 3, delay: 50 });

      const results = await Promise.all([
        batched(1),
        batched(2),
        batched(3),
      ]);

      expect(results).toEqual([2, 4, 6]);
      expect(callCount).toBe(1);
    });

    it('should process multiple batches', async () => {
      let callCount = 0;
      const batchEffect = effectful(async (inputs: number[]) => {
        callCount++;
        return inputs.map((x) => x * 2);
      }, EffectFlags.Async);

      const batched = batch(batchEffect, { size: 2, delay: 10 });

      const results = await Promise.all([
        batched(1),
        batched(2),
        batched(3),
        batched(4),
        batched(5),
      ]);

      expect(results).toEqual([2, 4, 6, 8, 10]);
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('should respect maxWait', async () => {
      const batchEffect = effectful(async (inputs: number[]) => {
        return inputs.map((x) => x * 2);
      }, EffectFlags.Async);

      const batched = batch(batchEffect, { size: 10, delay: 1000, maxWait: 50 });

      const startTime = Date.now();
      const result = await batched(1);
      const duration = Date.now() - startTime;

      expect(result).toBe(2);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('debounceEffect', () => {
    it('should debounce multiple calls', async () => {
      vi.useFakeTimers();
      let callCount = 0;

      const effect = effectful(async (x: number) => {
        callCount++;
        return x * 2;
      }, EffectFlags.Async);

      const debounced = debounceEffect(effect, 100);

      const promise1 = debounced(1);
      const promise2 = debounced(2);
      const promise3 = debounced(3);

      vi.advanceTimersByTime(150);

      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      expect(callCount).toBe(1);
      expect(result1).toBe(6); // Last input (3) * 2
      expect(result2).toBe(6);
      expect(result3).toBe(6);

      vi.useRealTimers();
    });

    it('should handle errors', async () => {
      vi.useFakeTimers();

      const effect = effectful(async (x: number) => {
        if (x > 2) throw new Error('Too large');
        return x * 2;
      }, EffectFlags.Async);

      const debounced = debounceEffect(effect, 100);

      const promise1 = debounced(1);
      const promise2 = debounced(3);

      vi.advanceTimersByTime(150);

      await expect(promise1).rejects.toThrow('Too large');
      await expect(promise2).rejects.toThrow('Too large');

      vi.useRealTimers();
    });

    it('should add Time flag', () => {
      const effect = effectful((x: number) => x * 2, EffectFlags.Pure);
      const debounced = debounceEffect(effect, 100);
      expect(debounced.flags & EffectFlags.Time).toBeTruthy();
    });
  });

  describe('throttleEffect', () => {
    it('should throttle multiple calls', async () => {
      vi.useFakeTimers();
      let callCount = 0;

      const effect = effectful((x: number) => {
        callCount++;
        return x * 2;
      }, EffectFlags.Pure);

      const throttled = throttleEffect(effect, 100);

      const result1 = await throttled(1);
      expect(result1).toBe(2);
      expect(callCount).toBe(1);

      // Immediate call should be queued
      const result2Promise = throttled(2);

      // Another call updates the pending input
      const result3Promise = throttled(3);

      // After throttle period, pending input (3) gets processed
      vi.advanceTimersByTime(150);

      const result2 = await result2Promise;
      const result3 = await result3Promise;
      expect(result2).toBe(6); // Gets result of pending input (3) * 2
      expect(result3).toBe(6); // Same result
      expect(callCount).toBe(2);

      vi.useRealTimers();
    });

    it('should handle async effects', async () => {
      const effect = effectful(async (x: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return x * 2;
      }, EffectFlags.Async);

      const throttled = throttleEffect(effect, 50);

      const result1 = await throttled(1);
      expect(result1).toBe(2);

      // Quick succession should throttle
      const result2Promise = throttled(2);
      const result3Promise = throttled(3);

      // Wait for throttle period and execution
      await new Promise((resolve) => setTimeout(resolve, 70));

      const result2 = await result2Promise;
      const result3 = await result3Promise;
      // Both should get the result of the last input (3) * 2
      expect(result2).toBe(6);
      expect(result3).toBe(6);
    });

    it('should add Time flag', () => {
      const effect = effectful((x: number) => x * 2, EffectFlags.Pure);
      const throttled = throttleEffect(effect, 100);
      expect(throttled.flags & EffectFlags.Time).toBeTruthy();
    });
  });

  describe('combineEffects', () => {
    it('should combine multiple effect flags', () => {
      const effect1 = effectful(() => {}, EffectFlags.IO);
      const effect2 = effectful(() => {}, EffectFlags.Network);
      const effect3 = effectful(() => {}, EffectFlags.Async);
      const effect4 = effectful(() => {}, EffectFlags.Database);

      const combined = combineEffects(effect1, effect2, effect3, effect4);

      expect(combined).toBe(
        EffectFlags.IO | EffectFlags.Network | EffectFlags.Async | EffectFlags.Database
      );
    });

    it('should handle flows without flags', () => {
      const plainFlow = ((x: number) => x * 2) as any;
      const effectFlow = effectful(() => {}, EffectFlags.IO);

      const combined = combineEffects(plainFlow, effectFlow);
      expect(combined).toBe(EffectFlags.IO);
    });
  });
});