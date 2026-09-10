#!/bin/bash

set -e

echo "🏗️  Building JobPulse Extension..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Please install Node.js first."
    exit 1
fi

# Create dist directory
mkdir -p dist

# Clean dist
rm -rf dist/*
mkdir -p dist

# 1. Bundle content script
echo "📦 Bundling content scripts..."
npx esbuild src/content/bundle.js \
  --bundle \
  --outfile=dist/src/content/bundle.js \
  --format=iife \
  --platform=browser \
  --target=chrome90 \
  --external:chrome \
  --allow-overwrite

# 2. Bundle service worker (IMPORTANT: This resolves all imports)
echo "📦 Bundling service worker..."
npx esbuild src/background/service-worker.js \
  --bundle \
  --outfile=dist/src/background/service-worker.js \
  --format=esm \
  --platform=browser \
  --target=chrome90 \
  --external:chrome \
  --allow-overwrite

# 3. Copy other files
echo "📦 Copying files..."

# Copy src directories (excluding content and background which are bundled)
mkdir -p dist/src
cp -r src/api dist/src/ 2>/dev/null || true
cp -r src/popup dist/src/ 2>/dev/null || true
cp -r src/state dist/src/ 2>/dev/null || true
cp -r src/utils dist/src/ 2>/dev/null || true
cp -r src/config dist/src/ 2>/dev/null || true

# Copy icons
if [ -d "icons" ]; then
    cp -r icons dist/
fi

# Copy config
if [ -d "config" ]; then
    cp -r config dist/
fi

# Copy manifest.json
cp manifest.json dist/

# Copy README
if [ -f "README.md" ]; then
    cp README.md dist/
fi

# 4. Remove old detector files (they're now bundled)
rm -f dist/src/content/detector.js 2>/dev/null || true
rm -f dist/src/content/linkedin.js 2>/dev/null || true
rm -f dist/src/content/naukri.js 2>/dev/null || true
rm -f dist/src/content/generic.js 2>/dev/null || true

# 5. Clean up test files
echo "🧹 Cleaning up..."
find dist -type f -name "*.test.js" -delete 2>/dev/null || true
find dist -type f -name "*.spec.js" -delete 2>/dev/null || true
find dist -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true

# 6. Create zip for Chrome Web Store
echo "📦 Creating zip..."
cd dist
zip -r ../jobpulse-extension.zip ./*
cd ..

echo "✅ Build complete!"
echo "📁 Output: dist/"
echo "📦 Extension zip: jobpulse-extension.zip"
echo ""
echo "🔧 To load in Chrome:"
echo "  1. Open chrome://extensions/"
echo "  2. Enable Developer mode"
echo "  3. Click 'Load unpacked'"
echo "  4. Select the 'dist' folder"