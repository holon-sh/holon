# @holon/effects

> Effect system for controlled side effects in Holon Flow

[![npm version](https://badge.fury.io/js/@holon%2Feffects.svg)](https://www.npmjs.com/package/@holon/effects)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @holon/effects @holon/flow @holon/context
```

## Usage

```typescript
import { effectful, pure, Effects, hasEffect, isPure } from '@holon/effects';
import { flow } from '@holon/flow';

// Pure computation - no side effects
const calculate = pure((x: number) => x * 2);

// Effectful computation - tracks side effects
const logResult = effectful(
  (x: number) => {
    console.log(`Result: ${x}`);
    return x;
  },
  [Effects.log],
  EffectFlags.IO
);

// Composition preserves effect information
const pipeline = calculate.pipe(logResult);

// Check for effects
console.log(isPure(calculate)); // true
console.log(isPure(logResult)); // false
console.log(hasEffect(logResult, EffectFlags.IO)); // true
```

## Features

- **Effect tracking** - Know what side effects a Flow has
- **Effect isolation** - Control when and how effects run
- **Type-safe** - Effects are tracked in the type system
- **Cross-runtime** - Works in Node, Deno, Bun, and browsers

## Effect Types

- **IO** - Input/output operations
- **Network** - Network requests
- **Read** - Reading from filesystem
- **Write** - Writing to filesystem
- **Random** - Random number generation
- **Time** - Time-dependent operations
- **Throw** - May throw exceptions
- **Async** - Asynchronous operations

## API

### `pure(fn)`

Create a pure Flow with no effects.

### `effectful(fn, effects, flags?)`

Create an effectful Flow with tracked effects.

### `hasEffect(flow, flag)`

Check if a Flow has specific effects.

### `isPure(flow)`

Check if a Flow is pure.

## License

MIT