import { describe, expect, it } from 'vitest';
import { compose, fallback, flow, parallel, race, repeat, split, when } from '../../src/flow.js';

describe('C.1 Basic Composition Patterns', () => {
  describe('Pipe Pattern', () => {
    it('should compose flows linearly', async () => {
      const addOne = flow((x: number) => x + 1);
      const double = flow((x: number) => x * 2);
      const toString = flow((x: number) => x.toString());

      const pipeline = compose(addOne, double, toString);
      const result = await pipeline(5);
      expect(result).toBe('12'); // (5 + 1) * 2 = 12
    });

    it('should handle async flows in pipeline', async () => {
      const fetchUser = flow(async (id: number) => ({ id, name: `User${id}` }));
      const getName = flow((user: { id: number; name: string }) => user.name);
      const greet = flow((name: string) => `Hello, ${name}!`);

      const pipeline = compose(fetchUser, getName, greet);
      const result = await pipeline(42);
      expect(result).toBe('Hello, User42!');
    });

    it('should support method chaining with pipe', async () => {
      const double = flow((x: number) => x * 2);
      const addTen = flow((x: number) => x + 10);

      const result = await double.pipe(addTen)(5); // (5 * 2) + 10
      expect(result).toBe(20);
    });
  });

  describe('Parallel Pattern', () => {
    it('should execute flows concurrently', async () => {
      const delays: number[] = [];
      const makeDelayedFlow = (delay: number, value: string) =>
        flow(async (input: string) => {
          const start = Date.now();
          await new Promise((resolve) => setTimeout(resolve, delay));
          delays.push(Date.now() - start);
          return `${input}-${value}`;
        });

      const flows = [
        makeDelayedFlow(50, 'A'),
        makeDelayedFlow(30, 'B'),
        makeDelayedFlow(40, 'C'),
      ];

      const parallelFlow = parallel(flows);
      const results = await parallelFlow('test');

      expect(results).toEqual(['test-A', 'test-B', 'test-C']);
      // All flows should complete in roughly the time of the slowest one (50ms)
      expect(Math.max(...delays)).toBeLessThan(100);
    });

    it('should handle errors in parallel execution', async () => {
      const flows = [
        flow(async (x: number) => x * 2),
        flow(async (x: number) => {
          if (x > 0) throw new Error('Test error');
          return x;
        }),
        flow(async (x: number) => x + 1),
      ];

      const parallelFlow = parallel(flows);
      await expect(parallelFlow(5)).rejects.toThrow('Test error');
    });
  });

  describe('Conditional Pattern', () => {
    it('should execute different flows based on condition', async () => {
      const isEven = flow((x: number) => x % 2 === 0);
      const doubleFlow = flow((x: number) => x * 2);
      const tripleFlow = flow((x: number) => x * 3);

      const conditionalFlow = when(isEven, doubleFlow, tripleFlow);

      expect(await conditionalFlow(4)).toBe(8); // even: 4 * 2
      expect(await conditionalFlow(3)).toBe(9); // odd: 3 * 3
    });

    it('should handle async conditions', async () => {
      const checkAuth = flow(async (user: { id: number; role: string }) => user.role === 'admin');
      const adminFlow = flow((user: { id: number; role: string }) => `Admin ${user.id}`);
      const userFlow = flow((user: { id: number; role: string }) => `User ${user.id}`);

      const authFlow = when(checkAuth, adminFlow, userFlow);

      expect(await authFlow({ id: 1, role: 'admin' })).toBe('Admin 1');
      expect(await authFlow({ id: 2, role: 'user' })).toBe('User 2');
    });
  });

  describe('Recursive Pattern', () => {
    it('should support recursive composition', async () => {
      // Factorial using recursive flow
      const factorial: Flow<number, number> = flow(async (n: number): Promise<number> => {
        if (n <= 1) return 1;
        const prev = await factorial(n - 1);
        return n * prev;
      });

      expect(await factorial(5)).toBe(120);
      expect(await factorial(0)).toBe(1);
    });

    it('should handle recursive tree traversal', async () => {
      interface TreeNode {
        value: number;
        children?: TreeNode[];
      }

      const sumTree: Flow<TreeNode, number> = flow(async (node: TreeNode): Promise<number> => {
        if (!node.children || node.children.length === 0) {
          return node.value;
        }

        const sums = await Promise.all(node.children.map((child) => sumTree(child)));
        return sums.reduce((acc, sum) => acc + sum, node.value);
      });

      const tree: TreeNode = {
        value: 1,
        children: [
          { value: 2, children: [{ value: 4 }, { value: 5 }] },
          { value: 3, children: [{ value: 6 }] },
        ],
      };

      expect(await sumTree(tree)).toBe(21); // 1+2+3+4+5+6
    });

    it('should support tail recursive optimization pattern', async () => {
      // Tail-recursive sum with accumulator
      const sumList: Flow<{ list: number[]; acc?: number }, number> = flow(
        async ({ list, acc = 0 }): Promise<number> => {
          if (list.length === 0) return acc;
          const [head, ...tail] = list;
          return sumList({ list: tail, acc: acc + head! });
        },
      );

      expect(await sumList({ list: [1, 2, 3, 4, 5] })).toBe(15);
      expect(await sumList({ list: [] })).toBe(0);
    });
  });

  describe('Race Pattern', () => {
    it('should return the first flow to complete', async () => {
      const fast = flow(
        async (x: number) =>
          new Promise<string>((resolve) => setTimeout(() => resolve('fast'), 10)),
      );
      const slow = flow(
        async (x: number) =>
          new Promise<string>((resolve) => setTimeout(() => resolve('slow'), 100)),
      );

      const raceFlow = race([fast, slow]);
      const result = await raceFlow(5);
      expect(result).toBe('fast');
    });

    it('should handle errors in race', async () => {
      const errorFlow = flow(
        async (x: number) =>
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Failed')), 10)),
      );
      const successFlow = flow(
        async (x: number) =>
          new Promise<string>((resolve) => setTimeout(() => resolve('success'), 100)),
      );

      const raceFlow = race([errorFlow, successFlow]);
      await expect(raceFlow(5)).rejects.toThrow('Failed');
    });
  });

  describe('Fallback Pattern', () => {
    it('should use fallback on primary failure', async () => {
      const primaryFlow = flow((x: number) => {
        if (x < 10) throw new Error('Too small');
        return x * 2;
      });
      const fallbackFlow = flow((x: number) => x + 100);

      const safeFlow = fallback(primaryFlow, fallbackFlow);

      expect(await safeFlow(5)).toBe(105); // fallback: 5 + 100
      expect(await safeFlow(10)).toBe(20); // primary: 10 * 2
    });
  });

  describe('Split-Join Pattern', () => {
    it('should split input and process separately', async () => {
      const splitter = flow((input: string) => {
        const [first, second] = input.split(',');
        return [first, second] as const;
      });

      const upperCase = flow((s: string) => s.toUpperCase());
      const reverse = flow((s: string) => s.split('').reverse().join(''));

      const splitFlow = split(splitter, [upperCase, reverse]);
      const result = await splitFlow('hello,world');

      expect(result).toEqual(['HELLO', 'dlrow']);
    });
  });

  describe('Repeat Pattern', () => {
    it('should repeat flow execution n times', async () => {
      const double = flow((x: number) => x * 2);
      const repeatThrice = repeat(double, 3);

      const result = await repeatThrice(2);
      expect(result).toBe(16); // 2 * 2 * 2 * 2 = 16
    });
  });
});