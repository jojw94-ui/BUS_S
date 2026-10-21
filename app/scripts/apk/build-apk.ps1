# 개인 설치용 APK 빌드 (Windows, 로컬)
# 실행: powershell -ExecutionPolicy Bypass -File app\scripts\apk\build-apk.ps1
# 결과: dist\BUS_S-<버전>-arm64.apk
#
# 준비물 (한 번만): %LOCALAPPDATA%\bus-s-toolchain 에 JDK 17(jdk-17*)과 Android SDK(sdk\cmdline-tools\latest)
#   - 관리자 권한 없이 사용자 폴더에 설치한 것을 쓴다. 빠진 SDK 구성요소는 Gradle이 자동으로 받는다.
# 이 PC의 제약: Windows 보안 정책이 hermesc.exe 를 막아서, 바이트코드 변환 없이 일반 JS 번들로 넣는다
#   (hermesc-passthrough.cmd). 앱 동작은 같고 첫 실행이 조금 느릴 수 있다.
#   -NoBuiltinKey : 앱에 내 API 키를 넣지 않는다 (다른 사람에게 줄 APK — 각자 앱에서 키 입력)
#   -Clean        : 네이티브 프로젝트(app\android)를 지우고 새로 만든다 (app.json·네이티브 패키지를 바꿨을 때)
param([switch]$NoBuiltinKey, [switch]$Clean)
$ErrorActionPreference = 'Stop'

$Toolchain = Join-Path $env:LOCALAPPDATA 'bus-s-toolchain'
$AppDir = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$RepoDir = Resolve-Path (Join-Path $AppDir '..')
$Passthrough = Join-Path $PSScriptRoot 'hermesc-passthrough.cmd'

$jdk = Get-ChildItem $Toolchain -Directory -Filter 'jdk-17*' | Select-Object -First 1
if (-not $jdk) { throw "JDK 17 이 없습니다: $Toolchain\jdk-17*" }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = Join-Path $Toolchain 'sdk'
if (-not (Test-Path (Join-Path $env:ANDROID_HOME 'cmdline-tools\latest'))) { throw "Android SDK 가 없습니다: $env:ANDROID_HOME" }
if ($NoBuiltinKey) {
  # 이미 있는 환경변수는 .env 가 덮어쓰지 않으므로, 빈 값으로 두면 키 없이 번들된다
  $env:EXPO_PUBLIC_BUSAN_BIMS_API_KEY = ''
} elseif (-not (Test-Path (Join-Path $AppDir '.env'))) { throw 'app\.env (EXPO_PUBLIC_BUSAN_BIMS_API_KEY) 가 없습니다' }

# 1. 네이티브 프로젝트 생성 (app\android, git 에 올리지 않는 생성물). 이미 있으면 그대로 쓴다.
$android = Join-Path $AppDir 'android'
if ($Clean -or -not (Test-Path (Join-Path $android 'app\build.gradle'))) {
  Push-Location $AppDir
  try {
    $env:CI = '1'
    $prebuildArgs = @('expo', 'prebuild', '--platform', 'android', '--no-install')
    if ($Clean) { $prebuildArgs += '--clean' }
    npx @prebuildArgs
    if ($LASTEXITCODE -ne 0) { throw 'expo prebuild 실패 (app\android 폴더를 다른 프로그램이 쓰고 있으면 닫고 다시 실행)' }
  } finally { Pop-Location }
}

# 2. 이 PC용 설정: SDK 경로, hermesc 대체, 소스맵 합성 생략
Set-Content -Encoding ascii (Join-Path $android 'local.properties') ("sdk.dir=" + ($env:ANDROID_HOME -replace '\\', '\\'))
$gradleFile = Join-Path $android 'app\build.gradle'
$gradle = Get-Content -Raw -Encoding utf8 $gradleFile
$gradle = [regex]::Replace($gradle, '(?m)^\s*hermesCommand = .*$', "    hermesCommand = '$($Passthrough -replace '\\', '/')'")
if ($gradle -notmatch '(?m)^\s*hermesFlags = ') {
  $gradle = $gradle -replace '(?m)^(\s*hermesCommand = .*)$', "`$1`n    hermesFlags = ['-O']"
}
# PowerShell 5.1 의 Set-Content -Encoding utf8 은 BOM 을 붙여 Gradle 이 파일을 못 읽는다 → BOM 없이 쓴다
[IO.File]::WriteAllText($gradleFile, $gradle, (New-Object Text.UTF8Encoding $false))

# 3. 빌드 (64비트 폰 전용)
Push-Location $android
try {
  $env:NODE_ENV = 'production'
  .\gradlew.bat assembleRelease '-PreactNativeArchitectures=arm64-v8a'
  if ($LASTEXITCODE -ne 0) { throw 'Gradle 빌드 실패' }
} finally { Pop-Location }

# 4. 결과 복사
$version = (Get-Content -Raw (Join-Path $AppDir 'app.json') | ConvertFrom-Json).expo.version
$dist = Join-Path $RepoDir 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$suffix = if ($NoBuiltinKey) { '-nokey' } else { '' }
$apk = Join-Path $dist "BUS_S-$version-arm64$suffix.apk"
Copy-Item (Join-Path $android 'app\build\outputs\apk\release\app-release.apk') $apk -Force
$mb = [math]::Round((Get-Item $apk).Length / 1MB, 1)
Write-Host "완료: $apk ($mb MB)"
