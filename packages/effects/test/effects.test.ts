import { context } from '@holon/context';
import { flow } from '@holon/flow';
import { describe, expect, test, vi } from 'vitest';
import {
  combineEffects,
  EffectInterpreter,
  EffectFlags,
  Effects,
  effect,
  effectful,
  hasEffect,
  IO,
  isPure,
  pure,
} from '../src/index.js';

describe('Effects', () => {
  describe('Effect creation', () => {
    test('should create an effect with string id', () => {
      const testEffect = effect('test', EffectFlags.IO, () => {
        console.log('test');
      });

      expect(typeof testEffect.id).toBe('symbol');
      expect(testEffect.flags).toBe(EffectFlags.IO);
      expect(typeof testEffect.handler).toBe('function');
    });

    test('should create an effect with symbol id', () => {
      const sym = Symbol('custom');
      const testEffect = effect(sym, EffectFlags.Read, async () => 'data');

      expect(testEffect.id).toBe(sym);
      expect(testEffect.flags).toBe(EffectFlags.Read);
    });

    test('should create effect with cleanup', () => {
      const cleanup = vi.fn();
      const testEffect = effect('withCleanup', EffectFlags.Write, () => 'result', cleanup);

      expect(testEffect.cleanup).toBe(cleanup);
    });

    test('should combine multiple effect flags', () => {
      const fileEffect = effect(
        'file',
        EffectFlags.Read | EffectFlags.IO | EffectFlags.Async,
        async () => 'content',
      );

      expect(fileEffect.flags & EffectFlags.Read).toBeTruthy();
      expect(fileEffect.flags & EffectFlags.IO).toBeTruthy();
      expect(fileEffect.flags & EffectFlags.Async).toBeTruthy();
    });
  });

  describe('Common Effects', () => {
    test('should have log effect', () => {
      expect(Effects.log).toBeDefined();
      expect(Effects.log.flags & EffectFlags.IO).toBeTruthy();
    });

    test('should have readFile effect', () => {
      expect(Effects.readFile).toBeDefined();
      expect(Effects.readFile.flags & EffectFlags.Read).toBeTruthy();
      expect(Effects.readFile.flags & EffectFlags.IO).toBeTruthy();
      expect(Effects.readFile.flags & EffectFlags.Async).toBeTruthy();
    });

    test('should have writeFile effect', () => {
      expect(Effects.writeFile).toBeDefined();
      expect(Effects.writeFile.flags & EffectFlags.Write).toBeTruthy();
      expect(Effects.writeFile.flags & EffectFlags.IO).toBeTruthy();
      expect(Effects.writeFile.flags & EffectFlags.Async).toBeTruthy();
    });

    test('should have random effect', () => {
      expect(Effects.random).toBeDefined();
      expect(Effects.random.flags & EffectFlags.Random).toBeTruthy();
    });

    test('should have now effect', () => {
      expect(Effects.now).toBeDefined();
      expect(Effects.now.flags & EffectFlags.Time).toBeTruthy();
    });

    test('should have throw effect', () => {
      expect(Effects.throw).toBeDefined();
      expect(Effects.throw.flags & EffectFlags.Throw).toBeTruthy();
    });
  });

  describe('Effectful flows', () => {
    test('should create effectful flow', () => {
      const withEffects = effectful((x: number) => x * 2, [Effects.log, Effects.random]);

      expect(withEffects.effects.has(Effects.log)).toBe(true);
      expect(withEffects.effects.has(Effects.random)).toBe(true);
      expect(withEffects.flags & EffectFlags.IO).toBeTruthy();
      expect(withEffects.flags & EffectFlags.Random).toBeTruthy();
    });

    test('should combine effect flags', () => {
      const multiEffect = effectful(
        () => 'test',
        [Effects.readFile, Effects.writeFile, Effects.now],
      );

      expect(multiEffect.flags & EffectFlags.Read).toBeTruthy();
      expect(multiEffect.flags & EffectFlags.Write).toBeTruthy();
      expect(multiEffect.flags & EffectFlags.Time).toBeTruthy();
      expect(multiEffect.flags & EffectFlags.IO).toBeTruthy();
      expect(multiEffect.flags & EffectFlags.Async).toBeTruthy();
    });
  });

  describe('Pure flows', () => {
    test('should create pure flow', () => {
      const pureFlow = pure((x: number) => x * 2);

      expect(pureFlow.effects.size).toBe(0);
      expect(pureFlow.flags).toBe(EffectFlags.None);
    });

    test('should identify pure flows', () => {
      const pureFlow = pure((x: number) => x + 1);
      const impureFlow = effectful((x: number) => x + Math.random(), [Effects.random]);

      expect(isPure(pureFlow)).toBe(true);
      expect(isPure(impureFlow)).toBe(false);
    });
  });

  describe('Effect detection', () => {
    test('should detect specific effects', () => {
      const withIO = effectful(() => {}, [Effects.log]);
      const withRandom = effectful(() => {}, [Effects.random]);
      const pureFlow = pure(() => {});

      expect(hasEffect(withIO, EffectFlags.IO)).toBe(true);
      expect(hasEffect(withIO, EffectFlags.Random)).toBe(false);

      expect(hasEffect(withRandom, EffectFlags.Random)).toBe(true);
      expect(hasEffect(withRandom, EffectFlags.IO)).toBe(false);

      expect(hasEffect(pureFlow, EffectFlags.IO)).toBe(false);
      expect(hasEffect(pureFlow, EffectFlags.Random)).toBe(false);
    });

    test('should detect multiple effects', () => {
      const multiEffect = effectful(() => {}, [Effects.readFile, Effects.random]);

      expect(hasEffect(multiEffect, EffectFlags.Read)).toBe(true);
      expect(hasEffect(multiEffect, EffectFlags.IO)).toBe(true);
      expect(hasEffect(multiEffect, EffectFlags.Random)).toBe(true);
      expect(hasEffect(multiEffect, EffectFlags.Async)).toBe(true);
      expect(hasEffect(multiEffect, EffectFlags.Write)).toBe(false);
    });
  });

  describe('Effect handlers with context', () => {
    test('should pass context to effect handler', async () => {
      const ctx = context({ value: 'test' });
      const customEffect = effect('custom', EffectFlags.None, (_input, ctx) => {
        return ctx.get('value');
      });

      const result = await customEffect.handler('input', ctx);
      expect(result).toBe('test');
    });
  });

  describe('Effect composition', () => {
    test('should compose effectful flows', () => {
      const first = effectful((x: number) => x * 2, [Effects.log]);
      const second = effectful((x: number) => x + 1, [Effects.random]);
      const composed = first.pipe(second);

      expect(composed(5)).toBe(11);
    });
  });

  describe('Async effects', () => {
    test('should handle async effects', async () => {
      const asyncEffect = effect('async', EffectFlags.Async, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return 'async result';
      });

      const ctx = context();
      const result = await asyncEffect.handler(null, ctx);
      expect(result).toBe('async result');
    });
  });

  describe('combineEffects', () => {
    test('should combine effects from multiple flows', () => {
      const flow1 = effectful(() => 1, [Effects.log]);
      const flow2 = effectful(() => 2, [Effects.random]);
      const flow3 = pure(() => 3);
      const regularFlow = flow(() => 4);

      const combined = combineEffects(flow1, flow2, flow3, regularFlow);

      expect(combined & EffectFlags.IO).toBeTruthy();
      expect(combined & EffectFlags.Random).toBeTruthy();
      expect(combined & EffectFlags.Write).toBeFalsy();
    });

    test('should return None for flows without effects', () => {
      const flow1 = flow(() => 1);
      const flow2 = flow(() => 2);

      const combined = combineEffects(flow1, flow2);
      expect(combined).toBe(EffectFlags.None);
    });
  });

  describe('Effect detection for regular flows', () => {
    test('should return false for regular flows without effect flags', () => {
      const regularFlow = flow(() => 'test');

      expect(hasEffect(regularFlow, EffectFlags.IO)).toBe(false);
      expect(isPure(regularFlow)).toBe(false);
    });
  });

  describe('effectful with explicit flags', () => {
    test('should use explicit flags when provided', () => {
      const customEffect = effect('custom', EffectFlags.IO, () => {});
      const flow = effectful(() => 'test', [customEffect], EffectFlags.Network | EffectFlags.Async);

      expect(flow.flags).toBe(EffectFlags.Network | EffectFlags.Async);
    });
  });
});

describe('IO Monad', () => {
  test('should create IO from value', async () => {
    const io = IO.of(42);
    const result = await io.run();
    expect(result).toBe(42);
  });

  test('should map over IO value', async () => {
    const io = IO.of(10).map((x) => x * 2);
    const result = await io.run();
    expect(result).toBe(20);
  });

  test('should chain IO computations with flatMap', async () => {
    const io = IO.of(5).flatMap((x) => IO.of(x * 3));
    const result = await io.run();
    expect(result).toBe(15);
  });

  test('should handle async computations', async () => {
    const io = IO.async(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return 'async result';
    });
    const result = await io.run();
    expect(result).toBe('async result');
  });

  test('should compose multiple operations', async () => {
    const io = IO.of(2)
      .map((x) => x + 3)
      .flatMap((x) => IO.of(x * 2))
      .map((x) => x.toString());
    const result = await io.run();
    expect(result).toBe('10');
  });

  test('should handle async in map', async () => {
    const io = IO.async(async () => 5).map((x) => x * 2);
    const result = await io.run();
    expect(result).toBe(10);
  });

  test('should handle async in flatMap', async () => {
    const io = IO.of(3).flatMap((x) => IO.async(async () => x * 4));
    const result = await io.run();
    expect(result).toBe(12);
  });
});

describe('EffectInterpreter', () => {
  test('should register and run effects', async () => {
    const interpreter = new EffectInterpreter();
    const testEffect = effect('test', EffectFlags.IO, () => 'processed');

    interpreter.register(testEffect);

    const flow = effectful(() => 'result', [testEffect]);
    const result = await interpreter.run(flow, 'input', context());
    expect(result).toBe('result');
  });

  test('should throw error for unregistered effects', async () => {
    const interpreter = new EffectInterpreter();
    const unknownEffect = effect('unknown', EffectFlags.IO, () => {});

    const flow = effectful(() => 'result', [unknownEffect]);

    await expect(interpreter.run(flow, 'test', context())).rejects.toThrow(
      'No handler for effect: Symbol(unknown)',
    );
  });

  test('should create pure interpreter with mock handlers', () => {
    const interpreter = EffectInterpreter.pure();
    expect(interpreter).toBeInstanceOf(EffectInterpreter);
  });

  test('should chain register calls', () => {
    const interpreter = new EffectInterpreter();
    const effect1 = effect('e1', EffectFlags.IO, () => 'e1');
    const effect2 = effect('e2', EffectFlags.Network, () => 'e2');

    const result = interpreter.register(effect1).register(effect2);
    expect(result).toBe(interpreter);
  });
});

describe('Effects Handlers', () => {
  test('should handle log effect', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    Effects.log.handler('test message', context());
    expect(spy).toHaveBeenCalledWith('test message');
    spy.mockRestore();
  });

  test('should handle random effect', () => {
    const result = Effects.random.handler(undefined, context());
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(1);
  });

  test('should handle now effect', () => {
    const before = Date.now();
    const result = Effects.now.handler(undefined, context());
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  test('should handle throw effect', () => {
    const error = new Error('Test error');
    expect(() => Effects.throw.handler(error, context())).toThrow('Test error');
  });

  test('should handle fetch effect', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('test'));

    const result = await Effects.fetch.handler('https://example.com', context());
    expect(result).toBeInstanceOf(Response);

    globalThis.fetch = originalFetch;
  });

  describe('Runtime-specific file operations', () => {
    test('should handle Deno runtime', async () => {
      (globalThis as any).Deno = {
        readTextFile: vi.fn(async () => 'deno content'),
        writeTextFile: vi.fn(async () => undefined),
      };

      const readResult = await Effects.readFile.handler('test.txt', context());
      expect(readResult).toBe('deno content');

      await Effects.writeFile.handler(['test.txt', 'content'], context());
      expect((globalThis as any).Deno.writeTextFile).toHaveBeenCalled();

      delete (globalThis as any).Deno;
    });

    test('should handle Bun runtime', async () => {
      (globalThis as any).Bun = {
        file: vi.fn(() => ({ text: async () => 'bun content' })),
        write: vi.fn(async () => undefined),
      };

      const readResult = await Effects.readFile.handler('test.txt', context());
      expect(readResult).toBe('bun content');

      await Effects.writeFile.handler(['test.txt', 'content'], context());
      expect((globalThis as any).Bun.write).toHaveBeenCalled();

      delete (globalThis as any).Bun;
    });

    test('should throw error when no runtime available', async () => {
      const originalProcess = globalThis.process;
      delete (globalThis as any).process;
      delete (globalThis as any).Deno;
      delete (globalThis as any).Bun;

      await expect(Effects.readFile.handler('test.txt', context())).rejects.toThrow(
        'File system not available in this runtime',
      );

      await expect(Effects.writeFile.handler(['test.txt', 'content'], context())).rejects.toThrow(
        'File system not available in this runtime',
      );

      if (originalProcess) globalThis.process = originalProcess;
    });
  });

  describe('EffectFlags export', () => {
    test('should export EffectFlags enum with correct values', () => {
      expect(EffectFlags).toBeDefined();
      expect(EffectFlags.None).toBe(0);
      expect(EffectFlags.Read).toBe(1 << 0);
      expect(EffectFlags.Write).toBe(1 << 1);
      expect(EffectFlags.IO).toBe(1 << 2);
      expect(EffectFlags.Network).toBe(1 << 3);
      expect(EffectFlags.Random).toBe(1 << 4);
      expect(EffectFlags.Time).toBe(1 << 5);
      expect(EffectFlags.Throw).toBe(1 << 6);
      expect(EffectFlags.Async).toBe(1 << 7);
    });

    test('should support bitwise operations', () => {
      const combined = EffectFlags.Read | EffectFlags.Write | EffectFlags.Async;
      expect(combined & EffectFlags.Read).toBeTruthy();
      expect(combined & EffectFlags.Write).toBeTruthy();
      expect(combined & EffectFlags.Async).toBeTruthy();
      expect(combined & EffectFlags.Network).toBeFalsy();
    });
  });
});
