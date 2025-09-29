#!/bin/bash

# Test script for Bun compatibility
# This script tests all packages with Bun runtime

set -e

BUN="bun"

if ! command -v "$BUN" &> /dev/null; then
  echo "❌ Bun not found"
  echo "Please install Bun: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

echo "🚀 Testing Holon packages with Bun v$($BUN --version)"
echo "================================================"

# Test each package
for package in packages/*; do
  if [ -d "$package" ] && [ -f "$package/package.json" ]; then
    name=$(basename "$package")
    echo ""
    echo "📦 Testing @holon/$name"
    echo "------------------------"

    cd "$package"

    # Run tests with Bun + vitest
    if $BUN run vitest --run; then
      echo "✅ @holon/$name: All tests passed!"
    else
      echo "❌ @holon/$name: Tests failed!"
      exit 1
    fi

    cd ../..
  fi
done

echo ""
echo "================================================"
echo "✨ All packages successfully tested with Bun!"
echo ""

# Summary
echo "📊 Test Summary:"
echo "  - @holon/flow: ✅"
echo "  - @holon/context: ✅"
echo "  - @holon/effects: ✅"
echo "  - @holon/test-utils: ✅"
echo ""
echo "🎉 Full Bun compatibility confirmed!"