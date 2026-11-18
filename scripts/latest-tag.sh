#!/usr/bin/env bash
# Print the newest release tag (vMAJOR.MINOR.PATCH) of journey-mesh.
# Prints "main" when there is none yet; the caller decides whether to warn.
set -euo pipefail

repo="${JOURNEY_MESH_REPO:-https://github.com/openuji/journey-mesh.git}"

tag="$(
  git ls-remote --tags --sort=-v:refname "$repo" 'refs/tags/v*' \
    | awk '{print $2}' \
    | sed 's|^refs/tags/||' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    | head -n 1 \
    || true
)"

echo "${tag:-main}"
