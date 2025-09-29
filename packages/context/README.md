# @holon/context

> Immutable context management for Holon Flow

[![npm version](https://badge.fury.io/js/@holon%2Fcontext.svg)](https://www.npmjs.com/package/@holon/context)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @holon/context @holon/flow
```

## Usage

```typescript
import { context, contextual, getCurrentContext } from '@holon/context';
import { flow } from '@holon/flow';

// Create context
const ctx = context({
  user: 'Alice',
  locale: 'en'
});

// Create context-aware flow
const greet = contextual((name: string, ctx) => {
  const locale = ctx.get('locale');
  return locale === 'es' ? `¡Hola, ${name}!` : `Hello, ${name}!`;
});

// Run with context
await ctx.run(greet, 'World'); // "Hello, World!"

// Create new context with additional values
const spanishCtx = ctx.with({ locale: 'es' });
await spanishCtx.run(greet, 'Mundo'); // "¡Hola, Mundo!"
```

## Features

- **Immutable** - Context is never mutated
- **Structural sharing** - Efficient memory usage
- **Type-safe** - Full TypeScript support
- **AsyncLocalStorage** - Automatic context propagation

## API

### `context(initial?)`

Create a new context.

### `contextual(fn)`

Create a context-aware Flow.

### `getCurrentContext()`

Get the current context from async local storage.

### `withContext(ctx, fn)`

Run a function with a specific context.

## License

MIT