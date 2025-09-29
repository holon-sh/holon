/**
 * @holon/flow - Core Flow abstraction
 *
 * The heart of Holon: a single, universal abstraction for all computation.
 * Everything is a Flow, and Flows compose to create complex systems.
 *
 * @packageDocumentation
 */

// Core Flow function and types
// Core Flow utilities
export {
  batch,
  compose,
  constant,
  debounce,
  fallback,
  filter,
  flow,
  identity,
  map,
  maybe,
  memoize,
  merge,
  parallel,
  race,
  reduce,
  repeat,
  result,
  retry,
  split,
  tap,
  throttle,
  timeout,
  validate,
  when,
} from './flow.js';
export type {
  Flow,
  FlowChain,
  FlowInput,
  FlowMeta,
  FlowOptions,
  FlowOutput,
  Maybe,
  Result,
  TypeValidator,
} from './types.js';

// Note: compose can be used as pipe since they have the same functionality
// Users can import { compose as pipe } if they prefer the pipe naming

// Module exports for modular architecture
export { coreModule, createFlowModule } from './module.js';
export type { CoreModule } from './module.js';
