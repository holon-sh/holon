import { flow } from '@holon/flow';
import { describe, expect, test } from 'vitest';
import {
  ContextKeys,
  context,
  contextual,
  createContextKey,
  emptyContext,
  getCurrentContext,
  withContext,
} from '../src/index.js';

describe('Context', () => {
  describe('Basic operations', () => {
    test('should create empty context', () => {
      const ctx = context();
      expect(ctx.keys()).toEqual([]);
      expect(ctx.has('foo')).toBe(false);
    });

    test('should create context with initial values', () => {
      const ctx = context({ foo: 'bar', num: 42 });
      expect(ctx.get('foo')).toBe('bar');
      expect(ctx.get('num')).toBe(42);
      expect(ctx.has('foo')).toBe(true);
    });

    test('should support symbol keys', () => {
      const sym = Symbol('test');
      const ctx = context({ [sym]: 'value' });
      expect(ctx.get(sym)).toBe('value');
      expect(ctx.has(sym)).toBe(true);
    });

    test('should create new context with additional values', () => {
      const ctx1 = context({ a: 1 });
      const ctx2 = ctx1.with({ b: 2 });

      expect(ctx1.get('a')).toBe(1);
      expect(ctx1.get('b')).toBeUndefined();

      expect(ctx2.get('a')).toBe(1);
      expect(ctx2.get('b')).toBe(2);
    });

    test('should override values in new context', () => {
      const ctx1 = context({ value: 'old' });
      const ctx2 = ctx1.with({ value: 'new' });

      expect(ctx1.get('value')).toBe('old');
      expect(ctx2.get('value')).toBe('new');
    });
  });

  describe('Structural sharing', () => {
    test('should share structure with parent context', () => {
      const parent = context({ shared: 'value', override: 'parent' });
      const child = parent.fork().with({ override: 'child', unique: 'childOnly' });

      expect(child.get('shared')).toBe('value');
      expect(child.get('override')).toBe('child');
      expect(child.get('unique')).toBe('childOnly');
      expect(parent.get('unique')).toBeUndefined();
    });

    test('should list all keys including parent keys', () => {
      const parent = context({ a: 1, b: 2 });
      const child = parent.fork().with({ b: 3, c: 4 });

      const keys = child.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
      expect(keys).toHaveLength(3);
    });
  });

  describe('Immutability', () => {
    test('should freeze context', () => {
      const ctx = context({ value: 'initial' }).freeze();

      expect(() => ctx.with({ newValue: 'test' })).toThrow('Cannot modify frozen context');
    });

    test('should create frozen empty context', () => {
      expect(() => emptyContext.with({ value: 'test' })).toThrow('Cannot modify frozen context');
    });
  });

  describe('Flow execution', () => {
    test('should run flow with context', async () => {
      const ctx = context({ multiplier: 2 });
      const multiplyFlow = flow((x: number) => x * 2);

      const result = await ctx.run(multiplyFlow, 5);
      expect(result).toBe(10);
    });
  });

  describe('Async context management', () => {
    test('should access context in contextual flow', async () => {
      const key = createContextKey('test-value');
      const ctx = context({ [key]: 'hello' });

      const getFromContext = contextual((input: string, ctx) => {
        const value = ctx.get(key);
        return `${input}: ${value}`;
      });

      const result = await withContext(ctx, () => getFromContext('prefix'));
      expect(result).toBe('prefix: hello');
    });

    test('should handle nested context', async () => {
      const ctx1 = context({ level: 1 });
      const ctx2 = ctx1.with({ level: 2 });

      const getLevel = contextual((_input: void, ctx) => ctx.get('level'));

      const level1 = await withContext(ctx1, () => getLevel());
      const level2 = await withContext(ctx2, () => getLevel());

      expect(level1).toBe(1);
      expect(level2).toBe(2);
    });

    test('should return undefined for missing context', async () => {
      const ctx = await getCurrentContext();
      expect(ctx).toBeUndefined();
    });
  });

  describe('Well-known context keys', () => {
    test('should provide standard context keys', () => {
      expect(typeof ContextKeys.REQUEST_ID).toBe('symbol');
      expect(typeof ContextKeys.USER_ID).toBe('symbol');
      expect(typeof ContextKeys.TRACE_ID).toBe('symbol');
      expect(typeof ContextKeys.LOCALE).toBe('symbol');
      expect(typeof ContextKeys.LOGGER).toBe('symbol');
    });

    test('should use well-known keys', () => {
      const ctx = context({
        [ContextKeys.REQUEST_ID]: 'req-123',
        [ContextKeys.USER_ID]: 'user-456',
      });

      expect(ctx.get(ContextKeys.REQUEST_ID)).toBe('req-123');
      expect(ctx.get(ContextKeys.USER_ID)).toBe('user-456');
    });
  });

  describe('Contextual flow composition', () => {
    test('should compose contextual flows', async () => {
      const key = Symbol('data');
      const ctx = context({ [key]: 10 });

      const addFromContext = contextual((input: number, ctx) => {
        const value = ctx.get(key) as number;
        return input + value;
      });

      const double = flow((x: number) => x * 2);
      const composed = addFromContext.pipe(double);

      const result = await withContext(ctx, () => composed(5));
      expect(result).toBe(30); // (5 + 10) * 2
    });
  });

  describe('Fork functionality', () => {
    test('should create child context with fork', () => {
      const parent = context({ a: 1, b: 2 });
      const child = parent.fork();

      expect(child.get('a')).toBe(1);
      expect(child.get('b')).toBe(2);

      const childWithMore = child.with({ c: 3 });
      expect(childWithMore.get('c')).toBe(3);
      expect(parent.get('c')).toBeUndefined();
    });
  });

  describe('Context Advanced Features', () => {
    test('should handle iterating over keys', () => {
      const ctx = context({ a: 1, b: 2, c: 3 });
      const keys = ctx.keys();

      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
      expect(keys).toHaveLength(3);
    });

    test('should handle keys with mixed types', () => {
      const sym = Symbol('test');
      const ctx = context({ string: 'value', [sym]: 'symbol-value', number: 42 });
      const keys = ctx.keys();

      expect(keys).toContain('string');
      expect(keys).toContain('number');
      expect(keys).toContain(sym);
      expect(keys).toHaveLength(3);
    });

    test('should handle empty context operations', () => {
      const ctx = context();

      expect(ctx.keys()).toEqual([]);
      expect(ctx.get('anything')).toBeUndefined();
      expect(ctx.has('anything')).toBe(false);
    });

    test('should handle freezing with nested values', () => {
      const ctx = context({ a: { nested: 'value' } });
      const frozen = ctx.freeze();

      expect(() => frozen.with({ b: 2 })).toThrow();
      expect(frozen.get('a')).toEqual({ nested: 'value' });
    });

    test('should handle chaining with operations', () => {
      const ctx1 = context({ a: 1 });
      const ctx2 = ctx1.with({ b: 2 });
      const ctx3 = ctx2.with({ c: 3 });
      const ctx4 = ctx3.with({ a: 10 }); // Override

      expect(ctx4.get('a')).toBe(10);
      expect(ctx4.get('b')).toBe(2);
      expect(ctx4.get('c')).toBe(3);
      expect(ctx1.get('a')).toBe(1); // Original unchanged
    });

    test('should handle undefined values correctly', () => {
      const ctx = context({ a: undefined });

      expect(ctx.has('a')).toBe(true);
      expect(ctx.get('a')).toBeUndefined();
      expect(ctx.keys()).toContain('a');
    });

    test('should handle null values correctly', () => {
      const ctx = context({ a: null });

      expect(ctx.has('a')).toBe(true);
      expect(ctx.get('a')).toBeNull();
    });

    test('should handle has with non-existent keys', () => {
      const ctx = context({ a: 1 });

      expect(ctx.has('a')).toBe(true);
      expect(ctx.has('nonexistent')).toBe(false);
      expect(ctx.has(Symbol('nonexistent'))).toBe(false);
    });

    test('should handle symbols in keys', () => {
      const sym1 = Symbol('test1');
      const sym2 = Symbol('test2');
      const ctx = context({ [sym1]: 'value1', [sym2]: 'value2', regular: 'value' });
      const keys = ctx.keys();

      expect(keys).toContain(sym1);
      expect(keys).toContain(sym2);
      expect(keys).toContain('regular');
      expect(keys).toHaveLength(3);
    });

    test('should handle fork with symbol keys', () => {
      const sym = Symbol('test');
      const parent = context({ [sym]: 'parent' });
      const child = parent.fork().with({ [sym]: 'child' });

      expect(parent.get(sym)).toBe('parent');
      expect(child.get(sym)).toBe('child');
    });

    test('should handle fork with overridden values', () => {
      const parent = context({ a: 1, b: 2 });
      const child = parent.fork().with({ b: 20, c: 30 });

      expect(child.get('a')).toBe(1); // Inherited
      expect(child.get('b')).toBe(20); // Overridden
      expect(child.get('c')).toBe(30); // New
      expect(parent.get('c')).toBeUndefined(); // Parent unchanged
    });

    test('should check if parent is frozen when forking', () => {
      const parent = context({ a: 1 }).freeze();
      const child = parent.fork();

      expect(child.get('a')).toBe(1);
      // Child should not be frozen
      expect(() => child.with({ b: 2 })).not.toThrow();
    });

    test('should handle empty with() call', () => {
      const ctx = context({ a: 1 });
      const same = ctx.with({});

      expect(same.get('a')).toBe(1);
      expect(same.keys()).toEqual(['a']);
    });

    test('should handle large number of keys', () => {
      const values: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        values[`key${i}`] = i;
      }

      const ctx = context(values);
      expect(ctx.keys()).toHaveLength(1000);
      expect(ctx.get('key500')).toBe(500);
      expect(ctx.has('key999')).toBe(true);
    });

    test('should handle complex nested values', () => {
      const obj = { nested: { deep: 'value' } };
      const ctx = context({ complex: obj });

      expect(ctx.get('complex')).toBe(obj);
      expect((ctx.get('complex') as any).nested.deep).toBe('value');
    });
  });
});

describe('Context Edge Cases', () => {
  describe('AsyncLocalStorage fallback', () => {
    test('should handle missing AsyncLocalStorage in run', async () => {
      const originalProcess = globalThis.process;
      delete (globalThis as any).process;

      const ctx = context({ test: 'value' });
      const testFlow = flow((x: number) => x * 2);

      const result = await ctx.run(testFlow, 5);
      expect(result).toBe(10);

      if (originalProcess) {
        globalThis.process = originalProcess;
      }
    });

    test('should handle missing AsyncLocalStorage in withContext', async () => {
      const originalProcess = globalThis.process;
      delete (globalThis as any).process;

      const ctx = context({ test: 'value' });

      const result = await withContext(ctx, () => 'test result');
      expect(result).toBe('test result');

      if (originalProcess) {
        globalThis.process = originalProcess;
      }
    });

    test('should handle synchronous flow in contextual pipe', () => {
      const syncFlow = contextual((_input: number, _ctx) => 42);
      const double = flow((x: number) => x * 2);

      const piped = syncFlow.pipe(double);
      // Since contextual always returns async, this will be a Promise
      expect(piped(5)).toBeInstanceOf(Promise);
    });
  });

  describe('Edge case handling', () => {
    test('should handle deeply nested parent contexts', () => {
      let ctx = context({ level0: 'base' });
      for (let i = 1; i <= 10; i++) {
        ctx = ctx.fork().with({ [`level${i}`]: `value${i}` });
      }

      expect(ctx.keys()).toHaveLength(11);
      expect(ctx.get('level0')).toBe('base');
      expect(ctx.get('level10')).toBe('value10');
    });

    test('should handle context with many keys', () => {
      const manyKeys: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        manyKeys[`key${i}`] = i;
      }

      const ctx = context(manyKeys);
      expect(ctx.keys()).toHaveLength(100);
      expect(ctx.get('key50')).toBe(50);
    });

    test('should handle context with mixed primitive types', () => {
      const ctx = context({
        string: 'text',
        number: 42,
        boolean: true,
        null: null,
        undefined: undefined,
        symbol: Symbol.for('test'),
        bigint: BigInt(9007199254740991),
      });

      expect(ctx.get('string')).toBe('text');
      expect(ctx.get('number')).toBe(42);
      expect(ctx.get('boolean')).toBe(true);
      expect(ctx.get('null')).toBe(null);
      expect(ctx.get('undefined')).toBe(undefined);
      expect(ctx.get('symbol')).toBe(Symbol.for('test'));
      expect(ctx.get('bigint')).toBe(BigInt(9007199254740991));
    });

    test('should handle async flow execution with context', async () => {
      const ctx = context({ multiplier: 3 });
      const asyncFlow = flow(async (x: number) => {
        await new Promise((r) => setTimeout(r, 1));
        return x * 2;
      });

      const result = await ctx.run(asyncFlow, 5);
      expect(result).toBe(10);
    });

    test('should handle error in flow execution', async () => {
      const ctx = context();
      const errorFlow = flow(() => {
        throw new Error('Test error');
      });

      await expect(ctx.run(errorFlow, undefined)).rejects.toThrow('Test error');
    });
  });
});
