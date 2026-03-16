#!/bin/bash
set -e

cd /home/gti/catan-coach

echo "$(date): Deploy triggered" >> logs/deploy.log

# Pull latest changes
git fetch origin master
git reset --hard origin/master

# Install dependencies and build
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

npm ci --production=false
npm run build

# Restart the app
pm2 restart catan-coach

echo "$(date): Deploy complete" >> logs/deploy.log
