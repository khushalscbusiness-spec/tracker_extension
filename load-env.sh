#!/bin/bash
# load-env.sh

if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo "🌍 Environment: $ENVIRONMENT"
echo "🔗 API URL: $API_URL"

# Build with current environment
NODE_ENV=$ENVIRONMENT ./build.sh