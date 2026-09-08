import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Colors } from '../theme/colors';
import { RouteOption, Waypoint, TollEvent } from '@routewise/types';
import { MapPin, Navigation, X, DollarSign, ShieldAlert } from 'lucide-react-native';

interface MapViewProps {
  origin: Waypoint | null;
  destination: Waypoint | null;
  selectedRoute?: RouteOption | null;
  routes?: RouteOption[];
  onSelectToll?: (tollId: string) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  origin,
  destination,
  selectedRoute,
}) => {
  const [selectedToll, setSelectedToll] = useState<TollEvent | null>(null);

  const tolls: TollEvent[] = selectedRoute?.tolls || [];

  return (
    <View style={styles.container}>
      {/* Map visual canvas representation */}
      <View style={styles.mapCanvas}>
        {/* Origin Marker */}
        {origin && (
          <View style={[styles.marker, styles.originMarker]}>
            <MapPin size={16} color="#10B981" />
            <Text style={styles.markerText} numberOfLines={1}>
              {origin.label?.split(',')[0] || 'Origen'}
            </Text>
          </View>
        )}

        {/* Route Progress Visual Track with Placed Toll Plazas */}
        <View style={styles.routeVisualization}>
          <View style={styles.routeTrack}>
            {tolls.map((t, idx) => {
              const leftPercent = `${Math.min(92, Math.max(8, (t.routePosition || (idx + 1) / (tolls.length + 1)) * 100))}%`;
              const isUnknown = t.priceStatus === 'UNKNOWN';
              const isOutdated = t.priceStatus === 'OUTDATED';

              return (
                <TouchableOpacity
                  key={t.id || `${t.tollPlazaId}-${idx}`}
                  style={[
                    styles.tollPin,
                    { left: leftPercent as any },
                    isUnknown && styles.tollPinUnknown,
                    isOutdated && styles.tollPinOutdated,
                  ]}
                  onPress={() => setSelectedToll(t)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.tollPinIcon}>🛣️</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Quick Toll summary under track */}
          {tolls.length > 0 && (
            <View style={styles.tollPillsRow}>
              {tolls.map((t, idx) => (
                <TouchableOpacity
                  key={t.id || idx}
                  style={[
                    styles.tollPill,
                    t.priceStatus === 'UNKNOWN' && styles.tollPillUnknown,
                  ]}
                  onPress={() => setSelectedToll(t)}
                >
                  <Text style={styles.tollPillText}>
                    {t.name.split('(')[0].replace(/^Caseta\s+/i, '').trim()}:{' '}
                    {t.priceStatus === 'UNKNOWN' ? '?' : `$${t.price}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Destination Marker */}
        {destination && (
          <View style={[styles.marker, styles.destMarker]}>
            <Navigation size={16} color="#38BDF8" />
            <Text style={styles.markerText} numberOfLines={1}>
              {destination.label?.split(',')[0] || 'Destino'}
            </Text>
          </View>
        )}
      </View>

      {/* Toll Detail Inspection Modal */}
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

              <View style={styles.modalMetaRow}>
                {selectedToll.highway && (
                  <Text style={styles.modalHighway}>{selectedToll.highway}</Text>
                )}
                <Text style={styles.modalOperator}>{selectedToll.operator || 'CAPUFE'}</Text>
              </View>

              <View style={styles.modalPriceBox}>
                <DollarSign size={20} color={Colors.accentToll} />
                <Text style={styles.modalPriceValue}>
                  {selectedToll.priceStatus === 'UNKNOWN'
                    ? 'Tarifa no verificada'
                    : `$${selectedToll.price} MXN`}
                </Text>
              </View>

              {selectedToll.priceStatus === 'UNKNOWN' && (
                <View style={styles.modalAlert}>
                  <ShieldAlert size={16} color="#EF4444" />
                  <Text style={styles.modalAlertText}>
                    La tarifa oficial no está disponible en la base de datos para este tipo de vehículo.
                  </Text>
                </View>
              )}

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

      {/* MapLibre & OpenStreetMap attribution */}
      <View style={styles.attributionContainer}>
        <Text style={styles.attributionText}>© MapLibre | © OpenStreetMap contributors</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 250,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  mapCanvas: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  marker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 6,
    maxWidth: '70%',
  },
  originMarker: {
    borderColor: '#10B981',
  },
  destMarker: {
    borderColor: '#38BDF8',
    alignSelf: 'flex-end',
  },
  markerText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  routeVisualization: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  routeTrack: {
    height: 6,
    width: '90%',
    backgroundColor: Colors.accentPrimary,
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
  },
  tollPin: {
    position: 'absolute',
    top: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    borderColor: Colors.accentToll,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -14 }],
  },
  tollPinUnknown: {
    borderColor: '#EF4444',
  },
  tollPinOutdated: {
    borderColor: '#F59E0B',
  },
  tollPinIcon: {
    fontSize: 12,
  },
  tollPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 18,
    justifyContent: 'center',
  },
  tollPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: Colors.accentToll,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tollPillUnknown: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#EF4444',
  },
  tollPillText: {
    color: Colors.accentToll,
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalPlazaName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalMetaRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHighway: {
    backgroundColor: Colors.backgroundPrimary,
    color: Colors.accentPrimary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: '700',
  },
  modalOperator: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  modalPriceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.backgroundPrimary,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  modalPriceValue: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  modalAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalAlertText: {
    color: '#EF4444',
    fontSize: 11,
    flex: 1,
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
  attributionContainer: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    backgroundColor: 'rgba(10, 14, 23, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  attributionText: {
    color: Colors.textMuted,
    fontSize: 9,
  },
});
