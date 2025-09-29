#!/bin/bash

# Test script for Deno compatibility (focused on actual test files)
# This script tests packages with Deno runtime without duplicates

set -e

DENO="deno"

if [ ! -f "$DENO" ]; then
  echo "❌ Deno not found at $DENO"
  echo "Please install Deno: curl -fsSL https://deno.land/install.sh | sh"
  exit 1
fi

echo "🦕 Testing Holon packages with Deno v$($DENO --version | head -1 | cut -d' ' -f2)"
echo "================================================"

# Test each package individually
PACKAGES=("flow" "context" "effects" "test-utils")
ALL_PASSED=true

for package in "${PACKAGES[@]}"; do
  echo ""
  echo "📦 Testing @holon/$package"
  echo "------------------------"

  cd packages/$package

  # Run tests with Deno, excluding node_modules
  if $DENO run --allow-all npm:vitest run test/*.test.ts test/**/*.test.ts --no-coverage 2>/dev/null; then
    echo "✅ @holon/$package: All tests passed!"
  else
    echo "❌ @holon/$package: Tests failed!"
    ALL_PASSED=false
  fi

  cd ../..
done

echo ""
echo "================================================"

if [ "$ALL_PASSED" = true ]; then
  echo "✨ All packages successfully tested with Deno!"
  echo ""
  echo "📊 Test Summary:"
  echo "  - @holon/flow: ✅"
  echo "  - @holon/context: ✅"
  echo "  - @holon/effects: ✅"
  echo "  - @holon/test-utils: ✅"
  echo ""
  echo "🎉 Full Deno compatibility confirmed!"
else
  echo "❌ Some packages failed tests with Deno"
  exit 1
fi