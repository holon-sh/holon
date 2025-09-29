import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { compose, flow, identity } from '../../src/flow.js';
import { MockFlow, SpyFlow, StubFlow, flowProperty } from '@holon/test-utils';
import type { Flow } from '../../src/types.js';

describe('C.6 Testing Patterns', () => {
  describe('Mock Pattern', () => {
    it('should mock external dependencies', async () => {
      // Real service that would make network calls
      const userService = flow(async (userId: number) => {
        // In real code, this would fetch from API
        throw new Error('Should not be called in tests');
      });

      // Mock for testing
      const mockUserService = new MockFlow<number, { id: number; name: string }>({
        id: 1,
        name: 'Test User',
      });

      mockUserService.whenInput(1).thenReturn({ id: 1, name: 'Alice' });
      mockUserService.whenInput(2).thenReturn({ id: 2, name: 'Bob' });

      // Function under test that uses the service
      const greetUser = (service: Flow<number, { id: number; name: string }>) =>
        flow(async (userId: number) => {
          const user = await service(userId);
          return `Hello, ${user.name}!`;
        });

      // Test with mock
      const greetWithMock = greetUser(mockUserService.flow);

      expect(await greetWithMock(1)).toBe('Hello, Alice!');
      expect(await greetWithMock(2)).toBe('Hello, Bob!');
      expect(await greetWithMock(999)).toBe('Hello, Test User!'); // Default

      // Verify calls
      expect(mockUserService.getCallCount()).toBe(3);
      expect(mockUserService.wasCalledWith(1)).toBe(true);
    });

    it('should support complex mock scenarios', async () => {
      interface Database {
        query: Flow<string, any[]>;
        transaction: Flow<() => Promise<void>, void>;
      }

      class MockDatabase implements Database {
        private queryMock = new MockFlow<string, any[]>([]);
        private transactionMock = new MockFlow<() => Promise<void>, void>(undefined);

        query = this.queryMock.flow;
        transaction = this.transactionMock.flow;

        setupQueryResponse(sql: string, response: any[]) {
          this.queryMock.whenInput(sql).thenReturn(response);
        }

        expectTransaction(fn: () => Promise<void>) {
          this.transactionMock.whenInput(fn).thenReturn(undefined);
        }

        verifyQueries(expected: string[]) {
          const history = this.queryMock.getCallHistory();
          const queries = history.map((h) => h.input);
          expect(queries).toEqual(expected);
        }
      }

      const mockDb = new MockDatabase();
      mockDb.setupQueryResponse('SELECT * FROM users', [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);

      const userRepository = flow(async () => {
        const users = await mockDb.query('SELECT * FROM users');
        return users;
      });

      const result = await userRepository();
      expect(result).toHaveLength(2);

      mockDb.verifyQueries(['SELECT * FROM users']);
    });
  });

  describe('Spy Pattern', () => {
    it('should spy on real implementations', async () => {
      const realCalculator = flow((input: { a: number; b: number }) => {
        return input.a + input.b;
      });

      const spyCalculator = new SpyFlow(realCalculator);

      // Use the spy - it delegates to real implementation
      const result1 = await spyCalculator.flow({ a: 5, b: 3 });
      const result2 = await spyCalculator.flow({ a: 10, b: 20 });

      expect(result1).toBe(8);
      expect(result2).toBe(30);

      // Verify interactions
      expect(spyCalculator.getCallCount()).toBe(2);
      expect(spyCalculator.wasCalledWith({ a: 5, b: 3 })).toBe(true);

      const history = spyCalculator.getCallHistory();
      expect(history[0]?.input).toEqual({ a: 5, b: 3 });
      expect(history[0]?.output).toBe(8);
    });

    it('should track performance metrics', async () => {
      const slowOperation = flow(async (ms: number) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return `Waited ${ms}ms`;
      });

      const spy = new SpyFlow(slowOperation);

      await spy.flow(50);
      await spy.flow(100);

      expect(spy.getCallCount()).toBe(2);
      expect(spy.getAverageDuration()).toBeGreaterThanOrEqual(75);

      const history = spy.getCallHistory();
      expect(history[0]!.duration).toBeGreaterThanOrEqual(45); // Allow 10% tolerance
      expect(history[1]!.duration).toBeGreaterThanOrEqual(90); // Allow 10% tolerance
    });
  });

  describe('Stub Pattern', () => {
    it('should stub different behaviors', async () => {
      const stub = new StubFlow<number, string>();

      // Configure different behaviors
      stub.onCall(1).returns('first');
      stub.onCall(2).returns('second');
      stub.onCall(3).throws(new Error('Third call fails'));
      stub.withArgs((n) => n === 42).returns('answer');
      stub.returns('default'); // Default fallback

      // Test behaviors
      expect(await stub.flow(1)).toBe('first');
      expect(await stub.flow(2)).toBe('second');
      await expect(async () => await stub.flow(3)).rejects.toThrow('Third call fails');
      expect(await stub.flow(42)).toBe('answer');
      expect(await stub.flow(999)).toBe('default');
    });

    it('should support conditional stubbing', async () => {
      const stub = new StubFlow<{ type: string; value: number }, string>();

      stub
        .withArgs((input) => input.type === 'even' && input.value % 2 === 0)
        .returns('valid even');

      stub
        .withArgs((input) => input.type === 'odd' && input.value % 2 === 1)
        .returns('valid odd');

      stub.returns('invalid'); // Default

      expect(await stub.flow({ type: 'even', value: 4 })).toBe('valid even');
      expect(await stub.flow({ type: 'odd', value: 3 })).toBe('valid odd');
      expect(await stub.flow({ type: 'even', value: 3 })).toBe('invalid');
      expect(await stub.flow({ type: 'odd', value: 4 })).toBe('invalid');
    });
  });

  describe('Property-based Testing Pattern', () => {
    it('should verify flow properties', async () => {
      // Identity law
      await fc.assert(
        fc.asyncProperty(fc.integer(), async (n) => {
          const id = identity<number>();
          const result = await id(n);
          expect(result).toBe(n);
        }),
      );

      // Composition associativity
      await fc.assert(
        fc.asyncProperty(fc.integer(), async (n) => {
          const add1 = flow((x: number) => x + 1);
          const double = flow((x: number) => x * 2);
          const square = flow((x: number) => x * x);

          const left = compose(compose(add1, double), square);
          const right = compose(add1, compose(double, square));

          const leftResult = await left(n);
          const rightResult = await right(n);

          expect(leftResult).toBe(rightResult);
        }),
      );
    });

    it('should test flow invariants', async () => {
      const sortFlow = flow((arr: number[]) => [...arr].sort((a, b) => a - b));

      await fc.assert(
        fc.asyncProperty(fc.array(fc.integer()), async (arr) => {
          const sorted = await sortFlow(arr);

          // Invariants
          expect(sorted).toHaveLength(arr.length); // Same length

          // Sorted order
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i]!).toBeGreaterThanOrEqual(sorted[i - 1]!);
          }

          // Contains same elements
          const originalCounts = new Map<number, number>();
          const sortedCounts = new Map<number, number>();

          for (const n of arr) {
            originalCounts.set(n, (originalCounts.get(n) || 0) + 1);
          }

          for (const n of sorted) {
            sortedCounts.set(n, (sortedCounts.get(n) || 0) + 1);
          }

          expect(sortedCounts).toEqual(originalCounts);
        }),
      );
    });

    it('should use flowProperty utilities', async () => {
      const reverseFlow = flow((s: string) => s.split('').reverse().join(''));

      // Test idempotence
      // Test idempotence manually
      await fc.assert(
        fc.asyncProperty(fc.string(), async (s) => {
          const once = await reverseFlow(s);
          const twice = await reverseFlow(once);
          expect(twice).toBe(s);
        }),
      );

      // Test preservation of length
      await fc.assert(
        fc.asyncProperty(fc.string(), async (s) => {
          const result = await reverseFlow(s);
          expect(result.length).toBe(s.length);
        }),
      );

      // Test commutative property doesn't hold
      const concat = flow((input: [string, string]) => input[0] + input[1]);

      // Commutivity doesn't hold for string concatenation
      const s1 = 'a';
      const s2 = 'b';
      const result1 = await concat([s1, s2]);
      const result2 = await concat([s2, s1]);
      expect(result1).not.toBe(result2);
    });

    it('should test error conditions with properties', async () => {
      const safeDivide = flow((input: { a: number; b: number }) => {
        if (input.b === 0) throw new Error('Division by zero');
        return input.a / input.b;
      });

      await fc.assert(
        fc.asyncProperty(
          fc.integer(),
          fc.integer({ min: -100, max: 100 }),
          async (a, b) => {
            if (b === 0) {
              expect(() => safeDivide({ a, b })).toThrow('Division by zero');
            } else {
              const result = safeDivide({ a, b });
              expect(result).toBeCloseTo(a / b, 10);
            }
          },
        ),
      );
    });
  });

  describe('Fixture Pattern', () => {
    it('should use test fixtures', async () => {
      class TestFixture<T> {
        private builders: Array<(obj: T) => T> = [];

        constructor(private base: T) {}

        with(modifier: (obj: T) => Partial<T>): this {
          this.builders.push((obj) => ({ ...obj, ...modifier(obj) }));
          return this;
        }

        build(): T {
          return this.builders.reduce((acc, builder) => builder(acc), this.base);
        }

        buildMany(count: number, customizer?: (index: number) => Partial<T>): T[] {
          return Array.from({ length: count }, (_, i) => {
            const base = this.build();
            return customizer ? { ...base, ...customizer(i) } : base;
          });
        }
      }

      interface User {
        id: number;
        name: string;
        email: string;
        role: 'admin' | 'user';
        active: boolean;
      }

      const userFixture = new TestFixture<User>({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
        active: true,
      });

      const adminUser = userFixture.with((u) => ({ role: 'admin' as const })).build();

      expect(adminUser.role).toBe('admin');
      expect(adminUser.name).toBe('Test User');

      const inactiveUsers = userFixture
        .with((u) => ({ active: false }))
        .buildMany(3, (i) => ({
          id: i + 1,
          name: `User ${i + 1}`,
          email: `user${i + 1}@example.com`,
        }));

      expect(inactiveUsers).toHaveLength(3);
      expect(inactiveUsers[0]!.active).toBe(false);
      expect(inactiveUsers[1]!.name).toBe('User 2');
    });
  });

  describe('Snapshot Testing Pattern', () => {
    it('should implement snapshot testing for flows', async () => {
      class SnapshotTester {
        private snapshots = new Map<string, any>();

        async testFlow<In, Out>(
          name: string,
          targetFlow: Flow<In, Out>,
          inputs: In[],
        ): Promise<void> {
          const results = await Promise.all(inputs.map((input) => targetFlow(input)));

          const snapshot = {
            inputs,
            outputs: results,
            timestamp: new Date().toISOString(),
          };

          const existing = this.snapshots.get(name);
          if (existing) {
            // Compare with existing snapshot
            expect(snapshot.outputs).toEqual(existing.outputs);
          } else {
            // Store new snapshot
            this.snapshots.set(name, snapshot);
          }
        }

        getSnapshot(name: string) {
          return this.snapshots.get(name);
        }
      }

      const transformer = flow((input: { text: string; format: string }) => {
        if (input.format === 'upper') return input.text.toUpperCase();
        if (input.format === 'lower') return input.text.toLowerCase();
        return input.text;
      });

      const tester = new SnapshotTester();

      await tester.testFlow('text-transformer', transformer, [
        { text: 'Hello', format: 'upper' },
        { text: 'WORLD', format: 'lower' },
        { text: 'Test', format: 'none' },
      ]);

      const snapshot = tester.getSnapshot('text-transformer');
      expect(snapshot.outputs).toEqual(['HELLO', 'world', 'Test']);

      // Running again should pass (snapshot exists)
      await tester.testFlow('text-transformer', transformer, [
        { text: 'Hello', format: 'upper' },
        { text: 'WORLD', format: 'lower' },
        { text: 'Test', format: 'none' },
      ]);
    });
  });
});