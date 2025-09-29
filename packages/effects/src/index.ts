import type { Context } from '@holon/context';
import type { Flow } from '@holon/flow';
import { flow } from '@holon/flow';

/**
 * Effect flags for tracking side effects
 */
export enum EffectFlags {
  None = 0,
  Read = 1 << 0,
  Write = 1 << 1,
  IO = 1 << 2,
  Network = 1 << 3,
  Random = 1 << 4,
  Time = 1 << 5,
  Throw = 1 << 6,
  Async = 1 << 7,

  // System effects
  Process = 1 << 8,
  Memory = 1 << 9,
  State = 1 << 10,
  Unsafe = 1 << 11,

  // Specialized effects
  Database = 1 << 12,
  Cache = 1 << 13,
  Queue = 1 << 14,
  Stream = 1 << 15,

  // Composite flags
  FileSystem = Read | Write | IO,
  FullDatabase = Read | Write | Network | Async | Database,
  Pure = None,
}

/**
 * Effect category for classification
 */
export type EffectCategory = 'io' | 'network' | 'system' | 'data' | 'computation' | 'control';

/**
 * Effect handler type
 */
export type EffectHandler<T = any, R = any> = (value: T, ctx: Context) => R | Promise<R>;

/**
 * Effect descriptor
 */
export interface Effect<T = any, R = any> {
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
  handler: EffectHandler<T, R>;

  /**
   * Optional cleanup
   */
  cleanup?: (result: R) => void | Promise<void>;

  /**
   * Effect metadata
   */
  metadata?: {
    name: string;
    description?: string;
    category: EffectCategory;
    performance?: {
      expectedMs: number;
      variance: number;
      complexity: 'O(1)' | 'O(n)' | 'O(n²)' | 'O(log n)';
    };
    security?: {
      requiresAuth: boolean;
      permissions: string[];
      sanitization: boolean;
    };
    reliability?: {
      retryable: boolean;
      idempotent: boolean;
      compensatable: boolean;
    };
  };

  /**
   * Validation function
   */
  validate?: (value: T, ctx: Context) => boolean | Promise<boolean>;

  /**
   * Transformation function
   */
  transform?: (value: T, ctx: Context) => T | Promise<T>;
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
 * Effect creation options
 */
export interface EffectOptions<T = any, R = any> {
  flags: EffectFlags;
  handler: EffectHandler<T, R>;
  cleanup?: (result: R) => void | Promise<void>;
  metadata?: Effect<T, R>['metadata'];
  validate?: (value: T, ctx: Context) => boolean | Promise<boolean>;
  transform?: (value: T, ctx: Context) => T | Promise<T>;
}

/**
 * Create an effect
 */
export function effect<T = any, R = any>(
  id: string | symbol,
  options: EffectOptions<T, R>,
): Effect<T, R>;
export function effect<T = any, R = any>(
  id: string | symbol,
  flags: EffectFlags,
  handler: EffectHandler<T, R>,
  cleanup?: (result: R) => void | Promise<void>,
): Effect<T, R>;
export function effect<T = any, R = any>(
  id: string | symbol,
  flagsOrOptions: EffectFlags | EffectOptions<T, R>,
  handler?: EffectHandler<T, R>,
  cleanup?: (result: R) => void | Promise<void>,
): Effect<T, R> {
  const effectId = typeof id === 'string' ? Symbol(id) : id;

  if (typeof flagsOrOptions === 'object') {
    // New signature with options
    const options = flagsOrOptions;
    return {
      id: effectId,
      flags: options.flags,
      handler: options.handler,
      ...(options.cleanup && { cleanup: options.cleanup }),
      ...(options.metadata && { metadata: options.metadata }),
      ...(options.validate && { validate: options.validate }),
      ...(options.transform && { transform: options.transform }),
    };
  } else {
    // Legacy signature for backward compatibility
    return {
      id: effectId,
      flags: flagsOrOptions,
      handler: handler!,
      ...(cleanup && { cleanup }),
    };
  }
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
  effectsOrFlags: Effect[] | EffectFlags,
  flags?: EffectFlags,
): EffectFlow<In, Out> {
  const effectFlow = flow(fn) as EffectFlow<In, Out>;

  // Handle both Effect[] and EffectFlags
  if (typeof effectsOrFlags === 'number') {
    // It's EffectFlags
    effectFlow.effects = new Set<Effect>();
    effectFlow.flags = effectsOrFlags as EffectFlags;
  } else {
    // It's Effect[]
    effectFlow.effects = new Set(effectsOrFlags);
    effectFlow.flags = flags ?? effectsOrFlags.reduce((acc, e) => acc | e.flags, 0 as EffectFlags);
  }

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

/**
 * Effect combinator options
 */
export interface BatchOptions {
  size?: number;
  delay?: number;
  maxWait?: number;
}

/**
 * Parallel execution with limit
 */
export function parallelLimit<In, Out>(
  limit: number,
  ...effects: EffectFlow<In, Out>[]
): EffectFlow<In, Out[]> {
  return effectful(
    async (input: In) => {
      const results: Out[] = [];
      const executing: Promise<void>[] = [];

      for (const effect of effects) {
        const resultOrPromise = effect(input);
        const promise = Promise.resolve(resultOrPromise).then((result) => {
          results.push(result);
        });

        executing.push(promise);

        if (executing.length >= limit) {
          await Promise.race(executing);
          executing.splice(
            executing.findIndex((p) => p),
            1,
          );
        }
      }

      await Promise.all(executing);
      return results;
    },
    combineEffects(...effects),
  );
}

/**
 * Race with timeout
 */
export function raceTimeout<In, Out>(
  effect: EffectFlow<In, Out>,
  timeoutMs: number,
  fallback?: Out,
): EffectFlow<In, Out> {
  return effectful(
    async (input: In) => {
      const timeoutPromise = new Promise<Out>((resolve, reject) =>
        setTimeout(() => {
          if (fallback !== undefined) {
            resolve(fallback);
          } else {
            reject(new Error(`Effect timeout after ${timeoutMs}ms`));
          }
        }, timeoutMs),
      );

      return Promise.race([effect(input), timeoutPromise]);
    },
    effect.flags | EffectFlags.Time,
  );
}

/**
 * Batch effect execution
 */
export function batch<In, Out>(
  effect: EffectFlow<In[], Out[]>,
  options: BatchOptions = {},
): EffectFlow<In, Out> {
  const { size = 10, delay = 100, maxWait = 1000 } = options;
  let queue: Array<{ input: In; resolve: (value: Out) => void; reject: (error: any) => void }> =
    [];
  let timer: NodeJS.Timeout | null = null;
  let firstQueueTime: number | null = null;

  const processBatch = async () => {
    if (queue.length === 0) return;

    const batch = queue.splice(0, size);
    const inputs = batch.map((item) => item.input);

    try {
      const results = await effect(inputs);
      batch.forEach((item, index) => {
        item.resolve(results[index] as Out);
      });
    } catch (error) {
      batch.forEach((item) => item.reject(error));
    }

    firstQueueTime = null;
    if (queue.length > 0) {
      scheduleProcess();
    }
  };

  const scheduleProcess = () => {
    if (timer) clearTimeout(timer);

    const now = Date.now();
    if (!firstQueueTime) firstQueueTime = now;

    const waitTime = Math.min(delay, maxWait - (now - firstQueueTime));
    timer = setTimeout(processBatch, waitTime);
  };

  return effectful((input: In) => {
    return new Promise<Out>((resolve, reject) => {
      queue.push({ input, resolve, reject });

      if (queue.length >= size) {
        processBatch();
      } else {
        scheduleProcess();
      }
    });
  }, effect.flags);
}

/**
 * Debounce effect execution
 */
export function debounceEffect<In, Out>(
  effect: EffectFlow<In, Out>,
  delayMs: number,
): EffectFlow<In, Out> {
  let timer: NodeJS.Timeout | null = null;
  let lastInput: In;
  let pendingResolves: Array<(value: Out) => void> = [];
  let pendingRejects: Array<(error: any) => void> = [];

  return effectful((input: In) => {
    return new Promise<Out>((resolve, reject) => {
      lastInput = input;
      pendingResolves.push(resolve);
      pendingRejects.push(reject);

      if (timer) clearTimeout(timer);

      timer = setTimeout(async () => {
        const resolvesToProcess = [...pendingResolves];
        const rejectsToProcess = [...pendingRejects];
        pendingResolves = [];
        pendingRejects = [];
        timer = null;

        try {
          const result = await effect(lastInput);
          resolvesToProcess.forEach((res) => res(result));
        } catch (error) {
          rejectsToProcess.forEach((rej) => rej(error));
        }
      }, delayMs);
    });
  }, effect.flags | EffectFlags.Time);
}

/**
 * Throttle effect execution
 */
export function throttleEffect<In, Out>(
  effect: EffectFlow<In, Out>,
  limitMs: number,
): EffectFlow<In, Out> {
  let lastRun = 0;
  let lastResult: Out | undefined;
  let pendingInput: In | undefined;
  let pendingResolves: Array<(value: Out) => void> = [];
  let timer: NodeJS.Timeout | null = null;

  return effectful((input: In) => {
    return new Promise<Out>(async (resolve, reject) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRun;

      if (timeSinceLastRun >= limitMs) {
        lastRun = now;
        try {
          lastResult = await effect(input);
          resolve(lastResult);
        } catch (error) {
          reject(error);
        }
      } else {
        // Store the latest input and add resolve to pending
        pendingInput = input;
        pendingResolves.push(resolve);

        if (!timer) {
          timer = setTimeout(async () => {
            timer = null;
            lastRun = Date.now();
            if (pendingInput !== undefined) {
              try {
                lastResult = await effect(pendingInput);
                // Resolve all pending promises with the new result
                const resolvesToProcess = [...pendingResolves];
                pendingResolves = [];
                resolvesToProcess.forEach(res => res(lastResult!));
              } catch (error) {
                // Reject all pending promises
                const resolvesToProcess = [...pendingResolves];
                pendingResolves = [];
                resolvesToProcess.forEach(() => reject(error));
              }
            }
          }, limitMs - timeSinceLastRun);
        }
      }
    });
  }, effect.flags | EffectFlags.Time);
}

/**
 * Parallel execution of multiple effects
 */
export function parallel<In, Out>(
  ...effects: EffectFlow<In, Out>[]
): EffectFlow<In, Out[]> {
  return parallelLimit(Infinity, ...effects);
}

/**
 * Sequential execution of effects with value passing
 */
export function sequential<T>(...effects: EffectFlow<any, any>[]): EffectFlow<T, any> {
  return effectful(
    async (input: T) => {
      let result: any = input;
      for (const effect of effects) {
        result = await effect(result);
      }
      return result;
    },
    combineEffects(...effects) | EffectFlags.Async,
  );
}

/**
 * Conditional effect execution
 */
export function conditional<In, Out1, Out2>(
  condition: (input: In) => boolean,
  ifTrue: EffectFlow<In, Out1>,
  ifFalse: EffectFlow<In, Out2>,
): EffectFlow<In, Out1 | Out2> {
  return effectful(
    (input: In) => {
      if (condition(input)) {
        return ifTrue(input);
      } else {
        return ifFalse(input);
      }
    },
    ifTrue.flags | ifFalse.flags,
  );
}

/**
 * Suppress errors in effect with fallback
 */
export function suppress<In, Out>(
  effect: EffectFlow<In, Out>,
  fallback: (error: any) => Out,
): EffectFlow<In, Out> {
  return effectful(
    async (input: In) => {
      try {
        return await effect(input);
      } catch (error) {
        return fallback(error);
      }
    },
    effect.flags,
  );
}

/**
 * Retry options
 */
export interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: 'linear' | 'exponential';
  onRetry?: (attempt: number, error: any) => void;
}

/**
 * Retry effect on failure
 */
export function retry<In, Out>(
  effect: EffectFlow<In, Out>,
  options: RetryOptions = {},
): EffectFlow<In, Out> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 'linear',
    onRetry,
  } = options;

  return effectful(
    async (input: In) => {
      let lastError: any;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await effect(input);
        } catch (error) {
          lastError = error;

          if (attempt < maxAttempts) {
            if (onRetry) {
              onRetry(attempt, error);
            }

            const waitTime = backoff === 'exponential'
              ? delay * Math.pow(2, attempt - 1)
              : delay * attempt;

            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      throw lastError;
    },
    effect.flags | EffectFlags.Async | EffectFlags.Time,
  );
}

/**
 * Timeout effect execution
 */
export function timeout<In, Out>(
  effect: EffectFlow<In, Out>,
  ms: number,
): EffectFlow<In, Out> {
  return effectful(
    async (input: In) => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Effect timeout after ${ms}ms`)), ms)
      );

      return Promise.race([
        effect(input),
        timeoutPromise,
      ]);
    },
    effect.flags | EffectFlags.Async | EffectFlags.Time,
  );
}

/**
 * Effect analysis result
 */
export interface AnalysisResult {
  pure: boolean;
  effects: EffectFlags;
  sideEffects: string[];
  async: boolean;
  complexity?: string;
  performance?: {
    expectedMs: number;
    variance: number;
  };
}

/**
 * Analyze effect for optimization opportunities
 */
export function analyze(flow: EffectFlow<any, any>): AnalysisResult {
  const flags = flow.flags || EffectFlags.None;
  const isFlowPure = flags === EffectFlags.None;
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
    complexity: 'O(n)',
    performance: {
      expectedMs: 100,
      variance: 50,
    },
  };
}

/**
 * Optimize effect flow (simplified version)
 */
export function optimize<In, Out>(
  flow: EffectFlow<In, Out>,
): EffectFlow<In, Out> {
  // This is a simplified optimization that just returns the flow
  // A real implementation would analyze and optimize the flow
  const analysis = analyze(flow);

  // For pure flows, we could add memoization
  if (analysis.pure) {
    const cache = new Map<In, Out>();
    return effectful(
      (input: In) => {
        if (cache.has(input)) {
          return cache.get(input)!;
        }
        const result = flow(input);
        // Cast to Out since pure flows shouldn't return promises
        cache.set(input, result as Out);
        return result;
      },
      flow.flags,
    );
  }

  // For now, just return the original flow
  return flow;
}

/**
 * Restrict effect to allowed flags
 */
export function restrict<In, Out>(
  flow: EffectFlow<In, Out>,
  allowed: EffectFlags,
): EffectFlow<In, Out> {
  if ((flow.flags & ~allowed) !== 0) {
    throw new Error(
      `Flow has disallowed effects. Has: ${flow.flags}, Allowed: ${allowed}`,
    );
  }
  return flow;
}

// Algebraic effects exports
export {
  AlgebraicEffect,
  AlgebraicEffects,
  scopedEffect,
  withHandler,
  type TypeSignature,
} from './algebraic.js';

// Effect tracking exports
export {
  EffectTracker,
  globalTracker,
  trackedEffect,
  trackedFlow,
  type EffectAnalysis,
  type EffectSample,
  type EffectUsage,
  type TrackerConfig,
} from './tracker.js';

// Module exports for modular architecture
export { effectsModule, createEffectsModule } from './module.js';
export type { EffectsModule } from './module.js';
