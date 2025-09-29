import { defineConfig, mergeConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    // Test configuration
    globals: true,
    environment: 'node',
    passWithNoTests: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'coverage/**',
        'dist/**',
        'node_modules/**',
        '**/[.]**',
        'packages/*/test?(s)/**',
        '**/*.d.ts',
        '**/*{.,-}{test,spec,bench}.?(c|m)[jt]s?(x)',
        '**/tests/**',
        '**/__tests__/**',
        '**/{vite,vitest,rollup,webpack,esbuild,tsup}.config.*',
        '**/eslint.config.js',
        '**/.{eslint,prettier,stylelint}rc.{js,cjs,yml,json}',
      ],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },

    // Test matching
    include: [
      '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      '**/tests/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      '**/__tests__/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.turbo/**',
      'coverage/**',
      '**/*.bench.{js,ts}',
    ],

    // Reporter configuration
    reporters: process.env.CI ? ['default', 'junit', 'json'] : ['default'],
    outputFile: {
      junit: './test-results/junit.xml',
      json: './test-results/results.json',
    },

    // Retry configuration
    retry: process.env.CI ? 2 : 0,

    // Timeout configuration
    testTimeout: 10000,
    hookTimeout: 10000,

    // Watch configuration
    watchExclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  },

  resolve: {
    alias: {
      '@holon/flow': resolve(__dirname, 'packages/flow/src'),
      '@holon/effects': resolve(__dirname, 'packages/effects/src'),
      '@holon/context': resolve(__dirname, 'packages/context/src'),
      '@holon/modules': resolve(__dirname, 'packages/modules/src'),
      '@holon/test-utils': resolve(__dirname, 'packages/test-utils/src'),
    },
  },

  define: {
    'import.meta.vitest': 'undefined',
  },
});

// Helper function to create package-specific config
export function createPackageConfig(overrides = {}) {
  return mergeConfig(
    defineConfig({
      test: {
        root: '.',
        name: overrides.name || 'package',
      },
    }),
    overrides,
  );
}