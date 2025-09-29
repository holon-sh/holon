import { describe, expect, test } from 'vitest';
import * as exports from '../src/index.js';

describe('Index exports', () => {
  test('should export flow function', () => {
    expect(exports.flow).toBeDefined();
    expect(typeof exports.flow).toBe('function');
  });

  test('should export core Flow utilities', () => {
    expect(exports.identity).toBeDefined();
    expect(exports.constant).toBeDefined();
    expect(exports.compose).toBeDefined();
    expect(exports.map).toBeDefined();
    expect(exports.filter).toBeDefined();
    expect(exports.reduce).toBeDefined();
    expect(exports.parallel).toBeDefined();
    expect(exports.race).toBeDefined();
  });

  test('should export error handling utilities', () => {
    expect(exports.fallback).toBeDefined();
    expect(exports.retry).toBeDefined();
    expect(exports.timeout).toBeDefined();
  });

  test('should export performance utilities', () => {
    expect(exports.memoize).toBeDefined();
    expect(exports.debounce).toBeDefined();
    expect(exports.throttle).toBeDefined();
  });

  test('should export monadic utilities', () => {
    expect(exports.maybe).toBeDefined();
    expect(exports.result).toBeDefined();
  });

  test('should export utility functions', () => {
    expect(exports.tap).toBeDefined();
    expect(exports.validate).toBeDefined();
  });

  test('should have correct TypeScript types', () => {
    // Type exports are checked at compile time
    // This test verifies the exports exist at runtime
    const typeExports = [
      'flow',
      'identity',
      'constant',
      'compose',
      'map',
      'filter',
      'reduce',
      'parallel',
      'race',
      'fallback',
      'retry',
      'timeout',
      'memoize',
      'debounce',
      'throttle',
      'maybe',
      'result',
      'tap',
      'validate',
    ];

    typeExports.forEach((name) => {
      expect(exports).toHaveProperty(name);
    });
  });
});
