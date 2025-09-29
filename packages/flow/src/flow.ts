import type { Flow, FlowMeta, FlowOptions, Maybe, Result } from './types.js';

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

  // Create the Flow function with validation
  const flowFn = (input: In): Out | Promise<Out> => {
    // Input validation if provided
    if (flowMeta?.types?.input && !flowMeta.types.input(input)) {
      throw new TypeError(`Invalid input type for flow ${flowMeta.name || 'anonymous'}`);
    }

    // Execute with error handling
    let result: Out | Promise<Out>;
    if (onError) {
      try {
        result = fn(input);
        // Handle async errors
        if (result instanceof Promise) {
          result = result.catch((error) => onError(error, input));
        }
      } catch (error) {
        result = onError(error as Error, input);
      }
    } else {
      result = fn(input);
    }

    // Output validation if provided
    if (flowMeta?.types?.output) {
      if (result instanceof Promise) {
        return result.then((value) => {
          if (!flowMeta.types!.output!(value)) {
            throw new TypeError(`Invalid output type for flow ${flowMeta.name || 'anonymous'}`);
          }
          return value;
        });
      }
      if (!flowMeta.types.output(result)) {
        throw new TypeError(`Invalid output type for flow ${flowMeta.name || 'anonymous'}`);
      }
    }

    return result;
  };

  // Attach the pipe method
  (flowFn as Flow<In, Out>).pipe = <Next>(next: Flow<Out, Next>): Flow<In, Next> => {
    const piped = flow<In, Next>((input: In) => {
      const intermediate = flowFn(input);
      if (intermediate instanceof Promise) {
        return intermediate.then((value) => next(value));
      }
      return next(intermediate);
    });

    // Merge metadata
    if (flowMeta || next.meta) {
      Object.defineProperty(piped, 'meta', {
        value: mergeMetadata(flowMeta, next.meta),
        writable: false,
        enumerable: true,
        configurable: true,
      });
    }

    return piped;
  };

  // Attach metadata if provided
  if (flowMeta) {
    Object.defineProperty(flowFn, 'meta', {
      value: flowMeta,
      writable: false,
      enumerable: true,
      configurable: true,
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
  flow((x: T) => x, {
    name: 'identity',
    description: 'Returns input unchanged',
    performance: { pure: true, memoizable: true },
  });

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
    description: `Always returns ${String(value)}`,
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
export function compose<A, B, C>(f1: Flow<A, B>, f2: Flow<B, C>): Flow<A, C>;
export function compose<A, B, C, D>(f1: Flow<A, B>, f2: Flow<B, C>, f3: Flow<C, D>): Flow<A, D>;
export function compose<A, B, C, D, E>(
  f1: Flow<A, B>,
  f2: Flow<B, C>,
  f3: Flow<C, D>,
  f4: Flow<D, E>,
): Flow<A, E>;
export function compose<A, B, C, D, E, F>(
  f1: Flow<A, B>,
  f2: Flow<B, C>,
  f3: Flow<C, D>,
  f4: Flow<D, E>,
  f5: Flow<E, F>,
): Flow<A, F>;
export function compose(...flows: Flow[]): Flow {
  if (flows.length === 0) {
    return identity();
  }
  if (flows.length === 1) {
    return flows[0]!;
  }

  const composed = flows.reduce((acc, flow) => acc.pipe(flow));
  const metadata = flows
    .map((f) => f.meta)
    .filter(Boolean)
    .reduce((acc, meta) => mergeMetadata(acc, meta), { name: 'composed' } as FlowMeta | undefined);

  if (metadata) {
    Object.defineProperty(composed, 'meta', {
      value: metadata,
      writable: false,
      enumerable: true,
      configurable: true,
    });
  }

  return composed;
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
export const map = <In, Out>(mapper: Flow<In, Out>): Flow<In[], Out[]> =>
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
      description: `Maps array elements with ${mapper.meta?.name || 'mapper'}`,
      ...(mapper.meta?.performance?.pure !== undefined && {
        performance: {
          pure: mapper.meta.performance.pure,
          memoizable: mapper.meta.performance.pure,
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
export const filter = <T>(predicate: Flow<T, boolean>): Flow<T[], T[]> =>
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
      description: `Filters array with ${predicate.meta?.name || 'predicate'}`,
      ...(predicate.meta?.performance?.pure !== undefined && {
        performance: {
          pure: predicate.meta.performance.pure,
          memoizable: predicate.meta.performance.pure,
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
export const reduce = <T, R>(reducer: Flow<[R, T], R>, initial: R): Flow<T[], R> =>
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
      description: `Reduces array with ${reducer.meta?.name || 'reducer'}`,
      ...(reducer.meta?.performance?.pure !== undefined && {
        performance: {
          pure: reducer.meta.performance.pure,
          memoizable: reducer.meta.performance.pure,
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
export const parallel = <In, Out>(flows: Flow<In, Out>[]): Flow<In, Out[]> =>
  flow(
    async (input: In) => {
      return Promise.all(flows.map((f) => f(input)));
    },
    {
      name: 'parallel',
      description: `Runs ${flows.length} flows in parallel`,
      ...(flows.every((f) => f.meta?.performance?.pure) && {
        performance: {
          pure: true,
          memoizable: true,
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
export const race = <In, Out>(flows: Flow<In, Out>[]): Flow<In, Out> =>
  flow(
    async (input: In) => {
      return Promise.race(flows.map((f) => f(input)));
    },
    {
      name: 'race',
      description: `Races ${flows.length} flows`,
      performance: { pure: false, memoizable: false },
    },
  );

/**
 * Creates a Flow that applies a fallback on error.
 *
 * @param primary - The primary Flow to try
 * @param fallback - The fallback Flow to use on error
 * @returns A Flow that tries primary, then fallback
 *
 * @example
 * ```typescript
 * const safeAPI = fallback(
 *   fetchFromAPI,
 *   fetchFromCache
 * );
 * ```
 *
 * @category Error Handling
 * @since 10.0.0
 */
export const fallback = <In, Out>(primary: Flow<In, Out>, fallback: Flow<In, Out>): Flow<In, Out> =>
  flow(
    async (input: In) => {
      try {
        return await primary(input);
      } catch {
        return await fallback(input);
      }
    },
    {
      name: 'fallback',
      description: `Try ${primary.meta?.name || 'primary'}, fallback to ${fallback.meta?.name || 'fallback'}`,
      ...(primary.meta?.performance?.pure !== undefined &&
        fallback.meta?.performance?.pure !== undefined && {
          performance: {
            pure: primary.meta.performance.pure && fallback.meta.performance.pure,
          },
        }),
    },
  );

/**
 * Creates a Flow that retries on failure.
 *
 * @param flow - The Flow to retry
 * @param maxRetries - Maximum number of retries
 * @param delay - Delay between retries in milliseconds
 * @returns A Flow that retries on failure
 *
 * @example
 * ```typescript
 * const reliableAPI = retry(fetchFromAPI, 3, 1000);
 * ```
 *
 * @category Error Handling
 * @since 10.0.0
 */
export const retry = <In, Out>(
  targetFlow: Flow<In, Out>,
  maxRetries = 3,
  delay = 1000,
): Flow<In, Out> => {
  return flow(
    async (input: In) => {
      let lastError: Error;
      for (let i = 0; i <= maxRetries; i++) {
        try {
          return await targetFlow(input);
        } catch (error) {
          lastError = error as Error;
          if (i < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
      throw lastError!;
    },
    {
      name: 'retry',
      description: `Retry ${targetFlow.meta?.name || 'flow'} up to ${maxRetries} times`,
      performance: { pure: false, memoizable: false },
    },
  );
};

/**
 * Creates a Flow that times out after a specified duration.
 *
 * @param flow - The Flow to timeout
 * @param ms - Timeout in milliseconds
 * @returns A Flow that times out
 *
 * @example
 * ```typescript
 * const quickAPI = timeout(fetchFromAPI, 5000);
 * ```
 *
 * @category Async
 * @since 10.0.0
 */
export const timeout = <In, Out>(targetFlow: Flow<In, Out>, ms: number): Flow<In, Out> => {
  return flow(
    async (input: In) => {
      return Promise.race([
        targetFlow(input),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
      ]);
    },
    {
      name: 'timeout',
      description: `Timeout ${targetFlow.meta?.name || 'flow'} after ${ms}ms`,
      performance: { pure: false, memoizable: false },
    },
  );
};

/**
 * Creates a Flow that memoizes its results.
 *
 * @param flow - The Flow to memoize
 * @param keyFn - Optional function to generate cache key
 * @returns A memoized Flow
 *
 * @example
 * ```typescript
 * const cachedExpensive = memoize(expensiveCalculation);
 * ```
 *
 * @category Performance
 * @since 10.0.0
 */
export const memoize = <In, Out>(
  targetFlow: Flow<In, Out>,
  keyFn: (input: In) => string = JSON.stringify,
): Flow<In, Out> => {
  const cache = new Map<string, Out>();
  return flow(
    (input: In) => {
      const key = keyFn(input);
      if (cache.has(key)) {
        return cache.get(key)!;
      }
      const result = targetFlow(input);
      if (result instanceof Promise) {
        return result.then((value) => {
          cache.set(key, value);
          return value;
        });
      }
      cache.set(key, result);
      return result;
    },
    {
      name: 'memoized',
      description: `Memoized ${targetFlow.meta?.name || 'flow'}`,
      ...(targetFlow.meta?.performance?.pure !== undefined && {
        performance: {
          pure: targetFlow.meta.performance.pure,
          memoizable: false, // Already memoized
        },
      }),
    },
  );
};

/**
 * Creates a Flow that debounces execution.
 *
 * @param flow - The Flow to debounce
 * @param ms - Debounce delay in milliseconds
 * @returns A debounced Flow
 *
 * @example
 * ```typescript
 * const debouncedSearch = debounce(searchAPI, 300);
 * ```
 *
 * @category Performance
 * @since 10.0.0
 */
export const debounce = <In, Out>(targetFlow: Flow<In, Out>, ms: number): Flow<In, Out> => {
  let timer: NodeJS.Timeout | undefined;
  let pendingResolves: Array<(value: Out | Promise<Out>) => void> = [];
  let lastInput: In | undefined;

  return flow(
    (input: In) =>
      new Promise<Out>((resolve) => {
        if (timer) clearTimeout(timer);
        pendingResolves.push(resolve);
        lastInput = input;

        timer = setTimeout(async () => {
          const result = await targetFlow(lastInput!);
          const resolves = pendingResolves;
          pendingResolves = [];
          timer = undefined;
          resolves.forEach(r => r(result));
        }, ms);
      }),
    {
      name: 'debounced',
      description: `Debounced ${targetFlow.meta?.name || 'flow'} by ${ms}ms`,
      performance: { pure: false, memoizable: false },
    },
  );
};

/**
 * Creates a Flow that throttles execution.
 *
 * @param flow - The Flow to throttle
 * @param ms - Throttle interval in milliseconds
 * @returns A throttled Flow
 *
 * @example
 * ```typescript
 * const throttledUpdate = throttle(updateUI, 16); // 60fps
 * ```
 *
 * @category Performance
 * @since 10.0.0
 */
export const throttle = <In, Out>(targetFlow: Flow<In, Out>, ms: number): Flow<In, Out> => {
  let lastCall = 0;
  let lastResult: Out | undefined;

  return flow(
    async (input: In) => {
      const now = Date.now();
      if (now - lastCall >= ms) {
        lastCall = now;
        lastResult = await targetFlow(input);
      }
      return lastResult!;
    },
    {
      name: 'throttled',
      description: `Throttled ${targetFlow.meta?.name || 'flow'} to ${1000 / ms}Hz`,
      performance: { pure: false, memoizable: false },
    },
  );
};

/**
 * Creates a Flow that transforms Maybe values.
 *
 * @param flow - The Flow to apply to non-null values
 * @returns A Flow that handles Maybe values
 *
 * @example
 * ```typescript
 * const safeParse = maybe(parseJSON);
 * ```
 *
 * @category Maybe
 * @since 10.0.0
 */
export const maybe = <In, Out>(targetFlow: Flow<In, Out>): Flow<Maybe<In>, Maybe<Out>> => {
  return flow(
    async (input: Maybe<In>) => {
      if (input === null || input === undefined) {
        return input as any;
      }
      return await targetFlow(input);
    },
    {
      name: 'maybe',
      description: `Maybe ${targetFlow.meta?.name || 'flow'}`,
      ...(targetFlow.meta?.performance && {
        performance: targetFlow.meta.performance,
      }),
    },
  );
};

/**
 * Creates a Flow that transforms Result values.
 *
 * @param flow - The Flow to apply to Ok values
 * @returns A Flow that handles Result values
 *
 * @example
 * ```typescript
 * const safeTransform = result(transform);
 * ```
 *
 * @category Result
 * @since 10.0.0
 */
export const result = <In, Out, E = Error>(
  targetFlow: Flow<In, Out>,
): Flow<Result<In, E>, Result<Out, E>> => {
  return flow(
    async (input: Result<In, E>) => {
      if (!input.ok) {
        return input as any;
      }
      try {
        const value = await targetFlow(input.value);
        return { ok: true, value };
      } catch (error) {
        return { ok: false, error: error as E };
      }
    },
    {
      name: 'result',
      description: `Result ${targetFlow.meta?.name || 'flow'}`,
      ...(targetFlow.meta?.performance && {
        performance: targetFlow.meta.performance,
      }),
    },
  );
};

/**
 * Creates a Flow that taps into the pipeline without modifying values.
 *
 * @param sideEffect - The side effect to perform
 * @returns A Flow that performs side effect and passes through
 *
 * @example
 * ```typescript
 * const withLogging = tap(console.log);
 * ```
 *
 * @category Utility
 * @since 10.0.0
 */
export const tap = <T>(sideEffect: (value: T) => void | Promise<void>): Flow<T, T> => {
  return flow(
    async (input: T) => {
      await sideEffect(input);
      return input;
    },
    {
      name: 'tap',
      description: 'Side effect tap',
      performance: { pure: false, memoizable: false },
    },
  );
};

/**
 * Creates a Flow that validates input with a predicate.
 *
 * @param predicate - The validation predicate
 * @param errorMessage - Optional error message
 * @returns A Flow that validates input
 *
 * @example
 * ```typescript
 * const validatePositive = validate(
 *   (x: number) => x > 0,
 *   'Must be positive'
 * );
 * ```
 *
 * @category Validation
 * @since 10.0.0
 */
export const validate = <T>(
  predicate: (value: T) => boolean,
  errorMessage = 'Validation failed',
): Flow<T, T> => {
  return flow(
    (input: T) => {
      if (!predicate(input)) {
        throw new Error(errorMessage);
      }
      return input;
    },
    {
      name: 'validate',
      description: errorMessage,
      performance: { pure: true, memoizable: true },
    },
  );
};

// Helper function to merge metadata
function mergeMetadata(meta1?: FlowMeta, meta2?: FlowMeta): FlowMeta | undefined {
  if (!meta1 && !meta2) return undefined;
  if (!meta1) return meta2;
  if (!meta2) return meta1;

  const merged: FlowMeta = {
    ...meta1,
    ...meta2,
  };

  // Merge names
  if (meta1.name && meta2.name) {
    merged.name = `${meta1.name} → ${meta2.name}`;
  }

  // Merge descriptions
  if (meta1.description && meta2.description) {
    merged.description = `${meta1.description} then ${meta2.description}`;
  }

  // Merge performance settings
  if (meta1.performance || meta2.performance) {
    merged.performance = {
      ...meta1.performance,
      ...meta2.performance,
    };

    // Handle pure flag - composition is pure only if both are pure
    const pure1 = meta1.performance?.pure;
    const pure2 = meta2.performance?.pure;
    if (pure1 !== undefined && pure2 !== undefined) {
      merged.performance.pure = pure1 && pure2;
    } else if (pure1 !== undefined) {
      merged.performance.pure = pure1;
    } else if (pure2 !== undefined) {
      merged.performance.pure = pure2;
    }

    // Handle memoizable flag - composition is memoizable only if both are
    const memo1 = meta1.performance?.memoizable;
    const memo2 = meta2.performance?.memoizable;
    if (memo1 !== undefined && memo2 !== undefined) {
      merged.performance.memoizable = memo1 && memo2;
    } else if (memo1 !== undefined) {
      merged.performance.memoizable = memo1;
    } else if (memo2 !== undefined) {
      merged.performance.memoizable = memo2;
    }

    // Sum expected durations
    if (meta1.performance?.expectedDuration || meta2.performance?.expectedDuration) {
      merged.performance.expectedDuration =
        (meta1.performance?.expectedDuration || 0) + (meta2.performance?.expectedDuration || 0);
    }
  }

  // Merge tags
  if (meta1.tags || meta2.tags) {
    merged.tags = [...new Set([...(meta1.tags || []), ...(meta2.tags || [])])];
  }

  // Merge types - output of first must match input of second
  if (meta1.types || meta2.types) {
    merged.types = {};
    if (meta1.types?.input) {
      merged.types.input = meta1.types.input;
    }
    if (meta2.types?.output) {
      merged.types.output = meta2.types.output;
    }
  }

  return merged;
}

/**
 * Batches multiple inputs and processes them together.
 *
 * @param targetFlow - The Flow to batch
 * @param options - Batching options
 * @returns A batched Flow
 *
 * @example
 * ```typescript
 * const batchedSave = batch(
 *   saveToDatabase,
 *   { size: 100, delay: 1000 }
 * );
 * ```
 *
 * @category Performance
 * @since 10.0.0
 */
export const batch = <In, Out>(
  targetFlow: Flow<In[], Out[]>,
  options: { size?: number; delay?: number } = {},
): Flow<In, Out> => {
  const { size = 10, delay = 100 } = options;
  const queue: Array<{
    input: In;
    resolve: (value: Out) => void;
    reject: (error: unknown) => void;
  }> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const processBatch = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    while (queue.length > 0) {
      const currentBatch = queue.splice(0, Math.min(size, queue.length));
      if (currentBatch.length === 0) break;

      try {
        const inputs = currentBatch.map((item) => item.input);
        const outputs = await targetFlow(inputs);

        currentBatch.forEach((item, index) => {
          item.resolve(outputs[index]!);
        });
      } catch (error) {
        currentBatch.forEach((item) => item.reject(error));
      }
    }
  };

  return flow(
    (input: In) =>
      new Promise<Out>((resolve, reject) => {
        queue.push({ input, resolve, reject });

        if (queue.length >= size) {
          if (timer) clearTimeout(timer);
          timer = null;
          void processBatch();
        } else if (!timer) {
          timer = setTimeout(() => {
            timer = null;
            void processBatch();
          }, delay);
        }
      }),
    {
      name: 'batch',
      description: `Batches calls to ${targetFlow.meta?.name || 'flow'}`,
      performance: {
        pure: false,
        memoizable: false,
      },
    },
  );
};

/**
 * Splits input into multiple parts and processes them separately.
 *
 * @param splitter - Function to split the input
 * @param flows - Array of Flows to process each part
 * @returns A Flow that processes split input
 *
 * @example
 * ```typescript
 * const splitProcess = split(
 *   (data) => [data.header, data.body, data.footer],
 *   [processHeader, processBody, processFooter]
 * );
 * ```
 *
 * @category Data
 * @since 10.0.0
 */
export const split = <In, Parts extends readonly unknown[], Outs extends readonly unknown[]>(
  splitter: Flow<In, Parts>,
  flows: readonly Flow<any, any>[],
): Flow<In, Outs> =>
  flow(
    async (input: In) => {
      const parts = await splitter(input);
      const results = await Promise.all(parts.map((part, i) => (flows[i] ? flows[i](part) : part)));
      return results as unknown as Outs;
    },
    {
      name: 'split',
      description: `Splits input into ${flows.length} parts`,
      ...((flows.every((f) => f.meta?.performance?.pure) && {
        performance: {
          pure: true,
          memoizable: true,
        },
      }) ||
        {}),
    },
  );

/**
 * Merges multiple inputs into one.
 *
 * @param merger - Function to merge inputs
 * @returns A Flow that merges inputs
 *
 * @example
 * ```typescript
 * const mergeData = merge(
 *   ([header, body, footer]) => ({ header, body, footer })
 * );
 * ```
 *
 * @category Data
 * @since 10.0.0
 */
export const merge = <Ins extends readonly unknown[], Out>(
  merger: Flow<Ins, Out>,
): Flow<Ins, Out> =>
  flow(merger, {
    name: 'merge',
    description: 'Merges multiple inputs',
    ...(merger.meta?.performance && { performance: merger.meta.performance }),
  });

/**
 * Conditionally executes one of two Flows based on a predicate.
 *
 * @param predicate - Condition to check
 * @param ifTrue - Flow to execute if true
 * @param ifFalse - Flow to execute if false
 * @returns A conditional Flow
 *
 * @example
 * ```typescript
 * const conditional = when(
 *   (x: number) => x > 0,
 *   flow(x => x * 2),
 *   flow(x => x * -1)
 * );
 * ```
 *
 * @category Control
 * @since 10.0.0
 */
export const when = <In, Out>(
  predicate: Flow<In, boolean>,
  ifTrue: Flow<In, Out>,
  ifFalse: Flow<In, Out>,
): Flow<In, Out> =>
  flow(
    async (input: In) => {
      const condition = await predicate(input);
      return condition ? ifTrue(input) : ifFalse(input);
    },
    {
      name: 'when',
      description: 'Conditional flow execution',
      ...(predicate.meta?.performance?.pure === true &&
        ifTrue.meta?.performance?.pure === true &&
        ifFalse.meta?.performance?.pure === true && {
          performance: {
            pure: true,
            memoizable: false,
          },
        }),
    },
  );

/**
 * Repeats a Flow multiple times.
 *
 * @param targetFlow - The Flow to repeat
 * @param times - Number of repetitions
 * @returns A Flow that repeats
 *
 * @example
 * ```typescript
 * const repeatThrice = repeat(
 *   flow((x: number) => x + 1),
 *   3
 * );
 * console.log(repeatThrice(0)); // 3
 * ```
 *
 * @category Control
 * @since 10.0.0
 */
export const repeat = <In, Out>(targetFlow: Flow<In, Out>, times: number): Flow<In, Out> =>
  flow(
    async (input: In) => {
      let result: any = input;
      for (let i = 0; i < times; i++) {
        result = await targetFlow(result);
      }
      return result;
    },
    {
      name: 'repeat',
      description: `Repeats ${targetFlow.meta?.name || 'flow'} ${times} times`,
      ...(targetFlow.meta?.performance?.pure && {
        performance: {
          pure: true,
          memoizable: true,
        },
      }),
    },
  );
