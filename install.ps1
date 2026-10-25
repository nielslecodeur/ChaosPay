param(
  [string]$InstallDir,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$repository = "https://github.com/nielslecodeur/Lumaid.git"

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Install Git and Node.js 24+ (which includes npm), then rerun this installer."
  }
}

Assert-Command "git"
Assert-Command "node"
Assert-Command "npm"

$nodeVersion = (& node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v?(\d+)\.') {
  throw "Could not determine the Node.js version from '$nodeVersion'."
}
if ([int]$Matches[1] -lt 24) {
  throw "Node.js 24 or newer is required; found $nodeVersion. Install a current LTS release from https://nodejs.org/ and retry."
}

if ($CheckOnly) {
  Write-Output "Prerequisites OK: Node.js $nodeVersion, npm and Git are available. No files were changed."
  exit 0
}

$scriptRoot = $PSScriptRoot
$packagePath = Join-Path $scriptRoot "package.json"
if (Test-Path -LiteralPath $packagePath) {
  $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  if ($package.name -ne "chaospay") {
    throw "The installer is next to a package.json, but it is not the ChaosPay repository."
  }
  $projectDir = $scriptRoot
} else {
  if (-not $InstallDir) {
    $InstallDir = Join-Path $HOME "chaospay"
  }
  $projectDir = [System.IO.Path]::GetFullPath($InstallDir)
  if (Test-Path -LiteralPath $projectDir) {
    $existingPackagePath = Join-Path $projectDir "package.json"
    if (-not (Test-Path -LiteralPath $existingPackagePath)) {
      throw "Install directory already exists and is not a ChaosPay checkout: $projectDir"
    }
    $existingPackage = Get-Content -LiteralPath $existingPackagePath -Raw | ConvertFrom-Json
    if ($existingPackage.name -ne "chaospay") {
      throw "Install directory already exists and is not a ChaosPay checkout: $projectDir"
    }
    Write-Output "Using existing ChaosPay checkout: $projectDir"
  } else {
    $parent = Split-Path -Parent $projectDir
    if (-not (Test-Path -LiteralPath $parent)) {
      throw "Parent directory does not exist: $parent"
    }
    & git clone --depth 1 $repository $projectDir
    if ($LASTEXITCODE -ne 0) {
      throw "Git clone failed with exit code $LASTEXITCODE."
    }
  }
}

Push-Location $projectDir
try {
  & npm ci
  if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

Write-Output ""
Write-Output "ChaosPay dependencies installed in $projectDir"
Write-Output "Start the local dashboard with: npm run dev:dashboard"
Write-Output "Then open: http://127.0.0.1:3002"
Write-Output "This does not create Stellar keys or submit payments."
