import { flow } from '@holon/flow';
import { describe, expect, test } from 'vitest';
import { MockFlow, SpyFlow, StubFlow, testFlow } from '../src/index.js';

describe('Test Utilities', () => {
  describe('MockFlow', () => {
    test('should return default response', () => {
      const mock = new MockFlow<number, string>('default');
      expect(mock.flow(42)).toBe('default');
      expect(mock.getCallCount()).toBe(1);
    });

    test('should return configured response for specific input', () => {
      const mock = new MockFlow<number, string>();
      mock.whenInput(5).thenReturn('five');
      mock.whenInput(10).thenReturn('ten');

      expect(mock.flow(5)).toBe('five');
      expect(mock.flow(10)).toBe('ten');
      expect(mock.wasCalledWith(5)).toBe(true);
      expect(mock.wasCalledWith(10)).toBe(true);
      expect(mock.wasCalledWith(15)).toBe(false);
    });

    test('should throw when no response configured', () => {
      const mock = new MockFlow<number, string>();
      expect(() => mock.flow(42)).toThrow('No mock response configured');
    });

    test('should track call history', () => {
      const mock = new MockFlow<number, string>('result');
      mock.flow(1);
      mock.flow(2);
      mock.flow(3);

      const history = mock.getCallHistory();
      expect(history).toHaveLength(3);
      expect(history[0]?.input).toBe(1);
      expect(history[1]?.input).toBe(2);
      expect(history[2]?.input).toBe(3);
    });

    test('should reset calls', () => {
      const mock = new MockFlow<number, string>('result');
      mock.flow(1);
      mock.flow(2);

      expect(mock.getCallCount()).toBe(2);

      mock.reset();
      expect(mock.getCallCount()).toBe(0);
    });

    test('should reset all', () => {
      const mock = new MockFlow<number, string>();
      mock.whenInput(5).thenReturn('five');
      mock.flow(5);

      mock.resetAll();
      expect(mock.getCallCount()).toBe(0);
      expect(() => mock.flow(5)).toThrow();
    });

    test('should support pipe', () => {
      const mock = new MockFlow<number, number>(10);
      const double = flow((x: number) => x * 2);
      const piped = mock.flow.pipe(double);

      expect(piped(5)).toBe(20); // mock returns 10, then doubled to 20
    });
  });

  describe('SpyFlow', () => {
    test('should wrap and observe flow execution', async () => {
      const original = flow((x: number) => x * 2);
      const spy = new SpyFlow(original);

      const result = await spy.flow(5);
      expect(result).toBe(10);
      expect(spy.getCallCount()).toBe(1);
    });

    test('should track execution duration', async () => {
      const slowFlow = flow(async (x: number) => {
        await new Promise((r) => setTimeout(r, 50));
        return x * 2;
      });
      const spy = new SpyFlow(slowFlow);

      await spy.flow(5);
      const lastCall = spy.getLastCall();

      expect(lastCall?.duration).toBeGreaterThan(49);
      expect(lastCall?.input).toBe(5);
      expect(lastCall?.output).toBe(10);
    });

    test('should track errors', async () => {
      const errorFlow = flow((x: number) => {
        if (x < 0) {
          throw new Error('Negative input');
        }
        return x * 2;
      });
      const spy = new SpyFlow(errorFlow);

      expect(await spy.flow(5)).toBe(10);

      // Synchronous error should be caught
      expect(() => spy.flow(-5)).toThrow('Negative input');

      const errors = spy.getCallsWithErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.error?.message).toBe('Negative input');
    });

    test('should calculate average duration', async () => {
      const flow1 = flow(async (x: number) => {
        await new Promise((r) => setTimeout(r, 10));
        return x;
      });
      const spy = new SpyFlow(flow1);

      await Promise.all([spy.flow(1), spy.flow(2), spy.flow(3)]);

      const avgDuration = spy.getAverageDuration();
      expect(avgDuration).toBeGreaterThan(9);
    });

    test('should check if called with specific input', () => {
      const original = flow((x: number) => x * 2);
      const spy = new SpyFlow(original);

      spy.flow(5);
      spy.flow(10);

      expect(spy.wasCalledWith(5)).toBe(true);
      expect(spy.wasCalledWith(10)).toBe(true);
      expect(spy.wasCalledWith(15)).toBe(false);
    });

    test('should reset history', () => {
      const original = flow((x: number) => x * 2);
      const spy = new SpyFlow(original);

      spy.flow(5);
      spy.flow(10);
      expect(spy.getCallCount()).toBe(2);

      spy.reset();
      expect(spy.getCallCount()).toBe(0);
    });
  });

  describe('StubFlow', () => {
    test('should return configured value', () => {
      const stub = new StubFlow<number, string>();
      stub.returns('fixed');

      expect(stub.flow(1)).toBe('fixed');
      expect(stub.flow(2)).toBe('fixed');
    });

    test('should throw configured error', () => {
      const stub = new StubFlow<number, string>();
      const error = new Error('Test error');
      stub.throws(error);

      expect(() => stub.flow(1)).toThrow('Test error');
    });

    test('should call fake function', () => {
      const stub = new StubFlow<number, string>();
      stub.callsFake((x) => `Value: ${x}`);

      expect(stub.flow(5)).toBe('Value: 5');
      expect(stub.flow(10)).toBe('Value: 10');
    });

    test('should handle onCall configuration', () => {
      const stub = new StubFlow<number, string>();
      stub.onCall(1).returns('first');
      stub.onCall(2).returns('second');
      stub.onCall(3).throws(new Error('third'));

      expect(stub.flow(0)).toBe('first');
      expect(stub.flow(0)).toBe('second');
      expect(() => stub.flow(0)).toThrow('third');
    });

    test('should handle withArgs configuration', () => {
      const stub = new StubFlow<number, string>();
      stub.withArgs((x) => x > 0).returns('positive');
      stub.withArgs((x) => x < 0).returns('negative');
      stub.withArgs((x) => x === 0).returns('zero');

      expect(stub.flow(5)).toBe('positive');
      expect(stub.flow(-5)).toBe('negative');
      expect(stub.flow(0)).toBe('zero');
    });

    test('should throw when no behavior configured', () => {
      const stub = new StubFlow<number, string>();

      expect(() => stub.flow(1)).toThrow('No stub behavior configured');
    });

    test('should reset behaviors', () => {
      const stub = new StubFlow<number, string>();
      stub.returns('value');

      expect(stub.flow(1)).toBe('value');

      stub.reset();
      expect(() => stub.flow(1)).toThrow('No stub behavior configured');
    });

    test('should support async behaviors', async () => {
      const stub = new StubFlow<number, Promise<string>>();
      stub.callsFake(async (x) => {
        await new Promise((r) => setTimeout(r, 10));
        return `Async: ${x}`;
      });

      const result = await stub.flow(5);
      expect(result).toBe('Async: 5');
    });
  });

  describe('testFlow helper', () => {
    test('should create mock', () => {
      const mock = testFlow.mock<number, string>('default');
      expect(mock.flow(1)).toBe('default');
    });

    test('should create spy', () => {
      const original = flow((x: number) => x * 2);
      const spy = testFlow.spy(original);

      expect(spy.flow(5)).toBe(10);
      expect(spy.getCallCount()).toBe(1);
    });

    test('should create stub', () => {
      const stub = testFlow.stub<number, string>();
      stub.returns('stubbed');

      expect(stub.flow(1)).toBe('stubbed');
    });
  });
});
