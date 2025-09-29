# Holon Flow Development Principles

## 🎯 Mission

We are building the future of computing—a quantum-inspired, holonic architecture that synthesizes radical simplicity with unlimited power. Every line of code should advance this vision.

## 📐 Core Principles

### 1. Simplicity First, Power Through Composition
- **Single abstraction**: Everything is a Flow
- **Minimal API surface**: `flow()` and `.pipe()` are all you need
- **Emergent complexity**: Complex behavior emerges from simple composition
- **No magic**: Explicit over implicit, always

### 2. Mathematical Rigor
- **Provably correct**: Use types to prove correctness at compile time
- **Pure by default**: Side effects are explicitly marked and controlled
- **Referential transparency**: Same input always produces same output
- **Category theory**: Functors, monads, and morphisms guide our design

### 3. Universal Runtime Support
- **Platform agnostic**: Code runs identically on Node, Deno, Bun, and browsers
- **Zero dependencies**: Core has NO external dependencies
- **ESM only**: Modern modules for modern runtimes
- **Progressive enhancement**: Features adapt to runtime capabilities

## 🧪 Testing Philosophy

### Test Pyramid (from specs/appendix-i-testing.md)

```
         /\
        /  \  E2E Tests (5%)
       /    \
      /------\  Integration Tests (15%)
     /        \
    /----------\  Component Tests (30%)
   /            \
  /--------------\  Unit Tests (50%)
```

### Testing Principles

1. **Tests as Specification**
   - Tests define behavior
   - Tests are documentation
   - Tests prevent regression
   - Tests enable refactoring

2. **Property-Based Testing**
   ```typescript
   // Don't just test examples, test properties
   test.property('composition associativity',
     fc.func(), fc.func(), fc.func(), fc.integer(),
     (f, g, h, x) => {
       const left = flow(f).pipe(flow(g)).pipe(flow(h));
       const right = flow(f).pipe(flow(g).pipe(flow(h)));
       expect(left(x)).toBe(right(x));
     }
   );
   ```

3. **Mutation Testing**
   - All mutants must be killed
   - >95% mutation score required
   - Surviving mutants = missing tests

4. **Cross-Runtime Testing**
   - Run tests in Node, Deno, Bun
   - Browser tests via Playwright
   - Same test suite everywhere

### Test Commands

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run mutation tests
pnpm test:mutation

# Run benchmarks
pnpm bench

# Watch mode
pnpm test --watch

# Debug specific test
pnpm test --inspect-brk path/to/test.ts
```

## 🔍 Troubleshooting Approach (from specs/appendix-j-troubleshooting.md)

### Systematic Diagnosis

1. **Identify Symptoms**
   - Collect error messages
   - Measure performance metrics
   - Detect behavioral anomalies
   - Check resource usage

2. **Isolate Problem**
   - Binary search to find root cause
   - Minimal reproduction case
   - Remove variables systematically

3. **Form Hypotheses**
   - Analyze stack traces
   - Review recent changes
   - Check known issues

4. **Verify Solution**
   - Test fix in isolation
   - Confirm no side effects
   - Document solution

### Debug Tools

```typescript
// Always available debug utilities
import { trace, profile, inspect } from '@holon/debug';

// Trace execution
const debugFlow = trace('myFlow', originalFlow);

// Profile performance
const profiledFlow = profile(originalFlow);
console.log(profiledFlow.stats);

// Inspect structure
const structure = inspect(complexFlow);
```

### Common Issues & Solutions

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| Type mismatch in pipe | Incompatible Flow types | Check input/output types align |
| Memory leak | Unbounded memoization | Use LRU cache or clear periodically |
| Slow performance | Missing optimization | Enable JIT compilation |
| Lost context | Async boundary | Use AsyncLocalStorage |

## 🏗 Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/amazing-feature

# Develop with hot reload
pnpm dev

# Test continuously
pnpm test --watch

# Check types
pnpm typecheck

# Lint and format
pnpm lint:fix
pnpm format
```

### 2. Code Quality Gates

All code must pass:
- ✅ Type checking (`tsc --noEmit`)
- ✅ Linting (`biome check`)
- ✅ Formatting (`prettier --check`)
- ✅ Unit tests (>90% coverage)
- ✅ Mutation tests (>95% killed)
- ✅ Integration tests
- ✅ Performance benchmarks

### 3. Commit Standards

```bash
# Use conventional commits
feat: add quantum flow composition
fix: resolve memory leak in memoization
docs: update API reference
perf: optimize hot path with JIT
test: add property-based tests
refactor: simplify core flow logic
```

## 📦 Package Guidelines

### Package Structure

```
packages/[name]/
├── src/
│   ├── index.ts        # Public API exports
│   ├── core/           # Core implementation
│   ├── utils/          # Internal utilities
│   └── types.ts        # Type definitions
├── tests/
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── fixtures/       # Test fixtures
├── bench/              # Benchmarks
├── package.json        # Minimal config
├── tsconfig.json       # Extends root
├── vitest.config.ts    # Extends root
└── README.md          # Package docs
```

### Package Rules

1. **Zero dependencies in core**
2. **100% ESM modules**
3. **Platform-agnostic code**
4. **Exports map in package.json**
5. **Dual publishing (npm + jsr.io)**

## 🚀 Performance Standards

### Benchmarks Required

Every Flow operation must have benchmarks:

```typescript
import { bench, describe } from 'vitest';

describe('flow composition', () => {
  bench('simple pipe', () => {
    const f = flow(x => x * 2).pipe(flow(x => x + 1));
    f(100);
  });

  bench('complex pipe', () => {
    const f = flow(x => x * 2)
      .pipe(flow(x => x + 1))
      .pipe(flow(x => x.toString()))
      .pipe(flow(x => x.length));
    f(100);
  });
});
```

### Performance Targets

- Flow creation: <100ns
- Simple pipe: <200ns
- Context access: <50ns
- Effect dispatch: <300ns
- Module resolution: <1ms

### Optimization Guidelines

1. **Measure first**: Never optimize without data
2. **JIT compilation**: Hot paths get compiled
3. **Structural sharing**: Immutable with O(1) updates
4. **Lazy evaluation**: Compute only when needed
5. **Memoization**: Cache pure computations

## 🤝 Collaboration

### Code Review Checklist

- [ ] Follows single responsibility principle
- [ ] Has comprehensive tests
- [ ] Includes benchmarks for perf-critical code
- [ ] Documents public API with JSDoc
- [ ] No breaking changes without migration guide
- [ ] Cross-runtime compatible
- [ ] Zero external dependencies (core only)
- [ ] Accessible error messages

### Documentation Standards

Every public API must have:

```typescript
/**
 * Creates a Flow from a function.
 *
 * @param fn - The function to convert to a Flow
 * @returns A Flow that executes the function
 *
 * @example
 * ```typescript
 * const double = flow((x: number) => x * 2);
 * console.log(double(5)); // 10
 * ```
 *
 * @category Core
 * @since 10.0.0
 */
export function flow<In, Out>(
  fn: (input: In) => Out | Promise<Out>
): Flow<In, Out>;
```

## 🔐 Security

### Security Principles

1. **No eval() or Function() constructors**
2. **No prototype pollution**
3. **Sanitize all inputs**
4. **Principle of least privilege**
5. **Secure by default**

### Dependency Security

```bash
# Check for vulnerabilities
pnpm audit

# Update dependencies safely
pnpm update --interactive

# Lock specific versions
pnpm add package@version --save-exact
```

## 📊 Metrics for Success

### Code Quality Metrics
- Test coverage: >90%
- Mutation score: >95%
- Cyclomatic complexity: <10
- Type coverage: 100%
- Bundle size: <10KB (core)

### Performance Metrics
- Operations/second: >1M
- Memory overhead: <5%
- Startup time: <10ms
- JIT compilation: <100ms

### Developer Experience Metrics
- Time to first Flow: <5 minutes
- API surface: <10 functions (core)
- Documentation coverage: 100%
- Cross-runtime compatibility: 100%

## 🎯 Decision Framework

When making architectural decisions, prioritize in this order:

1. **Correctness** - Must work correctly
2. **Simplicity** - Easiest to understand wins
3. **Performance** - Fast enough is good enough
4. **Flexibility** - Composition over configuration
5. **Size** - Smaller is better

## 🚨 Red Flags

Watch out for:
- 🚫 External dependencies in core
- 🚫 Runtime-specific code
- 🚫 Mutable state
- 🚫 Implicit behavior
- 🚫 Breaking changes
- 🚫 Missing tests
- 🚫 Poor error messages
- 🚫 Memory leaks
- 🚫 Synchronous I/O

## 📚 Required Reading

Before contributing, understand:
- [Main Specification](specs/01-holon-flow.md)
- [Testing Strategies](specs/appendix-i-testing.md)
- [Troubleshooting Guide](specs/appendix-j-troubleshooting.md)
- [API Reference](specs/appendix-b-api.md)
- [Implementation Guide](specs/implementation-guide.md)

## 🌟 Remember

> "Perfection is achieved not when there is nothing more to add,
> but when there is nothing left to take away."
> — Antoine de Saint-Exupéry

Every line of code should embody this philosophy. We're not just building software; we're crafting the future of computation.

---

**Last Updated**: 2025-09-29
**Version**: 10.0.0
**Status**: Living Document