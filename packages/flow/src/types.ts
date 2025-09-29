/**
 * Core Flow type - the fundamental abstraction of Holon
 *
 * A Flow is simultaneously:
 * - A function that transforms input to output
 * - A composable unit via the pipe method
 * - A container for metadata and effects
 *
 * @template In - The input type
 * @template Out - The output type
 */
export interface Flow<In = any, Out = any> {
  /**
   * Execute the Flow with the given input
   */
  (input: In): Out | Promise<Out>;

  /**
   * Compose this Flow with another, creating a pipeline
   *
   * @param next - The Flow to pipe output into
   * @returns A new Flow representing the composition
   */
  pipe<Next>(next: Flow<Out, Next>): Flow<In, Next>;

  /**
   * Optional metadata about this Flow
   */
  readonly meta?: FlowMeta;
}

/**
 * Metadata attached to a Flow
 */
export interface FlowMeta {
  /**
   * Human-readable name for debugging
   */
  name?: string;

  /**
   * Description of what this Flow does
   */
  description?: string;

  /**
   * Performance characteristics
   */
  performance?: {
    /**
     * Indicates if this Flow is pure (no side effects)
     */
    pure?: boolean;

    /**
     * Indicates if results can be memoized
     */
    memoizable?: boolean;

    /**
     * Expected execution time in ms
     */
    expectedDuration?: number;
  };

  /**
   * Type information for runtime validation
   */
  types?: {
    /**
     * Runtime type validator for input
     */
    input?: TypeValidator<any>;

    /**
     * Runtime type validator for output
     */
    output?: TypeValidator<any>;
  };

  /**
   * Tags for categorization and discovery
   */
  tags?: string[];

  /**
   * Version of this Flow
   */
  version?: string;

  /**
   * Custom metadata
   */
  [key: string]: any;
}

/**
 * Type validator function
 */
export interface TypeValidator<T> {
  (value: unknown): value is T;

  /**
   * Human-readable description of the type
   */
  description?: string;
}

/**
 * Options for creating a Flow
 */
export interface FlowOptions<In, Out> {
  /**
   * The function to wrap in a Flow
   */
  fn: (input: In) => Out | Promise<Out>;

  /**
   * Optional metadata
   */
  meta?: FlowMeta;

  /**
   * Optional error handler
   */
  onError?: (error: Error, input: In) => Out | Promise<Out>;
}

/**
 * Result type for fallible operations
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Maybe type for nullable values
 */
export type Maybe<T> = T | null | undefined;

/**
 * Utility type to extract input type from a Flow
 */
export type FlowInput<F> = F extends Flow<infer In, any> ? In : never;

/**
 * Utility type to extract output type from a Flow
 */
export type FlowOutput<F> = F extends Flow<any, infer Out> ? Out : never;

/**
 * Utility type for a chain of Flows
 */
export type FlowChain<T extends readonly Flow[]> = T extends readonly [
  Flow<infer First, any>,
  ...infer Rest,
]
  ? Rest extends readonly Flow[]
    ? Rest extends readonly []
      ? T[0]
      : T[0] extends Flow<First, infer Out>
        ? FlowChain<Rest> extends Flow<Out, infer Final>
          ? Flow<First, Final>
          : never
        : never
    : never
  : never;
