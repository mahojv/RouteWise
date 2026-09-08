import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RouteOption } from '@routewise/types';
import { Card } from './Card';
import { Colors } from '../theme/colors';
import { Clock, Navigation, DollarSign, AlertCircle, AlertTriangle } from 'lucide-react-native';

interface RouteCardProps {
  route: RouteOption;
  isSelected: boolean;
  onSelect: () => void;
}

export const RouteCard: React.FC<RouteCardProps> = ({
  route,
  isSelected,
  onSelect,
}) => {
  const hours = Math.floor(route.durationSeconds / 3600);
  const minutes = Math.round((route.durationSeconds % 3600) / 60);
  const distanceKm = Math.round(route.distanceMeters / 1000);
  const directCost = route.cost?.direct ?? route.totalCost;
  const tollCost = route.cost?.tolls ?? route.tollCost;
  const fuelCost = route.cost?.fuel ?? route.fuelCost;
  const hasUnknown = route.cost?.hasUnknownTolls;
  const hasOutdated = route.cost?.hasOutdatedTolls;

  return (
    <TouchableOpacity onPress={onSelect} activeOpacity={0.9} style={styles.container}>
      <Card
        highlighted={isSelected}
        elevated={isSelected}
        style={[styles.card, isSelected && styles.selectedCard]}
      >
        {/* Header: Title & Badges */}
        <View style={styles.headerRow}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{route.title}</Text>
            {route.explanation?.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{route.explanation.badge}</Text>
              </View>
            )}
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.priceTotal}>${directCost}</Text>
            <Text style={styles.priceCurrency}>MXN</Text>
          </View>
        </View>

        {/* Metrics Row: Time & Distance */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Clock size={15} color={Colors.accentPrimary} />
            <Text style={styles.metricText}>
              {hours > 0 ? `${hours} h ` : ''}{minutes} min
            </Text>
          </View>
          <View style={styles.metricDot} />
          <View style={styles.metricItem}>
            <Navigation size={15} color={Colors.textSecondary} />
            <Text style={styles.metricText}>{distanceKm} km</Text>
          </View>
          <View style={styles.metricDot} />
          <View style={styles.metricItem}>
            <DollarSign size={15} color={Colors.accentToll} />
            <Text style={[styles.metricText, styles.tollText]}>
              ${tollCost} casetas
            </Text>
          </View>
        </View>

        {/* Status Warnings */}
        {(hasUnknown || hasOutdated) && (
          <View style={styles.statusRow}>
            {hasUnknown && (
              <View style={styles.warningBadgeUnknown}>
                <AlertCircle size={13} color="#EF4444" />
                <Text style={styles.warningTextUnknown}>Tarifa por verificar</Text>
              </View>
            )}
            {hasOutdated && (
              <View style={styles.warningBadgeOutdated}>
                <AlertTriangle size={13} color="#F59E0B" />
                <Text style={styles.warningTextOutdated}>Precio estimado</Text>
              </View>
            )}
          </View>
        )}

        {/* Cost Breakdown Pills */}
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownPill}>
            <Text style={styles.breakdownLabel}>Gasolina</Text>
            <Text style={styles.breakdownValue}>${fuelCost}</Text>
          </View>
          <View style={styles.breakdownPill}>
            <Text style={styles.breakdownLabel}>Casetas ({route.tolls?.length || route.tollPlazas?.length || 0})</Text>
            <Text style={styles.breakdownValue}>${tollCost}</Text>
          </View>
          {route.cost?.time > 0 && (
            <View style={styles.breakdownPill}>
              <Text style={styles.breakdownLabel}>Valor Tiempo</Text>
              <Text style={styles.breakdownValue}>${route.cost.time}</Text>
            </View>
          )}
        </View>

        {/* Comparison Details */}
        {route.comparison?.vsCheapest && route.comparison.vsCheapest.minutesSaved > 0 && (
          <View style={styles.comparisonBox}>
            <Text style={styles.comparisonText}>
              ⏱️ Ahorras {route.comparison.vsCheapest.minutesSaved} min por solo ${route.comparison.vsCheapest.extraMoney} más
              {route.comparison.vsCheapest.costPerMinuteSaved ? ` ($${route.comparison.vsCheapest.costPerMinuteSaved}/min)` : ''}
            </Text>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  card: {
    padding: 14,
  },
  selectedCard: {
    borderColor: Colors.accentPrimary,
    borderWidth: 2,
    backgroundColor: '#1E293B',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: Colors.accentPrimary,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  badgeText: {
    color: Colors.accentPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  priceTotal: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  priceCurrency: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metricDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    marginHorizontal: 8,
  },
  metricText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tollText: {
    color: Colors.accentToll,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  warningBadgeUnknown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  warningTextUnknown: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
  },
  warningBadgeOutdated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  warningTextOutdated: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  breakdownPill: {
    backgroundColor: Colors.backgroundPrimary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  breakdownLabel: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  breakdownValue: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  comparisonBox: {
    marginTop: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentSuccess,
    padding: 6,
    borderRadius: 4,
  },
  comparisonText: {
    color: Colors.accentSuccess,
    fontSize: 11,
    fontWeight: '600',
  },
});
