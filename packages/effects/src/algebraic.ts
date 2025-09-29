import type { Context } from '@holon/context';

/**
 * Type signature for algebraic effects
 */
export interface TypeSignature<T, R> {
  input: T;
  output: R;
}

/**
 * Handler context for algebraic effects
 */
interface HandlerContext<T, R> {
  effect: AlgebraicEffect<T, R>;
  handler: <Out>(value: T, resume: (result: R) => Out) => Out;
}

/**
 * Global handler stack
 */
const handlerStack: HandlerContext<any, any>[] = [];

/**
 * Algebraic effect definition
 */
export class AlgebraicEffect<T = any, R = any> {
  constructor(
    public readonly name: string,
    public readonly signature?: TypeSignature<T, R>,
  ) {}

  /**
   * Perform the effect
   */
  perform(value: T): R {
    // Find the handler in the stack
    for (let i = handlerStack.length - 1; i >= 0; i--) {
      const ctx = handlerStack[i];
      if (ctx && ctx.effect === this) {
        // Found a handler for this effect
        let resumed = false;
        let resumeValue: R;

        const resume = (result: R): R => {
          if (resumed) {
            throw new Error(`Effect ${this.name} already resumed`);
          }
          resumed = true;
          resumeValue = result;
          return result;
        };

        // Call the handler with resume continuation
        ctx?.handler(value, resume);

        // Check if resumed was called
        if (!resumed) {
          throw new Error(`Handler for effect ${this.name} did not call resume`);
        }

        return resumeValue! as R;
      }
    }

    // No handler found
    throw new Error(`No handler for effect ${this.name}`);
  }

  /**
   * Handle the effect with a specific handler
   */
  handle<In, Out>(
    handler: (value: T, resume: (result: R) => Out) => Out,
    computation: () => In,
  ): In {
    // Push handler onto stack
    handlerStack.push({
      effect: this,
      handler: handler as any,
    });

    try {
      // Run the computation
      return computation();
    } finally {
      // Pop handler from stack
      handlerStack.pop();
    }
  }

  /**
   * Create a simple handler that always returns the same value
   */
  static constant<T, R>(effect: AlgebraicEffect<T, R>, value: R): <Out>(computation: () => Out) => Out {
    return <Out>(computation: () => Out) =>
      effect.handle((_, resume) => resume(value), computation);
  }

  /**
   * Create a handler that transforms the input
   */
  static transform<T, R>(
    effect: AlgebraicEffect<T, R>,
    fn: (value: T) => R,
  ): <Out>(computation: () => Out) => Out {
    return <Out>(computation: () => Out) =>
      effect.handle((value, resume) => resume(fn(value)), computation);
  }

  /**
   * Compose multiple handlers
   */
  static compose<Out>(
    ...handlers: Array<(computation: () => Out) => Out>
  ): (computation: () => Out) => Out {
    return (computation: () => Out) => {
      if (handlers.length === 0) {
        return computation();
      }
      const result = handlers.reduceRight(
        (comp: () => Out, handler) => () => handler(comp),
        computation,
      )();
      return result;
    };
  }
}

/**
 * Create an effect with a handler in context
 */
export function withHandler<T, R, Out>(
  effect: AlgebraicEffect<T, R>,
  handler: (value: T, resume: (result: R) => Out) => Out,
  computation: () => Out,
): Out {
  return effect.handle(handler, computation);
}

/**
 * Common algebraic effects
 */
export const AlgebraicEffects = {
  /**
   * State effect for managing mutable state
   */
  State: class State<S> {
    readonly get: AlgebraicEffect<void, S>;
    readonly set: AlgebraicEffect<S, void>;

    constructor(name = 'state') {
      this.get = new AlgebraicEffect(`${name}.get`);
      this.set = new AlgebraicEffect(`${name}.set`);
    }

    /**
     * Get current state
     */
    getValue(): S {
      return this.get.perform(undefined);
    }

    /**
     * Set new state
     */
    setValue(value: S): void {
      this.set.perform(value);
    }

    /**
     * Modify state
     */
    modify(fn: (state: S) => S): void {
      this.setValue(fn(this.getValue()));
    }

    /**
     * Run computation with state
     */
    run<Out>(initialState: S, computation: () => Out): [Out, S] {
      let state = initialState;
      let result: Out;

      // Setup both handlers at once
      handlerStack.push({
        effect: this.get as any,
        handler: (_, resume) => {
          resume(state);
          return undefined as any;
        },
      });

      handlerStack.push({
        effect: this.set as any,
        handler: (newState, resume) => {
          state = newState;
          resume(undefined);
          return undefined as any;
        },
      });

      try {
        result = computation();
      } finally {
        // Remove both handlers
        handlerStack.pop();
        handlerStack.pop();
      }

      return [result, state];
    }
  },

  /**
   * Exception effect for error handling
   */
  Exception: class Exception<E> {
    readonly raise: AlgebraicEffect<E, never>;

    constructor(name = 'exception') {
      this.raise = new AlgebraicEffect(`${name}.raise`);
    }

    /**
     * Throw an exception
     */
    throw(error: E): never {
      return this.raise.perform(error);
    }

    /**
     * Catch exceptions
     */
    catch<Out>(
      computation: () => Out,
      handler: (error: E) => Out,
    ): Out {
      // Push custom exception handler onto stack
      const ctx: HandlerContext<any, any> = {
        effect: this.raise as any,
        handler: (error: E) => {
          // For exceptions, we return the handled value directly
          // This is a special case that bypasses normal resume logic
          throw { __exceptionHandled: true, value: handler(error) };
        },
      };

      handlerStack.push(ctx);

      try {
        return computation();
      } catch (e: any) {
        if (e && e.__exceptionHandled) {
          return e.value;
        }
        throw e;
      } finally {
        handlerStack.pop();
      }
    }

    /**
     * Try-catch with finally
     */
    tryFinally<Out>(
      computation: () => Out,
      finallyBlock: () => void,
    ): Out {
      try {
        return computation();
      } finally {
        finallyBlock();
      }
    }
  },

  /**
   * Choice effect for non-deterministic computation
   */
  Choice: class Choice<T> {
    readonly choose: AlgebraicEffect<T[], T>;

    constructor(name = 'choice') {
      this.choose = new AlgebraicEffect(`${name}.choose`);
    }

    /**
     * Choose from alternatives
     */
    oneOf(choices: T[]): T {
      return this.choose.perform(choices);
    }

    /**
     * Run with all choices
     */
    all<Out>(choices: T[], computation: () => Out): Out[] {
      const results: Out[] = [];

      // Note: explore function would be used for a full all() implementation
      // Simple implementation for now
      for (const choice of choices) {
        this.choose.handle(
          (_, resume) => {
            resume(choice);
            return undefined;
          },
          () => {
            results.push(computation());
          },
        );
      }

      return results;
    }

    /**
     * Run with first successful choice
     */
    first<Out>(
      computation: () => Out,
      isSuccess: (result: Out) => boolean,
    ): Out | undefined {
      let result: Out | undefined;

      this.choose.handle(
        (choices, resume) => {
          for (const choice of choices) {
            const attempt = resume(choice) as Out;
            if (isSuccess(attempt)) {
              result = attempt as Out | undefined;
              break;
            }
          }
          return result;
        },
        computation,
      );

      return result;
    }
  },

  /**
   * Async effect for asynchronous operations
   */
  Async: class Async {
    readonly await: AlgebraicEffect<Promise<any>, any>;

    constructor(name = 'async') {
      this.await = new AlgebraicEffect(`${name}.await`);
    }

    /**
     * Await a promise
     */
    wait<T>(promise: Promise<T>): T {
      return this.await.perform(promise);
    }

    /**
     * Run async computation
     */
    async run<Out>(computation: () => Out): Promise<Out> {
      const promises: Promise<any>[] = [];
      // Note: values would store resolved values
      // const values: any[] = [];

      // Collect all promises
      const result = this.await.handle(
        (promise, resume) => {
          const index = promises.length;
          promises.push(promise);
          // Placeholder that will be replaced
          resume(Symbol(index.toString()));
          return undefined;
        },
        computation,
      );

      // Wait for all promises
      if (promises.length > 0) {
        // const resolved = await Promise.all(promises);
        await Promise.all(promises);
        // Replace placeholders with actual values
        // This is a simplified version - real implementation would need proper substitution
        return result as Out;
      }

      return result;
    }
  },
} as const;

/**
 * Create a scoped effect handler
 */
export function scopedEffect<T, R, Out>(
  effect: AlgebraicEffect<T, R>,
  handler: (value: T, ctx: Context) => R,
  ctx: Context,
): (computation: () => Out) => Out {
  return (computation: () => Out) =>
    effect.handle((value, resume) => resume(handler(value, ctx)), computation);
}