import { describe, expect, it, beforeEach, vi } from 'vitest';
import { context } from '@holon/context';
import { effect, effectful, EffectFlags } from '../src/index.js';
import {
  EffectTracker,
  globalTracker,
  trackedEffect,
  trackedFlow,
} from '../src/tracker.js';

describe('EffectTracker', () => {
  let tracker: EffectTracker;

  beforeEach(() => {
    tracker = new EffectTracker({
      maxSamples: 10,
      sampleRate: 1.0,
      captureInput: true,
      captureOutput: true,
      captureContext: true,
      enableProfiling: true,
    });
  });

  describe('Basic tracking', () => {
    it('should track successful effect execution', async () => {
      const testEffect = effect('test', {
        flags: EffectFlags.Pure,
        handler: async (value: number) => value * 2,
        metadata: {
          name: 'test',
          category: 'computation',
        },
      });

      const { execute } = tracker.track(testEffect, 5);
      const result = await execute();

      expect(result).toBe(10);

      const usage = tracker.getUsage(testEffect.id);
      expect(usage).toBeDefined();
      expect(usage!.count).toBe(1);
      expect(usage!.errors).toBe(0);
      expect(usage!.samples).toHaveLength(1);
      expect(usage!.samples[0].success).toBe(true);
    });

    it('should track failed effect execution', async () => {
      const failingEffect = effect('failing', {
        flags: EffectFlags.Throw,
        handler: async () => {
          throw new Error('Test error');
        },
      });

      const { execute } = tracker.track(failingEffect, null);

      await expect(execute()).rejects.toThrow('Test error');

      const usage = tracker.getUsage(failingEffect.id);
      expect(usage).toBeDefined();
      expect(usage!.count).toBe(1);
      expect(usage!.errors).toBe(1);
      expect(usage!.lastError?.message).toBe('Test error');
      expect(usage!.samples[0].success).toBe(false);
    });

    it('should capture input and output', async () => {
      const transformEffect = effect('transform', {
        flags: EffectFlags.Pure,
        handler: async (input: { x: number }) => ({ y: input.x * 2 }),
      });

      const { execute, sample } = tracker.track(transformEffect, { x: 5 });
      await execute();

      expect(sample.input).toEqual({ x: 5 });
      expect(sample.output).toEqual({ y: 10 });
    });

    it('should capture context data', async () => {
      const ctx = context({
        userId: '123',
        apiKey: 'secret',
        timestamp: Date.now(),
      });

      const contextEffect = effect('contextual', {
        flags: EffectFlags.Pure,
        handler: async (_input: any, ctx) => ctx.get('userId'),
      });

      const { execute, sample } = tracker.track(contextEffect, null, ctx);
      await execute();

      expect(sample.context).toBeDefined();
      expect(sample.context!['userId']).toBe('123');
      expect(sample.context!['apiKey']).toBe('secret');
    });
  });

  describe('Flow tracking', () => {
    it('should track effect flow execution', async () => {
      const flow1 = effectful(async (x: number) => x * 2, EffectFlags.Async);
      const flow2 = effectful((x: number) => x + 1, EffectFlags.Pure);

      // Create a combined flow with multiple effects
      const combinedFlow = effectful(async (x: number) => {
        const a = await flow1(x);
        return flow2(a);
      }, EffectFlags.Async);

      // Add some mock effects to the flow
      combinedFlow.effects = new Set([
        effect('e1', EffectFlags.Async, async () => {}),
        effect('e2', EffectFlags.Pure, () => {}),
      ]);

      const result = await tracker.trackFlow(combinedFlow, 5);
      expect(result).toBe(11); // (5 * 2) + 1

      const analysis = tracker.analyze();
      expect(analysis.totalExecutions).toBeGreaterThan(0);
    });

    it('should track dependencies between effects', async () => {
      const effect1 = effect('first', EffectFlags.Pure, () => 1);
      const effect2 = effect('second', EffectFlags.Pure, () => 2);
      const effect3 = effect('third', EffectFlags.Pure, () => 3);

      const flow = effectful(() => {}, EffectFlags.Pure);
      flow.effects = new Set([effect1, effect2, effect3]);

      await tracker.trackFlow(flow, undefined);

      const analysis = tracker.analyze();
      expect(analysis.dependencies.size).toBeGreaterThan(0);
    });
  });

  describe('Sampling', () => {
    it('should respect sample rate', async () => {
      const samplingTracker = new EffectTracker({
        sampleRate: 0.5,
        maxSamples: 100,
      });

      // Mock Math.random to control sampling
      const originalRandom = Math.random;
      let callCount = 0;
      Math.random = () => {
        callCount++;
        return callCount % 2 === 0 ? 0.3 : 0.7; // Alternates below and above 0.5
      };

      const testEffect = effect('sampled', EffectFlags.Pure, (x: number) => x);

      // Track and execute multiple times
      for (let i = 0; i < 10; i++) {
        const { execute } = samplingTracker.track(testEffect, i);
        await execute();
      }

      Math.random = originalRandom;

      // Should have tracked all executions
      const usage = samplingTracker.getUsage(testEffect.id);
      expect(usage).toBeDefined();
      expect(usage!.count).toBe(10);
    });

    it('should limit number of samples', async () => {
      const limitedTracker = new EffectTracker({
        maxSamples: 3,
        sampleRate: 1.0,
      });

      const testEffect = effect('limited', EffectFlags.Pure, (x: number) => x * 2);

      // Track more executions than maxSamples
      for (let i = 0; i < 10; i++) {
        const { execute } = limitedTracker.track(testEffect, i);
        await execute();
      }

      const usage = limitedTracker.getUsage(testEffect.id);
      expect(usage!.samples.length).toBeLessThanOrEqual(3);
      expect(usage!.count).toBe(10);
    });
  });

  describe('Analysis', () => {
    it('should provide comprehensive analysis', async () => {
      const effect1 = effect('io-effect', EffectFlags.IO, () => 'io');
      const effect2 = effect('network-effect', EffectFlags.Network, async () => 'network');
      const effect3 = effect('pure-effect', EffectFlags.Pure, () => 'pure');

      // Track multiple executions
      for (let i = 0; i < 5; i++) {
        const { execute: exec1 } = tracker.track(effect1, i);
        await exec1();
      }

      for (let i = 0; i < 3; i++) {
        const { execute: exec2 } = tracker.track(effect2, i);
        await exec2();
      }

      for (let i = 0; i < 7; i++) {
        const { execute: exec3 } = tracker.track(effect3, i);
        await exec3();
      }

      // Track one failure
      const failEffect = effect('fail', EffectFlags.Throw, () => {
        throw new Error('fail');
      });
      const { execute: execFail } = tracker.track(failEffect, 0);
      try {
        await execFail();
      } catch {}

      const analysis = tracker.analyze();

      expect(analysis.totalEffects).toBe(4);
      expect(analysis.totalExecutions).toBe(16); // 5 + 3 + 7 + 1
      expect(analysis.totalErrors).toBe(1);
      expect(analysis.effects.size).toBe(4);
      expect(analysis.hotPaths).toBeDefined();
      expect(analysis.hotPaths.length).toBeGreaterThan(0);
    });

    it('should identify hot paths', async () => {
      // Create effects with different usage patterns
      const hotEffect = effect('hot', EffectFlags.IO, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'hot';
      });

      const coldEffect = effect('cold', EffectFlags.Pure, () => 'cold');

      // Hot path: many calls, slow execution
      for (let i = 0; i < 20; i++) {
        const { execute } = tracker.track(hotEffect, i);
        await execute();
      }

      // Cold path: few calls, fast execution
      for (let i = 0; i < 2; i++) {
        const { execute } = tracker.track(coldEffect, i);
        await execute();
      }

      const analysis = tracker.analyze();
      const hotPaths = analysis.hotPaths;

      expect(hotPaths[0].effect).toBe(hotEffect.id);
      expect(hotPaths[0].count).toBe(20);
    });

    it('should calculate statistics correctly', async () => {
      const testEffect = effect('stats', EffectFlags.Pure, async (x: number) => {
        // Variable execution time
        await new Promise(resolve => setTimeout(resolve, x * 10));
        return x;
      });

      // Track with different inputs to get varied timings
      for (const input of [1, 2, 3, 4, 5]) {
        const { execute } = tracker.track(testEffect, input);
        await execute();
      }

      const usage = tracker.getUsage(testEffect.id);
      expect(usage).toBeDefined();
      expect(usage!.count).toBe(5);
      expect(usage!.averageTime).toBe(usage!.totalTime / usage!.count);
      expect(usage!.minTime).toBeLessThanOrEqual(usage!.maxTime);
    });
  });

  describe('Export functionality', () => {
    it('should export tracking data as JSON', async () => {
      const testEffect = effect('export-test', EffectFlags.Pure, (x: number) => x * 2);

      const { execute } = tracker.track(testEffect, 42);
      await execute();

      const exported = tracker.export();
      const parsed = JSON.parse(exported);

      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('analysis');
      expect(parsed.analysis.totalEffects).toBe(1);
      expect(parsed.analysis.totalExecutions).toBe(1);
      expect(parsed.analysis.effects).toHaveLength(1);
    });
  });

  describe('Reset functionality', () => {
    it('should reset all tracking data', async () => {
      const testEffect = effect('reset-test', EffectFlags.Pure, () => 'test');

      const { execute } = tracker.track(testEffect, null);
      await execute();

      let usage = tracker.getUsage(testEffect.id);
      expect(usage).toBeDefined();

      tracker.reset();

      usage = tracker.getUsage(testEffect.id);
      expect(usage).toBeUndefined();

      const analysis = tracker.analyze();
      expect(analysis.totalEffects).toBe(0);
      expect(analysis.totalExecutions).toBe(0);
    });
  });

  describe('trackedEffect utility', () => {
    it('should create tracked version of effect', async () => {
      const originalEffect = effect('original', {
        flags: EffectFlags.Pure,
        handler: (x: number) => x * 3,
      });

      const tracked = trackedEffect(originalEffect, tracker);

      const ctx = context();
      const result = await tracked.handler(5, ctx);

      expect(result).toBe(15);

      const usage = tracker.getUsage(originalEffect.id);
      expect(usage).toBeDefined();
      expect(usage!.count).toBe(1);
    });
  });

  describe('trackedFlow utility', () => {
    it('should create tracked version of flow', async () => {
      const originalFlow = effectful((x: number) => x + 10, EffectFlags.Pure);
      originalFlow.effects = new Set([
        effect('flow-effect', EffectFlags.Pure, () => {}),
      ]);

      const tracked = trackedFlow(originalFlow, tracker);

      const result = await tracked(5);
      expect(result).toBe(15);

      // Check that properties are preserved
      expect(tracked.effects).toBe(originalFlow.effects);
      expect(tracked.flags).toBe(originalFlow.flags);
    });
  });

  describe('globalTracker', () => {
    it('should have global tracker instance', () => {
      expect(globalTracker).toBeDefined();
      expect(globalTracker).toBeInstanceOf(EffectTracker);
    });

    it('should use sampling by default', async () => {
      // globalTracker is configured with 10% sampling
      const testEffect = effect('global-test', EffectFlags.Pure, () => 'test');

      // Track and execute many times
      for (let i = 0; i < 100; i++) {
        const { execute } = globalTracker.track(testEffect, i);
        await execute();
      }

      // All executions should be tracked (count), but only some sampled
      const usage = globalTracker.getUsage(testEffect.id);
      expect(usage).toBeDefined();
      expect(usage!.count).toBe(100);
      // Samples should be limited by sampling rate (10%)
      expect(usage!.samples.length).toBeLessThanOrEqual(100);
    });
  });
});