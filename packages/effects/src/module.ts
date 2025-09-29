/**
 * Module definition for @holon/effects
 * Provides modular access to effect system
 */

// Local type definitions to avoid circular dependency
export interface ModuleDefinition<T extends object> {
  name: string | symbol;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  dependencies?: Array<string | symbol>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Array<string | symbol>;
  factory: (ctx: any) => T | Promise<T>;
  onInit?: (ctx: any) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
  config?: {
    schema: any;
    defaults: unknown;
  };
}

type Context = any; // Will be provided at runtime
import type { EffectFlow } from './index.js';

/**
 * Effects module interface
 */
export interface EffectsModule {
  effects: {
    // Effect creation
    pure: any;
    effectful: any;
    effect: any;

    // Effect analysis
    isPure: any;
    hasEffect: any;
    combineEffects: any;
    analyze: (f: any) => {
      pure: boolean;
      effects: any; // EffectFlags
      sideEffects: string[];
      async: boolean;
    };

    // Effect restriction
    restrict: (
      f: any,
      allowed: any, // EffectFlags
    ) => any;

    // Common effects
    io: <T>(fn: (input: T) => any | Promise<any>) => EffectFlow<T, any>;
    network: <T>(fn: (input: T) => Promise<any>) => EffectFlow<T, any>;
    random: <T>(fn: (input: T) => any) => EffectFlow<T, any>;
    time: <T>(fn: (input: T) => any) => EffectFlow<T, any>;

    // Effect combinators
    parallelLimit: any;
    raceTimeout: any;
    batch: any;
    debounceEffect: any;
    throttleEffect: any;

    // Algebraic effects
    AlgebraicEffect: any;
    AlgebraicEffects: any;
    withHandler: any;
    scopedEffect: any;

    // Effect tracking
    EffectTracker: any;
    globalTracker: any;
    trackedEffect: any;
    trackedFlow: any;

    // Effect registry
    Effects: any; // typeof Effects
    EffectFlags: any; // typeof EffectFlags
    EffectCategory: any; // typeof EffectCategory

    // IO monad
    IO: any;
  };
}

/**
 * Effects module definition
 * Provides effect system and analysis
 */
export const effectsModule: ModuleDefinition<EffectsModule> = {
  name: Symbol.for('holon:flow-effects'),
  version: '0.2.1',
  description: 'Effect system for Flow',
  author: 'Holon Framework',
  license: 'MIT',

  dependencies: [Symbol.for('holon:flow-core')],

  factory: async (_ctx: Context): Promise<EffectsModule> => {
    // Import dependencies at runtime to avoid circular dependencies
    const {
      EffectFlags,
      Effects,
      IO,
      batch,
      combineEffects,
      debounceEffect,
      effect,
      effectful,
      hasEffect,
      isPure,
      parallelLimit,
      pure,
      raceTimeout,
      throttleEffect,
    } = await import('./index.js');

    const {
      AlgebraicEffect,
      AlgebraicEffects,
      scopedEffect,
      withHandler,
    } = await import('./algebraic.js');

    const {
      EffectTracker,
      globalTracker,
      trackedEffect,
      trackedFlow,
    } = await import('./tracker.js');

    return {
    effects: {
      // Effect creation
      pure,
      effectful,
      effect,

      // Effect analysis
      isPure,
      hasEffect,
      combineEffects,
      analyze: (f) => {
        const isFlowPure = isPure(f);
        const flags = (f as any).flags ?? EffectFlags.None;
        const async = (flags & EffectFlags.Async) !== 0;

        const sideEffects: string[] = [];
        if (flags & EffectFlags.IO) sideEffects.push('io');
        if (flags & EffectFlags.Read) sideEffects.push('read');
        if (flags & EffectFlags.Write) sideEffects.push('write');
        if (flags & EffectFlags.Network) sideEffects.push('network');
        if (flags & EffectFlags.Random) sideEffects.push('random');
        if (flags & EffectFlags.Time) sideEffects.push('time');
        if (flags & EffectFlags.Throw) sideEffects.push('throw');
        if (flags & EffectFlags.Process) sideEffects.push('process');
        if (flags & EffectFlags.Memory) sideEffects.push('memory');
        if (flags & EffectFlags.State) sideEffects.push('state');
        if (flags & EffectFlags.Unsafe) sideEffects.push('unsafe');
        if (flags & EffectFlags.Database) sideEffects.push('database');
        if (flags & EffectFlags.Cache) sideEffects.push('cache');
        if (flags & EffectFlags.Queue) sideEffects.push('queue');
        if (flags & EffectFlags.Stream) sideEffects.push('stream');

        return {
          pure: isFlowPure,
          effects: flags,
          sideEffects,
          async,
        };
      },

      // Effect restriction
      restrict: (f, allowed) => {
        const flags = (f as any).flags ?? EffectFlags.None;
        if ((flags & ~allowed) !== 0) {
          throw new Error(
            `Flow has disallowed effects. Has: ${flags}, Allowed: ${allowed}`,
          );
        }
        return f;
      },

      // Common effect creators
      io: (fn) => {
        const ioFlow = effectful(fn, EffectFlags.IO);
        return ioFlow;
      },

      network: (fn) => {
        const networkFlow = effectful(fn, EffectFlags.Network | EffectFlags.Async);
        return networkFlow;
      },

      random: (fn) => {
        const randomFlow = effectful(fn, EffectFlags.Random);
        return randomFlow;
      },

      time: (fn) => {
        const timeFlow = effectful(fn, EffectFlags.Time);
        return timeFlow;
      },

      // Effect combinators
      parallelLimit,
      raceTimeout,
      batch,
      debounceEffect,
      throttleEffect,

      // Algebraic effects
      AlgebraicEffect,
      AlgebraicEffects,
      withHandler,
      scopedEffect,

      // Effect tracking
      EffectTracker,
      globalTracker,
      trackedEffect,
      trackedFlow,

      // Effect registry
      Effects,
      EffectFlags,
      EffectCategory: 'io' as any,

      // IO monad
      IO,
    },
  };
  },

  config: {
    schema: {
      type: 'object',
      properties: {
        strictMode: { type: 'boolean' },
        allowedEffects: { type: 'number' },
      },
    },
    defaults: {
      strictMode: false,
      allowedEffects: 0, // EffectFlags.None
    },
  },
};

/**
 * Create an effects module with custom effects
 */
export function createEffectsModule<T extends object>(
  name: string,
  factory: (ctx: Context, effects: EffectsModule['effects']) => T,
  options?: {
    version?: string;
    description?: string;
    dependencies?: Array<string | symbol>;
  },
): ModuleDefinition<T> {
  const definition: ModuleDefinition<T> = {
    name: Symbol.for(`holon:effects-${name}`),
    version: options?.version ?? '1.0.0',
    dependencies: [Symbol.for('holon:flow-effects'), ...(options?.dependencies ?? [])],

    factory: async (ctx: Context) => {
      // Get effects module
      const effectsInstance = (await ctx.get(
        Symbol.for('holon:flow-effects'),
      )) as EffectsModule | undefined;

      if (!effectsInstance) {
        throw new Error('Effects module not found. Please load @holon/effects first.');
      }

      return factory(ctx, effectsInstance.effects);
    },
  };

  if (options?.description !== undefined) {
    definition.description = options.description;
  }

  return definition;
}