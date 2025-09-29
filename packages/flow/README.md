# @holon/flow

> Core Flow abstraction - the heart of Holon

[![npm version](https://badge.fury.io/js/@holon%2Fflow.svg)](https://www.npmjs.com/package/@holon/flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @holon/flow
```

## Usage

```typescript
import { flow, compose } from '@holon/flow';

// Create flows
const double = flow((x: number) => x * 2);
const addOne = flow((x: number) => x + 1);

// Compose flows
const transform = double.pipe(addOne);
// or
const transform = compose(double, addOne);

console.log(transform(5)); // 11
```

## API

### `flow(fn)`

Creates a Flow from a function.

```typescript
const myFlow = flow((x: number) => x * 2);
```

### `compose(...flows)`

Composes multiple flows into a pipeline.

```typescript
const pipeline = compose(
  flow1,
  flow2,
  flow3
);
```

### Collection Operations

- `map(flow)` - Map a flow over an array
- `filter(flow)` - Filter an array with a flow
- `reduce(flow, initial)` - Reduce an array with a flow

### Async Operations

- `parallel(flows)` - Run flows in parallel
- `race(flows)` - Race multiple flows

## License

MIT