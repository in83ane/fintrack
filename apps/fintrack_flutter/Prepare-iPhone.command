#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
source scripts/apple-common.sh
prepare_apple_build
flutter precache --ios
flutter build ios --release --config-only --no-codesign
open ios/Runner.xcworkspace
cat <<'INSTRUCTIONS'

Finish installation in Xcode:
1. Connect your iPhone, trust this Mac, and enable Developer Mode on iPhone.
2. Xcode > Settings > Accounts: add your own Apple ID.
3. Runner > Signing & Capabilities: enable Automatically manage signing.
4. Select your Team; use a unique bundle identifier if Xcode requests one.
5. Select your connected iPhone as the run destination and press Run.

Your Apple password and signing certificate stay on your Mac.
This project is prepared for signing; an unsigned IPA cannot be installed.
INSTRUCTIONS
