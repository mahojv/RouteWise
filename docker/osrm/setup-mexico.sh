#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
PROFILE_FILE="$SCRIPT_DIR/routewise.lua"

mkdir -p "$DATA_DIR"

if [ ! -f "$PROFILE_FILE" ]; then
  echo "❌ Error: No se encontró el perfil $PROFILE_FILE"
  exit 1
fi

echo "📍 Descargando datos OSM de México desde Geofabrik..."
if [ ! -f "$DATA_DIR/mexico-latest.osm.pbf" ]; then
  curl -L -o "$DATA_DIR/mexico-latest.osm.pbf" https://download.geofabrik.de/north-america/mexico-latest.osm.pbf
else
  echo "✓ Archivo mexico-latest.osm.pbf ya existe."
fi

echo "⚙️ Ejecutando osrm-extract con perfil routewise.lua..."
docker run -t -v "$DATA_DIR:/data" -v "$PROFILE_FILE:/opt/routewise.lua:ro" osrm/osrm-backend:latest osrm-extract -p /opt/routewise.lua /data/mexico-latest.osm.pbf

echo "⚙️ Ejecutando osrm-partition..."
docker run -t -v "$DATA_DIR:/data" osrm/osrm-backend:latest osrm-partition /data/mexico-latest.osrm

echo "⚙️ Ejecutando osrm-customize..."
docker run -t -v "$DATA_DIR:/data" osrm/osrm-backend:latest osrm-customize /data/mexico-latest.osrm

echo "✅ Dataset de OSRM México preparado exitosamente en $DATA_DIR"
