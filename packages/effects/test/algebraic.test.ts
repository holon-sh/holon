import { describe, expect, it } from 'vitest';
import { context } from '@holon/context';
import { AlgebraicEffect, AlgebraicEffects, scopedEffect, withHandler } from '../src/algebraic.js';

describe('AlgebraicEffect', () => {
  describe('Basic algebraic effects', () => {
    it('should handle simple effects', () => {
      const log = new AlgebraicEffect<string, void>('log');
      const messages: string[] = [];

      const result = log.handle(
        (msg, resume) => {
          messages.push(msg);
          resume(undefined);
          return 42;
        },
        () => {
          log.perform('Hello');
          log.perform('World');
          return 'Done';
        }
      );

      expect(result).toBe('Done');
      expect(messages).toEqual(['Hello', 'World']);
    });

    it('should throw when no handler found', () => {
      const unhandled = new AlgebraicEffect('unhandled');

      expect(() => {
        unhandled.perform('test');
      }).toThrow('No handler for effect unhandled');
    });

    it('should throw when handler does not resume', () => {
      const broken = new AlgebraicEffect('broken');

      expect(() => {
        broken.handle(
          (_value, _resume) => {
            // Not calling resume
            return 'oops';
          },
          () => broken.perform('test')
        );
      }).toThrow('Handler for effect broken did not call resume');
    });

    it('should throw when resuming multiple times', () => {
      const multiResume = new AlgebraicEffect('multiResume');

      expect(() => {
        multiResume.handle(
          (_value, resume) => {
            resume('first');
            resume('second'); // This should throw
            return 'done';
          },
          () => multiResume.perform('test')
        );
      }).toThrow('Effect multiResume already resumed');
    });

    it('should support nested handlers', () => {
      const outer = new AlgebraicEffect<string, string>('outer');
      const inner = new AlgebraicEffect<number, number>('inner');

      const result = outer.handle(
        (str, resume) => resume(`[${str}]`),
        () => inner.handle(
          (num, resume) => resume(num * 2),
          () => {
            const a = outer.perform('hello');
            const b = inner.perform(5);
            return `${a} - ${b}`;
          }
        )
      );

      expect(result).toBe('[hello] - 10');
    });
  });

  describe('Static helper methods', () => {
    it('should create constant handler', () => {
      const askName = new AlgebraicEffect<void, string>('askName');
      const handler = AlgebraicEffect.constant(askName, 'Alice');

      const result = handler(() => {
        const name = askName.perform(undefined);
        return `Hello, ${name}!`;
      });

      expect(result).toBe('Hello, Alice!');
    });

    it('should create transform handler', () => {
      const double = new AlgebraicEffect<number, number>('double');
      const handler = AlgebraicEffect.transform(double, (x) => x * 2);

      const result = handler(() => {
        const a = double.perform(5);
        const b = double.perform(10);
        return a + b;
      });

      expect(result).toBe(30); // (5*2) + (10*2)
    });

    it('should compose handlers', () => {
      const effect1 = new AlgebraicEffect<string, string>('effect1');
      const effect2 = new AlgebraicEffect<number, number>('effect2');

      const handler1 = AlgebraicEffect.transform(effect1, (s) => s.toUpperCase());
      const handler2 = AlgebraicEffect.transform(effect2, (n) => n * 3);

      const composed = AlgebraicEffect.compose(handler1, handler2);

      const result = composed(() => {
        const str = effect1.perform('hello');
        const num = effect2.perform(4);
        return `${str}:${num}`;
      });

      expect(result).toBe('HELLO:12');
    });
  });

  describe('withHandler utility', () => {
    it('should handle effects with utility function', () => {
      const ask = new AlgebraicEffect<string, string>('ask');

      const result = withHandler(
        ask,
        (question, resume) => {
          if (question === 'name') {
            return resume('Bob');
          } else {
            return resume('Unknown');
          }
        },
        () => {
          const name = ask.perform('name');
          const age = ask.perform('age');
          return `${name} - ${age}`;
        }
      );

      expect(result).toBe('Bob - Unknown');
    });
  });

  describe('scopedEffect with Context', () => {
    it('should handle effects with context', () => {
      const getConfig = new AlgebraicEffect<string, any>('getConfig');

      const ctx = context({
        apiUrl: 'https://api.example.com',
        apiKey: 'secret123',
      });

      const handler = scopedEffect(
        getConfig,
        (key, ctx) => ctx.get(key),
        ctx
      );

      const result = handler(() => {
        const url = getConfig.perform('apiUrl');
        const key = getConfig.perform('apiKey');
        return { url, key };
      });

      expect(result).toEqual({
        url: 'https://api.example.com',
        key: 'secret123',
      });
    });
  });

  describe('AlgebraicEffects.State', () => {
    it('should manage state', () => {
      const state = new AlgebraicEffects.State<number>('counter');

      const [result, finalState] = state.run(0, () => {
        const initial = state.getValue();
        state.setValue(10);
        const middle = state.getValue();
        state.modify(x => x * 2);
        const final = state.getValue();
        return [initial, middle, final];
      });

      expect(result).toEqual([0, 10, 20]);
      expect(finalState).toBe(20);
    });

    it('should handle complex state modifications', () => {
      interface AppState {
        count: number;
        items: string[];
      }

      const state = new AlgebraicEffects.State<AppState>('app');

      const [result, finalState] = state.run(
        { count: 0, items: [] },
        () => {
          state.modify(s => ({ ...s, count: s.count + 1 }));
          state.modify(s => ({ ...s, items: [...s.items, 'first'] }));
          state.modify(s => ({ ...s, count: s.count * 2 }));
          state.modify(s => ({ ...s, items: [...s.items, 'second'] }));
          return state.getValue();
        }
      );

      expect(result).toEqual({
        count: 2,
        items: ['first', 'second'],
      });
      expect(finalState).toEqual(result);
    });
  });

  describe('AlgebraicEffects.Exception', () => {
    it('should catch exceptions', () => {
      const exc = new AlgebraicEffects.Exception<string>('error');

      const result = exc.catch(
        (): number | string => {
          const value = 10;
          if (value > 5) {
            exc.throw('Value too large');
          }
          return value * 2;
        },
        (error): string => `Error: ${error}`
      );

      expect(result).toBe('Error: Value too large');
    });

    it('should not catch when no exception', () => {
      const exc = new AlgebraicEffects.Exception<string>('error');

      const result = exc.catch(
        (): number | string => {
          const value = 3;
          if (value > 5) {
            exc.throw('Value too large');
          }
          return value * 2;
        },
        (error): string => `Error: ${error}`
      );

      expect(result).toBe(6);
    });

    it('should execute finally block', () => {
      const exc = new AlgebraicEffects.Exception<string>('error');
      let finallyCalled = false;

      const result = exc.tryFinally(
        () => {
          return 'success';
        },
        () => {
          finallyCalled = true;
        }
      );

      expect(result).toBe('success');
      expect(finallyCalled).toBe(true);
    });

    it('should execute finally block on error', () => {
      const exc = new AlgebraicEffects.Exception<string>('error');
      let finallyCalled = false;

      expect(() => {
        exc.tryFinally(
          () => {
            throw new Error('oops');
          },
          () => {
            finallyCalled = true;
          }
        );
      }).toThrow('oops');

      expect(finallyCalled).toBe(true);
    });
  });

  describe('AlgebraicEffects.Choice', () => {
    it('should choose from alternatives', () => {
      const choice = new AlgebraicEffects.Choice<string>();

      // Make the choose field accessible for testing
      const chooseEffect = (choice as any).choose as AlgebraicEffect<string[], string>;
      let chosenValue: string | undefined;

      chooseEffect.handle(
        (choices, resume) => {
          chosenValue = choices[1]; // Choose second option
          return resume(chosenValue!);
        },
        () => {
          const result = choice.oneOf(['a', 'b', 'c']);
          expect(result).toBe('b');
        }
      );

      expect(chosenValue).toBe('b');
    });

    // Note: all() and first() methods have issues in the current implementation
    // They would need proper backtracking/continuation support to work correctly
  });

  describe('AlgebraicEffects.Async', () => {
    it('should await promises', async () => {
      const asyncEff = new AlgebraicEffects.Async();

      // Note: The current implementation has limitations
      // A proper implementation would need delimited continuations
      // For now, we test basic structure

      // Make the await field accessible for testing
      const awaitEffect = (asyncEff as any).await as AlgebraicEffect<Promise<any>, any>;

      const handler = awaitEffect.handle(
        (promise, resume) => {
          // In a real implementation, this would suspend and resume
          // For testing, we just verify the structure
          expect(promise).toBeInstanceOf(Promise);
          return resume('mocked-value');
        },
        () => {
          const result = asyncEff.wait(Promise.resolve('test'));
          return result;
        }
      );

      expect(handler).toBe('mocked-value');
    });
  });
});