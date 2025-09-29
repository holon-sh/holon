import { describe, expect, test, vi } from 'vitest';
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
  race,
  reduce,
  result,
  retry,
  tap,
  throttle,
  timeout,
  validate,
} from '../src/flow.js';

describe('Advanced Flow Features', () => {
  describe('Type Validation', () => {
    test('should validate input types', () => {
      const typedFlow = flow((x: number) => x * 2, {
        name: 'double',
        types: {
          input: (value): value is number => typeof value === 'number',
        },
      });

      expect(typedFlow(5)).toBe(10);
      expect(() => typedFlow('invalid' as any)).toThrow('Invalid input type');
    });

    test('should validate output types', async () => {
      const typedFlow = flow((x: number) => x * 2, {
        name: 'double',
        types: {
          output: (value): value is number => typeof value === 'number' && value > 0,
        },
      });

      expect(typedFlow(5)).toBe(10);
    });

    test('should validate async output types', async () => {
      const typedFlow = flow(async (x: number) => x * 2, {
        name: 'asyncDouble',
        types: {
          output: (value): value is number => typeof value === 'number' && value > 0,
        },
      });

      await expect(typedFlow(5)).resolves.toBe(10);
    });

    test('should fail output validation', async () => {
      const typedFlow = flow(() => 'not a number', {
        name: 'badFlow',
        types: {
          output: (value): value is number => typeof value === 'number',
        },
      });

      expect(() => typedFlow(undefined)).toThrow('Invalid output type');
    });

    test('should fail async output validation', async () => {
      const typedFlow = flow(async () => 'not a number', {
        name: 'asyncBadFlow',
        types: {
          output: (value): value is number => typeof value === 'number',
        },
      });

      await expect(typedFlow(undefined)).rejects.toThrow('Invalid output type');
    });
  });

  describe('Metadata Merging', () => {
    test('should merge names in pipeline', () => {
      const add = flow((x: number) => x + 1, { name: 'add' });
      const multiply = flow((x: number) => x * 2, { name: 'multiply' });

      const pipeline = add.pipe(multiply);
      expect(pipeline.meta?.name).toBe('add → multiply');
    });

    test('should merge descriptions', () => {
      const step1 = flow((x: number) => x + 1, {
        description: 'Adds one',
      });
      const step2 = flow((x: number) => x * 2, {
        description: 'Doubles value',
      });

      const pipeline = step1.pipe(step2);
      expect(pipeline.meta?.description).toBe('Adds one then Doubles value');
    });

    test('should calculate combined expected duration', () => {
      const slow1 = flow((x: number) => x, {
        performance: { expectedDuration: 100 },
      });
      const slow2 = flow((x: number) => x, {
        performance: { expectedDuration: 200 },
      });

      const pipeline = slow1.pipe(slow2);
      expect(pipeline.meta?.performance?.expectedDuration).toBe(300);
    });

    test('should merge tags uniquely', () => {
      const tagged1 = flow((x: number) => x, {
        tags: ['math', 'pure'],
      });
      const tagged2 = flow((x: number) => x, {
        tags: ['pure', 'fast'],
      });

      const pipeline = tagged1.pipe(tagged2);
      expect(pipeline.meta?.tags).toEqual(['math', 'pure', 'fast']);
    });

    test('should merge type validators', () => {
      const inputValidator = (value: unknown): value is number => typeof value === 'number';
      const outputValidator = (value: unknown): value is string => typeof value === 'string';

      const step1 = flow((x: number) => x + 1, {
        types: { input: inputValidator },
      });
      const step2 = flow((x: number) => x.toString(), {
        types: { output: outputValidator },
      });

      const pipeline = step1.pipe(step2);
      expect(pipeline.meta?.types?.input).toBe(inputValidator);
      expect(pipeline.meta?.types?.output).toBe(outputValidator);
    });
  });

  describe('Error Handling Flows', () => {
    describe('fallback', () => {
      test('should use primary when it succeeds', async () => {
        const primary = flow(() => 'primary');
        const backup = flow(() => 'backup');
        const safe = fallback(primary, backup);

        expect(await safe(undefined)).toBe('primary');
      });

      test('should use fallback when primary fails', async () => {
        const primary = flow(() => {
          throw new Error('fail');
        });
        const backup = flow(() => 'backup');
        const safe = fallback(primary, backup);

        expect(await safe(undefined)).toBe('backup');
      });

      test('should preserve pure flag only if both are pure', () => {
        const pure1 = flow((x: number) => x, { performance: { pure: true } });
        const pure2 = flow((x: number) => x, { performance: { pure: true } });
        const impure = flow((x: number) => Math.random() + x, { performance: { pure: false } });

        const safePure = fallback(pure1, pure2);
        expect(safePure.meta?.performance?.pure).toBe(true);

        const safeImpure = fallback(pure1, impure);
        expect(safeImpure.meta?.performance?.pure).toBe(false);
      });
    });

    describe('retry', () => {
      test('should retry on failure', async () => {
        let attempts = 0;
        const flaky = flow(() => {
          attempts++;
          if (attempts < 3) throw new Error('fail');
          return 'success';
        });

        const reliable = retry(flaky, 3, 0);
        expect(await reliable(undefined)).toBe('success');
        expect(attempts).toBe(3);
      });

      test('should fail after max retries', async () => {
        const alwaysFails = flow(() => {
          throw new Error('always fails');
        });
        const retried = retry(alwaysFails, 2, 0);

        await expect(retried(undefined)).rejects.toThrow('always fails');
      });

      test('should delay between retries', async () => {
        let attempts = 0;
        const flaky = flow(() => {
          attempts++;
          if (attempts < 2) throw new Error('fail');
          return 'success';
        });

        const start = Date.now();
        const reliable = retry(flaky, 3, 50);
        await reliable(undefined);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(50);
      });
    });

    describe('timeout', () => {
      test('should complete when fast enough', async () => {
        const fast = flow(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'fast';
        });

        const timed = timeout(fast, 100);
        expect(await timed(undefined)).toBe('fast');
      });

      test('should timeout when too slow', async () => {
        const slow = flow(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'slow';
        });

        const timed = timeout(slow, 10);
        await expect(timed(undefined)).rejects.toThrow('Timeout');
      });
    });
  });

  describe('Performance Flows', () => {
    describe('memoize', () => {
      test('should cache results', () => {
        let calls = 0;
        const expensive = flow((x: number) => {
          calls++;
          return x * 2;
        });

        const cached = memoize(expensive);

        expect(cached(5)).toBe(10);
        expect(cached(5)).toBe(10);
        expect(calls).toBe(1);
      });

      test('should cache async results', async () => {
        let calls = 0;
        const expensive = flow(async (x: number) => {
          calls++;
          return x * 2;
        });

        const cached = memoize(expensive);

        expect(await cached(5)).toBe(10);
        expect(await cached(5)).toBe(10);
        expect(calls).toBe(1);
      });

      test('should use custom key function', () => {
        let calls = 0;
        const expensive = flow((obj: { id: number }) => {
          calls++;
          return obj.id * 2;
        });

        const cached = memoize(expensive, (obj) => String(obj.id));

        expect(cached({ id: 5 })).toBe(10);
        expect(cached({ id: 5 })).toBe(10);
        expect(calls).toBe(1);
      });
    });

    describe('debounce', () => {
      test.skip('should debounce rapid calls', async () => {
        // TODO: Fix timing issues with fake timers
        vi.useFakeTimers();
        let calls = 0;
        const tracked = flow((x: number) => {
          calls++;
          return x;
        });

        const debounced = debounce(tracked, 100);

        const promise1 = debounced(1);
        const promise2 = debounced(2);
        const promise3 = debounced(3);

        vi.advanceTimersByTime(100);

        await Promise.all([promise1, promise2, promise3]);
        expect(calls).toBe(1);
        vi.useRealTimers();
      });
    });

    describe('throttle', () => {
      test('should throttle rapid calls', async () => {
        vi.useFakeTimers();
        let calls = 0;
        const tracked = flow(async (x: number) => {
          calls++;
          return x;
        });

        const throttled = throttle(tracked, 100);

        expect(await throttled(1)).toBe(1);
        expect(calls).toBe(1);

        // Too soon, should return cached
        expect(await throttled(2)).toBe(1);
        expect(calls).toBe(1);

        // Advance time
        vi.advanceTimersByTime(100);

        expect(await throttled(3)).toBe(3);
        expect(calls).toBe(2);
        vi.useRealTimers();
      });
    });
  });

  describe('Maybe and Result', () => {
    describe('maybe', () => {
      test('should handle null values', async () => {
        const double = flow((x: number) => x * 2);
        const safeDouble = maybe(double);

        expect(await safeDouble(5)).toBe(10);
        expect(await safeDouble(null)).toBe(null);
        expect(await safeDouble(undefined)).toBe(undefined);
      });

      test('should preserve metadata', () => {
        const pure = flow((x: number) => x * 2, {
          name: 'double',
          performance: { pure: true },
        });
        const safePure = maybe(pure);

        expect(safePure.meta?.performance?.pure).toBe(true);
      });
    });

    describe('result', () => {
      test('should handle Ok values', async () => {
        const double = flow((x: number) => x * 2);
        const safeDouble = result(double);

        const okResult = await safeDouble({ ok: true, value: 5 });
        expect(okResult).toEqual({ ok: true, value: 10 });
      });

      test('should pass through Err values', async () => {
        const double = flow((x: number) => x * 2);
        const safeDouble = result(double);

        const errResult = await safeDouble({ ok: false, error: new Error('test') });
        expect(errResult.ok).toBe(false);
        if (!errResult.ok) {
          expect(errResult.error).toBeInstanceOf(Error);
        }
      });

      test('should catch errors and return Err', async () => {
        const failing = flow(() => {
          throw new Error('fail');
        });
        const safeFailing = result(failing);

        const res = await safeFailing({ ok: true, value: undefined });
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe('Utility Flows', () => {
    describe('tap', () => {
      test('should perform side effect without modifying value', async () => {
        let sideEffect: number | undefined;
        const logger = tap<number>((x) => {
          sideEffect = x;
        });

        expect(await logger(42)).toBe(42);
        expect(sideEffect).toBe(42);
      });

      test('should handle async side effects', async () => {
        let sideEffect: number | undefined;
        const asyncLogger = tap<number>(async (x) => {
          sideEffect = x;
        });

        expect(await asyncLogger(42)).toBe(42);
        expect(sideEffect).toBe(42);
      });
    });

    describe('validate', () => {
      test('should pass valid values', () => {
        const positive = validate((x: number) => x > 0, 'Must be positive');
        expect(positive(5)).toBe(5);
      });

      test('should reject invalid values', () => {
        const positive = validate((x: number) => x > 0, 'Must be positive');
        expect(() => positive(-5)).toThrow('Must be positive');
      });

      test('should use default error message', () => {
        const positive = validate((x: number) => x > 0);
        expect(() => positive(-5)).toThrow('Validation failed');
      });
    });
  });

  describe('Advanced Composition', () => {
    test('should compose with metadata', () => {
      const step1 = flow((x: number) => x + 1, { name: 'add1' });
      const step2 = flow((x: number) => x * 2, { name: 'mul2' });
      const step3 = flow((x: number) => x - 3, { name: 'sub3' });
      const step4 = flow((x: number) => x / 2, { name: 'div2' });
      const step5 = flow((x: number) => Math.floor(x), { name: 'floor' });

      const pipeline = compose(step1, step2, step3, step4, step5);

      expect(pipeline(10)).toBe(9);
      expect(pipeline.meta?.name).toContain('composed');
    });

    test('should handle edge cases in parallel', async () => {
      const flows = [
        flow((x: number) => x + 1),
        flow((x: number) => x * 2),
        flow((x: number) => x - 1),
      ];

      const all = parallel(flows);
      const results = await all(5);

      expect(results).toEqual([6, 10, 4]);
    });

    test('should handle edge cases in race', async () => {
      const flows = [
        flow(async (x: number) => {
          await new Promise((r) => setTimeout(r, 50));
          return x + 1;
        }),
        flow(async (x: number) => {
          return x * 2;
        }),
      ];

      const fastest = race(flows);
      const result = await fastest(5);

      expect(result).toBe(10);
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle complex error recovery pipeline', async () => {
      let attempts = 0;
      const unreliable = flow(() => {
        attempts++;
        if (attempts < 3) throw new Error('Random failure');
        return 'success';
      });

      const pipeline = compose(
        retry(unreliable, 5, 0),
        tap(() => {}),
        validate((x: string) => x === 'success', 'Invalid result'),
      );

      await expect(pipeline(undefined)).resolves.toBe('success');
    });

    test('should handle complex data transformation', async () => {
      const pipeline = compose(
        flow((nums: number[]) => nums.filter((n) => n > 0)),
        map(flow((n: number) => n * 2)),
        filter(flow((n: number) => n < 20)),
        reduce(
          flow(([sum, n]: [number, number]) => sum + n),
          0,
        ),
      );

      const result = await pipeline([-1, 2, 5, 8, 10]);
      expect(result).toBe(30); // (2*2=4) + (5*2=10) + (8*2=16) = 30, none greater than 20
    });

    test('should handle nested maybe transformations', async () => {
      const safeDivide = flow(([a, b]: [number, number]) => {
        if (b === 0) return null;
        return a / b;
      });

      const pipeline = compose(
        maybe(safeDivide),
        maybe(flow((x: number) => x * 2)),
        maybe(flow((x: number) => Math.round(x))),
      );

      expect(await pipeline([10, 3])).toBeCloseTo(7);
      expect(await pipeline([10, 0])).toBe(null);
      expect(await pipeline(null)).toBe(null);
    });
  });

  describe('Performance Characteristics', () => {
    test('should properly mark pure functions', () => {
      const pureFn = flow((x: number) => x * 2, {
        performance: { pure: true, memoizable: true },
      });

      expect(pureFn.meta?.performance?.pure).toBe(true);
      expect(pureFn.meta?.performance?.memoizable).toBe(true);
    });

    test('should propagate impurity through composition', () => {
      const pure = flow((x: number) => x * 2, {
        performance: { pure: true },
      });
      const impure = flow((x: number) => x + Math.random(), {
        performance: { pure: false },
      });

      const composed = pure.pipe(impure);
      expect(composed.meta?.performance?.pure).toBe(false);
    });
  });
});
