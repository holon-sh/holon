import type { Context } from '@holon/context';
import type { Effect, EffectFlow, EffectFlags } from './index.js';

/**
 * Effect usage statistics
 */
export interface EffectUsage {
  count: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  errors: number;
  lastError?: Error;
  samples: EffectSample[];
}

/**
 * Single effect execution sample
 */
export interface EffectSample {
  timestamp: number;
  duration: number;
  success: boolean;
  error?: Error;
  input?: any;
  output?: any;
  context?: Record<string, any>;
}

/**
 * Effect analysis report
 */
export interface EffectAnalysis {
  effects: Map<symbol, EffectUsage>;
  totalEffects: number;
  totalExecutions: number;
  totalErrors: number;
  averageTime: number;
  flags: EffectFlags;
  dependencies: Map<symbol, Set<symbol>>;
  hotPaths: Array<{
    effect: symbol;
    count: number;
    averageTime: number;
  }>;
}

/**
 * Tracker configuration
 */
export interface TrackerConfig {
  maxSamples?: number;
  sampleRate?: number;
  captureInput?: boolean;
  captureOutput?: boolean;
  captureContext?: boolean;
  enableProfiling?: boolean;
}

/**
 * Effect dependency graph node
 */
interface DependencyNode {
  effect: symbol;
  dependencies: Set<symbol>;
  dependents: Set<symbol>;
}

/**
 * Effect tracker for monitoring and analysis
 */
export class EffectTracker {
  private effects: Map<symbol, EffectUsage> = new Map();
  private dependencies: Map<symbol, DependencyNode> = new Map();
  private readonly config: Required<TrackerConfig>;

  constructor(config: TrackerConfig = {}) {
    this.config = {
      maxSamples: config.maxSamples ?? 100,
      sampleRate: config.sampleRate ?? 1.0,
      captureInput: config.captureInput ?? false,
      captureOutput: config.captureOutput ?? false,
      captureContext: config.captureContext ?? false,
      enableProfiling: config.enableProfiling ?? true,
    };
  }

  /**
   * Track an effect execution
   */
  track<T, R>(
    effect: Effect<T, R>,
    input: T,
    context?: Context,
  ): { execute: () => Promise<R>; sample: EffectSample } {
    const startTime = this.config.enableProfiling ? performance.now() : 0;
    const sample: EffectSample = {
      timestamp: Date.now(),
      duration: 0,
      success: false,
    };

    // Decide whether to capture this sample
    const shouldSample = this.shouldSample();

    if (shouldSample && this.config.captureInput) {
      sample.input = this.sanitizeValue(input);
    }

    if (shouldSample && this.config.captureContext && context) {
      sample.context = this.captureContextData(context);
    }

    const execute = async (): Promise<R> => {
      try {
        const result = await effect.handler(input, context!);

        if (this.config.enableProfiling) {
          sample.duration = performance.now() - startTime;
        }
        sample.success = true;

        if (shouldSample && this.config.captureOutput) {
          sample.output = this.sanitizeValue(result);
        }

        this.recordSuccess(effect.id, sample);
        return result;
      } catch (error) {
        if (this.config.enableProfiling) {
          sample.duration = performance.now() - startTime;
        }
        sample.success = false;
        sample.error = error as Error;

        this.recordError(effect.id, sample, error as Error);
        throw error;
      }
    };

    return { execute, sample };
  }

  /**
   * Track a Flow execution
   */
  async trackFlow<In, Out>(
    flow: EffectFlow<In, Out>,
    input: In,
    _context?: Context,
  ): Promise<Out> {
    const effects = Array.from(flow.effects);

    // Track dependencies between effects
    for (let i = 0; i < effects.length - 1; i++) {
      this.addDependency(effects[i]!.id, effects[i + 1]!.id);
    }

    // Execute with tracking
    const startTime = performance.now();
    try {
      const result = await flow(input);
      const duration = performance.now() - startTime;

      // Record flow-level metrics
      for (const effect of effects) {
        const sample: EffectSample = {
          timestamp: Date.now(),
          duration: duration / effects.length, // Approximate per-effect time
          success: true,
        };
        this.recordSuccess(effect.id, sample);
      }

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;

      // Record error for all effects in the flow
      for (const effect of effects) {
        const sample: EffectSample = {
          timestamp: Date.now(),
          duration: duration / effects.length,
          success: false,
          error: error as Error,
        };
        this.recordError(effect.id, sample, error as Error);
      }

      throw error;
    }
  }

  /**
   * Get usage statistics for an effect
   */
  getUsage(effectId: symbol): EffectUsage | undefined {
    return this.effects.get(effectId);
  }

  /**
   * Get comprehensive analysis
   */
  analyze(): EffectAnalysis {
    const hotPaths = this.identifyHotPaths();
    const totalExecutions = Array.from(this.effects.values()).reduce(
      (sum, usage) => sum + usage.count,
      0,
    );
    const totalErrors = Array.from(this.effects.values()).reduce(
      (sum, usage) => sum + usage.errors,
      0,
    );
    const totalTime = Array.from(this.effects.values()).reduce(
      (sum, usage) => sum + usage.totalTime,
      0,
    );

    // Build dependency map
    const dependencies = new Map<symbol, Set<symbol>>();
    for (const [effectId, node] of this.dependencies) {
      dependencies.set(effectId, new Set(node.dependencies));
    }

    return {
      effects: new Map(this.effects),
      totalEffects: this.effects.size,
      totalExecutions,
      totalErrors,
      averageTime: totalExecutions > 0 ? totalTime / totalExecutions : 0,
      flags: 0, // Would need to track actual flags
      dependencies,
      hotPaths,
    };
  }

  /**
   * Reset tracking data
   */
  reset(): void {
    this.effects.clear();
    this.dependencies.clear();
  }

  /**
   * Export tracking data
   */
  export(): string {
    const analysis = this.analyze();
    return JSON.stringify(
      {
        timestamp: Date.now(),
        analysis: {
          totalEffects: analysis.totalEffects,
          totalExecutions: analysis.totalExecutions,
          totalErrors: analysis.totalErrors,
          averageTime: analysis.averageTime,
          hotPaths: analysis.hotPaths,
          effects: Array.from(analysis.effects.entries()).map(([id, usage]) => ({
            id: id.toString(),
            ...usage,
            samples: usage.samples.slice(0, 10), // Limit samples in export
          })),
        },
      },
      null,
      2,
    );
  }

  /**
   * Private: Determine if we should sample this execution
   */
  private shouldSample(): boolean {
    if (this.config.sampleRate >= 1.0) return true;
    return Math.random() < this.config.sampleRate;
  }

  /**
   * Private: Record successful execution
   */
  private recordSuccess(effectId: symbol, sample: EffectSample): void {
    const usage = this.getOrCreateUsage(effectId);
    usage.count++;
    usage.totalTime += sample.duration;
    usage.averageTime = usage.totalTime / usage.count;
    usage.minTime = Math.min(usage.minTime, sample.duration);
    usage.maxTime = Math.max(usage.maxTime, sample.duration);

    // Add sample if under limit
    if (usage.samples.length < this.config.maxSamples) {
      usage.samples.push(sample);
    } else {
      // Replace oldest sample
      usage.samples[usage.count % this.config.maxSamples] = sample;
    }
  }

  /**
   * Private: Record failed execution
   */
  private recordError(effectId: symbol, sample: EffectSample, error: Error): void {
    const usage = this.getOrCreateUsage(effectId);
    usage.count++;
    usage.errors++;
    usage.lastError = error;
    usage.totalTime += sample.duration;
    usage.averageTime = usage.totalTime / usage.count;

    // Add error sample
    if (usage.samples.length < this.config.maxSamples) {
      usage.samples.push(sample);
    }
  }

  /**
   * Private: Get or create usage entry
   */
  private getOrCreateUsage(effectId: symbol): EffectUsage {
    if (!this.effects.has(effectId)) {
      this.effects.set(effectId, {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        errors: 0,
        samples: [],
      });
    }
    return this.effects.get(effectId)!;
  }

  /**
   * Private: Add dependency relationship
   */
  private addDependency(from: symbol, to: symbol): void {
    // Get or create nodes
    if (!this.dependencies.has(from)) {
      this.dependencies.set(from, {
        effect: from,
        dependencies: new Set(),
        dependents: new Set(),
      });
    }
    if (!this.dependencies.has(to)) {
      this.dependencies.set(to, {
        effect: to,
        dependencies: new Set(),
        dependents: new Set(),
      });
    }

    // Add relationship
    this.dependencies.get(from)!.dependencies.add(to);
    this.dependencies.get(to)!.dependents.add(from);
  }

  /**
   * Private: Identify hot paths
   */
  private identifyHotPaths(): Array<{ effect: symbol; count: number; averageTime: number }> {
    const paths = Array.from(this.effects.entries())
      .map(([effect, usage]) => ({
        effect,
        count: usage.count,
        averageTime: usage.averageTime,
      }))
      .sort((a, b) => b.count * b.averageTime - a.count * a.averageTime)
      .slice(0, 10); // Top 10 hot paths

    return paths;
  }

  /**
   * Private: Sanitize value for storage
   */
  private sanitizeValue(value: any): any {
    try {
      // Simple JSON serialization for safety
      return JSON.parse(JSON.stringify(value));
    } catch {
      return '[Unserializable]';
    }
  }

  /**
   * Private: Capture context data
   */
  private captureContextData(context: Context): Record<string, any> {
    const data: Record<string, any> = {};
    for (const key of context.keys()) {
      const value = context.get(key);
      if (value !== undefined && typeof value !== 'function') {
        data[String(key)] = this.sanitizeValue(value);
      }
    }
    return data;
  }
}

/**
 * Global tracker instance
 */
export const globalTracker = new EffectTracker({
  maxSamples: 1000,
  sampleRate: 0.1, // Sample 10% by default
  enableProfiling: true,
});

/**
 * Create a tracked effect
 */
export function trackedEffect<T, R>(
  effect: Effect<T, R>,
  tracker: EffectTracker = globalTracker,
): Effect<T, R> {
  return {
    ...effect,
    handler: async (value: T, ctx: Context) => {
      const { execute } = tracker.track(effect, value, ctx);
      return execute();
    },
  };
}

/**
 * Create a tracked Flow
 */
export function trackedFlow<In, Out>(
  flow: EffectFlow<In, Out>,
  tracker: EffectTracker = globalTracker,
): EffectFlow<In, Out> {
  const tracked = (async (input: In) => {
    const context = await import('@holon/context').then(m => m.getCurrentContext());
    return tracker.trackFlow(flow, input, context);
  }) as EffectFlow<In, Out>;

  tracked.effects = flow.effects;
  tracked.flags = flow.flags;
  tracked.pipe = flow.pipe;

  return tracked;
}