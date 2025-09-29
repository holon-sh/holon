import { describe, expect, test, vi } from 'vitest';
import { batch, flow, merge, repeat, split, when } from '../src/flow.js';

describe('Advanced Flow Operations', () => {
  describe('batch', () => {
    test('should batch multiple inputs', async () => {
      const processArray = vi.fn((items: number[]) => Promise.resolve(items.map((x) => x * 2)));
      const batchedFlow = batch(flow(processArray), { size: 3, delay: 10 });

      const results = await Promise.all([batchedFlow(1), batchedFlow(2), batchedFlow(3)]);

      expect(results).toEqual([2, 4, 6]);
      expect(processArray).toHaveBeenCalledTimes(1);
      expect(processArray).toHaveBeenCalledWith([1, 2, 3]);
    });

    test('should process batch after delay', async () => {
      const processArray = vi.fn((items: number[]) => Promise.resolve(items.map((x) => x * 2)));
      const batchedFlow = batch(flow(processArray), { size: 10, delay: 50 });

      const promise1 = batchedFlow(1);
      const promise2 = batchedFlow(2);

      // Wait for batch delay
      await new Promise((resolve) => setTimeout(resolve, 60));

      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe(2);
      expect(result2).toBe(4);
      expect(processArray).toHaveBeenCalledTimes(1);
    });

    test('should handle batch errors', async () => {
      const error = new Error('Batch processing failed');
      const processArray = vi.fn(() => Promise.reject(error));
      const batchedFlow = batch(flow(processArray), { size: 2, delay: 10 });

      await expect(batchedFlow(1)).rejects.toThrow('Batch processing failed');
    });

    test('should have proper metadata', () => {
      const namedFlow = flow((items: number[]) => items, { name: 'processor' });
      const batchedFlow = batch(namedFlow);

      expect(batchedFlow.meta?.name).toBe('batch');
      expect(batchedFlow.meta?.description).toContain('processor');
      expect(batchedFlow.meta?.performance?.pure).toBe(false);
      expect(batchedFlow.meta?.performance?.memoizable).toBe(false);
    });
  });

  describe('split', () => {
    test('should split input and process parts separately', async () => {
      interface Data {
        header: string;
        body: string;
        footer: string;
      }

      const splitter = flow((data: Data) => [data.header, data.body, data.footer] as const);

      const processHeader = flow((h: string) => h.toUpperCase());
      const processBody = flow((b: string) => b.length);
      const processFooter = flow((f: string) => f.split('').reverse().join(''));

      const splitFlow = split(splitter, [processHeader, processBody, processFooter]);

      const result = await splitFlow({
        header: 'hello',
        body: 'world',
        footer: 'test',
      });

      expect(result).toEqual(['HELLO', 5, 'tset']);
    });

    test('should handle async flows', async () => {
      const splitter = flow((x: number) => [x, x * 2] as const);
      const flow1 = flow(async (x: number) => {
        await new Promise((r) => setTimeout(r, 10));
        return x + 1;
      });
      const flow2 = flow(async (x: number) => {
        await new Promise((r) => setTimeout(r, 10));
        return x - 1;
      });

      const splitFlow = split(splitter, [flow1, flow2]);
      const result = await splitFlow(5);

      expect(result).toEqual([6, 9]); // [5+1, 10-1]
    });

    test('should preserve pure metadata when all flows are pure', () => {
      const splitter = flow((x: number) => [x, x] as const, {
        performance: { pure: true },
      });
      const pure1 = flow((x: number) => x * 2, { performance: { pure: true } });
      const pure2 = flow((x: number) => x + 1, { performance: { pure: true } });

      const splitFlow = split(splitter, [pure1, pure2]);

      expect(splitFlow.meta?.performance?.pure).toBe(true);
      expect(splitFlow.meta?.performance?.memoizable).toBe(true);
    });

    test('should not be pure if any flow is not pure', () => {
      const splitter = flow((x: number) => [x, x] as const);
      const pure1 = flow((x: number) => x * 2, { performance: { pure: true } });
      const impure = flow((x: number) => x + Math.random());

      const splitFlow = split(splitter, [pure1, impure]);

      // When not all flows are pure, performance property is not set
      expect(splitFlow.meta?.performance).toBeUndefined();
    });
  });

  describe('merge', () => {
    test('should merge multiple inputs into one', async () => {
      const merger = flow(([a, b, c]: [number, string, boolean]) => ({
        num: a,
        str: b,
        bool: c,
      }));

      const mergeFlow = merge(merger);
      const result = await mergeFlow([42, 'hello', true]);

      expect(result).toEqual({
        num: 42,
        str: 'hello',
        bool: true,
      });
    });

    test('should preserve metadata from merger', () => {
      const pureMerger = flow(([a, b]: [number, number]) => a + b, {
        name: 'adder',
        performance: { pure: true },
      });

      const mergeFlow = merge(pureMerger);

      expect(mergeFlow.meta?.name).toBe('merge');
      expect(mergeFlow.meta?.performance?.pure).toBe(true);
    });
  });

  describe('when', () => {
    test('should execute ifTrue when condition is true', async () => {
      const predicate = flow((x: number) => x > 0);
      const ifTrue = flow((x: number) => x * 2);
      const ifFalse = flow((x: number) => Math.abs(x));

      const conditional = when(predicate, ifTrue, ifFalse);

      expect(await conditional(5)).toBe(10);
      expect(await conditional(-5)).toBe(5);
      expect(await conditional(0)).toBe(0);
    });

    test('should handle async predicates', async () => {
      const asyncPredicate = flow(async (x: number) => {
        await new Promise((r) => setTimeout(r, 10));
        return x % 2 === 0;
      });
      const even = flow((x: number) => `${x} is even`);
      const odd = flow((x: number) => `${x} is odd`);

      const conditional = when(asyncPredicate, even, odd);

      expect(await conditional(4)).toBe('4 is even');
      expect(await conditional(3)).toBe('3 is odd');
    });

    test('should be pure only if all flows are pure', () => {
      const purePredicate = flow((x: number) => x > 0, {
        performance: { pure: true },
      });
      const pureTrue = flow((x: number) => x * 2, { performance: { pure: true } });
      const pureFalse = flow((x: number) => x * -1, { performance: { pure: true } });

      const conditional = when(purePredicate, pureTrue, pureFalse);

      expect(conditional.meta?.performance?.pure).toBe(true);
      expect(conditional.meta?.performance?.memoizable).toBe(false);
    });

    test('should not be pure if any flow is impure', () => {
      const predicate = flow((x: number) => x > 0);
      const ifTrue = flow((x: number) => x * 2, { performance: { pure: true } });
      const ifFalse = flow((x: number) => x + Math.random());

      const conditional = when(predicate, ifTrue, ifFalse);

      expect(conditional.meta?.performance?.pure).toBeUndefined();
    });
  });

  describe('repeat', () => {
    test('should repeat flow multiple times', async () => {
      const increment = flow((x: number) => x + 1);
      const repeatFive = repeat(increment, 5);

      expect(await repeatFive(0)).toBe(5);
      expect(await repeatFive(10)).toBe(15);
    });

    test('should handle async flows', async () => {
      const asyncDouble = flow(async (x: number) => {
        await new Promise((r) => setTimeout(r, 10));
        return x * 2;
      });
      const repeatThrice = repeat(asyncDouble, 3);

      expect(await repeatThrice(2)).toBe(16); // 2 -> 4 -> 8 -> 16
    });

    test('should work with zero repetitions', async () => {
      const double = flow((x: number) => x * 2);
      const noRepeat = repeat(double, 0);

      expect(await noRepeat(5)).toBe(5);
    });

    test('should preserve pure metadata', () => {
      const pureFlow = flow((x: number) => x + 1, {
        name: 'increment',
        performance: { pure: true },
      });
      const repeated = repeat(pureFlow, 3);

      expect(repeated.meta?.name).toBe('repeat');
      expect(repeated.meta?.description).toContain('increment');
      expect(repeated.meta?.description).toContain('3 times');
      expect(repeated.meta?.performance?.pure).toBe(true);
      expect(repeated.meta?.performance?.memoizable).toBe(true);
    });

    test('should handle flows that transform types', async () => {
      const toString = flow((x: number) => x.toString());
      const append = flow((s: string) => s + '!');
      const combined = toString.pipe(repeat(append, 3));

      expect(await combined(42)).toBe('42!!!');
    });
  });
});
