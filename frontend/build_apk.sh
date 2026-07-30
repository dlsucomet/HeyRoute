#!/usr/bin/env bash
# ============================================================
# Sparrow Standalone APK Builder (Linux / macOS / WSL)
# Builds a standalone Android Release APK without Metro
# ============================================================

set -e

UNIVERSAL=0
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --universal|-u|-Universal) UNIVERSAL=1 ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

echo "=========================================="
echo "  Sparrow Standalone APK Builder          "
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Verify .env file exists
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "[WARNING] .env file not found in $SCRIPT_DIR. Using defaults or template.env if available..."
else
    echo "[INFO] Using .env configuration from $SCRIPT_DIR/.env"
fi

ANDROID_DIR="$SCRIPT_DIR/android"
if [ ! -d "$ANDROID_DIR" ]; then
    echo "[ERROR] Android directory not found at $ANDROID_DIR"
    exit 1
fi

cd "$ANDROID_DIR"

GRADLE_ARGS=("assembleRelease")
if [ "$UNIVERSAL" -eq 0 ]; then
    echo "[INFO] Target Architecture: arm64-v8a (Modern Android Phones)"
    GRADLE_ARGS+=("-PreactNativeArchitectures=arm64-v8a")
    DEST_NAME="Sparrow.apk"
else
    echo "[INFO] Target Architecture: Universal (all ABIs)"
    DEST_NAME="Sparrow-universal.apk"
fi

echo ""
echo "[1/2] Compiling JS bundle and Native Release APK..."
./gradlew "${GRADLE_ARGS[@]}"

APK_PATH="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_PATH" ]; then
    echo "[ERROR] Expected APK file not found at $APK_PATH"
    exit 1
fi

DEST_PATH="$SCRIPT_DIR/$DEST_NAME"
cp -f "$APK_PATH" "$DEST_PATH"

SIZE_MB=$(du -m "$DEST_PATH" | cut -f1)

echo ""
echo "=========================================="
echo "  ✅ APK BUILD COMPLETE!"
echo "=========================================="
echo ""
echo "  APK File:  $DEST_PATH"
echo "  Size:      ~${SIZE_MB} MB"
echo ""
echo "How to Install on Your Android Device:"
echo "  1. Via USB (ADB):"
echo "     adb install -r \"$DEST_NAME\""
echo "     OR run: npm run install:apk:arm64"
echo ""
echo "  2. Standalone Sharing (Without Laptop/Metro):"
echo "     Copy \"$DEST_NAME\" to your Android device via USB, Google Drive, or Telegram,"
echo "     and open it on your phone to install."
echo ""
