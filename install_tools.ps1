# ============================================================
# install_tools.ps1 — Ejecutar como Administrador
# Instala Solana CLI + Anchor CLI (avm v0.31.1)
# ============================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Instalando Solana CLI + Anchor CLI" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- 1. Instalar Solana CLI ---
Write-Host "`n[1/4] Descargando Solana CLI..." -ForegroundColor Yellow

$solanaInstaller = "$env:TEMP\solana-install-init.ps1"
$installDir = "$env:USERPROFILE\.local\share\solana\install"

# Descargar el instalador oficial de Solana
try {
    Invoke-WebRequest -Uri "https://release.anza.xyz/stable/install" -OutFile $solanaInstaller -UseBasicParsing
    Write-Host "  Descarga completada." -ForegroundColor Green
} catch {
    # Alternativa: descargar binario precompilado
    Write-Host "  Instalador oficial no disponible, descargando binario..." -ForegroundColor Yellow
    $solanaZip = "$env:TEMP\solana-cli.zip"
    $solanaUrl = "https://github.com/anza-xyz/agave/releases/download/v2.2.2/solana-release-x86_64-pc-windows-msvc.tar.bz2"
    
    # Usar .NET para descargar
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Write-Host "  Descargando desde GitHub..." -ForegroundColor Yellow
    
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($solanaUrl, "$env:TEMP\solana-cli.tar.bz2")
    
    # Extraer con tar (disponible en Windows 10+)
    $extractDir = "$env:USERPROFILE\solana-cli"
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
    tar -xjf "$env:TEMP\solana-cli.tar.bz2" -C $extractDir
    
    # Buscar el directorio bin
    $binDir = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
    $solanaBinPath = Join-Path $binDir.FullName "bin"
    
    # Agregar al PATH permanentemente
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$solanaBinPath*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$solanaBinPath", "User")
        $env:Path = "$env:Path;$solanaBinPath"
    }
    
    Write-Host "  Solana CLI instalado en: $solanaBinPath" -ForegroundColor Green
}

# Verificar instalación
$solanaExe = Get-Command solana -ErrorAction SilentlyContinue
if ($solanaExe) {
    Write-Host "  Solana CLI: $(solana --version)" -ForegroundColor Green
} else {
    Write-Host "  ADVERTENCIA: solana no encontrado en PATH. Puede requerir reiniciar terminal." -ForegroundColor Red
    Write-Host "  Intenta agregar manualmente el directorio bin al PATH." -ForegroundColor Yellow
}

# --- 2. Instalar Rust (si no existe) ---
Write-Host "`n[2/4] Verificando Rust..." -ForegroundColor Yellow
$rustup = Get-Command rustup -ErrorAction SilentlyContinue
if (-not $rustup) {
    Write-Host "  Instalando Rust via rustup..." -ForegroundColor Yellow
    $rustupInstaller = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest -Uri "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe" -OutFile $rustupInstaller -UseBasicParsing
    Start-Process -FilePath $rustupInstaller -ArgumentList "-y", "--default-toolchain", "stable" -Wait -NoNewWindow
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
    Write-Host "  Rust instalado." -ForegroundColor Green
} else {
    Write-Host "  Rust ya instalado: $(rustc --version)" -ForegroundColor Green
}

# --- 3. Instalar Anchor Version Manager (avm) ---
Write-Host "`n[3/4] Instalando Anchor CLI (avm)..." -ForegroundColor Yellow
try {
    $cargoPath = Get-Command cargo -ErrorAction SilentlyContinue
    if ($cargoPath) {
        cargo install --git https://github.com/coral-xyz/anchor avm --force 2>&1 | Write-Host
        $avmPath = "$env:USERPROFILE\.cargo\bin\avm.exe"
        if (Test-Path $avmPath) {
            & $avmPath install 0.31.1
            & $avmPath use 0.31.1
            Write-Host "  Anchor CLI instalado: $(anchor --version)" -ForegroundColor Green
        }
    } else {
        Write-Host "  Cargo no encontrado. Instala Rust primero: https://rustup.rs" -ForegroundColor Red
    }
} catch {
    Write-Host "  Error instalando Anchor: $_" -ForegroundColor Red
    Write-Host "  Intenta manualmente: cargo install --git https://github.com/coral-xyz/anchor avm" -ForegroundColor Yellow
}

# --- 4. Verificar PATH ---
Write-Host "`n[4/4] Verificando herramientas..." -ForegroundColor Yellow

$tools = @("solana", "anchor", "cargo", "rustc")
foreach ($tool in $tools) {
    $cmd = Get-Command $tool -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Host "  [OK] $tool encontrado: $($cmd.Source)" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] $tool no encontrado en PATH" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " Instalacion completada." -ForegroundColor Cyan
Write-Host " REINICIA la terminal y ejecuta:" -ForegroundColor Yellow
Write-Host "   solana --version" -ForegroundColor White
Write-Host "   anchor --version" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan