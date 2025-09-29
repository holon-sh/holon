import { describe, expect, it, test } from 'vitest';
import {
  compose,
  constant,
  filter,
  flow,
  identity,
  map,
  parallel,
  race,
  reduce,
} from '../src/flow.js';

describe('flow', () => {
  describe('basic creation', () => {
    it('should create a flow from a function', () => {
      const double = flow((x: number) => x * 2);
      expect(double(5)).toBe(10);
    });

    it('should handle async functions', async () => {
      const asyncDouble = flow(async (x: number) => {
        await new Promise((r) => setTimeout(r, 1));
        return x * 2;
      });
      expect(await asyncDouble(5)).toBe(10);
    });

    it('should attach metadata', () => {
      const withMeta = flow((x: number) => x, {
        name: 'identity',
        description: 'Returns input unchanged',
      });
      expect(withMeta.meta?.name).toBe('identity');
      expect(withMeta.meta?.description).toBe('Returns input unchanged');
    });

    it('should handle errors with onError', () => {
      const safeDivide = flow({
        fn: ([a, b]: [number, number]) => {
          if (b === 0) throw new Error('Division by zero');
          return a / b;
        },
        onError: () => Number.POSITIVE_INFINITY,
      });

      expect(safeDivide([10, 2])).toBe(5);
      expect(safeDivide([10, 0])).toBe(Number.POSITIVE_INFINITY);
    });

    it('should handle async errors with onError', async () => {
      const safeAsync = flow({
        fn: async (x: number) => {
          if (x < 0) throw new Error('Negative input');
          return x * 2;
        },
        onError: () => -1,
      });

      expect(await safeAsync(5)).toBe(10);
      expect(await safeAsync(-5)).toBe(-1);
    });
  });

  describe('composition with pipe', () => {
    it('should compose two flows', () => {
      const double = flow((x: number) => x * 2);
      const addOne = flow((x: number) => x + 1);
      const doubleThenAddOne = double.pipe(addOne);

      expect(doubleThenAddOne(5)).toBe(11); // (5 * 2) + 1
    });

    it('should compose multiple flows', () => {
      const add5 = flow((x: number) => x + 5);
      const double = flow((x: number) => x * 2);
      const toString = flow((x: number) => x.toString());

      const pipeline = add5.pipe(double).pipe(toString);
      expect(pipeline(10)).toBe('30'); // ((10 + 5) * 2).toString()
    });

    it('should handle async flows in composition', async () => {
      const asyncDouble = flow(async (x: number) => x * 2);
      const asyncAddOne = flow(async (x: number) => x + 1);
      const pipeline = asyncDouble.pipe(asyncAddOne);

      expect(await pipeline(5)).toBe(11);
    });

    it('should merge metadata in composition', () => {
      const pure1 = flow((x: number) => x * 2, {
        performance: { pure: true },
      });
      const pure2 = flow((x: number) => x + 1, {
        performance: { pure: true },
      });
      const composed = pure1.pipe(pure2);

      expect(composed.meta?.performance?.pure).toBe(true);
    });
  });

  describe('compose function', () => {
    it('should compose multiple flows', () => {
      const add5 = flow((x: number) => x + 5);
      const double = flow((x: number) => x * 2);
      const toString = flow((x: number) => x.toString());

      const pipeline = compose(add5, double, toString);
      expect(pipeline(10)).toBe('30');
    });

    it('should return original flow for single flow', () => {
      const single = flow((x: number) => x * 2);
      const composed = compose(single);
      expect(composed(5)).toBe(10);
    });
  });

  describe('utility flows', () => {
    it('identity should return input unchanged', () => {
      const id = identity<number>();
      expect(id(42)).toBe(42);
    });

    it('constant should always return same value', () => {
      const always42 = constant(42);
      expect(always42('ignored')).toBe(42);
      expect(always42(null)).toBe(42);
      expect(always42(undefined)).toBe(42);
    });
  });

  describe('collection operations', () => {
    it('map should apply flow to each element', async () => {
      const double = flow((x: number) => x * 2);
      const mapDouble = map(double);

      expect(await mapDouble([1, 2, 3])).toEqual([2, 4, 6]);
    });

    it('filter should keep matching elements', async () => {
      const isEven = flow((x: number) => x % 2 === 0);
      const filterEven = filter(isEven);

      expect(await filterEven([1, 2, 3, 4, 5])).toEqual([2, 4]);
    });

    it('reduce should accumulate values', async () => {
      const sum = reduce<number, number>(
        flow(([acc, x]) => acc + x),
        0,
      );

      expect(await sum([1, 2, 3, 4])).toBe(10);
    });
  });

  describe('async operations', () => {
    it('parallel should run flows in parallel', async () => {
      const delays: number[] = [];
      const makeDelayed = (ms: number) =>
        flow(async (x: number) => {
          const start = Date.now();
          await new Promise((r) => setTimeout(r, ms));
          delays.push(Date.now() - start);
          return x * ms;
        });

      const parallelFlows = parallel([makeDelayed(10), makeDelayed(20), makeDelayed(30)]);

      const results = await parallelFlows(2);
      expect(results).toEqual([20, 40, 60]);

      // All should complete around the same time (parallel)
      const maxDelay = Math.max(...delays);
      expect(maxDelay).toBeLessThan(50); // Should be ~30ms, not 60ms
    });

    it('race should return first result', async () => {
      const fast = flow(async (x: number) => {
        await new Promise((r) => setTimeout(r, 10));
        return x * 2;
      });

      const slow = flow(async (x: number) => {
        await new Promise((r) => setTimeout(r, 100));
        return x * 3;
      });

      const fastest = race([slow, fast]);
      expect(await fastest(5)).toBe(10); // fast wins
    });
  });

  describe('type safety', () => {
    it('should enforce type constraints', () => {
      const numberFlow = flow((x: number) => x * 2);
      const stringFlow = flow((x: string) => x.length);

      // This should type-check correctly
      const composed = stringFlow.pipe(numberFlow);

      // @ts-expect-error - Type mismatch
      const invalid = numberFlow.pipe(stringFlow);

      expect(composed('hello')).toBe(10); // 5 * 2
    });
  });

  describe('composition laws', () => {
    test('associativity: (f ∘ g) ∘ h = f ∘ (g ∘ h)', () => {
      const f = flow((x: number) => x + 1);
      const g = flow((x: number) => x * 2);
      const h = flow((x: number) => x - 3);

      const left = f.pipe(g).pipe(h);
      const right = f.pipe(g.pipe(h));

      const input = 5;
      expect(left(input)).toBe(right(input));
    });

    test('identity law: f ∘ id = id ∘ f = f', () => {
      const f = flow((x: number) => x * 2);
      const id = identity<number>();

      const leftIdentity = id.pipe(f);
      const rightIdentity = f.pipe(id);

      const input = 5;
      expect(leftIdentity(input)).toBe(f(input));
      expect(rightIdentity(input)).toBe(f(input));
    });
  });
});
