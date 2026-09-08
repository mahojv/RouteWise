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

Write-Host "⚙️ Ejecutando osrm-extract con perfil car.lua..." -ForegroundColor Cyan
docker run -t -v "${dataDir}:/data" osrm/osrm-backend:latest osrm-extract -p /opt/car.lua /data/mexico-latest.osm.pbf

Write-Host "⚙️ Ejecutando osrm-partition..." -ForegroundColor Cyan
docker run -t -v "${dataDir}:/data" osrm/osrm-backend:latest osrm-partition /data/mexico-latest.osrm

Write-Host "⚙️ Ejecutando osrm-customize..." -ForegroundColor Cyan
docker run -t -v "${dataDir}:/data" osrm/osrm-backend:latest osrm-customize /data/mexico-latest.osrm

Write-Host "✅ Dataset de OSRM México preparado exitosamente en $dataDir" -ForegroundColor Green
