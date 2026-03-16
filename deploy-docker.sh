#!/bin/bash
set -e

cd /repo

echo "$(date): Deploy triggered" >> logs/deploy.log

git fetch origin master
git reset --hard origin/master

# Rebuild and restart only the app container
docker compose up -d --build app

echo "$(date): Deploy complete" >> logs/deploy.log
