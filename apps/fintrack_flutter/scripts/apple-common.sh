#!/bin/bash
set -euo pipefail

prepare_apple_build() {
  if [[ "$(uname -s)" != Darwin ]]; then
    echo "Run this installer on your Mac. Apple builds require Xcode."
    return 1
  fi
  if ! xcodebuild -version >/dev/null 2>&1; then
    echo "Install Xcode from the App Store, open it once, and finish its setup."
    echo "Then run: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer"
    return 1
  fi

  # Use a private, versioned SDK; leave existing Flutter installations untouched.
  local sdk="$HOME/Library/Application Support/FinTrack/toolchain/flutter-3.47.9"
  local revision=c197ca5199e9ee5661e865596c9c07294dfab51c
  if [[ ! -d "$sdk/.git" ]]; then
    mkdir -p "$(dirname "$sdk")"
    git clone --depth 1 --branch 3.47.9 https://github.com/flutter/flutter.git "$sdk"
  fi
  if [[ "$(git -C "$sdk" rev-parse HEAD)" != "$revision" ]]; then
    echo "The managed Flutter SDK does not match the expected version: $sdk"
    return 1
  fi
  export PATH="$sdk/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
  if ! command -v pod >/dev/null 2>&1; then
    if command -v brew >/dev/null 2>&1; then
      brew install cocoapods
    else
      echo "Install CocoaPods (https://guides.cocoapods.org/using/getting-started.html), then run this script again."
      echo "If you use Homebrew: brew install cocoapods"
      return 1
    fi
  fi
  flutter pub get
}
