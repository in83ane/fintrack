#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
source scripts/apple-common.sh
prepare_apple_build
flutter build macos --release

app="build/macos/Build/Products/Release/FinTrack.app"
destination="$HOME/Applications/FinTrack.app"
if [[ ! -d "$app" ]]; then
  echo "Build did not produce $app"
  exit 1
fi
mkdir -p "$HOME/Applications"
if [[ -e "$destination" ]]; then
  if pgrep -f '/FinTrack.app/Contents/MacOS/' >/dev/null; then
    echo "Quit FinTrack, then run this installer again."
    exit 1
  fi
  backup="$HOME/Applications/FinTrack-backup-$(date +%Y%m%d-%H%M%S).app"
  mv "$destination" "$backup"
  echo "Previous app saved at: $backup"
fi
ditto "$app" "$destination"
open "$destination"
echo "Installed: $destination"
