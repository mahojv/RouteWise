import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../src/theme/colors';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Button';
import { MapView } from '../src/components/MapView';
import { RouteCard } from '../src/components/RouteCard';
import { TollList } from '../src/components/TollList';
import { useRouteStore } from '../src/store/routeStore';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react-native';

export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'routes' | 'tolls' | 'breakdown'>('routes');

  const {
    origin,
    destination,
    searchResult,
    selectedRouteId,
    setSelectedRouteId,
    executeSearch,
    status,
  } = useRouteStore();

  const routes = searchResult?.routes || [];
  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  const handleRecalculate = async () => {
    await executeSearch();
  };

  const directCost = selectedRoute?.cost?.direct ?? 0;
  const tollCost = selectedRoute?.cost?.tolls ?? 0;
  const fuelCost = selectedRoute?.cost?.fuel ?? 0;
  const timeCost = selectedRoute?.cost?.time ?? 0;
  const generalizedCost = selectedRoute?.cost?.generalized ?? directCost;

  if (!searchResult || routes.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: Math.max(24, insets.top + 16), paddingBottom: Math.max(24, insets.bottom + 16) }]}>
        <View style={styles.emptyContent}>
          <AlertCircle size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No hay resultados de búsqueda</Text>
          <Text style={styles.emptySubtitle}>Realiza una nueva búsqueda de rutas para ver alternativas.</Text>
          <Button
            title="IR A BÚSQUEDA"
            onPress={() => router.replace('/')}
            style={{ marginTop: 16 }}
          />
        </View>
      </View>
    );
  }

  const hours = selectedRoute ? Math.floor(selectedRoute.durationMinutes / 60) : 0;
  const minutes = selectedRoute ? Math.round(selectedRoute.durationMinutes % 60) : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(16, insets.top + 8),
            paddingBottom: Math.max(64, insets.bottom + 48),
          },
        ]}
      >
        {/* Navigation & Route Title */}
        <View style={styles.routeHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.routeHeaderInfo}>
            <Text style={styles.routeTitle} numberOfLines={1}>
              {origin?.label?.split(',')[0] || 'Origen'} ➔ {destination?.label?.split(',')[0] || 'Destino'}
            </Text>
            <Text style={styles.routeSubtitle}>
              {routes.length} alternativas optimizadas
            </Text>
          </View>
        </View>

        {/* Map Visualization */}
        <MapView
          origin={origin}
          destination={destination}
          selectedRoute={selectedRoute}
          routes={routes}
          onSelectRoute={(id) => setSelectedRouteId(id)}
        />

        {/* Navigation Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'routes' && styles.tabButtonActive]}
            onPress={() => setActiveTab('routes')}
          >
            <Text style={[styles.tabText, activeTab === 'routes' && styles.tabTextActive]}>
              Alternativas ({routes.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'tolls' && styles.tabButtonActive]}
            onPress={() => setActiveTab('tolls')}
          >
            <Text style={[styles.tabText, activeTab === 'tolls' && styles.tabTextActive]}>
              Casetas ({selectedRoute?.tolls?.length || 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'breakdown' && styles.tabButtonActive]}
            onPress={() => setActiveTab('breakdown')}
          >
            <Text style={[styles.tabText, activeTab === 'breakdown' && styles.tabTextActive]}>
              Desglose Económico
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: ALL ROUTES */}
        {activeTab === 'routes' && (
          <View style={styles.tabContent}>
            {/* Recommended Feature Card */}
            {selectedRoute && (
              <Card elevated highlighted style={styles.featureCard}>
                <View style={styles.featureHeader}>
                  <View style={styles.featureBadge}>
                    <Text style={styles.featureBadgeText}>
                      {selectedRoute.explanation?.badge || '🏆 Opción Recomendada'}
                    </Text>
                  </View>
                  <Text style={styles.featurePrice}>${directCost} MXN</Text>
                </View>

                <View style={styles.featureMetrics}>
                  <Text style={styles.featureTime}>
                    {hours > 0 ? `${hours}h ` : ''}{minutes}m
                  </Text>
                  <Text style={styles.featureDot}>·</Text>
                  <Text style={styles.featureDistance}>
                    {Math.round(selectedRoute.distanceKm)} km
                  </Text>
                  <Text style={styles.featureDot}>·</Text>
                  <Text style={styles.featureTolls}>
                    ${tollCost} casetas
                  </Text>
                </View>

                <Text style={styles.featureExplanation}>
                  {selectedRoute.explanation?.description}
                </Text>
              </Card>
            )}

            <Text style={styles.sectionTitle}>TODAS LAS ALTERNATIVAS</Text>
            {routes.map((r) => (
              <RouteCard
                key={r.id}
                route={r}
                isSelected={r.id === selectedRoute?.id}
                onSelect={() => setSelectedRouteId(r.id)}
              />
            ))}
          </View>
        )}

        {/* TAB 2: TOLLS */}
        {activeTab === 'tolls' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>CASETAS EN RUTA SELECCIONADA</Text>
            <TollList tolls={selectedRoute?.tolls || []} />
          </View>
        )}

        {/* TAB 3: COST BREAKDOWN */}
        {activeTab === 'breakdown' && selectedRoute && (
          <View style={styles.tabContent}>
            <Card elevated style={styles.breakdownDetailCard}>
              <Text style={styles.breakdownDetailTitle}>Desglose Real del Trayecto</Text>

              <View style={styles.breakdownDetailRow}>
                <Text style={styles.breakdownDetailLabel}>Combustible estimado</Text>
                <Text style={styles.breakdownDetailValue}>${fuelCost} MXN</Text>
              </View>

              <View style={styles.breakdownDetailRow}>
                <Text style={styles.breakdownDetailLabel}>Casetas de cuota ({selectedRoute.tolls?.length || 0})</Text>
                <Text style={styles.breakdownDetailValue}>${tollCost} MXN</Text>
              </View>

              <View style={[styles.breakdownDetailRow, styles.directTotalRow]}>
                <Text style={styles.directTotalLabel}>Gasto Directo (Bolsillo)</Text>
                <Text style={styles.directTotalValue}>${directCost} MXN</Text>
              </View>

              <View style={styles.breakdownDetailRow}>
                <Text style={styles.breakdownDetailLabel}>Valor del tiempo ({Math.round(selectedRoute.durationMinutes)} min)</Text>
                <Text style={styles.breakdownDetailValue}>${timeCost} MXN</Text>
              </View>

              <View style={[styles.breakdownDetailRow, styles.generalizedTotalRow]}>
                <Text style={styles.generalizedTotalLabel}>Costo Generalizado Total</Text>
                <Text style={styles.generalizedTotalValue}>${generalizedCost} MXN</Text>
              </View>
            </Card>
          </View>
        )}

        {/* Recalculate / Action Button */}
        <Button
          title="RECALCULAR ALTERNATIVAS"
          variant="secondary"
          size="md"
          loading={status === 'loading'}
          onPress={handleRecalculate}
          style={styles.recalculateBtn}
          icon={<RefreshCw size={18} color={Colors.textPrimary} />}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundPrimary,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,

  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.backgroundCardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  routeHeaderInfo: {
    flex: 1,
  },
  routeTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  routeSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundCard,
    borderRadius: 10,
    padding: 4,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: Colors.accentPrimary,
  },
  tabText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  tabContent: {
    marginTop: 10,
  },
  featureCard: {
    marginTop: 8,
    marginBottom: 12,
    padding: 16,
    borderColor: Colors.accentPrimary,
    borderWidth: 1.5,
  },
  featureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  featureBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  featureBadgeText: {
    color: Colors.accentPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  featurePrice: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  featureMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  featureTime: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  featureDot: {
    color: Colors.textMuted,
    marginHorizontal: 6,
  },
  featureDistance: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  featureTolls: {
    color: Colors.accentToll,
    fontSize: 14,
    fontWeight: '600',
  },
  featureExplanation: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 8,
  },
  breakdownDetailCard: {
    padding: 16,
    gap: 12,
  },
  breakdownDetailTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  breakdownDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownDetailLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  breakdownDetailValue: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  directTotalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    paddingTop: 10,
  },
  directTotalLabel: {
    color: Colors.accentPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  directTotalValue: {
    color: Colors.accentPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  generalizedTotalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    paddingTop: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
    marginHorizontal: -14,
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  generalizedTotalLabel: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  generalizedTotalValue: {
    color: Colors.accentSuccess,
    fontSize: 16,
    fontWeight: '800',
  },
  recalculateBtn: {
    marginTop: 20,
  },
});
