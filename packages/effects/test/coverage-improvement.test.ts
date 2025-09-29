import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  throttleEffect,
  batch,
  EffectFlags,
  effectful,
  EffectInterpreter,
  Effects
} from '../src/index.js';
import {
  EffectTracker,
  trackedFlow,
  trackedEffect
} from '../src/tracker.js';
import { context } from '@holon/context';

describe('Coverage Improvement Tests', () => {
  describe('throttleEffect - edge cases', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle multiple pending resolves when throttling', async () => {
      let callCount = 0;
      const effect = effectful(async (x: number) => {
        callCount++;
        return x * 2;
      }, EffectFlags.Async);

      const throttled = throttleEffect(effect, 100);

      // Fire multiple calls quickly
      const promise1 = throttled(1);
      const promise2 = throttled(2);
      const promise3 = throttled(3);

      // First one should execute immediately
      await promise1;
      expect(callCount).toBe(1);

      // Wait for throttle period
      vi.advanceTimersByTime(100);
      await Promise.resolve(); // Let promises resolve

      // The last value (3) should be used for pending promises
      await promise3;
      expect(callCount).toBe(2);
    });

    it('should handle rejection in throttled effect', async () => {
      const effect = effectful(async () => {
        throw new Error('Test error');
      }, EffectFlags.Async);

      const throttled = throttleEffect(effect, 100);

      // First call should reject immediately
      await expect(throttled(1)).rejects.toThrow('Test error');
    });
  });

  describe('batch - error handling', () => {
    it('should reject all items in batch on error', async () => {
      const effect = effectful(async (items: number[]) => {
        throw new Error('Batch error');
      }, EffectFlags.Async);

      const batched = batch(effect, { size: 2, delay: 10 });

      const promise1 = batched(1);
      const promise2 = batched(2);

      await expect(promise1).rejects.toThrow('Batch error');
      await expect(promise2).rejects.toThrow('Batch error');
    });
  });

  describe('EffectInterpreter.pure', () => {
    it('should handle throw effect', () => {
      const interpreter = EffectInterpreter.pure();

      // Pure interpreter should have registered a handler for throw
      // but it should still throw errors
      const throwEffect = effectful(() => {
        throw new Error('Test throw');
      }, EffectFlags.Throw);

      // Since throw effect actually throws, it will propagate
      expect(() => throwEffect(null)).toThrow('Test throw');
    });
  });

  describe('EffectTracker - Flow tracking error path', () => {
    it('should track flow with errors', async () => {
      const tracker = new EffectTracker();

      const failingFlow = effectful(async () => {
        throw new Error('Flow error');
      }, EffectFlags.Async) as any;

      failingFlow.effects = new Set([
        { id: Symbol('test1'), flags: EffectFlags.IO },
        { id: Symbol('test2'), flags: EffectFlags.Network }
      ]);

      await expect(tracker.trackFlow(failingFlow, null)).rejects.toThrow('Flow error');

      const analysis = tracker.analyze();
      expect(analysis.totalErrors).toBeGreaterThan(0);
    });
  });

  describe('trackedFlow integration', () => {
    it('should track flow execution with context', async () => {
      // Create a mock flow
      const mockFlow = effectful(async (x: number) => x * 2, EffectFlags.Async) as any;
      mockFlow.effects = new Set();
      mockFlow.pipe = () => mockFlow;

      const tracked = trackedFlow(mockFlow);

      // Execute the tracked flow
      const result = await tracked(5);
      expect(result).toBe(10);
    });
  });

  describe('trackedEffect integration', () => {
    it('should track effect execution', async () => {
      const tracker = new EffectTracker();
      const testEffect = {
        id: Symbol('test'),
        flags: EffectFlags.Async,
        handler: async (value: number) => value * 2,
      };

      const tracked = trackedEffect(testEffect, tracker);
      const ctx = context();

      const result = await tracked.handler(5, ctx);
      expect(result).toBe(10);

      const usage = tracker.getUsage(testEffect.id);
      expect(usage?.count).toBe(1);
    });
  });

  describe('Module branches coverage', () => {
    it('should handle flows without flags property', async () => {
      const mockContext = {
        get: () => ({ flow: (fn: Function) => fn }),
      };

      const module = await (await import('../src/module.js')).effectsModule.factory(mockContext);
      const { effects } = module;

      // Test with plain function (no flags property)
      const plainFn = (x: number) => x * 2;
      const analysis = effects.analyze(plainFn);

      // Since plainFn has no flags property, isPure returns false
      expect(analysis.pure).toBe(false);
      expect(analysis.effects).toBe(0);
      expect(analysis.sideEffects).toEqual([]);
    });

    it('should cover all effect flag branches in analyze', async () => {
      const mockContext = {
        get: () => ({ flow: (fn: Function) => fn }),
      };

      const module = await (await import('../src/module.js')).effectsModule.factory(mockContext);
      const { effects } = module;

      // Test with all possible flags
      const allFlagsFlow = effects.effectful(
        () => {},
        EffectFlags.IO |
        EffectFlags.Read |
        EffectFlags.Write |
        EffectFlags.Network |
        EffectFlags.Random |
        EffectFlags.Time |
        EffectFlags.Throw |
        EffectFlags.Async |
        EffectFlags.Process |
        EffectFlags.Memory |
        EffectFlags.State |
        EffectFlags.Unsafe |
        EffectFlags.Database |
        EffectFlags.Cache |
        EffectFlags.Queue |
        EffectFlags.Stream
      );

      const analysis = effects.analyze(allFlagsFlow);

      expect(analysis.sideEffects).toContain('io');
      expect(analysis.sideEffects).toContain('read');
      expect(analysis.sideEffects).toContain('write');
      expect(analysis.sideEffects).toContain('network');
      expect(analysis.sideEffects).toContain('random');
      expect(analysis.sideEffects).toContain('time');
      expect(analysis.sideEffects).toContain('throw');
      expect(analysis.sideEffects).toContain('process');
      expect(analysis.sideEffects).toContain('memory');
      expect(analysis.sideEffects).toContain('state');
      expect(analysis.sideEffects).toContain('unsafe');
      expect(analysis.sideEffects).toContain('database');
      expect(analysis.sideEffects).toContain('cache');
      expect(analysis.sideEffects).toContain('queue');
      expect(analysis.sideEffects).toContain('stream');
      expect(analysis.async).toBe(true);
    });

    it('should handle flows without flags in restrict', async () => {
      const mockContext = {
        get: () => ({ flow: (fn: Function) => fn }),
      };

      const module = await (await import('../src/module.js')).effectsModule.factory(mockContext);
      const { effects } = module;

      const plainFlow = (x: number) => x * 2;

      // Should not throw for plain functions (treated as pure)
      expect(() =>
        effects.restrict(plainFlow, EffectFlags.None)
      ).not.toThrow();
    });
  });
});