# Holon Flow

> **Quantum-inspired computing architecture where everything is a Flow**

[![CI](https://github.com/holon-flow/holon/actions/workflows/ci.yml/badge.svg)](https://github.com/holon-flow/holon/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/holon-flow/holon/branch/main/graph/badge.svg)](https://codecov.io/gh/holon-flow/holon)
[![npm version](https://badge.fury.io/js/@holon%2Fflow.svg)](https://www.npmjs.com/package/@holon/flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🌟 Revolutionary Simplicity, Unlimited Power

Holon Flow is a radical reimagining of computation. One abstraction. Infinite composition. Zero complexity.

```typescript
import { flow } from '@holon/flow';

// Everything is a Flow
const double = flow((x: number) => x * 2);
const addOne = flow((x: number) => x + 1);

// Flows compose naturally
const transform = double.pipe(addOne);

console.log(transform(5)); // 11
```

## ✨ Features

- 🎯 **Single Abstraction** - Everything is a Flow
- 🔗 **Infinite Composition** - Build complex from simple
- 🚀 **Universal Runtime** - Works in Node, Deno, Bun, and browsers
- 📦 **Zero Dependencies** - Core has NO external dependencies
- 🧬 **Quantum Inspired** - Superposition of computations
- ♾️ **Fractal Architecture** - Self-similar at every scale
- 🛡️ **Type Safe** - 100% TypeScript with perfect inference
- ⚡ **Blazing Fast** - JIT compilation of hot paths

## 📦 Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`@holon/flow`](packages/flow) | Core Flow abstraction | ![npm](https://img.shields.io/npm/v/@holon/flow) |
| [`@holon/context`](packages/context) | Immutable context management | ![npm](https://img.shields.io/npm/v/@holon/context) |
| [`@holon/effects`](packages/effects) | Effect system for side effects | ![npm](https://img.shields.io/npm/v/@holon/effects) |
| [`@holon/modules`](packages/modules) | Module system | Coming soon |

## 🚀 Quick Start

### Install

```bash
# npm
npm install @holon/flow

# pnpm
pnpm add @holon/flow

# bun
bun add @holon/flow

# deno (via npm specifier)
import { flow } from "npm:@holon/flow";
```

### Basic Usage

```typescript
import { flow, compose, map, filter, reduce } from '@holon/flow';

// Simple transformations
const processNumber = compose(
  flow((x: number) => x * 2),
  flow(x => x + 10),
  flow(x => `Result: ${x}`)
);

console.log(processNumber(5)); // "Result: 20"

// Working with collections
const processArray = compose(
  filter(flow((x: number) => x % 2 === 0)),
  map(flow(x => x * 2)),
  reduce(flow(([sum, x]) => sum + x), 0)
);

console.log(await processArray([1, 2, 3, 4, 5])); // 12
```

### With Effects

```typescript
import { effectful, Effects, pure } from '@holon/effects';

// Pure computation
const calculate = pure((x: number) => x * 2);

// Effectful computation
const save = effectful(
  async (data: any) => {
    await fetch('/api/data', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return data;
  },
  [Effects.fetch],
  EffectFlags.Network | EffectFlags.Async
);

// Composition maintains effect tracking
const pipeline = calculate.pipe(save);
```

### With Context

```typescript
import { context, contextual, getCurrentContext } from '@holon/context';

// Create context-aware Flow
const greet = contextual((name: string, ctx) => {
  const locale = ctx.get('locale') || 'en';
  return locale === 'es' ? `¡Hola, ${name}!` : `Hello, ${name}!`;
});

// Run with context
const ctx = context({ locale: 'es' });
await ctx.run(greet, 'World'); // "¡Hola, World!"
```

## 📚 Documentation

- [Main Specification](specs/01-holon-flow.md) - Complete architecture
- [Beginner's Guide](specs/beginners-guide.md) - Start here if new
- [Advanced Techniques](specs/advanced-techniques.md) - For experts
- [API Reference](specs/appendix-b-api.md) - Complete API docs
- [Patterns Catalog](specs/appendix-c-patterns.md) - Common patterns

## 🧪 Development

This is a monorepo managed with [Turborepo](https://turbo.build/) and [pnpm](https://pnpm.io/).

### Prerequisites

- Node.js >= 20, Bun >= 1.0, or Deno >= 1.0
- pnpm >= 9

### Runtime Support

| Runtime | Status | Test Command |
|---------|--------|--------------|
| Node.js 20+ | ✅ Full support | `npm test` |
| Bun 1.0+ | ✅ Full support | `bun test` or `bun run vitest --run` |
| Deno 1.0+ | ✅ Full support | `deno test` |
| Browser | ✅ Full support | Via bundlers |

### Setup

```bash
# Install dependencies (choose one)
pnpm install
bun install
npm install

# Build all packages
pnpm build
# or
bun run build

# Run tests
pnpm test
# or with Bun
bun run vitest --run
# or with native Bun test runner (experimental)
bun test

# Run tests with coverage
pnpm test:coverage

# Run benchmarks
pnpm bench

# Lint and format
pnpm lint
pnpm format
```

### Development Workflow

```bash
# Start development mode
pnpm dev

# Run tests in watch mode
pnpm test:watch

# Type checking
pnpm typecheck

# Clean all builds
pnpm clean
```

## 🧪 Testing Philosophy

We follow a comprehensive testing strategy:

- **Unit Tests** (50%) - Test individual Flows
- **Component Tests** (30%) - Test Flow compositions
- **Integration Tests** (15%) - Test module interactions
- **E2E Tests** (5%) - Test complete scenarios

All code must achieve:
- ✅ >90% test coverage
- ✅ >95% mutation score
- ✅ Property-based tests for laws
- ✅ Cross-runtime compatibility

## 🚀 Performance

Holon Flow is designed for maximum performance:

- **Flow creation**: <100ns
- **Simple pipe**: <200ns
- **Context access**: <50ns
- **Effect dispatch**: <300ns

Run benchmarks:
```bash
pnpm bench
```

## 🤝 Contributing

We welcome contributions! Please read [CLAUDE.md](CLAUDE.md) for development principles and guidelines.

### Development Principles

1. **Simplicity First** - If it's not simple, it's not right
2. **Zero Dependencies** - Core must remain dependency-free
3. **Universal Runtime** - Must work everywhere
4. **Type Safety** - Types prevent bugs
5. **Performance** - Measure, don't guess

## 📄 License

MIT © 2025 Holon Team

## 🌟 Philosophy

> "We don't program computers. We describe transformations of information,
> and the system finds the optimal way to execute them."

Holon Flow represents a fundamental shift in how we think about computation. Join us in building the future.

---

<p align="center">
  <b>Everything is a Flow. Flows compose. That's all you need.</b>
</p>