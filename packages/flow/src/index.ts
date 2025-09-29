/**
 * @holon/flow - Core Flow abstraction
 *
 * The heart of Holon: a single, universal abstraction for all computation.
 * Everything is a Flow, and Flows compose to create complex systems.
 *
 * @packageDocumentation
 */

// Core Flow function and types
export { flow } from './flow.js';
export type {
  Flow,
  FlowMeta,
  FlowOptions,
  TypeValidator,
  Result,
  Maybe,
  FlowInput,
  FlowOutput,
  FlowChain,
} from './types.js';

// Effect flags for tracking side effects
export { EffectFlags } from './types.js';

// Core Flow utilities
export {
  identity,
  constant,
  compose,
  map,
  filter,
  reduce,
  parallel,
  race,
} from './flow.js';

// Note: compose can be used as pipe since they have the same functionality
// Users can import { compose as pipe } if they prefer the pipe naming