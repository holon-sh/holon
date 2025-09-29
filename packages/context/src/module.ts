import { type Context, context } from './index.js';

/**
 * JSON Schema type definition
 */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Module definition for extending Context
 */
export interface ModuleDefinition<T extends object> {
  /**
   * Module metadata
   */
  name: string | symbol;
  version: string;
  description?: string;
  author?: string;
  license?: string;

  /**
   * Module dependencies
   */
  dependencies?: Array<string | symbol>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Array<string | symbol>;

  /**
   * Factory function to create module extensions
   */
  factory: (ctx: Context) => T | Promise<T>;

  /**
   * Lifecycle hooks
   */
  onInit?: (ctx: Context) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;

  /**
   * Module configuration
   */
  config?: {
    schema: JSONSchema;
    defaults: unknown;
  };
}

/**
 * Module instance with metadata
 */
export interface Module<T extends object = object> {
  definition: ModuleDefinition<T>;
  instance?: T;
  initialized: boolean;
  dependencies: Map<string | symbol, Module>;
}

/**
 * Module-aware Context interface
 */
export interface ModularContext extends Context {
  /**
   * Load and use a module
   */
  use<T extends object>(module: ModuleDefinition<T>): ModularContext & T;

  /**
   * Check if a module is loaded
   */
  hasModule(name: string | symbol): boolean;

  /**
   * Get a loaded module instance
   */
  getModule<T extends object>(name: string | symbol): T | undefined;

  /**
   * Unload a module
   */
  unload(name: string | symbol): ModularContext;
}

/**
 * Create a module definition
 */
export function createModule<T extends object>(
  definition: ModuleDefinition<T>,
): ModuleDefinition<T> {
  return definition;
}

/**
 * Module registry singleton
 */
class ModuleRegistry {
  private modules = new Map<string | symbol, Module>();
  private initOrder: Array<string | symbol> = [];

  /**
   * Register a module
   */
  register<T extends object>(definition: ModuleDefinition<T>): void {
    if (this.modules.has(definition.name)) {
      throw new Error(`Module ${String(definition.name)} is already registered`);
    }

    this.modules.set(definition.name, {
      definition: definition as ModuleDefinition<object>,
      initialized: false,
      dependencies: new Map(),
    });
  }

  /**
   * Initialize a module and its dependencies
   */
  async initialize<T extends object>(name: string | symbol, ctx: Context): Promise<T> {
    const module = this.modules.get(name);
    if (!module) {
      throw new Error(`Module ${String(name)} not found`);
    }

    if (module.initialized && module.instance) {
      return module.instance as T;
    }

    // Initialize dependencies first
    if (module.definition.dependencies) {
      for (const dep of module.definition.dependencies) {
        if (!this.modules.has(dep)) {
          throw new Error(`Dependency ${String(dep)} not found for module ${String(name)}`);
        }
        await this.initialize(dep, ctx);
        module.dependencies.set(dep, this.modules.get(dep)!);
      }
    }

    // Create module instance
    const instance = await module.definition.factory(ctx);
    module.instance = instance;
    module.initialized = true;

    // Run initialization hook
    if (module.definition.onInit) {
      await module.definition.onInit(ctx);
    }

    this.initOrder.push(name);
    return instance as T;
  }

  /**
   * Destroy a module
   */
  async destroy(name: string | symbol): Promise<void> {
    const module = this.modules.get(name);
    if (!module || !module.initialized) {
      return;
    }

    // Run destroy hook
    if (module.definition.onDestroy) {
      await module.definition.onDestroy();
    }

    module.initialized = false;
    delete module.instance;
    module.dependencies.clear();

    // Remove from init order
    const index = this.initOrder.indexOf(name);
    if (index >= 0) {
      this.initOrder.splice(index, 1);
    }
  }

  /**
   * Get a module instance
   */
  getInstance<T extends object>(name: string | symbol): T | undefined {
    const module = this.modules.get(name);
    return module?.instance as T | undefined;
  }

  /**
   * Check if a module is registered
   */
  has(name: string | symbol): boolean {
    return this.modules.has(name);
  }

  /**
   * Destroy all modules in reverse initialization order
   */
  async destroyAll(): Promise<void> {
    const reverseOrder = [...this.initOrder].reverse();
    for (const name of reverseOrder) {
      await this.destroy(name);
    }
    this.modules.clear();
    this.initOrder = [];
  }
}

// Global module registry
const globalRegistry = new ModuleRegistry();

/**
 * Clear the global module registry (for testing)
 * @internal
 */
export function clearModuleRegistry(): void {
  globalRegistry.destroyAll();
}

/**
 * Enhance a context with module support
 */
export function withModules(ctx: Context): ModularContext {
  const loadedModules = new Map<string | symbol, object>();
  const initPromises = new Map<string | symbol, Promise<object>>();

  const modularCtx = ctx as ModularContext;

  modularCtx.use = <T extends object>(module: ModuleDefinition<T>): ModularContext & T => {
    // Register module if not already registered
    if (!globalRegistry.has(module.name)) {
      globalRegistry.register(module);
    }

    // Initialize module
    const instancePromise = globalRegistry.initialize<T>(module.name, ctx).then((instance) => {
      loadedModules.set(module.name, instance);
      return instance;
    });
    initPromises.set(module.name, instancePromise);

    // Wait for initialization synchronously if possible
    instancePromise.catch(() => {}); // Prevent unhandled rejection

    // Create proxy that provides both context and module methods
    const proxy = new Proxy({} as ModularContext & T, {
      get(_, prop) {
        if (prop in modularCtx) {
          return (modularCtx as any)[prop];
        }

        // Return cached module property if available
        const cached = loadedModules.get(module.name);
        if (cached && prop in cached) {
          return (cached as any)[prop];
        }

        // Module not yet loaded - this shouldn't happen in normal usage
        // as the module should be awaited before use
        throw new Error(
          `Module ${String(module.name)} not yet initialized. Await the module before accessing its properties.`,
        );
      },
    });

    return proxy;
  };

  modularCtx.hasModule = (name: string | symbol): boolean => globalRegistry.has(name);

  modularCtx.getModule = <T extends object>(name: string | symbol): T | undefined =>
    globalRegistry.getInstance<T>(name);

  modularCtx.unload = (name: string | symbol): ModularContext => {
    globalRegistry.destroy(name);
    loadedModules.delete(name);
    return modularCtx;
  };

  return modularCtx;
}

/**
 * Core context module providing basic utilities
 */
export const contextModule = createModule<{
  context: {
    scope: (name: string, values: Record<string, unknown>) => Context;
    fork: () => Context;
    merge: (...contexts: Context[]) => Context;
    isolate: (keys: string[]) => Context;
  };
}>({
  name: Symbol.for('holon:context'),
  version: '10.0.0',
  description: 'Core context utilities',

  factory: (ctx) => ({
    context: {
      scope: (name: string, values: Record<string, unknown>) => {
        const scoped = ctx.with({ [Symbol(name)]: values });
        return scoped.with(values);
      },

      fork: () => ctx.fork(),

      merge: (...contexts: Context[]) => {
        let merged = ctx;
        for (const c of contexts) {
          for (const key of c.keys()) {
            const value = c.get(key);
            if (value !== undefined) {
              merged = merged.with({ [key]: value });
            }
          }
        }
        return merged;
      },

      isolate: (keys: string[] | symbol[]) => {
        const values: Record<string | symbol, unknown> = {};
        for (const key of keys) {
          const value = ctx.get(key);
          if (value !== undefined) {
            values[key] = value;
          }
        }
        return context(values);
      },
    },
  }),
});
