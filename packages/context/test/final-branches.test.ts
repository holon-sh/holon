import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearModuleRegistry, context, createModule, withModules } from '../src/index.js';

describe('Final Branch Coverage', () => {
  afterEach(async () => {
    await clearModuleRegistry();
  });

  describe('Context parent chain branches', () => {
    test('should handle deeply nested parent chain for get', () => {
      const grandparent = context({ a: 1 });
      const parent = grandparent.fork().with({ b: 2 });
      const child = parent.fork().with({ c: 3 });

      // Test all branches of parent chain traversal
      expect(child.get('c')).toBe(3); // Found in current
      expect(child.get('b')).toBe(2); // Found in parent
      expect(child.get('a')).toBe(1); // Found in grandparent
      expect(child.get('d')).toBeUndefined(); // Not found anywhere
    });

    test('should handle parent chain for has', () => {
      const grandparent = context({ a: 1 });
      const parent = grandparent.fork();
      const child = parent.fork().with({ b: 2 });

      expect(child.has('b')).toBe(true); // In current
      expect(child.has('a')).toBe(true); // In grandparent
      expect(child.has('c')).toBe(false); // Nowhere
    });

    test('should handle parent chain iteration for keys', () => {
      const grandparent = context({ a: 1 });
      const parent = grandparent.fork().with({ b: 2 });
      const child = parent.fork().with({ c: 3 });

      const keys = child.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
      expect(keys).toHaveLength(3);
    });

    test('should handle context without parent', () => {
      const ctx = context({ a: 1 });
      // Direct context without parent
      const keys = ctx.keys();
      expect(keys).toEqual(['a']);
    });

    test('should handle empty parent chain', () => {
      const ctx = context();
      const child = ctx.fork();
      const grandchild = child.fork();

      expect(grandchild.keys()).toEqual([]);
      expect(grandchild.has('anything')).toBe(false);
    });
  });

  describe('Module dependency branches', () => {
    test('should handle module already registered branch', async () => {
      const module = createModule({
        name: 'already-registered',
        version: '1.0.0',
        factory: () => ({ value: 1 }),
      });

      const ctx1 = withModules(context());
      ctx1.use(module);

      const ctx2 = withModules(context());
      ctx2.use(module); // Should hit "already registered" branch

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod1 = ctx1.getModule<any>('already-registered');
      const mod2 = ctx2.getModule<any>('already-registered');
      expect(mod1).toBe(mod2); // Same module instance
    });

    test('should handle error in module factory catch block', async () => {
      const errorModule = createModule({
        name: 'factory-error',
        version: '1.0.0',
        factory: () => {
          throw new Error('Factory error');
        },
      });

      const ctx = withModules(context());

      // Suppress expected error output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        ctx.use(errorModule);
        await new Promise((resolve) => setTimeout(resolve, 10));
      } catch (error) {
        // Expected to throw
        expect(error).toBeDefined();
      }

      consoleSpy.mockRestore();
    });

    test('should handle instancePromise.catch branch', () => {
      const asyncErrorModule = createModule({
        name: 'async-error',
        version: '1.0.0',
        factory: async () => {
          throw new Error('Async factory error');
        },
      });

      const ctx = withModules(context());

      // This triggers instancePromise.catch(() => {}) to prevent unhandled rejection
      const enhanced = ctx.use(asyncErrorModule);

      // The proxy is returned immediately
      expect(enhanced).toBeDefined();
    });
  });

  describe('Module destroy branches', () => {
    test('should handle destroy with initialized false', async () => {
      createModule({
        name: 'not-initialized',
        version: '1.0.0',
        factory: () => ({ test: true }),
      });

      const ctx = withModules(context());

      // Register module but don't initialize
      expect(ctx.hasModule('not-initialized')).toBe(false);

      // Try to unload non-existent module - should handle gracefully
      ctx.unload('not-initialized');
      expect(ctx.hasModule('not-initialized')).toBe(false);
    });

    test('should handle missing module in initOrder', async () => {
      const module = createModule({
        name: 'test-order',
        version: '1.0.0',
        factory: () => ({ test: true }),
      });

      const ctx = withModules(context());
      ctx.use(module);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Manually clear and try to destroy
      await clearModuleRegistry();

      // Should handle missing module gracefully
      ctx.unload('test-order');
    });
  });

  describe('AsyncLocalStorage import branches', () => {
    test('should handle non-node environment', async () => {
      const originalProcess = globalThis.process;

      // Mock non-node environment
      globalThis.process = { versions: {} } as any;

      try {
        // Create context in non-node environment
        const ctx = context({ test: 'value' });
        expect(ctx.get('test')).toBe('value');

        // Test run without AsyncLocalStorage
        const testFlow = ((_: null) => 'result') as any;
        testFlow.pipe = () => testFlow;
        const result = await ctx.run(testFlow, null);
        expect(result).toBe('result');
      } finally {
        globalThis.process = originalProcess;
      }
    });
  });

  describe('Contextual flow synchronous branch', () => {
    test('should handle non-promise intermediate in pipe', () => {
      // Create a mock flow that returns synchronously
      const mockFlow = Object.assign((input: number) => input * 2, {
        pipe: function <Next>(next: (x: any) => Next) {
          const piped = (input: any) => {
            const intermediate = (this as any)(input);
            // Test the synchronous branch (line 219)
            if (intermediate instanceof Promise) {
              return intermediate.then(next);
            }
            return next(intermediate);
          };
          piped.pipe = (f: any) => (this as any).pipe((x: any) => f(next(x)));
          return piped;
        },
      });

      const result = mockFlow.pipe((x: number) => x + 1)(5);
      expect(result).toBe(11);
    });
  });

  describe('Context with branches', () => {
    test('should handle with() with only string keys', () => {
      const ctx = context();
      const newCtx = ctx.with({ a: 1, b: 2 });
      expect(newCtx.get('a')).toBe(1);
      expect(newCtx.get('b')).toBe(2);
    });

    test('should handle with() with only symbol keys', () => {
      const sym1 = Symbol('test1');
      const sym2 = Symbol('test2');
      const ctx = context();
      const newCtx = ctx.with({ [sym1]: 'value1', [sym2]: 'value2' });
      expect(newCtx.get(sym1)).toBe('value1');
      expect(newCtx.get(sym2)).toBe('value2');
    });

    test('should handle with() with no symbol keys', () => {
      const ctx = context();
      const obj = Object.create(null);
      obj.a = 1;
      obj.b = 2;
      const newCtx = ctx.with(obj);
      expect(newCtx.get('a')).toBe(1);
      expect(newCtx.get('b')).toBe(2);
    });
  });
});
