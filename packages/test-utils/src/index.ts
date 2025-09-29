import type { Flow } from '@holon/flow';
import fc from 'fast-check';
import { expect } from 'vitest';

/**
 * Test utility for property-based testing of Flows
 */
export const flowProperty = {
  /**
   * Test that a Flow preserves a property
   */
  preserves<In, Out>(
    flow: Flow<In, Out>,
    property: (input: In, output: Out) => boolean,
    arbitrary: fc.Arbitrary<In>,
    options?: fc.Parameters<[In]>,
  ) {
    return fc.assert(
      fc.asyncProperty(arbitrary, async (input) => {
        const output = await flow(input);
        return property(input, output);
      }),
      options,
    );
  },

  /**
   * Test composition associativity
   */
  associativity<A, B, C, D>(
    f: Flow<A, B>,
    g: Flow<B, C>,
    h: Flow<C, D>,
    arbitrary: fc.Arbitrary<A>,
  ) {
    return fc.assert(
      fc.asyncProperty(arbitrary, async (input) => {
        const left = f.pipe(g).pipe(h);
        const right = f.pipe(g.pipe(h));

        const leftResult = await left(input);
        const rightResult = await right(input);

        expect(leftResult).toEqual(rightResult);
      }),
    );
  },

  /**
   * Test identity laws
   */
  identity<T>(
    flow: Flow<T, T>,
    identity: Flow<T, T>,
    arbitrary: fc.Arbitrary<T>,
  ) {
    return fc.assert(
      fc.asyncProperty(arbitrary, async (input) => {
        const leftIdentity = await identity.pipe(flow)(input);
        const rightIdentity = await flow.pipe(identity)(input);
        const original = await flow(input);

        expect(leftIdentity).toEqual(original);
        expect(rightIdentity).toEqual(original);
      }),
    );
  },
};

/**
 * Create a test Flow with tracking
 */
export function trackingFlow<In, Out>(
  fn: (input: In) => Out,
  tracker: {
    calls: Array<{ input: In; output: Out }>;
    callCount: number;
  } = { calls: [], callCount: 0 },
): Flow<In, Out> & { tracker: typeof tracker } {
  const flow = ((input: In) => {
    const output = fn(input);
    tracker.calls.push({ input, output });
    tracker.callCount++;
    return output;
  }) as Flow<In, Out> & { tracker: typeof tracker };

  flow.pipe = function <Next>(next: Flow<Out, Next>) {
    const piped = ((input: In) => {
      const intermediate = flow(input);
      if (intermediate instanceof Promise) {
        return intermediate.then((value) => next(value));
      }
      return next(intermediate);
    }) as Flow<In, Next>;

    piped.pipe = function <Final>(final: Flow<Next, Final>) {
      return flow.pipe(next.pipe(final));
    };

    return piped;
  };

  flow.tracker = tracker;
  return flow;
}

/**
 * Create a delayed Flow for testing async behavior
 */
export function delayedFlow<In, Out>(
  fn: (input: In) => Out,
  delay: number,
): Flow<In, Promise<Out>> {
  return ((input: In) =>
    new Promise<Out>((resolve) =>
      setTimeout(() => resolve(fn(input)), delay)
    )) as Flow<In, Promise<Out>>;
}

/**
 * Test helper to measure Flow execution time
 */
export async function measureFlow<In, Out>(
  flow: Flow<In, Out>,
  input: In,
): Promise<{ result: Out; duration: number }> {
  const start = performance.now();
  const result = await flow(input);
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Test helper to verify Flow purity
 */
export async function isPure<In, Out>(
  flow: Flow<In, Out>,
  input: In,
  iterations: number = 10,
): Promise<boolean> {
  const results: Out[] = [];

  for (let i = 0; i < iterations; i++) {
    const result = await flow(input);
    results.push(result);
  }

  // Check all results are equal
  const first = JSON.stringify(results[0]);
  return results.every((r) => JSON.stringify(r) === first);
}

/**
 * Create a Flow that fails after N successful calls
 */
export function failingFlow<In, Out>(
  fn: (input: In) => Out,
  failAfter: number,
  error: Error = new Error('Intentional test failure'),
): Flow<In, Out> {
  let callCount = 0;

  return ((input: In) => {
    if (++callCount > failAfter) {
      throw error;
    }
    return fn(input);
  }) as Flow<In, Out>;
}

/**
 * Create a Flow with controllable behavior for testing
 */
export class ControllableFlow<In, Out> {
  private behavior: (input: In) => Out | Promise<Out>;
  public flow: Flow<In, Out>;

  constructor(initialBehavior: (input: In) => Out | Promise<Out>) {
    this.behavior = initialBehavior;
    this.flow = ((input: In) => this.behavior(input)) as Flow<In, Out>;

    const self = this;
    this.flow.pipe = function <Next>(next: Flow<Out, Next>) {
      const piped = ((input: In) => {
        const intermediate = self.flow(input);
        if (intermediate instanceof Promise) {
          return intermediate.then((value) => next(value));
        }
        return next(intermediate);
      }) as Flow<In, Next>;

      piped.pipe = function <Final>(final: Flow<Next, Final>) {
        return self.flow.pipe(next.pipe(final));
      };

      return piped;
    };
  }

  setBehavior(behavior: (input: In) => Out | Promise<Out>) {
    this.behavior = behavior;
  }

  throwError(error: Error) {
    this.behavior = () => {
      throw error;
    };
  }

  returnValue(value: Out) {
    this.behavior = () => value;
  }

  delay(ms: number) {
    const original = this.behavior;
    this.behavior = (input: In) =>
      new Promise<Out>((resolve) =>
        setTimeout(() => resolve(original(input) as Out), ms)
      );
  }
}

/**
 * Arbitraries for common types
 */
export const arbitraries = {
  flow: <In, Out>(
    _inputArb: fc.Arbitrary<In>,
    outputArb: fc.Arbitrary<Out>,
  ): fc.Arbitrary<Flow<In, Out>> =>
    fc.func(outputArb).map((fn) => ((input: In) => fn(input)) as Flow<In, Out>),

  pureFlow: <T>(_arb: fc.Arbitrary<T>): fc.Arbitrary<Flow<T, T>> =>
    fc.constant(((x: T) => x) as Flow<T, T>),

  asyncFlow: <In, Out>(
    _inputArb: fc.Arbitrary<In>,
    outputArb: fc.Arbitrary<Out>,
    delayArb: fc.Arbitrary<number> = fc.nat({ max: 100 }),
  ): fc.Arbitrary<Flow<In, Promise<Out>>> =>
    fc
      .tuple(fc.func(outputArb), delayArb)
      .map(
        ([fn, delay]) =>
          ((input: In) =>
            new Promise<Out>((resolve) =>
              setTimeout(() => resolve(fn(input)), delay)
            )) as Flow<In, Promise<Out>>
      ),
};

// Re-export fast-check for convenience
export { fc };