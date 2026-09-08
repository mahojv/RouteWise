import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TollEvent } from '@routewise/types';
import { Card } from './Card';
import { Colors } from '../theme/colors';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react-native';

interface TollListProps {
  tolls: TollEvent[];
  avoidTollIds: string[];
  onToggleAvoid: (tollId: string) => void;
}

export const TollList: React.FC<TollListProps> = ({
  tolls,
  avoidTollIds,
  onToggleAvoid,
}) => {
  if (!tolls || tolls.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No hay casetas de cobro en esta ruta (100% Libre).</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {tolls.map((toll, index) => {
        const isAvoided = avoidTollIds.includes(toll.tollPlazaId);
        const progressPercent = Math.round((toll.routePosition || 0) * 100);

        return (
          <Card key={toll.id || `${toll.tollPlazaId}-${index}`} style={styles.tollCard}>
            <View style={styles.topRow}>
              <View style={styles.plazaInfo}>
                <View style={styles.nameHeader}>
                  <Text style={styles.tollIndex}>#{index + 1}</Text>
                  <Text style={styles.tollName}>{toll.name}</Text>
                </View>
                <View style={styles.metaRow}>
                  {toll.highway && (
                    <Text style={styles.highwayBadge}>{toll.highway}</Text>
                  )}
                  {toll.operator && (
                    <Text style={styles.operatorText}>{toll.operator}</Text>
                  )}
                  <Text style={styles.progressText}>Al {progressPercent}% del viaje</Text>
                </View>
              </View>

              <View style={styles.priceContainer}>
                {toll.priceStatus === 'UNKNOWN' ? (
                  <View style={styles.unknownPriceBadge}>
                    <Text style={styles.unknownPriceText}>Por verificar</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.priceValue}>${toll.price}</Text>
                    <Text style={styles.priceCurrency}>MXN</Text>
                  </>
                )}
              </View>
            </View>

            {/* Price Status Banner */}
            {toll.priceStatus === 'UNKNOWN' && (
              <View style={styles.statusBannerUnknown}>
                <AlertCircle size={14} color="#EF4444" />
                <Text style={styles.statusBannerTextUnknown}>
                  Tarifa oficial no disponible para este vehículo. No se asume $0.
                </Text>
              </View>
            )}

            {toll.priceStatus === 'OUTDATED' && (
              <View style={styles.statusBannerOutdated}>
                <AlertTriangle size={14} color="#F59E0B" />
                <Text style={styles.statusBannerTextOutdated}>
                  Tarifa histórica. Podría presentar ligeras variaciones recientes.
                </Text>
              </View>
            )}

            {toll.priceStatus === 'VALID' && (
              <View style={styles.statusBannerValid}>
                <CheckCircle2 size={14} color="#10B981" />
                <Text style={styles.statusBannerTextValid}>
                  Tarifa oficial CAPUFE verificada
                </Text>
              </View>
            )}

            {/* Action Toggle */}
            <View style={styles.bottomRow}>
              <TouchableOpacity
                style={[
                  styles.avoidBtn,
                  isAvoided ? styles.avoidBtnActive : styles.avoidBtnInactive,
                ]}
                onPress={() => onToggleAvoid(toll.tollPlazaId)}
              >
                <Text
                  style={[
                    styles.avoidBtnText,
                    isAvoided ? styles.avoidBtnTextActive : styles.avoidBtnTextInactive,
                  ]}
                >
                  {isAvoided ? 'Caseta Evitada (Desactivar desvío)' : 'Evitar esta caseta'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  emptyContainer: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
  },
  emptyText: {
    color: Colors.accentSuccess,
    fontSize: 13,
    fontWeight: '600',
  },
  tollCard: {
    padding: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  plazaInfo: {
    flex: 1,
    paddingRight: 10,
  },
  nameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tollIndex: {
    color: Colors.accentPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  tollName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  highwayBadge: {
    backgroundColor: Colors.backgroundPrimary,
    color: Colors.accentPrimary,
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  operatorText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  progressText: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  priceValue: {
    color: Colors.accentToll,
    fontSize: 18,
    fontWeight: '800',
  },
  priceCurrency: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  unknownPriceBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unknownPriceText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBannerUnknown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  statusBannerTextUnknown: {
    color: '#EF4444',
    fontSize: 11,
  },
  statusBannerOutdated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  statusBannerTextOutdated: {
    color: '#F59E0B',
    fontSize: 11,
  },
  statusBannerValid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  statusBannerTextValid: {
    color: '#10B981',
    fontSize: 11,
  },
  bottomRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  avoidBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  avoidBtnInactive: {
    backgroundColor: 'transparent',
    borderColor: Colors.borderSubtle,
  },
  avoidBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
  },
  avoidBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  avoidBtnTextInactive: {
    color: Colors.textSecondary,
  },
  avoidBtnTextActive: {
    color: '#EF4444',
  },
});
