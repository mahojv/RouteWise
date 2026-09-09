import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PublicTollPlaza } from '@routewise/types';
import { Card } from './Card';
import { Colors } from '../theme/colors';

interface TollListProps {
  tolls: PublicTollPlaza[];
}

export const TollList: React.FC<TollListProps> = ({ tolls }) => {
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
        return (
          <Card key={toll.id || `toll-${index}`} style={styles.tollCard}>
            <View style={styles.topRow}>
              <View style={styles.plazaInfo}>
                <View style={styles.nameHeader}>
                  <Text style={styles.tollIndex}>#{index + 1}</Text>
                  <Text style={styles.tollName}>{toll.name}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.coordsText}>
                    Ubicación: {toll.latitude.toFixed(4)}, {toll.longitude.toFixed(4)}
                  </Text>
                </View>
              </View>

              <View style={styles.priceContainer}>
                <Text style={styles.priceValue}>${toll.price}</Text>
                <Text style={styles.priceCurrency}>MXN</Text>
              </View>
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
    marginTop: 4,
  },
  coordsText: {
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
});
