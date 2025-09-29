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

  /**
   * Delete a key from context (returns new context without the key)
   */
  delete(key: string | symbol): Context;

  /**
   * Clear all keys (returns empty context)
   */
  clear(): Context;

  /**
   * Get all entries as array of key-value pairs
   */
  entries(): [string | symbol, unknown][];

  /**
   * Get all values as array
   */
  values(): unknown[];

  /**
   * Merge multiple contexts (later contexts override earlier ones)
   */
  merge(...contexts: Context[]): Context;

  /**
   * Create exact copy without parent relationship
   */
  clone(): Context;

  /**
   * Convert to plain object (for serialization)
   */
  toObject(): Record<string | symbol, unknown>;
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
      this.data = new Map();
      // Handle string keys
      for (const [key, value] of Object.entries(initial)) {
        this.data.set(key, value);
      }
      // Handle symbol keys
      const symbols = Object.getOwnPropertySymbols(initial);
      for (const sym of symbols) {
        this.data.set(sym, initial[sym]);
      }
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
    const storage = await getAsyncLocalStorage();
    if (storage) {
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

  delete(key: string | symbol): Context {
    if (this.frozen) {
      throw new Error('Cannot modify frozen context');
    }

    // Create new context without the specified key
    const newData = new Map();

    // Copy all entries except the one to delete
    for (const [k, v] of this.data) {
      if (k !== key) {
        newData.set(k, v);
      }
    }

    return new ImmutableContext(newData, this.parent);
  }

  clear(): Context {
    if (this.frozen) {
      throw new Error('Cannot modify frozen context');
    }

    // Return new empty context (no parent to preserve clear semantics)
    return new ImmutableContext();
  }

  entries(): [string | symbol, unknown][] {
    const entriesMap = new Map<string | symbol, unknown>();

    // Start from parent to allow child to override
    let parent = this.parent;
    const parentChain: ImmutableContext[] = [];

    while (parent) {
      parentChain.unshift(parent);
      parent = parent.parent;
    }

    // Add entries from parent chain
    for (const ctx of parentChain) {
      for (const [key, value] of ctx.data) {
        entriesMap.set(key, value);
      }
    }

    // Add entries from this context (overrides parent)
    for (const [key, value] of this.data) {
      entriesMap.set(key, value);
    }

    return Array.from(entriesMap.entries());
  }

  values(): unknown[] {
    return this.entries().map(([_, value]) => value);
  }

  merge(...contexts: Context[]): Context {
    if (this.frozen) {
      throw new Error('Cannot modify frozen context');
    }

    // Start with current context's data
    const mergedData = new Map<string | symbol, unknown>();

    // Add all entries from this context
    for (const [key, value] of this.entries()) {
      mergedData.set(key, value);
    }

    // Merge in data from other contexts
    for (const ctx of contexts) {
      for (const [key, value] of ctx.entries()) {
        mergedData.set(key, value);
      }
    }

    return new ImmutableContext(mergedData);
  }

  clone(): Context {
    // Create new context with all data but no parent
    const clonedData = new Map<string | symbol, unknown>();

    for (const [key, value] of this.entries()) {
      clonedData.set(key, value);
    }

    return new ImmutableContext(clonedData);
  }

  toObject(): Record<string | symbol, unknown> {
    const obj: Record<string | symbol, unknown> = {};

    for (const [key, value] of this.entries()) {
      obj[key] = value;
    }

    return obj;
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

async function getAsyncLocalStorage() {
  if (!asyncLocalStorage) {
    // Try to import from Node.js async_hooks
    if (typeof globalThis.process !== 'undefined' && globalThis.process.versions?.node) {
      try {
        const { AsyncLocalStorage } = await import('node:async_hooks');
        asyncLocalStorage = new AsyncLocalStorage();
      } catch {
        // AsyncLocalStorage not available
      }
    }
  }
  return asyncLocalStorage;
}

/**
 * Get current context from async local storage
 */
export async function getCurrentContext(): Promise<Context | undefined> {
  const storage = await getAsyncLocalStorage();
  return storage?.getStore();
}

/**
 * Run a function with a specific context
 */
export async function withContext<T>(ctx: Context, fn: () => T | Promise<T>): Promise<T> {
  const storage = await getAsyncLocalStorage();
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
  const flow = (async (input: In) => {
    const ctx = (await getCurrentContext()) ?? emptyContext;
    return fn(input, ctx);
  }) as Flow<In, Out>;

  flow.pipe = <Next>(next: Flow<Out, Next>): Flow<In, Next> => {
    const piped = ((input: In) => {
      const intermediate = flow(input);
      if (intermediate instanceof Promise) {
        return intermediate.then((r) => next(r));
      }
      return next(intermediate);
    }) as Flow<In, Next>;

    piped.pipe = <Final>(final: Flow<Next, Final>) => flow.pipe(next.pipe(final));

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

// Export module system
export type { JSONSchema, ModularContext, Module, ModuleDefinition } from './module.js';
export { clearModuleRegistry, contextModule, createModule, withModules } from './module.js';
