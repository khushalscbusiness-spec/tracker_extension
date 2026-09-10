#!/bin/bash
# update-config.sh - Update extension config without rebuilding

echo "🔄 Updating JobPulse Extension Configuration"

# Check if dist exists
if [ ! -d "dist" ]; then
    echo "❌ dist directory not found. Please build first: ./build.sh"
    exit 1
fi

# Create config directory if not exists
mkdir -p dist/config

# Copy config.json if exists, otherwise create from template
if [ -f "config/config.json" ]; then
    cp config/config.json dist/config/config.json
    echo "✅ Config updated"
else
    # Create default config
    cat > dist/config/config.json << EOF
{
  "API_URL": "http://localhost:8000/api/v1",
  "WEBSITE_URL": "http://localhost:3000",
  "DASHBOARD_URL": "http://localhost:3000/dashboard",
  "EXTENSION_CONFIG": {
    "debug": true,
    "logLevel": "debug",
    "enableAnalytics": false
  }
}
EOF
    echo "✅ Default config created"
fi

echo "📝 Config file: dist/config/config.json"
echo "🔄 Restart Chrome to apply changes"