import { describe, expect, it } from 'vitest';
import { effectsModule, createEffectsModule, type EffectsModule } from '../src/module.js';
import { EffectFlags } from '../src/index.js';
import { flow } from '@holon/flow';

describe('Effects Module', () => {
  describe('effectsModule', () => {
    it('should have correct module metadata', () => {
      expect(effectsModule.name).toBe(Symbol.for('holon:flow-effects'));
      expect(effectsModule.version).toBe('0.2.1');
      expect(effectsModule.description).toBe('Effect system for Flow');
      expect(effectsModule.author).toBe('Holon Framework');
      expect(effectsModule.license).toBe('MIT');
    });

    it('should declare dependencies', () => {
      expect(effectsModule.dependencies).toContain(Symbol.for('holon:flow-core'));
    });

    it('should have config schema', () => {
      expect(effectsModule.config).toBeDefined();
      expect(effectsModule.config?.defaults).toEqual({
        strictMode: false,
        allowedEffects: 0,
      });
    });

    it('should create effects module with factory', async () => {
      // Mock context
      const mockContext = {
        get: (key: symbol) => {
          if (key === Symbol.for('holon:flow-core')) {
            return { flow };
          }
          return undefined;
        },
      };

      const module = await effectsModule.factory(mockContext);
      expect(module).toBeDefined();
      expect(module.effects).toBeDefined();
    });

    it('should provide all effect utilities', async () => {
      const mockContext = {
        get: (key: symbol) => {
          if (key === Symbol.for('holon:flow-core')) {
            return { flow };
          }
          return undefined;
        },
      };

      const module = await effectsModule.factory(mockContext);
      const { effects } = module;

      // Check core functions
      expect(effects.pure).toBeDefined();
      expect(effects.effectful).toBeDefined();
      expect(effects.effect).toBeDefined();

      // Check analysis functions
      expect(effects.isPure).toBeDefined();
      expect(effects.hasEffect).toBeDefined();
      expect(effects.combineEffects).toBeDefined();
      expect(effects.analyze).toBeDefined();
      expect(effects.restrict).toBeDefined();

      // Check effect creators
      expect(effects.io).toBeDefined();
      expect(effects.network).toBeDefined();
      expect(effects.random).toBeDefined();
      expect(effects.time).toBeDefined();

      // Check combinators
      expect(effects.parallelLimit).toBeDefined();
      expect(effects.raceTimeout).toBeDefined();
      expect(effects.batch).toBeDefined();
      expect(effects.debounceEffect).toBeDefined();
      expect(effects.throttleEffect).toBeDefined();

      // Check algebraic effects
      expect(effects.AlgebraicEffect).toBeDefined();
      expect(effects.AlgebraicEffects).toBeDefined();
      expect(effects.withHandler).toBeDefined();
      expect(effects.scopedEffect).toBeDefined();

      // Check tracking
      expect(effects.EffectTracker).toBeDefined();
      expect(effects.globalTracker).toBeDefined();
      expect(effects.trackedEffect).toBeDefined();
      expect(effects.trackedFlow).toBeDefined();

      // Check registry
      expect(effects.Effects).toBeDefined();
      expect(effects.EffectFlags).toBeDefined();
      expect(effects.IO).toBeDefined();
    });

    it('should analyze effects correctly', async () => {
      const mockContext = {
        get: () => ({ flow }),
      };

      const module = await effectsModule.factory(mockContext);
      const { effects } = module;

      // Test pure flow
      const pureFlow = effects.pure((x: number) => x * 2);
      const pureAnalysis = effects.analyze(pureFlow);
      expect(pureAnalysis.pure).toBe(true);
      expect(pureAnalysis.effects).toBe(EffectFlags.None);
      expect(pureAnalysis.sideEffects).toEqual([]);
      expect(pureAnalysis.async).toBe(false);

      // Test effectful flow
      const effectfulFlow = effects.effectful(
        (x: number) => x * 2,
        EffectFlags.IO | EffectFlags.Network | EffectFlags.Async
      );
      const effectfulAnalysis = effects.analyze(effectfulFlow);
      expect(effectfulAnalysis.pure).toBe(false);
      expect(effectfulAnalysis.effects).toBe(
        EffectFlags.IO | EffectFlags.Network | EffectFlags.Async
      );
      expect(effectfulAnalysis.sideEffects).toContain('io');
      expect(effectfulAnalysis.sideEffects).toContain('network');
      expect(effectfulAnalysis.async).toBe(true);
    });

    it('should restrict effects correctly', async () => {
      const mockContext = {
        get: () => ({ flow }),
      };

      const module = await effectsModule.factory(mockContext);
      const { effects } = module;

      const ioFlow = effects.effectful(() => {}, EffectFlags.IO);

      // Should not throw for allowed effects
      expect(() =>
        effects.restrict(ioFlow, EffectFlags.IO | EffectFlags.Read)
      ).not.toThrow();

      // Should throw for disallowed effects
      expect(() =>
        effects.restrict(ioFlow, EffectFlags.Read)
      ).toThrow(/Flow has disallowed effects/);
    });

    it('should create IO effect', async () => {
      const mockContext = {
        get: () => ({ flow }),
      };

      const module = await effectsModule.factory(mockContext);
      const { effects } = module;

      const ioEffect = effects.io((x: number) => {
        console.log(x);
        return x * 2;
      });

      expect(ioEffect.flags).toBe(EffectFlags.IO);
    });

    it('should create network effect', async () => {
      const mockContext = {
        get: () => ({ flow }),
      };

      const module = await effectsModule.factory(mockContext);
      const { effects } = module;

      const networkEffect = effects.network(async (url: string) => {
        return { data: 'mocked' };
      });

      expect(networkEffect.flags).toBe(EffectFlags.Network | EffectFlags.Async);
    });

    it('should create random effect', async () => {
      const mockContext = {
        get: () => ({ flow }),
      };

      const module = await effectsModule.factory(mockContext);
      const { effects } = module;

      const randomEffect = effects.random(() => Math.random());

      expect(randomEffect.flags).toBe(EffectFlags.Random);
    });

    it('should create time effect', async () => {
      const mockContext = {
        get: () => ({ flow }),
      };

      const module = await effectsModule.factory(mockContext);
      const { effects } = module;

      const timeEffect = effects.time(() => Date.now());

      expect(timeEffect.flags).toBe(EffectFlags.Time);
    });
  });

  describe('createEffectsModule', () => {
    it('should create custom effects module', () => {
      const customModule = createEffectsModule(
        'custom',
        (_ctx, effects) => ({
          customEffect: effects.effectful(
            () => 'custom',
            effects.EffectFlags.IO
          ),
        }),
        {
          version: '1.0.0',
          description: 'Custom effects module',
        }
      );

      expect(customModule.name).toBe(Symbol.for('holon:effects-custom'));
      expect(customModule.version).toBe('1.0.0');
      expect(customModule.description).toBe('Custom effects module');
      expect(customModule.dependencies).toContain(Symbol.for('holon:flow-effects'));
    });

    it('should provide effects to factory', async () => {
      let capturedEffects: EffectsModule['effects'] | undefined;

      const customModule = createEffectsModule(
        'test',
        (_ctx, effects) => {
          capturedEffects = effects;
          return {
            testEffect: effects.pure(() => 'test'),
          };
        }
      );

      // Mock context with effects module
      const mockEffectsModule = await effectsModule.factory({ get: () => ({ flow }) });
      const mockContext = {
        get: (key: symbol) => {
          if (key === Symbol.for('holon:flow-effects')) {
            return mockEffectsModule;
          }
          return undefined;
        },
      };

      const result = await customModule.factory(mockContext);
      expect(result.testEffect).toBeDefined();
      expect(capturedEffects).toBeDefined();
      expect(capturedEffects?.pure).toBeDefined();
    });

    it('should throw if effects module not found', async () => {
      const customModule = createEffectsModule(
        'test',
        (_ctx, effects) => ({
          test: effects.pure(() => 'test'),
        })
      );

      const mockContext = {
        get: () => undefined,
      };

      await expect(customModule.factory(mockContext)).rejects.toThrow(
        'Effects module not found'
      );
    });

    it('should handle dependencies', () => {
      const customModule = createEffectsModule(
        'deps',
        (_ctx, _effects) => ({ test: 'value' }),
        {
          dependencies: [Symbol.for('other-module')],
        }
      );

      expect(customModule.dependencies).toContain(Symbol.for('holon:flow-effects'));
      expect(customModule.dependencies).toContain(Symbol.for('other-module'));
    });
  });
});