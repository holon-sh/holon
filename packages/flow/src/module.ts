/**
 * Module definition for @holon/flow core utilities
 * Provides modular access to core Flow functions
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
import {
  batch,
  compose,
  constant,
  debounce,
  fallback,
  filter,
  flow,
  identity,
  map,
  maybe,
  memoize,
  merge,
  parallel,
  race,
  reduce,
  repeat,
  result,
  retry,
  split,
  tap,
  throttle,
  timeout,
  validate,
  when,
} from './flow.js';

/**
 * Core module interface
 */
export interface CoreModule {
  core: {
    // Flow creation
    flow: typeof flow;
    identity: typeof identity;
    constant: typeof constant;

    // Composition
    pipe: typeof compose;
    compose: typeof compose;
    parallel: typeof parallel;
    race: typeof race;
    merge: typeof merge;
    split: typeof split;

    // Transformation
    map: typeof map;
    filter: typeof filter;
    reduce: typeof reduce;
    tap: typeof tap;

    // Error handling
    retry: typeof retry;
    fallback: typeof fallback;
    result: typeof result;
    maybe: typeof maybe;

    // Performance
    timeout: typeof timeout;
    throttle: typeof throttle;
    debounce: typeof debounce;
    memoize: typeof memoize;
    batch: typeof batch;

    // Control flow
    when: typeof when;
    repeat: typeof repeat;
    validate: typeof validate;
  };
}

/**
 * Core module definition for @holon/flow
 * Provides all core Flow utilities through the module system
 */
export const coreModule: ModuleDefinition<CoreModule> = {
  name: Symbol.for('holon:flow-core'),
  version: '0.2.1',
  description: 'Core Flow utilities and functions',
  author: 'Holon Framework',
  license: 'MIT',

  factory: (_ctx: Context): CoreModule => ({
    core: {
      // Flow creation
      flow,
      identity,
      constant,

      // Composition
      pipe: compose, // Alias for compose
      compose,
      parallel,
      race,
      merge,
      split,

      // Transformation
      map,
      filter,
      reduce,
      tap,

      // Error handling
      retry,
      fallback,
      result,
      maybe,

      // Performance
      timeout,
      throttle,
      debounce,
      memoize,
      batch,

      // Control flow
      when,
      repeat,
      validate,
    },
  }),

  // No dependencies for core module
  dependencies: [],

  // Optional configuration schema
  config: {
    schema: {
      type: 'object',
      properties: {
        debug: { type: 'boolean' },
        maxRetries: { type: 'number' },
        defaultTimeout: { type: 'number' },
      },
    },
    defaults: {
      debug: false,
      maxRetries: 3,
      defaultTimeout: 30000,
    },
  },
};

/**
 * Create a Flow module with custom utilities
 */
export function createFlowModule<T extends object>(
  name: string,
  factory: (ctx: Context, core: CoreModule['core']) => T,
  options?: {
    version?: string;
    description?: string;
    dependencies?: Array<string | symbol>;
  },
): ModuleDefinition<T> {
  const definition: ModuleDefinition<T> = {
    name: Symbol.for(`holon:flow-${name}`),
    version: options?.version ?? '1.0.0',
    dependencies: [Symbol.for('holon:flow-core'), ...(options?.dependencies ?? [])],

    factory: async (ctx: Context) => {
      // Get core module
      const coreInstance = (await ctx.get(Symbol.for('holon:flow-core'))) as CoreModule | undefined;

      if (!coreInstance) {
        throw new Error('Core module not found. Please load @holon/flow-core first.');
      }

      return factory(ctx, coreInstance.core);
    },
  };

  if (options?.description !== undefined) {
    definition.description = options.description;
  }

  return definition;
}