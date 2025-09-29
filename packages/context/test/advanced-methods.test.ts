import { describe, expect, test } from 'vitest';
import { context } from '../src/index.js';

describe('Context Advanced Methods', () => {
  describe('delete method', () => {
    test('should delete a key from context', () => {
      const ctx = context({ a: 1, b: 2, c: 3 });
      const deleted = ctx.delete('b');

      expect(deleted.get('a')).toBe(1);
      expect(deleted.get('b')).toBeUndefined();
      expect(deleted.get('c')).toBe(3);
      expect(deleted.has('b')).toBe(false);
    });

    test('should handle delete on non-existent key', () => {
      const ctx = context({ a: 1 });
      const deleted = ctx.delete('nonexistent');

      expect(deleted.get('a')).toBe(1);
      expect(deleted.keys()).toEqual(['a']);
    });

    test('should handle multiple delete operations', () => {
      const ctx = context({ a: 1, b: 2, c: 3, d: 4 });
      const result = ctx.delete('a').delete('c');

      expect(result.get('a')).toBeUndefined();
      expect(result.get('b')).toBe(2);
      expect(result.get('c')).toBeUndefined();
      expect(result.get('d')).toBe(4);
    });

    test('should handle delete with symbol keys', () => {
      const sym = Symbol('test');
      const ctx = context({ [sym]: 'value', a: 1 });
      const deleted = ctx.delete(sym);

      expect(deleted.has(sym)).toBe(false);
      expect(deleted.get('a')).toBe(1);
    });

    test('should throw when deleting from frozen context', () => {
      const ctx = context({ a: 1 }).freeze();
      expect(() => ctx.delete('a')).toThrow('Cannot modify frozen context');
    });

    test('should delete key but preserve parent values', () => {
      const parent = context({ a: 1, b: 2 });
      const child = parent.fork().with({ b: 20, c: 3 });
      const deleted = child.delete('b');

      expect(deleted.get('a')).toBe(1); // From parent
      expect(deleted.get('b')).toBe(2); // Back to parent value
      expect(deleted.get('c')).toBe(3); // Own value
    });
  });

  describe('clear method', () => {
    test('should clear all keys', () => {
      const ctx = context({ a: 1, b: 2 });
      const cleared = ctx.clear();

      expect(cleared.keys()).toEqual([]);
      expect(cleared.get('a')).toBeUndefined();
      expect(cleared.get('b')).toBeUndefined();
    });

    test('should clear context with symbols', () => {
      const sym = Symbol('test');
      const ctx = context({ a: 1, [sym]: 'value' });
      const cleared = ctx.clear();

      expect(cleared.keys()).toEqual([]);
      expect(cleared.has(sym)).toBe(false);
    });

    test('should throw when clearing frozen context', () => {
      const ctx = context({ a: 1 }).freeze();
      expect(() => ctx.clear()).toThrow('Cannot modify frozen context');
    });

    test('should clear child context without parent chain', () => {
      const parent = context({ a: 1 });
      const child = parent.fork().with({ b: 2 });
      const cleared = child.clear();

      expect(cleared.keys()).toEqual([]);
      expect(cleared.get('a')).toBeUndefined(); // Parent chain removed
    });
  });

  describe('entries method', () => {
    test('should return all entries', () => {
      const ctx = context({ a: 1, b: 2, c: 3 });
      const entries = ctx.entries();

      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 2]);
      expect(entries).toContainEqual(['c', 3]);
      expect(entries).toHaveLength(3);
    });

    test('should handle entries with symbols', () => {
      const sym = Symbol('test');
      const ctx = context({ [sym]: 'value', regular: 'text' });
      const entries = ctx.entries();

      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual([sym, 'value']);
      expect(entries).toContainEqual(['regular', 'text']);
    });

    test('should merge entries from parent chain', () => {
      const parent = context({ a: 1, b: 2 });
      const child = parent.fork().with({ b: 20, c: 3 });
      const entries = child.entries();

      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 20]); // Child overrides
      expect(entries).toContainEqual(['c', 3]);
      expect(entries).toHaveLength(3);
    });

    test('should handle empty context', () => {
      const ctx = context();
      expect(ctx.entries()).toEqual([]);
    });
  });

  describe('values method', () => {
    test('should return all values', () => {
      const ctx = context({ a: 1, b: 2, c: 3 });
      const values = ctx.values();

      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toContain(3);
      expect(values).toHaveLength(3);
    });

    test('should handle complex values', () => {
      const obj = { nested: 'value' };
      const arr = [1, 2, 3];
      const ctx = context({ obj, arr, primitive: 42 });
      const values = ctx.values();

      expect(values).toContain(obj);
      expect(values).toContain(arr);
      expect(values).toContain(42);
    });

    test('should include values from parent', () => {
      const parent = context({ a: 1 });
      const child = parent.fork().with({ b: 2 });
      const values = child.values();

      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toHaveLength(2);
    });
  });

  describe('merge method', () => {
    test('should merge multiple contexts', () => {
      const ctx1 = context({ a: 1, b: 2 });
      const ctx2 = context({ b: 20, c: 3 });
      const ctx3 = context({ d: 4 });

      const merged = ctx1.merge(ctx2, ctx3);

      expect(merged.get('a')).toBe(1);
      expect(merged.get('b')).toBe(20); // ctx2 overrides
      expect(merged.get('c')).toBe(3);
      expect(merged.get('d')).toBe(4);
    });

    test('should merge contexts with symbols', () => {
      const sym1 = Symbol('test1');
      const sym2 = Symbol('test2');

      const ctx1 = context({ [sym1]: 'value1' });
      const ctx2 = context({ [sym2]: 'value2' });

      const merged = ctx1.merge(ctx2);

      expect(merged.get(sym1)).toBe('value1');
      expect(merged.get(sym2)).toBe('value2');
    });

    test('should merge with empty context', () => {
      const ctx = context({ a: 1 });
      const empty = context();

      const merged = ctx.merge(empty);

      expect(merged.get('a')).toBe(1);
      expect(merged.keys()).toEqual(['a']);
    });

    test('should throw when merging into frozen context', () => {
      const ctx1 = context({ a: 1 }).freeze();
      const ctx2 = context({ b: 2 });

      expect(() => ctx1.merge(ctx2)).toThrow('Cannot modify frozen context');
    });

    test('should flatten parent chains when merging', () => {
      const parent1 = context({ a: 1 });
      const child1 = parent1.fork().with({ b: 2 });

      const parent2 = context({ c: 3 });
      const child2 = parent2.fork().with({ d: 4 });

      const merged = child1.merge(child2);

      expect(merged.get('a')).toBe(1);
      expect(merged.get('b')).toBe(2);
      expect(merged.get('c')).toBe(3);
      expect(merged.get('d')).toBe(4);
      expect(merged.keys()).toHaveLength(4);
    });
  });

  describe('clone method', () => {
    test('should create exact copy without parent', () => {
      const parent = context({ a: 1 });
      const child = parent.fork().with({ b: 2 });

      const cloned = child.clone();

      expect(cloned.get('a')).toBe(1);
      expect(cloned.get('b')).toBe(2);
      expect(cloned.keys()).toHaveLength(2);

      // Verify no parent relationship
      cloned.with({ c: 3 });
      expect(parent.get('c')).toBeUndefined();
    });

    test('should clone context with symbols', () => {
      const sym = Symbol('test');
      const ctx = context({ [sym]: 'value', a: 1 });

      const cloned = ctx.clone();

      expect(cloned.get(sym)).toBe('value');
      expect(cloned.get('a')).toBe(1);
    });

    test('should create independent copy', () => {
      const original = context({ a: 1 });
      const cloned = original.clone();

      const modified = cloned.with({ b: 2 });

      expect(original.has('b')).toBe(false);
      expect(modified.has('b')).toBe(true);
    });
  });

  describe('toObject method', () => {
    test('should convert context to plain object', () => {
      const ctx = context({ a: 1, b: 'text', c: true });
      const obj = ctx.toObject();

      expect(obj).toEqual({ a: 1, b: 'text', c: true });
      expect(obj['a']).toBe(1);
      expect(obj['b']).toBe('text');
      expect(obj['c']).toBe(true);
    });

    test('should include symbol keys in object', () => {
      const sym = Symbol.for('test');
      const ctx = context({ [sym]: 'symbol-value', regular: 'value' });
      const obj = ctx.toObject();

      expect(obj[sym]).toBe('symbol-value');
      expect(obj['regular']).toBe('value');
    });

    test('should flatten parent hierarchy', () => {
      const parent = context({ a: 1, b: 2 });
      const child = parent.fork().with({ b: 20, c: 3 });
      const obj = child.toObject();

      expect(obj).toEqual({ a: 1, b: 20, c: 3 });
    });

    test('should handle complex nested values', () => {
      const nested = { deep: { value: 'test' } };
      const ctx = context({ nested, array: [1, 2, 3] });
      const obj = ctx.toObject();

      expect(obj['nested']).toBe(nested);
      expect(obj['array']).toEqual([1, 2, 3]);
    });

    test('should return empty object for empty context', () => {
      const ctx = context();
      const obj = ctx.toObject();

      expect(obj).toEqual({});
      expect(Object.keys(obj)).toHaveLength(0);
    });
  });

  describe('Practical use cases', () => {
    test('should handle request context lifecycle', () => {
      // Initial app context
      const appCtx = context({
        app: 'myapp',
        version: '1.0.0',
        env: 'production',
      });

      // Request-specific context
      const requestCtx = appCtx.fork().with({
        requestId: 'req-123',
        userId: 'user-456',
        timestamp: Date.now(),
      });

      // Add auth info
      const authCtx = requestCtx.with({
        token: 'jwt-token',
        permissions: ['read', 'write'],
      });

      // Clean sensitive data before logging
      const loggableCtx = authCtx.delete('token');

      expect(loggableCtx.get('userId')).toBe('user-456');
      expect(loggableCtx.get('token')).toBeUndefined();
      expect(loggableCtx.get('app')).toBe('myapp');
    });

    test('should handle multi-tenant context merging', () => {
      // Tenant defaults
      const tenantDefaults = context({
        theme: 'default',
        locale: 'en',
        features: ['basic'],
      });

      // Specific tenant config
      const tenantConfig = context({
        theme: 'dark',
        customDomain: 'tenant.example.com',
        features: ['basic', 'advanced'],
      });

      // User preferences
      const userPrefs = context({
        locale: 'fr',
        timezone: 'Europe/Paris',
      });

      // Merge: user > tenant > defaults
      const finalContext = tenantDefaults.merge(tenantConfig, userPrefs);

      expect(finalContext.get('theme')).toBe('dark'); // From tenant
      expect(finalContext.get('locale')).toBe('fr'); // From user
      expect(finalContext.get('timezone')).toBe('Europe/Paris'); // From user
      expect(finalContext.get('customDomain')).toBe('tenant.example.com'); // From tenant
    });

    test('should handle caching context serialization', () => {
      const ctx = context({
        cacheKey: 'user:123',
        data: { name: 'Alice', age: 30 },
        ttl: 3600,
      });

      // Serialize for cache storage
      const serialized = JSON.stringify(ctx.toObject());

      // Restore from cache
      const restored = context(JSON.parse(serialized));

      expect(restored.get('cacheKey')).toBe('user:123');
      expect(restored.get('data')).toEqual({ name: 'Alice', age: 30 });
      expect(restored.get('ttl')).toBe(3600);
    });

    test('should handle test context reset', () => {
      let testCtx = context({
        testRun: 1,
        mocks: { api: 'mocked' },
      });

      // Run test
      testCtx = testCtx.with({ currentTest: 'test1' });
      expect(testCtx.get('currentTest')).toBe('test1');

      // Reset for next test
      testCtx = testCtx.clear().with({
        testRun: 2,
        mocks: { api: 'mocked' },
      });

      expect(testCtx.get('currentTest')).toBeUndefined();
      expect(testCtx.get('testRun')).toBe(2);
    });

    test('should handle middleware context chain', () => {
      // Each middleware adds to context
      const initialCtx = context({ request: 'GET /api/users' });

      // Auth middleware
      const afterAuth = initialCtx.with({
        authenticated: true,
        userId: '123',
      });

      // Logging middleware
      const afterLogging = afterAuth.with({
        startTime: Date.now(),
        correlationId: 'corr-456',
      });

      // Rate limit middleware
      const afterRateLimit = afterLogging.with({
        rateLimitRemaining: 99,
        rateLimitReset: Date.now() + 3600000,
      });

      // Get all middleware data
      const entries = afterRateLimit.entries();
      const entryKeys = entries.map(([key]) => key);

      expect(entryKeys).toContain('authenticated');
      expect(entryKeys).toContain('correlationId');
      expect(entryKeys).toContain('rateLimitRemaining');
    });
  });
});
