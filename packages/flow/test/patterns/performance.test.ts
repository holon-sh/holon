import { describe, expect, it, vi } from 'vitest';
import { batch, debounce, flow, memoize, throttle } from '../../src/flow.js';
import type { Flow } from '../../src/types.js';

describe('C.5 Performance Patterns', () => {
  describe('Memoization Pattern', () => {
    it('should cache function results', async () => {
      let callCount = 0;
      const expensiveOperation = flow((n: number) => {
        callCount++;
        return n * n;
      });

      const memoizedOperation = memoize(expensiveOperation);

      // First calls - compute
      expect(await memoizedOperation(5)).toBe(25);
      expect(await memoizedOperation(10)).toBe(100);
      expect(callCount).toBe(2);

      // Subsequent calls - use cache
      expect(await memoizedOperation(5)).toBe(25);
      expect(await memoizedOperation(10)).toBe(100);
      expect(callCount).toBe(2); // No additional calls

      // New value - compute
      expect(await memoizedOperation(7)).toBe(49);
      expect(callCount).toBe(3);
    });

    it('should support custom cache key generation', async () => {
      let callCount = 0;
      const userLookup = flow(async (user: { id: number; name: string }) => {
        callCount++;
        return { ...user, processed: true };
      });

      // Custom key based only on id
      const memoizedLookup = memoize(userLookup, (user) => String(user.id));

      await memoizedLookup({ id: 1, name: 'Alice' });
      await memoizedLookup({ id: 1, name: 'Bob' }); // Different name, same id

      expect(callCount).toBe(1); // Only called once due to same id
    });

    it('should implement LRU cache', async () => {
      class LRUCache<K, V> {
        private cache = new Map<K, V>();
        private maxSize: number;

        constructor(maxSize: number) {
          this.maxSize = maxSize;
        }

        get(key: K): V | undefined {
          const value = this.cache.get(key);
          if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
          }
          return value;
        }

        set(key: K, value: V): void {
          // Remove if exists (to update position)
          if (this.cache.has(key)) {
            this.cache.delete(key);
          }

          // Add to end
          this.cache.set(key, value);

          // Remove oldest if over capacity
          if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
          }
        }

        clear(): void {
          this.cache.clear();
        }
      }

      const memoizeWithLRU = <In, Out>(
        targetFlow: Flow<In, Out>,
        maxSize: number,
        keyFn: (input: In) => string = JSON.stringify,
      ): Flow<In, Out> => {
        const cache = new LRUCache<string, Out>(maxSize);

        return flow(async (input: In) => {
          const key = keyFn(input);
          const cached = cache.get(key);

          if (cached !== undefined) {
            return cached;
          }

          const result = await targetFlow(input);
          cache.set(key, result);
          return result;
        });
      };

      let callCount = 0;
      const operation = flow((n: number) => {
        callCount++;
        return n * 2;
      });

      const lruMemoized = memoizeWithLRU(operation, 3);

      // Fill cache
      await lruMemoized(1); // Cache: [1]
      await lruMemoized(2); // Cache: [1, 2]
      await lruMemoized(3); // Cache: [1, 2, 3]
      expect(callCount).toBe(3);

      // Add 4th item, should evict 1
      await lruMemoized(4); // Cache: [2, 3, 4]
      expect(callCount).toBe(4);

      // Access 1 again, should recompute
      await lruMemoized(1); // Cache: [3, 4, 1]
      expect(callCount).toBe(5);

      // Access 3, should be cached and move to end
      await lruMemoized(3); // Cache: [4, 1, 3]
      expect(callCount).toBe(5); // No new call
    });
  });

  describe('Batching Pattern', () => {
    it('should batch individual requests', { timeout: 15000 }, async () => {
      const batchProcessor = flow(async (items: number[]) => {
        // Simulate batch processing
        await new Promise((resolve) => setTimeout(resolve, 50));
        return items.map((n) => n * 2);
      });

      const batchedFlow = batch(batchProcessor, { size: 3, delay: 100 });

      // Send individual requests
      const promises = [
        batchedFlow(1),
        batchedFlow(2),
        batchedFlow(3),
        batchedFlow(4),
        batchedFlow(5),
      ];

      const results = await Promise.all(promises);
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should support time-based batching', async () => {
      let batchCount = 0;
      const batchLogger = flow(async (messages: string[]) => {
        batchCount++;
        return messages.map((m) => `Logged: ${m}`);
      });

      const batchedLogger = batch(batchLogger, { size: 10, delay: 50 });

      // Send messages quickly
      const start = Date.now();
      const promises: Promise<string>[] = [];

      for (let i = 0; i < 5; i++) {
        promises.push(batchedLogger(`Message ${i}`));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      expect(results).toHaveLength(5);
      expect(batchCount).toBe(1); // All messages in one batch
      expect(duration).toBeGreaterThanOrEqual(50); // Waited for delay
    });

    it('should implement adaptive batching', async () => {
      class AdaptiveBatcher<In, Out> {
        private queue: Array<{ input: In; resolve: (value: Out) => void; reject: (error: Error) => void }> = [];
        private batchSize: number;
        private minBatchSize = 1;
        private maxBatchSize = 100;
        private successRate = 1;
        private timer?: NodeJS.Timeout;

        constructor(
          private processor: Flow<In[], Out[]>,
          initialBatchSize = 10,
          private maxDelay = 100,
        ) {
          this.batchSize = initialBatchSize;
        }

        async add(input: In): Promise<Out> {
          return new Promise<Out>((resolve, reject) => {
            this.queue.push({ input, resolve, reject });

            if (this.queue.length >= this.batchSize) {
              this.flush();
            } else if (!this.timer) {
              this.timer = setTimeout(() => this.flush(), this.maxDelay);
            }
          });
        }

        private async flush() {
          if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
          }

          if (this.queue.length === 0) return;

          const batch = this.queue.splice(0, this.batchSize);
          const inputs = batch.map((item) => item.input);

          try {
            const results = await this.processor(inputs);

            // Adjust batch size based on success
            this.successRate = this.successRate * 0.9 + 0.1; // Exponential moving average
            this.batchSize = Math.min(
              this.maxBatchSize,
              Math.max(this.minBatchSize, Math.floor(this.batchSize * (1 + this.successRate * 0.1))),
            );

            batch.forEach((item, i) => item.resolve(results[i]!));
          } catch (error) {
            // Reduce batch size on failure
            this.successRate = this.successRate * 0.9; // Decay success rate
            this.batchSize = Math.max(this.minBatchSize, Math.floor(this.batchSize * 0.8));

            batch.forEach((item) => item.reject(error as Error));
          }
        }
      }

      const processor = flow(async (items: number[]) => {
        if (items.length > 5) {
          throw new Error('Batch too large');
        }
        return items.map((n) => n * 2);
      });

      const batcher = new AdaptiveBatcher(processor, 10, 50);

      // First batch will fail (too large), causing adaptation
      const promises1 = Array.from({ length: 10 }, (_, i) => batcher.add(i).catch(() => -1));
      const results1 = await Promise.all(promises1);
      expect(results1.every((r) => r === -1)).toBe(true);

      // Next batch should succeed with reduced size
      await new Promise((resolve) => setTimeout(resolve, 100));
      const promises2 = Array.from({ length: 4 }, (_, i) => batcher.add(i));
      const results2 = await Promise.all(promises2);
      expect(results2).toEqual([0, 2, 4, 6]);
    });
  });

  describe('Stream Processing Pattern', () => {
    it('should process data in streams', async () => {
      class StreamProcessor<T> {
        private buffer: T[] = [];
        private subscribers: Array<(chunk: T[]) => void> = [];

        constructor(private chunkSize: number) {}

        write = flow(async (data: T) => {
          this.buffer.push(data);

          if (this.buffer.length >= this.chunkSize) {
            const chunk = this.buffer.splice(0, this.chunkSize);
            this.emit(chunk);
          }
        });

        flush = flow(async () => {
          if (this.buffer.length > 0) {
            this.emit(this.buffer);
            this.buffer = [];
          }
        });

        subscribe(callback: (chunk: T[]) => void) {
          this.subscribers.push(callback);
        }

        private emit(chunk: T[]) {
          this.subscribers.forEach((sub) => sub(chunk));
        }
      }

      const stream = new StreamProcessor<number>(3);
      const chunks: number[][] = [];

      stream.subscribe((chunk) => chunks.push(chunk));

      // Write data
      for (let i = 1; i <= 10; i++) {
        await stream.write(i);
      }

      // Should have 3 complete chunks
      expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);

      // Flush remaining
      await stream.flush();
      expect(chunks[3]).toEqual([10]);
    });

    it('should support transform streams', async () => {
      interface Transform<In, Out> {
        transform: Flow<In, Out>;
      }

      class TransformStream<In, Out> implements Transform<In, Out> {
        constructor(private transformer: (input: In) => Out | Promise<Out>) {}

        transform = flow(async (input: In): Promise<Out> => {
          return await this.transformer(input);
        });

        pipe<Next>(next: Transform<Out, Next>): TransformStream<In, Next> {
          return new TransformStream(async (input: In) => {
            const intermediate = await this.transform(input);
            return await next.transform(intermediate);
          });
        }
      }

      const uppercase = new TransformStream<string, string>((s) => s.toUpperCase());
      const addPrefix = new TransformStream<string, string>((s) => `PREFIX: ${s}`);
      const toLength = new TransformStream<string, number>((s) => s.length);

      const pipeline = uppercase.pipe(addPrefix).pipe(toLength);

      const result = await pipeline.transform('hello');
      expect(result).toBe(13); // "PREFIX: HELLO".length
    });

    it('should handle backpressure', async () => {
      class BackpressureStream<T> {
        private queue: T[] = [];
        private processing = false;
        private highWaterMark: number;
        private lowWaterMark: number;
        private paused = false;

        constructor(
          private processor: Flow<T, void>,
          highWaterMark = 10,
          lowWaterMark = 5,
        ) {
          this.highWaterMark = highWaterMark;
          this.lowWaterMark = lowWaterMark;
        }

        write = flow(async (item: T): Promise<boolean> => {
          this.queue.push(item);

          if (this.queue.length >= this.highWaterMark) {
            this.paused = true;
          }

          if (!this.processing) {
            this.process();
          }

          return !this.paused;
        });

        private async process() {
          this.processing = true;

          while (this.queue.length > 0) {
            const item = this.queue.shift()!;
            await this.processor(item);

            if (this.paused && this.queue.length <= this.lowWaterMark) {
              this.paused = false;
            }
          }

          this.processing = false;
        }

        isPaused(): boolean {
          return this.paused;
        }
      }

      let processedCount = 0;
      const slowProcessor = flow(async (item: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        processedCount++;
      });

      const stream = new BackpressureStream(slowProcessor, 5, 2);

      // Write many items quickly
      const canContinue: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        const result = await stream.write(i);
        canContinue.push(result);
      }

      // Should pause after hitting high water mark
      expect(canContinue.filter((c) => !c).length).toBeGreaterThan(0);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(processedCount).toBe(10);
    });
  });

  describe('Throttling Pattern', () => {
    it('should limit execution rate', async () => {
      let callCount = 0;
      const operation = flow((x: number) => {
        callCount++;
        return x * 2;
      });

      const throttledOperation = throttle(operation, 100);

      // Rapid calls
      const results: number[] = [];
      results.push(await throttledOperation(1)); // Executes immediately
      results.push(await throttledOperation(2)); // Returns cached result
      results.push(await throttledOperation(3)); // Returns cached result

      expect(callCount).toBe(1);
      expect(results[0]).toBe(2);
      expect(results[1]).toBe(2); // Same as first (throttled)
      expect(results[2]).toBe(2); // Same as first (throttled)

      // Wait for throttle period
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result4 = await throttledOperation(4);
      expect(callCount).toBe(2);
      expect(result4).toBe(8);
    });
  });

  describe('Debouncing Pattern', () => {
    it('should delay execution until idle', { timeout: 15000 }, async () => {
      let callCount = 0;
      const operation = flow((x: number) => {
        callCount++;
        return x * 2;
      });

      const debouncedOperation = debounce(operation, 50);

      // Rapid calls
      const promises: Promise<number>[] = [];
      for (let i = 1; i <= 5; i++) {
        promises.push(debouncedOperation(i));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // All should resolve to the last value
      const results = await Promise.all(promises);
      expect(callCount).toBe(1); // Only called once
      expect(results).toEqual([10, 10, 10, 10, 10]); // All get result of last call (5 * 2)
    });
  });

  describe('Lazy Evaluation Pattern', () => {
    it('should defer computation until needed', async () => {
      let computations = 0;

      class LazyFlow<T> {
        private value?: T;
        private computed = false;

        constructor(
          private computation: () => T | Promise<T>,
          private isRoot = false,
        ) {}

        get = flow(async (): Promise<T> => {
          if (!this.computed) {
            if (this.isRoot) computations++;
            this.value = await this.computation();
            this.computed = true;
          }
          return this.value!;
        });

        map<U>(fn: (value: T) => U | Promise<U>): LazyFlow<U> {
          return new LazyFlow(async () => {
            const value = await this.get();
            return await fn(value);
          }, false);
        }
      }

      const lazy = new LazyFlow(() => 42, true);
      const doubled = lazy.map((x) => x * 2);
      const stringified = doubled.map((x) => x.toString());

      // No computation yet
      expect(computations).toBe(0);

      // Trigger computation
      const result = await stringified.get();
      expect(result).toBe('84');
      expect(computations).toBe(1);

      // Second access uses cached value
      const result2 = await stringified.get();
      expect(result2).toBe('84');
      expect(computations).toBe(1); // No additional computation
    });
  });
});