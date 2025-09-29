# @holon/test-utils

> Shared testing utilities for Holon Flow packages

[![npm version](https://badge.fury.io/js/@holon%2Ftest-utils.svg)](https://www.npmjs.com/package/@holon/test-utils)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install --save-dev @holon/test-utils @holon/flow
```

## Usage

```typescript
import { flowProperty, trackingFlow, measureFlow, fc } from '@holon/test-utils';
import { flow } from '@holon/flow';

// Property-based testing
describe('Flow laws', () => {
  test('composition associativity', () => {
    const f = flow((x: number) => x + 1);
    const g = flow((x: number) => x * 2);
    const h = flow((x: number) => x - 3);

    flowProperty.associativity(f, g, h, fc.integer());
  });
});

// Track Flow executions
test('flow is called correct number of times', () => {
  const tracked = trackingFlow((x: number) => x * 2);

  tracked(5);
  tracked(10);

  expect(tracked.tracker.callCount).toBe(2);
  expect(tracked.tracker.calls).toEqual([
    { input: 5, output: 10 },
    { input: 10, output: 20 }
  ]);
});

// Measure performance
test('flow performance', async () => {
  const myFlow = flow((x: number) => x * 2);

  const { result, duration } = await measureFlow(myFlow, 100);

  expect(result).toBe(200);
  expect(duration).toBeLessThan(10); // ms
});
```

## Features

- **Property-based testing** - Test Flow laws and properties
- **Flow tracking** - Track calls and results
- **Performance testing** - Measure Flow execution time
- **Test utilities** - Helpers for testing Flows
- **Fast-check integration** - Built-in property testing

## API

### Property Testing

- `flowProperty.preserves()` - Test property preservation
- `flowProperty.associativity()` - Test composition associativity
- `flowProperty.identity()` - Test identity laws

### Test Helpers

- `trackingFlow()` - Create a Flow with call tracking
- `delayedFlow()` - Create an async Flow with delay
- `measureFlow()` - Measure Flow execution time
- `isPure()` - Test Flow purity
- `failingFlow()` - Create a Flow that fails after N calls
- `ControllableFlow` - Flow with controllable behavior

### Arbitraries

Pre-configured fast-check arbitraries for Flows:

- `arbitraries.flow()` - Generate random Flows
- `arbitraries.pureFlow()` - Generate pure Flows
- `arbitraries.asyncFlow()` - Generate async Flows

## License

MIT