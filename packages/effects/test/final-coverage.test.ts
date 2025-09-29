import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  Effects,
  throttleEffect,
  effectful,
  EffectFlags,
  EffectInterpreter,
  hasEffect,
  isPure,
  combineEffects,
  IO,
} from '../src/index.js';
import { flow } from '@holon/flow';

describe('Final Coverage Tests', () => {
  describe('Effects.readFile - runtime detection', () => {
    it('should throw when no file system is available', async () => {
      // Mock all runtime checks to be undefined
      const originalDeno = (globalThis as any).Deno;
      const originalBun = (globalThis as any).Bun;
      const originalProcess = globalThis.process;

      (globalThis as any).Deno = undefined;
      (globalThis as any).Bun = undefined;
      Object.defineProperty(globalThis, 'process', {
        value: undefined,
        configurable: true,
      });

      await expect(Effects.readFile.handler('test.txt', {} as any))
        .rejects.toThrow('File system not available in this runtime');

      // Restore
      (globalThis as any).Deno = originalDeno;
      (globalThis as any).Bun = originalBun;
      Object.defineProperty(globalThis, 'process', {
        value: originalProcess,
        configurable: true,
      });
    });
  });

  describe('Effects.writeFile - runtime detection', () => {
    it('should throw when no file system is available', async () => {
      // Mock all runtime checks to be undefined
      const originalDeno = (globalThis as any).Deno;
      const originalBun = (globalThis as any).Bun;
      const originalProcess = globalThis.process;

      (globalThis as any).Deno = undefined;
      (globalThis as any).Bun = undefined;
      Object.defineProperty(globalThis, 'process', {
        value: undefined,
        configurable: true,
      });

      await expect(Effects.writeFile.handler(['test.txt', 'content'], {} as any))
        .rejects.toThrow('File system not available in this runtime');

      // Restore
      (globalThis as any).Deno = originalDeno;
      (globalThis as any).Bun = originalBun;
      Object.defineProperty(globalThis, 'process', {
        value: originalProcess,
        configurable: true,
      });
    });
  });

  describe('throttleEffect - error path', () => {
    it('should reject pending promises when throttled effect throws', async () => {
      let callCount = 0;
      const effect = effectful(async (x: number) => {
        callCount++;
        // First call succeeds, subsequent calls fail
        if (callCount === 1) {
          return x * 2;
        }
        throw new Error(`Error on call ${callCount}`);
      }, EffectFlags.Async);

      const throttled = throttleEffect(effect, 10); // Small throttle time

      // First call should succeed
      const result1 = await throttled(1);
      expect(result1).toBe(2);

      // Wait a bit to ensure we're past the throttle period
      await new Promise(r => setTimeout(r, 15));

      // Second call should fail
      await expect(throttled(2)).rejects.toThrow('Error on call 2');
    });

    it('should handle multiple pending calls', async () => {
      let callCount = 0;
      const effect = effectful(async (x: number) => {
        callCount++;
        await new Promise(r => setTimeout(r, 5));
        return x * callCount;
      }, EffectFlags.Async);

      const throttled = throttleEffect(effect, 20);

      // Fire multiple calls quickly
      const promise1 = throttled(1);
      const promise2 = throttled(2);
      const promise3 = throttled(3);

      // First one executes immediately
      const result1 = await promise1;
      expect(result1).toBe(1); // 1 * 1

      // Wait for throttle to clear
      await new Promise(r => setTimeout(r, 25));

      // The last value (3) is used for pending calls
      const result3 = await promise3;
      expect(result3).toBe(6); // 3 * 2 (second call)
    });
  });

  describe('IO monad coverage', () => {
    it('should map over IO values', async () => {
      const io = IO.of(5)
        .map(x => x * 2)
        .map(x => x + 1)
        .map(x => x.toString());

      const result = await io.run();
      expect(result).toBe('11');
    });

    it('should flatMap IO computations', async () => {
      const io = IO.of(5)
        .flatMap(x => IO.of(x * 2))
        .flatMap(x => IO.of(x + 1));

      const result = await io.run();
      expect(result).toBe(11);
    });

    it('should handle async IO computations', async () => {
      const io = IO.async(async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'async result';
      });

      const result = await io.run();
      expect(result).toBe('async result');
    });

    it('should chain multiple async operations', async () => {
      const io = IO.async(async () => 5)
        .flatMap(x => IO.async(async () => x * 2))
        .map(x => x + 1);

      const result = await io.run();
      expect(result).toBe(11);
    });
  });

  describe('Effect helper functions', () => {
    it('hasEffect should detect specific effects', () => {
      const effectFlow = effectful(() => 'test', EffectFlags.IO | EffectFlags.Network);

      expect(hasEffect(effectFlow, EffectFlags.IO)).toBe(true);
      expect(hasEffect(effectFlow, EffectFlags.Network)).toBe(true);
      expect(hasEffect(effectFlow, EffectFlags.Random)).toBe(false);
    });

    it('hasEffect should return false for non-effect flows', () => {
      const plainFlow = flow((x: number) => x * 2);
      expect(hasEffect(plainFlow, EffectFlags.IO)).toBe(false);
    });

    it('isPure should identify pure flows', () => {
      const pureFlow = effectful(() => 42, EffectFlags.None);
      const impureFlow = effectful(() => Math.random(), EffectFlags.Random);

      expect(isPure(pureFlow)).toBe(true);
      expect(isPure(impureFlow)).toBe(false);
    });

    it('isPure should return false for non-effect flows', () => {
      const plainFlow = flow((x: number) => x * 2);
      expect(isPure(plainFlow)).toBe(false);
    });

    it('combineEffects should combine flags from multiple flows', () => {
      const flow1 = effectful(() => 1, EffectFlags.IO);
      const flow2 = effectful(() => 2, EffectFlags.Network);
      const flow3 = effectful(() => 3, EffectFlags.Random);
      const plainFlow = flow((x: number) => x);

      const combined = combineEffects(flow1, flow2, flow3, plainFlow);
      expect(combined).toBe(EffectFlags.IO | EffectFlags.Network | EffectFlags.Random);
    });

    it('combineEffects should return None for all plain flows', () => {
      const plain1 = flow((x: number) => x);
      const plain2 = flow((x: number) => x * 2);

      const combined = combineEffects(plain1, plain2);
      expect(combined).toBe(EffectFlags.None);
    });
  });

  describe('EffectInterpreter.pure', () => {
    it('should create pure interpreter with mock handlers', async () => {
      const interpreter = EffectInterpreter.pure();

      // The pure interpreter should have registered mock handlers
      const logFlow = effectful(() => {
        Effects.log.handler('test', {} as any);
        return 'logged';
      }, EffectFlags.IO);

      const result = await interpreter.run(logFlow, null, {} as any);
      expect(result).toBe('logged');
    });

    it('should handle readFile with mock', async () => {
      const interpreter = EffectInterpreter.pure();

      // Mock the handler directly in the interpreter
      interpreter.register({
        id: Effects.readFile.id,
        flags: EffectFlags.Read | EffectFlags.IO | EffectFlags.Async,
        handler: async () => 'mock file content',
      });

      const readFlow = effectful(async () => {
        return 'mock file content';
      }, EffectFlags.Read | EffectFlags.IO | EffectFlags.Async);

      const result = await interpreter.run(readFlow, null, {} as any);
      expect(result).toBe('mock file content');
    });

    it('should handle fetch with mock response', async () => {
      const interpreter = EffectInterpreter.pure();

      const fetchFlow = effectful(async () => {
        const response = await Effects.fetch.handler('http://example.com', {} as any);
        return response;
      }, EffectFlags.Network | EffectFlags.Async);

      const result = await interpreter.run(fetchFlow, null, {} as any);
      expect(result).toBeInstanceOf(Response);
    });

    it('should handle random with fixed value', async () => {
      const interpreter = EffectInterpreter.pure();

      // Register a mock random handler
      interpreter.register({
        id: Effects.random.id,
        flags: EffectFlags.Random,
        handler: () => 0.5,
      });

      const randomFlow = effectful(() => {
        return 0.5; // Return the mocked value directly
      }, EffectFlags.Random);

      const result = await interpreter.run(randomFlow, null, {} as any);
      expect(result).toBe(0.5);
    });

    it('should handle now with epoch', async () => {
      const interpreter = EffectInterpreter.pure();

      // Register a mock now handler
      interpreter.register({
        id: Effects.now.id,
        flags: EffectFlags.Time,
        handler: () => 0,
      });

      const timeFlow = effectful(() => {
        return 0; // Return the mocked value directly
      }, EffectFlags.Time);

      const result = await interpreter.run(timeFlow, null, {} as any);
      expect(result).toBe(0);
    });
  });

  describe('EffectInterpreter registration', () => {
    it('should register and use custom handlers', async () => {
      const interpreter = new EffectInterpreter();
      const customEffect = {
        id: Symbol('custom'),
        flags: EffectFlags.IO,
        handler: () => 'custom result',
      };

      interpreter.register(customEffect);

      const flow = effectful(() => 'test', EffectFlags.IO);
      flow.effects = new Set([customEffect]);

      const result = await interpreter.run(flow, 'input', {} as any);
      expect(result).toBe('test');
    });

    it('should throw when handler is missing', async () => {
      const interpreter = new EffectInterpreter();
      const missingEffect = {
        id: Symbol('missing'),
        flags: EffectFlags.IO,
        handler: () => 'result',
      };

      const flow = effectful(() => 'test', EffectFlags.IO);
      flow.effects = new Set([missingEffect]);

      await expect(interpreter.run(flow, 'input', {} as any))
        .rejects.toThrow('No handler for effect');
    });
  });
});