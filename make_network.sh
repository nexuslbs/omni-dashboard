#!/bin/sh
# Ensure the omniagent_default Docker network exists before starting services.
# This decouples the dashboard from requiring the network to be pre-created by another stack.

NETWORK_NAME="omniagent_default"

if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  echo "Network '$NETWORK_NAME' already exists."
else
  echo "Creating network '$NETWORK_NAME'..."
  docker network create "$NETWORK_NAME" --driver bridge 2>&1
  echo "Network '$NETWORK_NAME' created."
fi
