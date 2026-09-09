$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $scriptDir "data"

if (!(Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
}

$osmFile = Join-Path $dataDir "mexico-latest.osm.pbf"
$pbfUrl = "https://download.geofabrik.de/north-america/mexico-latest.osm.pbf"

Write-Host "📍 Descargando datos OSM de México desde Geofabrik..." -ForegroundColor Cyan
if (!(Test-Path $osmFile)) {
    Invoke-WebRequest -Uri $pbfUrl -OutFile $osmFile
} else {
    Write-Host "✓ Archivo mexico-latest.osm.pbf ya existe." -ForegroundColor Green
}

$profileFile = Join-Path $scriptDir "routewise.lua"
if (!(Test-Path $profileFile)) {
    Write-Host "❌ Error: No se encontró el perfil $profileFile" -ForegroundColor Red
    exit 1
}

# Función auxiliar para ejecutar comandos Docker y verificar exit code ($LASTEXITCODE)
function Assert-DockerCommand {
    param (
        [string]$StageName,
        [string[]]$DockerArgs
    )
    Write-Host "⚙️ Ejecutando $StageName..." -ForegroundColor Cyan
    & docker $DockerArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error: La etapa '$StageName' falló con Exit Code $LASTEXITCODE." -ForegroundColor Red
        Write-Host "⚠️ Atención: El procesamiento fue interrumpido o falló. Pueden existir archivos parciales/corruptos en: $dataDir" -ForegroundColor Yellow
        Write-Host "⚠️ Se recomienda eliminar los archivos derivados mexico-latest.osrm* antes de volver a intentar." -ForegroundColor Yellow
        exit $LASTEXITCODE
    }
}

Assert-DockerCommand -StageName "osrm-extract" -DockerArgs @("run", "-t", "-v", "${dataDir}:/data", "-v", "${profileFile}:/opt/routewise.lua:ro", "osrm/osrm-backend:latest", "osrm-extract", "-p", "/opt/routewise.lua", "/data/mexico-latest.osm.pbf")

Assert-DockerCommand -StageName "osrm-partition" -DockerArgs @("run", "-t", "-v", "${dataDir}:/data", "osrm/osrm-backend:latest", "osrm-partition", "/data/mexico-latest.osrm")

Assert-DockerCommand -StageName "osrm-customize" -DockerArgs @("run", "-t", "-v", "${dataDir}:/data", "osrm/osrm-backend:latest", "osrm-customize", "/data/mexico-latest.osrm")

# Validación final de archivos generados requeridos
$requiredFiles = @(
    "mexico-latest.osrm",
    "mexico-latest.osrm.partition",
    "mexico-latest.osrm.cells",
    "mexico-latest.osrm.ebg",
    "mexico-latest.osrm.enw"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    $filePath = Join-Path $dataDir $file
    if (!(Test-Path $filePath)) {
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "❌ Error: Faltan archivos requeridos generados por OSRM:" -ForegroundColor Red
    foreach ($mf in $missingFiles) {
        Write-Host "  - Faltante: $mf" -ForegroundColor Red
    }
    Write-Host "⚠️ El proceso no completó de forma íntegra. Elimina los archivos generados incompletos y vuelve a intentar." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Dataset de OSRM México preparado exitosamente en $dataDir" -ForegroundColor Green

