import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';
import { Colors } from '../theme/colors';
import { PublicRouteOption, Waypoint, PublicTollPlaza } from '@routewise/types';
import { Maximize2, Minimize2, X, DollarSign } from 'lucide-react-native';

interface MapViewProps {
  origin: Waypoint | null;
  destination: Waypoint | null;
  selectedRoute?: PublicRouteOption | null;
  routes?: PublicRouteOption[];
  onSelectRoute?: (routeId: string) => void;
  fullHeight?: boolean;
}

export const MapView: React.FC<MapViewProps> = ({
  origin,
  destination,
  selectedRoute,
  routes = [],
  onSelectRoute,
  fullHeight = false,
}) => {
  const [selectedToll, setSelectedToll] = useState<PublicTollPlaza | null>(null);
  const [isExpanded, setIsExpanded] = useState(fullHeight);

  // Generate Leaflet + 100% Free OpenStreetMap HTML (No API Key Required)
  const generateMapHtml = () => {
    const originLat = origin?.latitude || 20.5888;
    const originLng = origin?.longitude || -100.3899;
    const originLabel = (origin?.label || 'Origen').replace(/'/g, "\\'");

    const destLat = destination?.latitude || 19.4326;
    const destLng = destination?.longitude || -99.1332;
    const destLabel = (destination?.label || 'Destino').replace(/'/g, "\\'");

    const formattedRoutes = routes.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      isSelected: r.id === selectedRoute?.id,
      coordinates: r.geometry?.coordinates || [],
      tolls: r.tolls || [],
    }));

    const activeTolls = selectedRoute?.tolls || [];

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #0A0E17;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .leaflet-container {
      background: #0A0E17;
    }
    /* Filter to apply sleek dark mode styling to standard free OpenStreetMap tiles */
    .dark-tiles .leaflet-tile-container img {
      filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3);
    }
    .toll-badge-marker {
      background: #F59E0B;
      color: #0F172A;
      font-weight: 900;
      font-size: 11px;
      padding: 3px 7px;
      border-radius: 12px;
      border: 1.5px solid #FFFFFF;
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      white-space: nowrap;
      text-align: center;
    }
    .origin-marker-pin {
      background: #10B981;
      color: #FFFFFF;
      font-weight: 800;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 8px;
      border: 1.5px solid #FFFFFF;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .dest-marker-pin {
      background: #38BDF8;
      color: #0F172A;
      font-weight: 800;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 8px;
      border: 1.5px solid #FFFFFF;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .leaflet-control-attribution {
      background: rgba(10, 14, 23, 0.8)5 !important;
      color: #94A3B8 !important;
      font-size: 9px !important;
    }
    .leaflet-control-attribution a {
      color: #38BDF8 !important;
    }
  </style>
</head>
<body>
  <div id="map" class="dark-tiles"></div>
  <script>
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: true
    }).setView([${originLat}, ${originLng}], 8);

    // 100% Free Official OpenStreetMap Tile Layer (NO API Key Required)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const routesData = ${JSON.stringify(formattedRoutes)};
    const bounds = L.latLngBounds();

    // Draw unselected routes first
    routesData.filter(r => !r.isSelected).forEach(r => {
      if (r.coordinates && r.coordinates.length > 0) {
        const latLngs = r.coordinates.map(c => [c[1], c[0]]);
        latLngs.forEach(ll => bounds.extend(ll));
        L.polyline(latLngs, {
          color: '#64748B',
          weight: 4,
          opacity: 0.6,
          dashArray: '6, 6'
        }).addTo(map);
      }
    });

    // Draw active selected route on top
    const activeRoute = routesData.find(r => r.isSelected);
    if (activeRoute && activeRoute.coordinates && activeRoute.coordinates.length > 0) {
      const latLngs = activeRoute.coordinates.map(c => [c[1], c[0]]);
      latLngs.forEach(ll => bounds.extend(ll));

      // Outer Glow line
      L.polyline(latLngs, {
        color: 'rgba(56, 189, 248, 0.4)',
        weight: 10,
        opacity: 0.8
      }).addTo(map);

      // Core Active line
      L.polyline(latLngs, {
        color: '#38BDF8',
        weight: 5,
        opacity: 1.0
      }).addTo(map);
    }

    // Origin Marker
    const originIcon = L.divIcon({
      className: 'custom-pin',
      html: '<div class="origin-marker-pin">🟢 ' + '${originLabel}' + '</div>',
      iconSize: [100, 30],
      iconAnchor: [50, 15]
    });
    L.marker([${originLat}, ${originLng}], { icon: originIcon }).addTo(map);
    bounds.extend([${originLat}, ${originLng}]);

    // Destination Marker
    const destIcon = L.divIcon({
      className: 'custom-pin',
      html: '<div class="dest-marker-pin">🏁 ' + '${destLabel}' + '</div>',
      iconSize: [100, 30],
      iconAnchor: [50, 15]
    });
    L.marker([${destLat}, ${destLng}], { icon: destIcon }).addTo(map);
    bounds.extend([${destLat}, ${destLng}]);

    // Active Toll Plazas Badges
    const tollsData = ${JSON.stringify(activeTolls)};
    tollsData.forEach(t => {
      if (t.latitude && t.longitude) {
        const tollIcon = L.divIcon({
          className: 'custom-toll-badge',
          html: '<div class="toll-badge-marker">🛣️ $' + t.price + '</div>',
          iconSize: [70, 24],
          iconAnchor: [35, 12]
        });
        L.marker([t.latitude, t.longitude], { icon: tollIcon })
          .addTo(map)
          .bindPopup('<b>' + t.name + '</b><br>Costo: $' + t.price + ' MXN');
      }
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  </script>
</body>
</html>
    `;
  };

  return (
    <View
      style={[
        styles.container,
        isExpanded ? styles.expandedContainer : styles.normalContainer,
      ]}
    >
      {/* 100% Free OpenStreetMap Tiles - No API Key Needed */}
      {Platform.OS === 'web' ? (
        <iframe
          title="Free OpenStreetMap of Mexico"
          srcDoc={generateMapHtml()}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 16,
          }}
        />
      ) : (
        <View style={styles.nativeFallbackMap}>
          <iframe
            title="Free OpenStreetMap of Mexico"
            srcDoc={generateMapHtml()}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        </View>
      )}

      {/* Floating Map Expand / Contract Control Button */}
      <View style={styles.mapControls}>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <Minimize2 size={16} color={Colors.textPrimary} />
          ) : (
            <Maximize2 size={16} color={Colors.textPrimary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Floating Alternative Route Selector Chips */}
      {routes.length > 1 && (
        <View style={styles.alternativesChipOverlay}>
          {routes.map((r) => {
            const isSelected = r.id === selectedRoute?.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[
                  styles.altChip,
                  isSelected ? styles.altChipActive : styles.altChipInactive,
                ]}
                onPress={() => onSelectRoute?.(r.id)}
              >
                <Text
                  style={[
                    styles.altChipText,
                    isSelected ? styles.altChipTextActive : styles.altChipTextInactive,
                  ]}
                >
                  {r.title} ({r.durationMinutes}m · ${r.cost?.direct ?? 0})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Toll Detail Modal */}
      {selectedToll && (
        <Modal
          transparent
          animationType="fade"
          visible={!!selectedToll}
          onRequestClose={() => setSelectedToll(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Detalle de Caseta</Text>
                <TouchableOpacity onPress={() => setSelectedToll(null)}>
                  <X size={20} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalPlazaName}>{selectedToll.name}</Text>

              <View style={styles.modalPriceBox}>
                <DollarSign size={20} color={Colors.accentToll} />
                <Text style={styles.modalPriceValue}>${selectedToll.price} MXN</Text>
              </View>

              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedToll(null)}
              >
                <Text style={styles.modalCloseBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0A0E17',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  normalContainer: {
    height: 300,
  },
  expandedContainer: {
    height: 480,
  },
  nativeFallbackMap: {
    width: '100%',
    height: '100%',
  },
  mapControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  alternativesChipOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
    zIndex: 10,
  },
  altChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
  },
  altChipActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#FFFFFF',
  },
  altChipInactive: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  altChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  altChipTextActive: {
    color: '#0F172A',
    fontWeight: '900',
  },
  altChipTextInactive: {
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalPlazaName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalPriceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.backgroundPrimary,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalPriceValue: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  modalCloseBtn: {
    backgroundColor: Colors.backgroundCardElevated,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
});
