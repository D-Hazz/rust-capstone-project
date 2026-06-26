#!/bin/bash

# 1. Explicitly load NVM to prevent "command not found" errors
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
else
    # If curl already installed nvm, ensure it is fully accessible in this session
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    source "$NVM_DIR/nvm.sh"
fi

# Install Node.js LTS and project dependencies
nvm install --lts
npm install

set -e  # Exit immediately if any command fails

# 2. Adaptive launch of Bitcoind in the background
echo "Starting Bitcoin node via Docker..."
if docker compose version >/dev/null 2>&1; then
    docker compose up --detach
elif docker-compose version >/dev/null 2>&1; then
    docker-compose up -d
else
    # Fallback if the detach flag causes an issue with old version syntax/aliases
    docker compose up & 
fi

sleep 10

echo "Waiting for bitcoind to be fully initialized..."

# Polling loop to check if the Bitcoin JSON-RPC interface is ready
while true; do
  result=$(curl --silent --user alice:password --data-binary \
    '{"jsonrpc":"1.0","id":"ping","method":"getblockchaininfo","params":[]}' \
    -H 'content-type: text/plain;' http://127.0.0.1:18443)

  if echo "$result" | grep -q '"chain"'; then
    echo "bitcoind is ready."
    break
  else
    echo "bitcoind not ready yet, retrying in 3s..."
    sleep 3
  fi
done

# Ensure the orchestration scripts have correct execution permissions
chmod +x ./rust/run-rust.sh
chmod +x ./run.sh

# Run the test scripts
/bin/bash run.sh
npm run test

# Stop the docker context safely and remove volumes
echo "Cleaning up containers..."
docker compose down -v || docker-compose down -v || true