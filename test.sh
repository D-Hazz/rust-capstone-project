#!/bin/bash
set -e

# Load NVM into the script's subshell environment
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install nvm if missing, then use LTS Node
if ! command -v nvm &> /dev/null; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

nvm install --lts
npm install

# Spawn Bitcoind using Docker Compose
docker compose up -d

echo "Waiting for bitcoind to be fully initialized..."

attempt=0
while [ "$attempt" -lt 60 ]; do
  result=$(curl --silent --user alice:password --data-binary \
    '{"jsonrpc":"1.0","id":"ping","method":"getblockchaininfo","params":[]}' \
    -H 'content-type: text/plain;' http://127.0.0.1:18443 || true)

  if echo "$result" | grep -q '"chain"'; then
    echo "bitcoind is ready."
    break
  else
    attempt=$((attempt + 1))
    echo "bitcoind not ready yet ($attempt/60), retrying in 3s..."
    sleep 3
  fi
done

if [ "$attempt" -ge 60 ]; then
  echo "Bitcoin Core did not become ready within 3 minutes." >&2
  docker compose logs bitcoin
  exit 1
fi

chmod +x ./rust/run-rust.sh
chmod +x ./run.sh

# Run the test scripts
/bin/bash run.sh
npm run test

echo "Tests completed; the Bitcoin node is left running and its data is preserved."