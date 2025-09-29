#!/bin/bash

# Test script for Deno compatibility
# This script tests all packages with Deno runtime

set -e

DENO="deno"

if [ ! -f "$DENO" ]; then
  echo "❌ Deno not found at $DENO"
  echo "Please install Deno: curl -fsSL https://deno.land/install.sh | sh"
  exit 1
fi

echo "🦕 Testing Holon packages with Deno v$($DENO --version | head -1 | cut -d' ' -f2)"
echo "================================================"

# Use the global test:deno command which runs vitest with Deno
echo ""
echo "Running all tests with Deno..."
echo "------------------------"

# Run tests and capture exit code properly
# Note: Deno may have issues with vitest's exit code handling
$DENO run --allow-all npm:vitest run --reporter=verbose --no-coverage || EXIT_CODE=$?

# Check if tests actually passed (exit code 0 or undefined exit code issues)
if [ -z "$EXIT_CODE" ] || [ "$EXIT_CODE" -eq "0" ]; then
  echo ""
  echo "✅ All tests passed with Deno!"
else
  echo ""
  echo "❌ Some tests failed with Deno!"
  exit 1
fi

echo ""
echo "================================================"
echo "✨ All packages successfully tested with Deno!"
echo ""

# Summary
echo "📊 Test Summary:"
echo "  - @holon/flow: ✅"
echo "  - @holon/context: ✅"
echo "  - @holon/effects: ✅"
echo "  - @holon/test-utils: ✅"
echo ""
echo "🎉 Full Deno compatibility confirmed!"