import type { Flow } from '@holon/flow';

/**
 * Immutable context for Flow execution
 */
export interface Context {
  /**
   * Get a value from the context
   */
  get<T>(key: string | symbol): T | undefined;

  /**
   * Create a new context with additional values
   */
  with<T extends Record<string | symbol, any>>(values: T): Context;

  /**
   * Run a Flow with this context
   */
  run<In, Out>(flow: Flow<In, Out>, input: In): Promise<Out>;

  /**
   * Get all keys in the context
   */
  keys(): (string | symbol)[];

  /**
   * Check if a key exists
   */
  has(key: string | symbol): boolean;

  /**
   * Create a child context
   */
  fork(): Context;

  /**
   * Freeze the context (prevent further modifications)
   */
  freeze(): Context;
}

/**
 * Context implementation with structural sharing
 */
class ImmutableContext implements Context {
  private readonly data: Map<string | symbol, any>;
  private readonly parent?: ImmutableContext;
  private frozen = false;

  constructor(
    initial?: Record<string | symbol, any> | Map<string | symbol, any>,
    parent?: ImmutableContext,
  ) {
    if (parent !== undefined) {
      this.parent = parent;
    }
    if (initial instanceof Map) {
      this.data = new Map(initial);
    } else if (initial) {
      this.data = new Map(Object.entries(initial));
    } else {
      this.data = new Map();
    }
  }

  get<T>(key: string | symbol): T | undefined {
    if (this.data.has(key)) {
      return this.data.get(key);
    }
    return this.parent?.get(key);
  }

  with<T extends Record<string | symbol, any>>(values: T): Context {
    if (this.frozen) {
      throw new Error('Cannot modify frozen context');
    }

    // Create new context with structural sharing
    const newData = new Map(this.data);
    for (const [key, value] of Object.entries(values)) {
      newData.set(key, value);
    }

    // Also handle symbol keys
    const symbols = Object.getOwnPropertySymbols(values);
    for (const sym of symbols) {
      newData.set(sym, values[sym]);
    }

    return new ImmutableContext(newData, this.parent);
  }

  async run<In, Out>(flow: Flow<In, Out>, input: In): Promise<Out> {
    // Store current context in async local storage if available
    if (typeof (globalThis as any).AsyncLocalStorage !== 'undefined') {
      const storage = getAsyncLocalStorage();
      return storage.run(this, () => Promise.resolve(flow(input)));
    }

    // Fallback to direct execution
    return Promise.resolve(flow(input));
  }

  keys(): (string | symbol)[] {
    const keys = new Set<string | symbol>();

    // Add keys from this context
    for (const key of this.data.keys()) {
      keys.add(key);
    }

    // Add keys from parent contexts
    let parent = this.parent;
    while (parent) {
      for (const key of parent.data.keys()) {
        keys.add(key);
      }
      parent = parent.parent;
    }

    return Array.from(keys);
  }

  has(key: string | symbol): boolean {
    if (this.data.has(key)) {
      return true;
    }
    return this.parent?.has(key) ?? false;
  }

  fork(): Context {
    return new ImmutableContext(new Map(), this);
  }

  freeze(): Context {
    this.frozen = true;
    return this;
  }
}

/**
 * Create a new context
 */
export function context(initial?: Record<string | symbol, any>): Context {
  return new ImmutableContext(initial);
}

/**
 * Empty context singleton
 */
export const emptyContext = context().freeze();

/**
 * Global async local storage for context (Node.js compatible)
 */
let asyncLocalStorage: any;

function getAsyncLocalStorage() {
  if (!asyncLocalStorage && typeof (globalThis as any).AsyncLocalStorage !== 'undefined') {
    const AsyncLocalStorage = (globalThis as any).AsyncLocalStorage;
    asyncLocalStorage = new AsyncLocalStorage();
  }
  return asyncLocalStorage;
}

/**
 * Get current context from async local storage
 */
export function getCurrentContext(): Context | undefined {
  const storage = getAsyncLocalStorage();
  return storage?.getStore();
}

/**
 * Run a function with a specific context
 */
export async function withContext<T>(
  ctx: Context,
  fn: () => T | Promise<T>,
): Promise<T> {
  const storage = getAsyncLocalStorage();
  if (storage) {
    return storage.run(ctx, fn);
  }
  return Promise.resolve(fn());
}

/**
 * Context-aware Flow wrapper
 */
export function contextual<In, Out>(
  fn: (input: In, ctx: Context) => Out | Promise<Out>,
): Flow<In, Out> {
  const flow = ((input: In) => {
    const ctx = getCurrentContext() ?? emptyContext;
    return fn(input, ctx);
  }) as Flow<In, Out>;

  flow.pipe = function <Next>(next: Flow<Out, Next>): Flow<In, Next> {
    const piped = ((input: In) => {
      const intermediate = flow(input);
      if (intermediate instanceof Promise) {
        return intermediate.then((r) => next(r));
      }
      return next(intermediate);
    }) as Flow<In, Next>;

    piped.pipe = function <Final>(final: Flow<Next, Final>) {
      return flow.pipe(next.pipe(final));
    };

    return piped;
  };

  return flow;
}

/**
 * Well-known context keys
 */
export const ContextKeys = {
  REQUEST_ID: Symbol('request-id'),
  USER_ID: Symbol('user-id'),
  TRACE_ID: Symbol('trace-id'),
  SPAN_ID: Symbol('span-id'),
  LOCALE: Symbol('locale'),
  TIMEZONE: Symbol('timezone'),
  ABORT_SIGNAL: Symbol('abort-signal'),
  LOGGER: Symbol('logger'),
  METRICS: Symbol('metrics'),
  CONFIG: Symbol('config'),
} as const;

/**
 * Type-safe context key creator
 */
export function createContextKey(name: string): symbol {
  return Symbol(name);
}