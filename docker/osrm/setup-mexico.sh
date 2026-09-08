#!/bin/bash
set -e

DATA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/data"
mkdir -p "$DATA_DIR"

echo "📍 Descargando datos OSM de México desde Geofabrik..."
if [ ! -f "$DATA_DIR/mexico-latest.osm.pbf" ]; then
  curl -L -o "$DATA_DIR/mexico-latest.osm.pbf" https://download.geofabrik.de/north-america/mexico-latest.osm.pbf
else
  echo "✓ Archivo mexico-latest.osm.pbf ya existe."
fi

echo "⚙️ Ejecutando osrm-extract con perfil car.lua..."
docker run -t -v "$DATA_DIR:/data" osrm/osrm-backend:latest osrm-extract -p /opt/car.lua /data/mexico-latest.osm.pbf

echo "⚙️ Ejecutando osrm-partition..."
docker run -t -v "$DATA_DIR:/data" osrm/osrm-backend:latest osrm-partition /data/mexico-latest.osrm

echo "⚙️ Ejecutando osrm-customize..."
docker run -t -v "$DATA_DIR:/data" osrm/osrm-backend:latest osrm-customize /data/mexico-latest.osrm

echo "✅ Dataset de OSRM México preparado exitosamente en $DATA_DIR"
