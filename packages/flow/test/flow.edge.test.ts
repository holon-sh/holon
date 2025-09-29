import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  compose,
  debounce,
  fallback,
  filter,
  flow,
  map,
  maybe,
  memoize,
  parallel,
  reduce,
  result,
  retry,
  tap,
  throttle,
  validate,
} from '../src/flow.js';

describe('Flow Edge Cases and Coverage', () => {
  describe('Error handling with onError', () => {
    test('should handle sync errors with onError', () => {
      const errorFlow = flow({
        fn: () => {
          throw new Error('sync error');
        },
        onError: (error) => `handled: ${error.message}`,
      });

      expect(errorFlow(undefined)).toBe('handled: sync error');
    });

    test('should handle async errors with onError', async () => {
      const errorFlow = flow({
        fn: async () => {
          throw new Error('async error');
        },
        onError: (error) => `handled: ${error.message}`,
      });

      expect(await errorFlow(undefined)).toBe('handled: async error');
    });
  });

  describe('Type validation edge cases', () => {
    test('should handle invalid async output type', async () => {
      const validatedFlow = flow(async () => 'invalid', {
        name: 'test',
        types: {
          output: (value): value is number => typeof value === 'number',
        },
      });

      await expect(validatedFlow(undefined)).rejects.toThrow('Invalid output type');
    });
  });

  describe('Compose with single argument', () => {
    test('should return single flow when only one provided', () => {
      const single = flow((x: number) => x * 2);
      const composed = compose(single);
      expect(composed(5)).toBe(10);
    });
  });

  describe('Metadata edge cases', () => {
    test('should handle undefined metadata correctly', () => {
      const f1 = flow((x: number) => x);
      const f2 = flow((x: number) => x, { name: 'test' });

      const piped = f1.pipe(f2);
      expect(piped.meta?.name).toBe('test');
    });

    test('should handle metadata with only one duration', () => {
      const f1 = flow((x: number) => x, {
        performance: { expectedDuration: 100 },
      });
      const f2 = flow((x: number) => x);

      const piped = f1.pipe(f2);
      expect(piped.meta?.performance?.expectedDuration).toBe(100);
    });

    test('should merge types when only output is present', () => {
      const f1 = flow((x: number) => x);
      const f2 = flow((x: number) => x.toString(), {
        types: {
          output: (v): v is string => typeof v === 'string',
        },
      });

      const piped = f1.pipe(f2);
      expect(piped.meta?.types?.output).toBeDefined();
      expect(piped.meta?.types?.input).toBeUndefined();
    });
  });

  describe('Debounce implementation', () => {
    let mockTimers: ReturnType<typeof vi.useFakeTimers>;

    beforeEach(() => {
      mockTimers = vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('should create debounced flow with timer handling', async () => {
      let calls = 0;
      const original = flow(() => {
        calls++;
        return 'result';
      });

      const debounced = debounce(original, 50);

      // Start the debounced call
      const promise = debounced(undefined);

      // Advance timers to trigger the debounced execution
      await mockTimers.advanceTimersByTimeAsync(50);

      // Wait for the promise to resolve
      const result = await promise;
      expect(result).toBe('result');
      expect(calls).toBe(1);
    });

    test('should cancel previous timer on new calls', async () => {
      let calls = 0;
      const original = flow((x: number) => {
        calls++;
        return x;
      });

      const debounced = debounce(original, 50);

      // Start multiple calls
      debounced(1);
      debounced(2);
      const finalPromise = debounced(3);

      // Advance time past the debounce delay
      await mockTimers.advanceTimersByTimeAsync(50);

      const result = await finalPromise;
      expect(result).toBe(3);
      expect(calls).toBe(1); // Only one call should have been made
    });
  });

  describe('Throttle edge cases', () => {
    test('should handle first call immediately', async () => {
      const tracked = flow((x: number) => x * 2);
      const throttled = throttle(tracked, 100);

      const result = await throttled(5);
      expect(result).toBe(10);
    });
  });

  describe('Retry with zero retries', () => {
    test('should try once with zero retries', async () => {
      let attempts = 0;
      const failing = flow(() => {
        attempts++;
        throw new Error('fail');
      });

      const retried = retry(failing, 0, 0);
      await expect(retried(undefined)).rejects.toThrow('fail');
      expect(attempts).toBe(1);
    });
  });

  describe('Maybe with edge cases', () => {
    test('should handle null input', async () => {
      const double = flow((x: number) => x * 2);
      const safeMaybe = maybe(double);
      expect(await safeMaybe(null)).toBe(null);
    });

    test('should handle undefined input', async () => {
      const double = flow((x: number) => x * 2);
      const safeMaybe = maybe(double);
      expect(await safeMaybe(undefined)).toBe(undefined);
    });
  });

  describe('Result with error flow', () => {
    test('should pass through error result unchanged', async () => {
      const double = flow((x: number) => x * 2);
      const safeResult = result(double);

      const errorInput = { ok: false as const, error: new Error('test') };
      const output = await safeResult(errorInput);

      expect(output).toBe(errorInput);
    });
  });

  describe('Tap with Promise side effect', () => {
    test('should handle async side effect', async () => {
      let captured: number | undefined;
      const asyncTap = tap<number>(async (x) => {
        await Promise.resolve();
        captured = x;
      });

      const result = await asyncTap(42);
      expect(result).toBe(42);
      expect(captured).toBe(42);
    });
  });

  describe('Validate edge cases', () => {
    test('should use custom error message', () => {
      const validator = validate((x: number) => x > 0, 'Number must be positive');

      expect(() => validator(-1)).toThrow('Number must be positive');
    });
  });

  describe('Fallback with both pure', () => {
    test('should preserve pure when both are pure', () => {
      const pure1 = flow((x: number) => x, { performance: { pure: true } });
      const pure2 = flow((x: number) => x * 2, { performance: { pure: true } });

      const combined = fallback(pure1, pure2);
      expect(combined.meta?.performance?.pure).toBe(true);
    });

    test('should not set pure when only one is pure', () => {
      const pure1 = flow((x: number) => x, { performance: { pure: true } });
      const impure = flow(() => Math.random());

      const combined = fallback(pure1, impure);
      expect(combined.meta?.performance?.pure).toBeUndefined();
    });

    test('should not set pure when neither has performance metadata', () => {
      const f1 = flow((x: number) => x);
      const f2 = flow((x: number) => x * 2);

      const combined = fallback(f1, f2);
      expect(combined.meta?.performance?.pure).toBeUndefined();
    });
  });

  describe('Memoize with metadata', () => {
    test('should preserve pure flag', () => {
      const pure = flow((x: number) => x * 2, { performance: { pure: true } });
      const memoized = memoize(pure);

      expect(memoized.meta?.performance?.pure).toBe(true);
      expect(memoized.meta?.performance?.memoizable).toBe(false);
    });

    test('should handle flow without performance metadata', () => {
      const simple = flow((x: number) => x * 2);
      const memoized = memoize(simple);

      expect(memoized.meta?.performance).toBeUndefined();
    });
  });

  describe('Maybe/Result with metadata', () => {
    test('should preserve all metadata in maybe', () => {
      const tagged = flow((x: number) => x * 2, {
        name: 'double',
        performance: { pure: true, memoizable: true },
        tags: ['math'],
      });

      const safeMaybe = maybe(tagged);
      expect(safeMaybe.meta?.performance?.pure).toBe(true);
      expect(safeMaybe.meta?.performance?.memoizable).toBe(true);
    });

    test('should preserve all metadata in result', () => {
      const tagged = flow((x: number) => x * 2, {
        name: 'double',
        performance: { pure: true, memoizable: true },
        tags: ['math'],
      });

      const safeResult = result(tagged);
      expect(safeResult.meta?.performance?.pure).toBe(true);
      expect(safeResult.meta?.performance?.memoizable).toBe(true);
    });

    test('should handle flow without metadata in maybe', () => {
      const simple = flow((x: number) => x * 2);
      const safeMaybe = maybe(simple);

      expect(safeMaybe.meta?.performance).toBeUndefined();
    });

    test('should handle flow without metadata in result', () => {
      const simple = flow((x: number) => x * 2);
      const safeResult = result(simple);

      expect(safeResult.meta?.performance).toBeUndefined();
    });
  });

  describe('Reduce with pure metadata', () => {
    test('should preserve pure flag from reducer', () => {
      const pureReducer = flow(([acc, val]: [number, number]) => acc + val, {
        performance: { pure: true },
      });
      const reduced = reduce(pureReducer, 0);

      expect(reduced.meta?.performance?.pure).toBe(true);
      expect(reduced.meta?.performance?.memoizable).toBe(true);
    });

    test('should handle reducer without pure flag', () => {
      const reducer = flow(([acc, val]: [number, number]) => acc + val);
      const reduced = reduce(reducer, 0);

      expect(reduced.meta?.performance).toBeUndefined();
    });
  });

  describe('Parallel with pure metadata', () => {
    test('should mark as pure when all flows are pure', () => {
      const pure1 = flow((x: number) => x * 2, { performance: { pure: true } });
      const pure2 = flow((x: number) => x + 1, { performance: { pure: true } });
      const pure3 = flow((x: number) => x - 1, { performance: { pure: true } });

      const parallelFlow = parallel([pure1, pure2, pure3]);

      expect(parallelFlow.meta?.performance?.pure).toBe(true);
      expect(parallelFlow.meta?.performance?.memoizable).toBe(true);
    });

    test('should not mark as pure when not all flows are pure', () => {
      const pure1 = flow((x: number) => x * 2, { performance: { pure: true } });
      const impure = flow((x: number) => Math.random() + x);

      const parallelFlow = parallel([pure1, impure]);

      expect(parallelFlow.meta?.performance).toBeUndefined();
    });
  });

  describe('Map and Filter with pure metadata', () => {
    test('should preserve pure flag from mapper', () => {
      const pureMapper = flow((x: number) => x * 2, {
        performance: { pure: true },
      });
      const mapped = map(pureMapper);

      expect(mapped.meta?.performance?.pure).toBe(true);
      expect(mapped.meta?.performance?.memoizable).toBe(true);
    });

    test('should handle mapper without pure flag', () => {
      const mapper = flow((x: number) => x * 2);
      const mapped = map(mapper);

      expect(mapped.meta?.performance).toBeUndefined();
    });

    test('should preserve pure flag from filter predicate', () => {
      const purePredicate = flow((x: number) => x > 0, {
        performance: { pure: true },
      });
      const filtered = filter(purePredicate);

      expect(filtered.meta?.performance?.pure).toBe(true);
      expect(filtered.meta?.performance?.memoizable).toBe(true);
    });

    test('should handle filter predicate without pure flag', () => {
      const predicate = flow((x: number) => x > 0);
      const filtered = filter(predicate);

      expect(filtered.meta?.performance).toBeUndefined();
    });
  });

  describe('Metadata merging with single pure flag', () => {
    test('should preserve pure flag from only first flow', () => {
      const pure1 = flow((x: number) => x * 2, {
        performance: { pure: true },
      });
      const noPerf = flow((x: number) => x + 1);

      const piped = pure1.pipe(noPerf);

      // This tests line 888 - when only meta1 has pure defined
      expect(piped.meta?.performance?.pure).toBe(true);
    });

    test('should preserve memoizable flag from only first flow', () => {
      const memo1 = flow((x: number) => x * 2, {
        performance: { memoizable: true },
      });
      const noPerf = flow((x: number) => x + 1);

      const piped = memo1.pipe(noPerf);

      // This tests line 899 - when only meta1 has memoizable defined
      expect(piped.meta?.performance?.memoizable).toBe(true);
    });

    test('should preserve pure flag from only second flow', () => {
      const noPerf = flow((x: number) => x * 2);
      const pure2 = flow((x: number) => x + 1, {
        performance: { pure: false },
      });

      const piped = noPerf.pipe(pure2);

      // This tests line 890 - when only meta2 has pure defined
      expect(piped.meta?.performance?.pure).toBe(false);
    });

    test('should preserve memoizable flag from only second flow', () => {
      const noPerf = flow((x: number) => x * 2);
      const memo2 = flow((x: number) => x + 1, {
        performance: { memoizable: false },
      });

      const piped = noPerf.pipe(memo2);

      // This tests line 901 - when only meta2 has memoizable defined
      expect(piped.meta?.performance?.memoizable).toBe(false);
    });

    test('should combine partial performance metadata', () => {
      // Test when meta1 has only pure, meta2 has only memoizable
      const onlyPure = flow((x: number) => x * 2, {
        performance: { pure: true },
      });
      const onlyMemo = flow((x: number) => x + 1, {
        performance: { memoizable: false },
      });

      const piped = onlyPure.pipe(onlyMemo);

      // Both flags should be preserved
      expect(piped.meta?.performance?.pure).toBe(true); // from meta1
      expect(piped.meta?.performance?.memoizable).toBe(false); // from meta2
    });

    test('should handle flow with empty performance object', () => {
      const emptyPerf = flow((x: number) => x * 2, {
        performance: {},
      });
      const normal = flow((x: number) => x + 1);

      const piped = emptyPerf.pipe(normal);

      // Empty performance object should still be treated as defined
      expect(piped.meta?.performance).toBeDefined();
    });
  });
});
