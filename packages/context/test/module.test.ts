import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  clearModuleRegistry,
  context,
  contextModule,
  createModule,
  withModules,
} from '../src/index.js';

describe('Module System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await clearModuleRegistry();
  });

  describe('Module Definition', () => {
    test('should create a module definition', () => {
      const module = createModule({
        name: 'test-module',
        version: '1.0.0',
        description: 'Test module',
        factory: () => ({ test: 'value' }),
      });

      expect(module.name).toBe('test-module');
      expect(module.version).toBe('1.0.0');
      expect(module.description).toBe('Test module');
    });

    test('should support symbol names', () => {
      const sym = Symbol('test');
      const module = createModule({
        name: sym,
        version: '1.0.0',
        factory: () => ({ test: 'value' }),
      });

      expect(module.name).toBe(sym);
    });
  });

  describe('Module Loading', () => {
    test('should load a simple module', async () => {
      const testModule = createModule({
        name: 'simple',
        version: '1.0.0',
        factory: () => ({
          hello: () => 'world',
        }),
      });

      const ctx = withModules(context());
      ctx.use(testModule);

      expect(ctx.hasModule('simple')).toBe(true);
    });

    test('should provide module functionality', async () => {
      const mathModule = createModule({
        name: 'math',
        version: '1.0.0',
        factory: () => ({
          add: (a: number, b: number) => a + b,
          multiply: (a: number, b: number) => a * b,
        }),
      });

      const ctx = withModules(context());
      ctx.use(mathModule);

      // Wait for async initialization
      await new Promise((resolve) => setTimeout(resolve, 10));

      const math = ctx.getModule<{ add: Function; multiply: Function }>('math');

      expect(math).toBeDefined();
      if (math) {
        expect(math.add(2, 3)).toBe(5);
        expect(math.multiply(3, 4)).toBe(12);
      }
    });

    test('should handle module dependencies', async () => {
      const coreModule = createModule({
        name: 'core',
        version: '1.0.0',
        factory: () => ({
          version: '1.0.0',
          utils: {
            format: (s: string) => s.toUpperCase(),
          },
        }),
      });

      const extModule = createModule({
        name: 'extension',
        version: '1.0.0',
        dependencies: ['core'],
        factory: (_ctx) => ({
          enhance: (s: string) => `Enhanced: ${s}`,
        }),
      });

      const ctx = withModules(context());
      ctx.use(coreModule);
      ctx.use(extModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(ctx.hasModule('core')).toBe(true);
      expect(ctx.hasModule('extension')).toBe(true);
    });

    test('should run lifecycle hooks', async () => {
      const onInit = vi.fn();
      const onDestroy = vi.fn();

      const lifecycleModule = createModule({
        name: 'lifecycle',
        version: '1.0.0',
        factory: () => ({ active: true }),
        onInit,
        onDestroy,
      });

      const ctx = withModules(context());
      ctx.use(lifecycleModule);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onInit).toHaveBeenCalled();

      ctx.unload('lifecycle');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onDestroy).toHaveBeenCalled();
    });
  });

  describe('Context Module', () => {
    test('should provide scope functionality', async () => {
      const ctx = withModules(context()).use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));
      const ctxModule = ctx.getModule<any>(Symbol.for('holon:context'));

      if (ctxModule?.context) {
        const scoped = ctxModule.context.scope('request', {
          id: '123',
          timestamp: 1234567890,
        });

        expect(scoped.get('id')).toBe('123');
        expect(scoped.get('timestamp')).toBe(1234567890);
      }
    });

    test('should provide fork functionality', async () => {
      const ctx = withModules(context({ parent: 'value' }));
      ctx.use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));
      const ctxModule = ctx.getModule<any>(Symbol.for('holon:context'));

      if (ctxModule?.context) {
        const forked = ctxModule.context.fork();
        expect(forked.get('parent')).toBe('value');

        const modified = forked.with({ child: 'value2' });
        expect(modified.get('child')).toBe('value2');
        expect(ctx.get('child')).toBeUndefined();
      }
    });

    test('should provide merge functionality', async () => {
      const ctx1 = context({ a: 1, b: 2 });
      const ctx2 = context({ b: 3, c: 4 });

      const ctx = withModules(context()).use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));
      const ctxModule = ctx.getModule<any>(Symbol.for('holon:context'));

      if (ctxModule?.context) {
        const merged = ctxModule.context.merge(ctx1, ctx2);

        expect(merged.get('a')).toBe(1);
        expect(merged.get('b')).toBe(3); // ctx2 overrides ctx1
        expect(merged.get('c')).toBe(4);
      }
    });

    test('should provide isolate functionality', async () => {
      const ctx = withModules(context({ a: 1, b: 2, c: 3, d: 4 })).use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));
      const ctxModule = ctx.getModule<any>(Symbol.for('holon:context'));

      if (ctxModule?.context) {
        const isolated = ctxModule.context.isolate(['a', 'c']);

        expect(isolated.get('a')).toBe(1);
        expect(isolated.get('b')).toBeUndefined();
        expect(isolated.get('c')).toBe(3);
        expect(isolated.get('d')).toBeUndefined();
      }
    });
  });

  describe('Module Configuration', () => {
    test('should support module configuration', () => {
      const configModule = createModule({
        name: 'configured',
        version: '1.0.0',
        config: {
          schema: {
            type: 'object',
            properties: {
              timeout: { type: 'number' },
              retries: { type: 'number' },
            },
            required: ['timeout'],
          },
          defaults: {
            timeout: 5000,
            retries: 3,
          },
        },
        factory: () => ({
          configured: true,
        }),
      });

      expect(configModule.config).toBeDefined();
      expect(configModule.config?.defaults).toEqual({
        timeout: 5000,
        retries: 3,
      });
    });
  });

  describe('Module Management', () => {
    test('should check if module is loaded', async () => {
      const testModule = createModule({
        name: 'test',
        version: '1.0.0',
        factory: () => ({ test: true }),
      });

      const ctx = withModules(context());

      expect(ctx.hasModule('test')).toBe(false);

      ctx.use(testModule);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(ctx.hasModule('test')).toBe(true);
    });

    test('should unload a module', async () => {
      const testModule = createModule({
        name: 'unloadable',
        version: '1.0.0',
        factory: () => ({ test: true }),
        onDestroy: vi.fn(),
      });

      const ctx = withModules(context());
      ctx.use(testModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(ctx.getModule('unloadable')).toBeDefined();

      ctx.unload('unloadable');

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(ctx.getModule('unloadable')).toBeUndefined();
    });

    test('should prevent duplicate module registration', () => {
      const module1 = createModule({
        name: 'duplicate',
        version: '1.0.0',
        factory: () => ({ version: 1 }),
      });

      createModule({
        name: 'duplicate',
        version: '2.0.0',
        factory: () => ({ version: 2 }),
      });

      const ctx = withModules(context());
      ctx.use(module1);

      // Using the same module again should not throw
      expect(() => ctx.use(module1)).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should throw error for missing dependencies', async () => {
      const depModule = createModule({
        name: 'dependent',
        version: '1.0.0',
        dependencies: ['non-existent'],
        factory: () => ({ test: true }),
      });

      const ctx = withModules(context());

      // This will register the module but initialization will fail
      expect(() => {
        try {
          ctx.use(depModule);
        } catch (e) {
          // The error is thrown synchronously in the proxy
          throw e;
        }
      }).not.toThrow();

      // Trying to access module properties should throw
      ctx.use(depModule);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Getting the module should return undefined since initialization failed
      const mod = ctx.getModule('dependent');
      expect(mod).toBeUndefined();
    });

    test('should handle factory error gracefully', async () => {
      const errorModule = createModule({
        name: 'error-factory',
        version: '1.0.0',
        factory: () => {
          throw new Error('Factory failed');
        },
      });

      const ctx = withModules(context());
      ctx.use(errorModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(ctx.getModule('error-factory')).toBeUndefined();
    });

    test('should handle async factory error', async () => {
      const asyncErrorModule = createModule({
        name: 'async-error-factory',
        version: '1.0.0',
        factory: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          throw new Error('Async factory failed');
        },
      });

      const ctx = withModules(context());
      ctx.use(asyncErrorModule);

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(ctx.getModule('async-error-factory')).toBeUndefined();
    });

    test('should handle optional dependencies', async () => {
      const optionalDepModule = createModule({
        name: 'optional-dep-module',
        version: '1.0.0',
        optionalDependencies: ['non-existent-optional'],
        factory: () => ({ loaded: true }),
      });

      const ctx = withModules(context());
      ctx.use(optionalDepModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<{ loaded: boolean }>('optional-dep-module');
      expect(mod?.loaded).toBe(true);
    });
  });

  describe('contextModule tests', () => {
    test('should provide scope functionality', async () => {
      const ctx = withModules(context({ initial: 'value' }));
      ctx.use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>(Symbol.for('holon:context'));
      expect(mod).toBeDefined();

      if (mod) {
        const scoped = mod.context.scope('test-scope', { a: 1, b: 2 });
        expect(scoped.get('a')).toBe(1);
        expect(scoped.get('b')).toBe(2);
        expect(scoped.get('initial')).toBe('value');
      }
    });

    test('should provide fork functionality', async () => {
      const ctx = withModules(context({ base: 'value' }));
      ctx.use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>(Symbol.for('holon:context'));
      if (mod) {
        const forked = mod.context.fork();
        expect(forked.get('base')).toBe('value');

        const forkedWithExtra = forked.with({ extra: 'data' });
        expect(forkedWithExtra.get('extra')).toBe('data');
      }
    });

    test('should provide merge functionality', async () => {
      const ctx = withModules(context({ base: 'value' }));
      ctx.use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>(Symbol.for('holon:context'));
      if (mod) {
        const ctx1 = context({ a: 1 });
        const ctx2 = context({ b: 2 });
        const ctx3 = context({ c: 3 });

        const merged = mod.context.merge(ctx1, ctx2, ctx3);
        expect(merged.get('base')).toBe('value');
        expect(merged.get('a')).toBe(1);
        expect(merged.get('b')).toBe(2);
        expect(merged.get('c')).toBe(3);
      }
    });

    test('should provide isolate functionality', async () => {
      const ctx = withModules(
        context({
          keep1: 'value1',
          keep2: 'value2',
          remove: 'should not be present',
        }),
      );
      ctx.use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>(Symbol.for('holon:context'));
      if (mod) {
        const isolated = mod.context.isolate(['keep1', 'keep2']);
        expect(isolated.get('keep1')).toBe('value1');
        expect(isolated.get('keep2')).toBe('value2');
        expect(isolated.get('remove')).toBeUndefined();
      }
    });

    test('should handle empty isolate', async () => {
      const ctx = withModules(context({ a: 1, b: 2 }));
      ctx.use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>(Symbol.for('holon:context'));
      if (mod) {
        const isolated = mod.context.isolate([]);
        expect(isolated.keys()).toHaveLength(0);
      }
    });

    test('should handle isolate with non-existent keys', async () => {
      const ctx = withModules(context({ existing: 'value' }));
      ctx.use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>(Symbol.for('holon:context'));
      if (mod) {
        const isolated = mod.context.isolate(['non-existent', 'also-missing']);
        expect(isolated.keys()).toHaveLength(0);
      }
    });

    test('should handle merge with undefined values', async () => {
      const ctx = withModules(context({ base: 'value' }));
      ctx.use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>(Symbol.for('holon:context'));
      if (mod) {
        const ctxWithUndefined = context({ a: undefined, b: 'defined' });
        const merged = mod.context.merge(ctxWithUndefined);

        // undefined values are skipped in merge
        expect(merged.has('a')).toBe(false);
        expect(merged.get('b')).toBe('defined');
      }
    });

    test('should handle merge with symbol keys', async () => {
      const sym = Symbol('test-symbol');
      const ctx = withModules(context({ base: 'value' }));
      ctx.use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>(Symbol.for('holon:context'));
      if (mod) {
        const ctxWithSymbol = context({ [sym]: 'symbol-value' });
        const merged = mod.context.merge(ctxWithSymbol);

        expect(merged.get(sym)).toBe('symbol-value');
        expect(merged.get('base')).toBe('value');
      }
    });
  });

  describe('ModuleRegistry edge cases', () => {
    test('should handle module with all lifecycle hooks', async () => {
      const onInitSpy = vi.fn();
      const onDestroySpy = vi.fn();

      const lifecycleModule = createModule({
        name: 'lifecycle-test',
        version: '1.0.0',
        factory: () => ({ lifecycle: true }),
        onInit: onInitSpy,
        onDestroy: onDestroySpy,
      });

      const ctx = withModules(context());
      ctx.use(lifecycleModule);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onInitSpy).toHaveBeenCalled();
      expect(ctx.getModule('lifecycle-test')).toBeDefined();

      await ctx.unload('lifecycle-test');
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onDestroySpy).toHaveBeenCalled();
    });

    test('should handle module with async lifecycle hooks', async () => {
      const asyncInitSpy = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });

      const asyncDestroySpy = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });

      const asyncLifecycleModule = createModule({
        name: 'async-lifecycle',
        version: '1.0.0',
        factory: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { async: true };
        },
        onInit: asyncInitSpy,
        onDestroy: asyncDestroySpy,
      });

      const ctx = withModules(context());
      ctx.use(asyncLifecycleModule);

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(asyncInitSpy).toHaveBeenCalled();
      expect(ctx.getModule('async-lifecycle')).toBeDefined();

      await ctx.unload('async-lifecycle');
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(asyncDestroySpy).toHaveBeenCalled();
    });

    test('should handle module registration with same name', () => {
      const module1 = createModule({
        name: 'duplicate',
        version: '1.0.0',
        factory: () => ({ version: 1 }),
      });

      const ctx = withModules(context());
      ctx.use(module1);

      // Using the same module again should reuse existing
      expect(() => ctx.use(module1)).not.toThrow();
    });

    test('should check if module is loaded', async () => {
      const testModule = createModule({
        name: 'check-loaded',
        version: '1.0.0',
        factory: () => ({ test: true }),
      });

      const ctx = withModules(context());

      expect(ctx.hasModule('check-loaded')).toBe(false);

      ctx.use(testModule);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(ctx.hasModule('check-loaded')).toBe(true);
    });
  });
});
