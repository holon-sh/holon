import { afterEach, describe, expect, test } from 'vitest';
import {
  clearModuleRegistry,
  context,
  contextModule,
  contextual,
  createModule,
  getCurrentContext,
  withContext,
  withModules,
} from '../src/index.js';

describe('Branch Coverage Tests', () => {
  afterEach(async () => {
    await clearModuleRegistry();
  });

  describe('Context branches', () => {
    test('should handle context without parent in get operation', () => {
      const ctx = context({ a: 1 });
      expect(ctx.get('b')).toBeUndefined(); // Tests branch where parent doesn't exist
    });

    test('should handle context with undefined values in with operation', () => {
      const ctx = context();
      const newCtx = ctx.with({ a: undefined, b: 2 });
      expect(newCtx.has('a')).toBe(true);
      expect(newCtx.get('a')).toBeUndefined();
      expect(newCtx.get('b')).toBe(2);
    });

    test('should handle empty keys array', () => {
      const ctx = context({ a: 1, b: 2 });
      expect(ctx.keys()).toHaveLength(2);

      const emptyCtx = context();
      expect(emptyCtx.keys()).toHaveLength(0);
    });

    test('should handle has() with non-existent parent', () => {
      const ctx = context({ a: 1 });
      expect(ctx.has('a')).toBe(true);
      expect(ctx.has('b')).toBe(false); // Tests ?? false branch
    });
  });

  describe('Module branches', () => {
    test('should handle module with no dependencies', async () => {
      const simpleModule = createModule({
        name: 'no-deps',
        version: '1.0.0',
        factory: () => ({ simple: true }),
      });

      const ctx = withModules(context());
      ctx.use(simpleModule);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>('no-deps');
      expect(mod?.simple).toBe(true);
    });

    test('should handle module with empty dependencies array', async () => {
      const emptyDepsModule = createModule({
        name: 'empty-deps',
        version: '1.0.0',
        dependencies: [],
        factory: () => ({ empty: true }),
      });

      const ctx = withModules(context());
      ctx.use(emptyDepsModule);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>('empty-deps');
      expect(mod?.empty).toBe(true);
    });

    test('should handle module without onInit hook', async () => {
      const noInitModule = createModule({
        name: 'no-init',
        version: '1.0.0',
        factory: () => ({ noInit: true }),
      });

      const ctx = withModules(context());
      ctx.use(noInitModule);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const mod = ctx.getModule<any>('no-init');
      expect(mod?.noInit).toBe(true);
    });

    test('should handle module without onDestroy hook', async () => {
      const noDestroyModule = createModule({
        name: 'no-destroy',
        version: '1.0.0',
        factory: () => ({ noDestroy: true }),
      });

      const ctx = withModules(context());
      ctx.use(noDestroyModule);
      await new Promise((resolve) => setTimeout(resolve, 10));

      ctx.unload('no-destroy');
      // Should complete without error
    });

    test('should handle destroy of non-initialized module', () => {
      const ctx = withModules(context());
      // Should not throw
      expect(() => ctx.unload('non-existent')).not.toThrow();
    });

    test('should handle proxy get for modular context properties', async () => {
      const testModule = createModule({
        name: 'proxy-test',
        version: '1.0.0',
        factory: () => ({ value: 'test' }),
      });

      const ctx = withModules(context({ base: 'value' }));
      const enhanced = ctx.use(testModule);

      // Access context property through proxy
      expect(enhanced.get('base')).toBe('value');
      expect(enhanced.has('base')).toBe(true);
      expect(enhanced.keys()).toContain('base');
    });

    test('should handle module registry has check', () => {
      const testModule = createModule({
        name: 'has-test',
        version: '1.0.0',
        factory: () => ({}),
      });

      const ctx = withModules(context());

      expect(ctx.hasModule('has-test')).toBe(false);
      ctx.use(testModule);
      expect(ctx.hasModule('has-test')).toBe(true);
    });
  });

  describe('AsyncLocalStorage branches', () => {
    test('should handle withContext without storage', async () => {
      const originalProcess = globalThis.process;
      delete (globalThis as any).process;

      try {
        const ctx = context({ test: 'value' });
        const result = await withContext(ctx, () => 'result');
        expect(result).toBe('result');
      } finally {
        if (originalProcess) {
          globalThis.process = originalProcess;
        }
      }
    });

    test('should handle getCurrentContext without storage', async () => {
      const originalProcess = globalThis.process;
      delete (globalThis as any).process;

      try {
        const ctx = await getCurrentContext();
        expect(ctx).toBeUndefined();
      } finally {
        if (originalProcess) {
          globalThis.process = originalProcess;
        }
      }
    });
  });

  describe('Contextual flow branches', () => {
    test('should handle contextual with missing current context', async () => {
      const testFlow = contextual((input: number, _ctx) => {
        // Should get empty context when no current context
        return input * 2;
      });

      const result = await testFlow(5);
      expect(result).toBe(10);
    });

    test('should handle contextual pipe with promise', async () => {
      const asyncFlow = contextual(async (input: number, _ctx) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return input * 2;
      });

      const syncNext = ((x: number) => x + 1) as any;
      const piped = asyncFlow.pipe(syncNext);

      const result = await piped(5);
      expect(result).toBe(11);
    });
  });

  describe('Module edge cases for branch coverage', () => {
    test('should handle duplicate module registration gracefully', () => {
      const module1 = createModule({
        name: 'duplicate',
        version: '1.0.0',
        factory: () => ({ first: true }),
      });

      const ctx = withModules(context());
      ctx.use(module1);

      // Try to use again - should not throw
      ctx.use(module1);
      expect(ctx.hasModule('duplicate')).toBe(true);
    });

    test('should handle module destroy with no instance', async () => {
      createModule({
        name: 'no-instance',
        version: '1.0.0',
        factory: () => ({ test: true }),
      });

      const ctx = withModules(context());

      // Register but don't initialize
      ctx.hasModule('no-instance'); // Just check, don't use

      // Unload non-initialized module
      ctx.unload('no-instance');
      expect(ctx.hasModule('no-instance')).toBe(false);
    });

    test('should handle context isolate with all undefined values', async () => {
      const ctx = withModules(context({ a: undefined, b: undefined }));
      ctx.use(contextModule);

      await new Promise((resolve) => setTimeout(resolve, 10));
      const ctxModule = ctx.getModule<any>(Symbol.for('holon:context'));

      if (ctxModule?.context) {
        const isolated = ctxModule.context.isolate(['a', 'b', 'c']);
        expect(isolated.keys()).toHaveLength(0); // All undefined, nothing copied
      }
    });
  });
});
