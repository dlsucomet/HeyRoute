<#
.SYNOPSIS
    Builds a standalone Android Release APK for Sparrow without needing Metro bundler.
.DESCRIPTION
    Compiles the React Native JS bundle with Hermes and packages native assets into an APK.
    By default, compiles for modern physical ARM64 devices (arm64-v8a) for faster builds (~75% faster)
    and smaller APK size (~40-50MB). Use -Universal to build for all CPU architectures.
.PARAMETER Universal
    Build a universal APK that includes armeabi-v7a, arm64-v8a, x86, and x86_64.
.EXAMPLE
    .\build_apk.ps1
.EXAMPLE
    .\build_apk.ps1 -Universal
#>
param(
    [switch]$Universal
)

$ErrorActionPreference = 'Stop'

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Sparrow Standalone APK Builder          " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Verify .env file exists
$envPath = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "[WARNING] .env file not found in $PSScriptRoot. Using defaults or template.env if available..." -ForegroundColor Yellow
} else {
    Write-Host "[INFO] Using .env configuration from $envPath" -ForegroundColor Green
}

$androidDir = Join-Path $PSScriptRoot "android"
if (-not (Test-Path $androidDir)) {
    Write-Host "[ERROR] Android directory not found at $androidDir" -ForegroundColor Red
    exit 1
}

Push-Location $androidDir

try {
    $gradleArgs = @("assembleRelease")
    if (-not $Universal) {
        Write-Host "[INFO] Target Architecture: arm64-v8a (Modern Android Phones)" -ForegroundColor Green
        $gradleArgs += "-PreactNativeArchitectures=arm64-v8a"
    } else {
        Write-Host "[INFO] Target Architecture: Universal (all ABIs)" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "[1/2] Compiling JS bundle and Native Release APK..." -ForegroundColor Cyan
    & .\gradlew.bat @gradleArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Gradle build failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    $apkPath = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
    if (-not (Test-Path $apkPath)) {
        Write-Host "[ERROR] Expected APK file not found at $apkPath" -ForegroundColor Red
        exit 1
    }

    # Copy to frontend directory for easy access
    $destName = if ($Universal) { "Sparrow-universal.apk" } else { "Sparrow.apk" }
    $destPath = Join-Path $PSScriptRoot $destName
    Copy-Item -Path $apkPath -Destination $destPath -Force

    $fileInfo = Get-Item $destPath
    $sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  ✅ APK BUILD COMPLETE!                  " -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  APK File:  $destPath"
    Write-Host "  Size:      $sizeMB MB"
    Write-Host ""
    Write-Host "How to Install on Your Android Device:" -ForegroundColor Cyan
    Write-Host "  1. Via USB (ADB):"
    Write-Host "     adb install -r `"$destName`""
    Write-Host "     OR run: npm run install:apk:arm64"
    Write-Host ""
    Write-Host "  2. Standalone Sharing (Without Laptop/Metro):"
    Write-Host "     Copy `"$destName`" to your Android device via USB, Google Drive, or Telegram,"
    Write-Host "     and open it on your phone to install."
    Write-Host ""

} finally {
    Pop-Location
}
