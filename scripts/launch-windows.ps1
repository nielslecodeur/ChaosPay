param([ValidateSet('Dashboard', 'Testnet', 'Install')][string]$Mode = 'Dashboard')
$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
    $guard = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 3002)
    try { $guard.Start() } catch { throw 'Fermez le serveur local sur le port 3002 avant de lancer ou configurer Lumaid.' } finally { $guard.Stop() }
    $version = '24.12.0'
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Windows 64 bits requis.' }
    $cache = Join-Path $env:LOCALAPPDATA 'Lumaid\runtime'
    $name = "node-v$version-win-$arch"
    $runtime = Join-Path $cache $name
    $node = Join-Path $runtime 'node.exe'
    if (-not (Test-Path -LiteralPath $node)) {
        Write-Host 'Preparation du moteur portable...'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $stage = Join-Path $cache ([guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force -Path $stage | Out-Null
        $archive = Join-Path $stage "$name.zip"
        $base = "https://nodejs.org/dist/v$version"
        Invoke-WebRequest "$base/$name.zip" -OutFile $archive -UseBasicParsing
        $checksums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content
        $line = @($checksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $name.zip") })
        if ($line.Count -ne 1) { throw 'Somme de controle introuvable.' }
        $expected = ($line[0].Trim() -split '\s+')[0]
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) { throw 'Verification SHA256 echouee.' }
        Expand-Archive -LiteralPath $archive -DestinationPath $stage
        Move-Item -LiteralPath (Join-Path $stage $name) -Destination $runtime
        Remove-Item -LiteralPath $archive
        Remove-Item -LiteralPath $stage
    }
    $env:PATH = "$runtime;$env:PATH"
    if ((& $node --version) -ne "v$version") { throw 'Version du moteur incorrecte.' }
    $npm = Join-Path $runtime 'node_modules\npm\bin\npm-cli.js'
    New-Item -ItemType Directory -Force -Path '.local' | Out-Null
    $stamp = '.local/portable-install.txt'
    $fingerprint = "$version-$arch-" + (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash
    if (-not (Test-Path 'node_modules/tsx/dist/cli.mjs') -or -not (Test-Path $stamp) -or (Get-Content $stamp -Raw).Trim() -ne $fingerprint) {
        Write-Host 'Installation des dependances...'
        & $node $npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Installation interrompue. Fermez les autres processus du projet, verifiez votre connexion puis relancez.' }
        Set-Content -LiteralPath $stamp -Value $fingerprint -Encoding ascii
    }
    if ($Mode -eq 'Install') { Write-Host 'Lumaid est pret.'; exit 0 }
    if ($Mode -eq 'Testnet') {
        if (Test-Path '.env') {
            Write-Host 'Configuration existante conservee.'
            & $node $npm run check:connections
        } else {
            Write-Host 'Creation de comptes Stellar Testnet avec des fonds de test.'
            & $node $npm run setup:testnet
        }
        if ($LASTEXITCODE -ne 0) { throw 'Configuration incomplete. Conservez .env et consultez le message ci-dessus.' }
        exit 0
    }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 3002)
    try { $listener.Start() } catch { throw 'Port 3002 deja utilise. Fermez le precedent serveur.' } finally { $listener.Stop() }
    Write-Host 'Lumaid : http://127.0.0.1:3002 - gardez cette fenetre ouverte. Ctrl+C pour arreter.'
    $browser = Start-Job {
        for ($i = 0; $i -lt 45; $i++) {
            try {
                $response = Invoke-WebRequest 'http://127.0.0.1:3002' -UseBasicParsing -TimeoutSec 1
                if ($response.StatusCode -eq 200) { Start-Process 'http://127.0.0.1:3002'; break }
            } catch {}
            Start-Sleep -Seconds 1
        }
    }
    try {
        & $node 'node_modules/tsx/dist/cli.mjs' 'packages/runner/src/server.ts'
        if ($LASTEXITCODE -ne 0) { throw 'Le serveur a rencontre une erreur.' }
    } finally { Stop-Job $browser; Remove-Job $browser }
} catch {
    Write-Host ('Erreur : ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
