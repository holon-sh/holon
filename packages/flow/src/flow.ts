import type { Flow, FlowMeta, FlowOptions } from './types.js';

/**
 * Creates a Flow from a function.
 *
 * This is the fundamental building block of Holon. Every computation
 * is expressed as a Flow, which can then be composed with other Flows
 * to build complex systems.
 *
 * @param fn - The function to convert to a Flow
 * @param meta - Optional metadata to attach to the Flow
 * @returns A Flow that executes the function
 *
 * @example
 * ```typescript
 * const double = flow((x: number) => x * 2);
 * const addOne = flow((x: number) => x + 1);
 * const doubleThenAddOne = double.pipe(addOne);
 *
 * console.log(doubleThenAddOne(5)); // 11
 * ```
 *
 * @category Core
 * @since 10.0.0
 */
export function flow<In, Out>(
  fn: (input: In) => Out | Promise<Out>,
  meta?: FlowMeta,
): Flow<In, Out>;

/**
 * Creates a Flow from options.
 *
 * This overload allows for more control over Flow creation,
 * including error handling and metadata.
 *
 * @param options - Options for creating the Flow
 * @returns A Flow with the specified behavior
 *
 * @example
 * ```typescript
 * const safeDiv = flow({
 *   fn: ([a, b]: [number, number]) => a / b,
 *   onError: () => 0,
 *   meta: { name: 'safeDiv', pure: true }
 * });
 * ```
 */
export function flow<In, Out>(options: FlowOptions<In, Out>): Flow<In, Out>;

export function flow<In, Out>(
  fnOrOptions: ((input: In) => Out | Promise<Out>) | FlowOptions<In, Out>,
  meta?: FlowMeta,
): Flow<In, Out> {
  // Normalize arguments
  const options: FlowOptions<In, Out> =
    typeof fnOrOptions === 'function'
      ? { fn: fnOrOptions, ...(meta !== undefined && { meta }) }
      : fnOrOptions;

  const { fn, meta: flowMeta, onError } = options;

  // Create the Flow function
  const flowFn = (input: In): Out | Promise<Out> => {
    if (onError) {
      try {
        const result = fn(input);
        // Handle async errors
        if (result instanceof Promise) {
          return result.catch((error) => onError(error, input));
        }
        return result;
      } catch (error) {
        return onError(error as Error, input);
      }
    }
    return fn(input);
  };

  // Attach the pipe method
  (flowFn as Flow<In, Out>).pipe = function <Next>(
    next: Flow<Out, Next>,
  ): Flow<In, Next> {
    const piped = flow<In, Next>((input: In) => {
      const intermediate = flowFn(input);
      if (intermediate instanceof Promise) {
        return intermediate.then((value) => next(value));
      }
      return next(intermediate);
    });

    // Merge metadata
    if (flowMeta || next.meta) {
      (piped as any).meta = mergeMetadata(flowMeta, next.meta);
    }

    return piped;
  };

  // Attach metadata if provided
  if (flowMeta) {
    Object.defineProperty(flowFn, 'meta', {
      value: flowMeta,
      writable: false,
      enumerable: true,
      configurable: true
    });
  }

  return flowFn as Flow<In, Out>;
}

/**
 * Identity Flow - returns input unchanged.
 *
 * Useful as a default or placeholder in compositions.
 *
 * @example
 * ```typescript
 * const pipeline = someCondition
 *   ? processFlow
 *   : identity;
 * ```
 *
 * @category Core
 * @since 10.0.0
 */
export const identity = <T>(): Flow<T, T> =>
  flow((x: T) => x, { name: 'identity', performance: { pure: true } });

/**
 * Creates a Flow that always returns the same value.
 *
 * @param value - The value to always return
 * @returns A Flow that ignores input and returns the constant
 *
 * @example
 * ```typescript
 * const always42 = constant(42);
 * console.log(always42("ignored")); // 42
 * ```
 *
 * @category Core
 * @since 10.0.0
 */
export const constant = <T>(value: T): Flow<any, T> =>
  flow(() => value, {
    name: 'constant',
    performance: { pure: true, memoizable: true },
  });

/**
 * Composes multiple Flows into a single Flow pipeline.
 *
 * This is equivalent to chaining .pipe() calls but can be more
 * readable for long pipelines.
 *
 * @param flows - The Flows to compose in order
 * @returns A single Flow representing the entire pipeline
 *
 * @example
 * ```typescript
 * const pipeline = compose(
 *   parseJSON,
 *   validateSchema,
 *   transformData,
 *   saveToDatabase
 * );
 * ```
 *
 * @category Composition
 * @since 10.0.0
 */
export function compose<A, B>(f1: Flow<A, B>): Flow<A, B>;
export function compose<A, B, C>(
  f1: Flow<A, B>,
  f2: Flow<B, C>,
): Flow<A, C>;
export function compose<A, B, C, D>(
  f1: Flow<A, B>,
  f2: Flow<B, C>,
  f3: Flow<C, D>,
): Flow<A, D>;
export function compose<A, B, C, D, E>(
  f1: Flow<A, B>,
  f2: Flow<B, C>,
  f3: Flow<C, D>,
  f4: Flow<D, E>,
): Flow<A, E>;
export function compose(...flows: Flow[]): Flow {
  if (flows.length === 0) {
    return identity();
  }
  if (flows.length === 1) {
    return flows[0]!;
  }
  return flows.reduce((acc, flow) => acc.pipe(flow));
}

/**
 * Creates a Flow that maps over an array.
 *
 * @param mapper - The Flow to apply to each element
 * @returns A Flow that maps the array
 *
 * @example
 * ```typescript
 * const doubleAll = map(flow((x: number) => x * 2));
 * console.log(doubleAll([1, 2, 3])); // [2, 4, 6]
 * ```
 *
 * @category Collections
 * @since 10.0.0
 */
export const map = <In, Out>(
  mapper: Flow<In, Out>,
): Flow<In[], Out[]> =>
  flow(
    async (items: In[]) => {
      const results: Out[] = [];
      for (const item of items) {
        results.push(await mapper(item));
      }
      return results;
    },
    {
      name: 'map',
      ...(mapper.meta?.performance?.pure !== undefined && {
        performance: {
          pure: mapper.meta.performance.pure,
        },
      }),
    },
  );

/**
 * Creates a Flow that filters an array.
 *
 * @param predicate - The Flow to test each element
 * @returns A Flow that filters the array
 *
 * @example
 * ```typescript
 * const onlyEven = filter(flow((x: number) => x % 2 === 0));
 * console.log(onlyEven([1, 2, 3, 4])); // [2, 4]
 * ```
 *
 * @category Collections
 * @since 10.0.0
 */
export const filter = <T>(
  predicate: Flow<T, boolean>,
): Flow<T[], T[]> =>
  flow(
    async (items: T[]) => {
      const results: T[] = [];
      for (const item of items) {
        if (await predicate(item)) {
          results.push(item);
        }
      }
      return results;
    },
    {
      name: 'filter',
      ...(predicate.meta?.performance?.pure !== undefined && {
        performance: {
          pure: predicate.meta.performance.pure,
        },
      }),
    },
  );

/**
 * Creates a Flow that reduces an array to a single value.
 *
 * @param reducer - The Flow to combine elements
 * @param initial - The initial value
 * @returns A Flow that reduces the array
 *
 * @example
 * ```typescript
 * const sum = reduce(
 *   flow(([acc, x]: [number, number]) => acc + x),
 *   0
 * );
 * console.log(sum([1, 2, 3, 4])); // 10
 * ```
 *
 * @category Collections
 * @since 10.0.0
 */
export const reduce = <T, R>(
  reducer: Flow<[R, T], R>,
  initial: R,
): Flow<T[], R> =>
  flow(
    async (items: T[]) => {
      let acc = initial;
      for (const item of items) {
        acc = await reducer([acc, item]);
      }
      return acc;
    },
    {
      name: 'reduce',
      ...(reducer.meta?.performance?.pure !== undefined && {
        performance: {
          pure: reducer.meta.performance.pure,
        },
      }),
    },
  );

/**
 * Creates a Flow that applies flows in parallel.
 *
 * @param flows - Array of Flows to run in parallel
 * @returns A Flow that runs all flows and returns results
 *
 * @example
 * ```typescript
 * const fetchAll = parallel([
 *   fetchUser,
 *   fetchPosts,
 *   fetchComments
 * ]);
 * const [user, posts, comments] = await fetchAll(userId);
 * ```
 *
 * @category Async
 * @since 10.0.0
 */
export const parallel = <In, Out>(
  flows: Flow<In, Out>[],
): Flow<In, Out[]> =>
  flow(
    async (input: In) => {
      return Promise.all(flows.map((f) => f(input)));
    },
    {
      name: 'parallel',
      ...(flows.every((f) => f.meta?.performance?.pure) && {
        performance: {
          pure: true,
        },
      }),
    },
  );

/**
 * Creates a Flow that races multiple flows.
 *
 * @param flows - Array of Flows to race
 * @returns A Flow that returns the first result
 *
 * @example
 * ```typescript
 * const fastest = race([
 *   primaryServer,
 *   backupServer,
 *   cacheServer
 * ]);
 * ```
 *
 * @category Async
 * @since 10.0.0
 */
export const race = <In, Out>(
  flows: Flow<In, Out>[],
): Flow<In, Out> =>
  flow(
    async (input: In) => {
      return Promise.race(flows.map((f) => f(input)));
    },
    {
      name: 'race',
    },
  );

// Helper function to merge metadata
function mergeMetadata(
  meta1?: FlowMeta,
  meta2?: FlowMeta,
): FlowMeta | undefined {
  if (!meta1 && !meta2) return undefined;
  if (!meta1) return meta2;
  if (!meta2) return meta1;

  const merged: FlowMeta = {
    ...meta1,
    ...meta2,
  };

  // Merge performance settings
  if (meta1.performance || meta2.performance) {
    merged.performance = {
      ...meta1.performance,
      ...meta2.performance,
    };

    // Handle pure flag
    const pure1 = meta1.performance?.pure;
    const pure2 = meta2.performance?.pure;
    if (pure1 !== undefined && pure2 !== undefined) {
      merged.performance.pure = pure1 && pure2;
    } else if (pure1 !== undefined) {
      merged.performance.pure = pure1;
    } else if (pure2 !== undefined) {
      merged.performance.pure = pure2;
    }

    // Handle memoizable flag
    const memo1 = meta1.performance?.memoizable;
    const memo2 = meta2.performance?.memoizable;
    if (memo1 !== undefined && memo2 !== undefined) {
      merged.performance.memoizable = memo1 && memo2;
    } else if (memo1 !== undefined) {
      merged.performance.memoizable = memo1;
    } else if (memo2 !== undefined) {
      merged.performance.memoizable = memo2;
    }
  }

  // Merge tags
  if (meta1.tags || meta2.tags) {
    merged.tags = [...(meta1.tags || []), ...(meta2.tags || [])];
  }

  return merged;
}