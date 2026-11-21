#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export CARGO_HOME="$ROOT/.build-tools/cargo"
export RUSTUP_HOME="$ROOT/.build-tools/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
cd "$ROOT"
exec "$CARGO_HOME/bin/cargo" "$@"
