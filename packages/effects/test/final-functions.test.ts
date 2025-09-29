import { describe, expect, it } from 'vitest';
import {
  pure,
  effect,
  Effects,
  EffectFlags,
  IO,
} from '../src/index.js';

describe('Final Functions Coverage', () => {
  describe('pure function', () => {
    it('should create pure effect flow', () => {
      const pureFlow = pure((x: number) => x * 2);
      expect(pureFlow.flags).toBe(EffectFlags.None);
      expect(pureFlow(5)).toBe(10);
    });

    it('should work with async pure functions', async () => {
      const asyncPure = pure(async (x: number) => x * 3);
      // pure() always sets flags to None, even for async functions
      expect(asyncPure.flags).toBe(EffectFlags.None);
      const result = await asyncPure(5);
      expect(result).toBe(15);
    });
  });

  describe('effect function factory', () => {
    it('should create named effects', () => {
      const customEffect = effect(
        'custom',
        EffectFlags.IO,
        (input: string) => `Processed: ${input}`
      );

      expect(customEffect.id).toBeDefined();
      expect(customEffect.flags).toBe(EffectFlags.IO);
      const result = customEffect.handler('test', {} as any);
      expect(result).toBe('Processed: test');
    });

    it('should create effects with categories', () => {
      const dbEffect = effect(
        'database',
        EffectFlags.Database,
        async () => ({ data: 'from db' })
      );

      expect(dbEffect.flags).toBe(EffectFlags.Database);
    });
  });

  describe('Effects registry additional', () => {
    it('should have random effect', () => {
      expect(Effects.random).toBeDefined();
      expect(Effects.random.flags).toBe(EffectFlags.Random);

      // Test random functionality
      const result = Effects.random.handler(undefined, {} as any);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(1);
    });

    it('should have log effect', () => {
      expect(Effects.log).toBeDefined();
      expect(Effects.log.flags).toBe(EffectFlags.IO);

      // Test log functionality (it just logs to console)
      const originalLog = console.log;
      let logged = '';
      console.log = (msg: string) => { logged = msg; };

      Effects.log.handler('test message', {} as any);
      expect(logged).toBe('test message');

      console.log = originalLog;
    });

    it('should have now effect', () => {
      expect(Effects.now).toBeDefined();
      expect(Effects.now.flags).toBe(EffectFlags.Time);

      const result = Effects.now.handler(undefined, {} as any);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should have throw effect', () => {
      expect(Effects.throw).toBeDefined();
      expect(Effects.throw.flags).toBe(EffectFlags.Throw);

      expect(() => Effects.throw.handler('Test error', {} as any))
        .toThrow('Test error');
    });
  });

  describe('IO monad additional methods', () => {
    it('should create IO from async function', async () => {
      const asyncIO = IO.async(async () => {
        return 'async value';
      });

      const result = await asyncIO.run();
      expect(result).toBe('async value');
    });

    it('should chain IO operations with flatMap', async () => {
      const io = IO.of(10)
        .flatMap(x => IO.of(x * 2))
        .flatMap(x => IO.of(x + 5))
        .map(x => x.toString());

      const result = await io.run();
      expect(result).toBe('25');
    });

    it('should handle nested async IO', async () => {
      const io = IO.async(async () => 5)
        .flatMap(x => IO.async(async () => x * 2))
        .flatMap(x => IO.of(x + 1));

      const result = await io.run();
      expect(result).toBe(11);
    });
  });

  describe('Effects with different runtimes', () => {
    it('should detect Node.js runtime', () => {
      // We're running in Node.js
      expect(typeof process !== 'undefined').toBe(true);
      expect(typeof (globalThis as any).Deno).toBe('undefined');
      expect(typeof (globalThis as any).Bun).toBe('undefined');
    });
  });
});