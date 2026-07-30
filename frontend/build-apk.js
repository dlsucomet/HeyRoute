/**
 * Cross-platform Node script to build Sparrow standalone Release APK
 * and copy it to frontend/Sparrow.apk with timestamp and size info.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isUniversal = args.includes('--universal');
const archFlag = isUniversal ? [] : ['-PreactNativeArchitectures=arm64-v8a'];

console.log('==========================================');
console.log('  Sparrow Standalone APK Builder          ');
console.log('==========================================\n');

const androidDir = path.join(__dirname, 'android');
const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

const targetLabel = isUniversal ? 'Universal (all ABIs)' : 'arm64-v8a (Modern Android Phones)';
console.log(`[INFO] Target Architecture: ${targetLabel}`);
console.log(`[1/2] Running ${gradlewCmd} assembleRelease...\n`);

const cmdStr = [gradlewCmd, 'assembleRelease', ...archFlag].join(' ');
const result = spawnSync(
  cmdStr,
  { cwd: androidDir, stdio: 'inherit', shell: true }
);

if (result.status !== 0) {
  console.error(`\n❌ APK Build failed with exit code ${result.status}`);
  process.exit(result.status || 1);
}

const apkSrc = path.join(androidDir, 'app/build/outputs/apk/release/app-release.apk');
if (!fs.existsSync(apkSrc)) {
  console.error(`\n❌ Built APK not found at ${apkSrc}`);
  process.exit(1);
}

const destName = isUniversal ? 'Sparrow-universal.apk' : 'Sparrow.apk';
const apkDest = path.join(__dirname, destName);

// Copy APK to frontend root directory
fs.copyFileSync(apkSrc, apkDest);
const stats = fs.statSync(apkDest);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log('\n==========================================');
console.log('  ✅ APK BUILD COMPLETE!');
console.log('==========================================\n');
console.log(`  APK File:  ${apkDest}`);
console.log(`  Size:      ${sizeMB} MB`);
console.log(`  Updated:   ${stats.mtime.toLocaleString()}\n`);
console.log('How to Install on Your Android Device:');
console.log(`  1. Via USB (ADB):\n     adb install -r "${destName}"\n     OR run: npm run install:apk:arm64\n`);
console.log(`  2. Standalone Sharing (Without Laptop/Metro):\n     Copy "${destName}" to your Android device via USB, Google Drive, or Telegram,\n     and open it on your phone to install.\n`);
