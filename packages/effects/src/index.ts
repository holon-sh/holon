import type { Context } from '@holon/context';
import type { Flow } from '@holon/flow';
import { EffectFlags, flow } from '@holon/flow';

/**
 * Effect descriptor
 */
export interface Effect<T = any> {
  /**
   * Effect identifier
   */
  id: symbol;

  /**
   * Effect flags (bitwise)
   */
  flags: EffectFlags;

  /**
   * Effect handler
   */
  handler: (value: T, ctx: Context) => any | Promise<any>;

  /**
   * Optional cleanup
   */
  cleanup?: (result: any) => void | Promise<void>;
}

/**
 * Effect-aware Flow
 */
export interface EffectFlow<In = any, Out = any> extends Flow<In, Out> {
  /**
   * Effects used by this Flow
   */
  effects: Set<Effect>;

  /**
   * Effect flags (combined)
   */
  flags: EffectFlags;
}

/**
 * Create an effect
 */
export function effect<T>(
  id: string | symbol,
  flags: EffectFlags,
  handler: Effect<T>['handler'],
  cleanup?: Effect<T>['cleanup'],
): Effect<T> {
  const result: Effect<T> = {
    id: typeof id === 'string' ? Symbol(id) : id,
    flags,
    handler,
  };

  if (cleanup !== undefined) {
    result.cleanup = cleanup;
  }

  return result;
}

/**
 * Common effects
 */
export const Effects = {
  /**
   * Console logging effect
   */
  log: effect('log', EffectFlags.IO, (message: string) => console.log(message)),

  /**
   * File system read effect
   */
  readFile: effect(
    'readFile',
    EffectFlags.Read | EffectFlags.IO | EffectFlags.Async,
    async (path: string) => {
      // Runtime-specific implementation
      if (typeof (globalThis as any).Deno !== 'undefined') {
        return await (globalThis as any).Deno.readTextFile(path);
      }
      if (typeof (globalThis as any).Bun !== 'undefined') {
        const file = (globalThis as any).Bun.file(path);
        return await file.text();
      }
      if (typeof globalThis.process !== 'undefined') {
        // Node.js
        const { readFile } = await import('node:fs/promises');
        return await readFile(path, 'utf-8');
      }
      throw new Error('File system not available in this runtime');
    },
  ),

  /**
   * File system write effect
   */
  writeFile: effect(
    'writeFile',
    EffectFlags.Write | EffectFlags.IO | EffectFlags.Async,
    async ([path, content]: [string, string]) => {
      // Runtime-specific implementation
      if (typeof (globalThis as any).Deno !== 'undefined') {
        return await (globalThis as any).Deno.writeTextFile(path, content);
      }
      if (typeof (globalThis as any).Bun !== 'undefined') {
        return await (globalThis as any).Bun.write(path, content);
      }
      if (typeof globalThis.process !== 'undefined') {
        // Node.js
        const { writeFile } = await import('node:fs/promises');
        return await writeFile(path, content, 'utf-8');
      }
      throw new Error('File system not available in this runtime');
    },
  ),

  /**
   * HTTP fetch effect
   */
  fetch: effect(
    'fetch',
    EffectFlags.Network | EffectFlags.Async,
    async (url: string | URL | Request) => {
      return await fetch(url);
    },
  ),

  /**
   * Random number effect
   */
  random: effect('random', EffectFlags.Random, () => Math.random()),

  /**
   * Current time effect
   */
  now: effect('now', EffectFlags.Time, () => Date.now()),

  /**
   * Throw error effect
   */
  throw: effect('throw', EffectFlags.Throw, (error: Error) => {
    throw error;
  }),
} as const;

/**
 * Create an effectful Flow
 */
export function effectful<In, Out>(
  fn: (input: In) => Out | Promise<Out>,
  effects: Effect[],
  flags?: EffectFlags,
): EffectFlow<In, Out> {
  const effectFlow = flow(fn) as EffectFlow<In, Out>;

  effectFlow.effects = new Set(effects);
  effectFlow.flags = flags ?? effects.reduce((acc, e) => acc | e.flags, 0 as EffectFlags);

  return effectFlow;
}

/**
 * Mark a Flow as pure (no effects)
 */
export function pure<In, Out>(fn: (input: In) => Out): EffectFlow<In, Out> {
  return effectful(fn, [], EffectFlags.None);
}

/**
 * Check if a Flow has specific effects
 */
export function hasEffect(flow: Flow, flag: EffectFlags): boolean {
  if ('flags' in flow) {
    return ((flow as EffectFlow).flags & flag) !== 0;
  }
  return false;
}

/**
 * Check if a Flow is pure
 */
export function isPure(flow: Flow): boolean {
  if ('flags' in flow) {
    return (flow as EffectFlow).flags === EffectFlags.None;
  }
  return false;
}

/**
 * Combine effects from multiple Flows
 */
export function combineEffects(...flows: Flow[]): EffectFlags {
  return flows.reduce((acc, flow) => {
    if ('flags' in flow) {
      return acc | (flow as EffectFlow).flags;
    }
    return acc;
  }, EffectFlags.None);
}

/**
 * Effect interpreter
 */
export class EffectInterpreter {
  private handlers = new Map<symbol, Effect['handler']>();

  /**
   * Register an effect handler
   */
  register(effect: Effect): this {
    this.handlers.set(effect.id, effect.handler);
    return this;
  }

  /**
   * Run an effectful computation
   */
  async run<In, Out>(flow: EffectFlow<In, Out>, input: In, _ctx: Context): Promise<Out> {
    // Check if all effects have handlers
    for (const effect of flow.effects) {
      if (!this.handlers.has(effect.id)) {
        throw new Error(`No handler for effect: ${String(effect.id)}`);
      }
    }

    // Execute with effect handling
    return flow(input);
  }

  /**
   * Create a pure interpreter (mocks all effects)
   */
  static pure(): EffectInterpreter {
    const interpreter = new EffectInterpreter();

    // Register mock handlers
    interpreter.register({
      ...Effects.log,
      handler: () => {}, // No-op
    });

    interpreter.register({
      ...Effects.readFile,
      handler: async () => 'mock file content',
    });

    interpreter.register({
      ...Effects.writeFile,
      handler: async () => {},
    });

    interpreter.register({
      ...Effects.fetch,
      handler: async () => new Response('mock response'),
    });

    interpreter.register({
      ...Effects.random,
      handler: () => 0.5, // Always return 0.5
    });

    interpreter.register({
      ...Effects.now,
      handler: () => 0, // Always return epoch
    });

    return interpreter;
  }
}

/**
 * IO monad for effect isolation
 */
export class IO<T> {
  constructor(private readonly computation: () => T | Promise<T>) {}

  /**
   * Map over the IO value
   */
  map<R>(fn: (value: T) => R): IO<R> {
    return new IO(async () => fn(await this.computation()));
  }

  /**
   * FlatMap (bind) for IO
   */
  flatMap<R>(fn: (value: T) => IO<R>): IO<R> {
    return new IO(async () => {
      const value = await this.computation();
      return fn(value).run();
    });
  }

  /**
   * Run the IO computation
   */
  async run(): Promise<T> {
    return this.computation();
  }

  /**
   * Create an IO from a value
   */
  static of<T>(value: T): IO<T> {
    return new IO(() => value);
  }

  /**
   * Create an IO from an async computation
   */
  static async<T>(computation: () => Promise<T>): IO<T> {
    return new IO(computation);
  }
}
