import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../src/theme/colors';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { useRouteStore } from '../src/store/routeStore';
import { VehicleType, FuelType, RoutePreferenceMode } from '@routewise/types';
import {
  searchLocations,
  POPULAR_CITIES,
  LocationSuggestion,
} from '../src/services/geocodingService';
import {
  Navigation,
  MapPin,
  Car,
  Fuel,
  Sliders,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Zap,
  Clock,
  Coins,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    origin,
    destination,
    vehicleType,
    fuelType,
    fuelEfficiencyKmPerLiter,
    fuelPricePerLiter,
    preferenceStrategy,
    timeValue,
    status,
    error,
    setOrigin,
    setDestination,
    setVehicleType,
    setFuelType,
    setFuelEfficiencyKmPerLiter,
    setFuelPricePerLiter,
    setPreferenceStrategy,
    setTimeValue,
    setPresetRoute,
    executeSearch,
  } = useRouteStore();

  const [activePreset, setActivePreset] = useState<'QRO_CDMX' | 'QRO_VSA' | 'CUSTOM'>('QRO_CDMX');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showManualCoords, setShowManualCoords] = useState(false);

  // Estados de autocompletado para Origen
  const [originSearchText, setOriginSearchText] = useState(origin.label || '');
  const [originSuggestions, setOriginSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);

  // Estados de autocompletado para Destino
  const [destSearchText, setDestSearchText] = useState(destination.label || '');
  const [destSuggestions, setDestSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSearchingDest, setIsSearchingDest] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);

  // Sincronizar estados locales si cambian presets
  useEffect(() => {
    setOriginSearchText(origin.label || '');
  }, [origin.label]);

  useEffect(() => {
    setDestSearchText(destination.label || '');
  }, [destination.label]);

  // Manejar búsqueda de autocompletado para Origen
  const handleOriginTextChange = async (text: string) => {
    setOriginSearchText(text);
    setActivePreset('CUSTOM');

    if (text.trim().length >= 2) {
      setIsSearchingOrigin(true);
      setShowOriginDropdown(true);
      const results = await searchLocations(text);
      setOriginSuggestions(results);
      setIsSearchingOrigin(false);
    } else {
      setOriginSuggestions([]);
      setShowOriginDropdown(false);
    }
  };

  // Seleccionar sugerencia de Origen
  const handleSelectOriginSuggestion = (item: LocationSuggestion) => {
    setOrigin({
      label: item.name,
      latitude: item.latitude,
      longitude: item.longitude,
    });
    setOriginSearchText(item.name);
    setShowOriginDropdown(false);
  };

  // Manejar búsqueda de autocompletado para Destino
  const handleDestTextChange = async (text: string) => {
    setDestSearchText(text);
    setActivePreset('CUSTOM');

    if (text.trim().length >= 2) {
      setIsSearchingDest(true);
      setShowDestDropdown(true);
      const results = await searchLocations(text);
      setDestSuggestions(results);
      setIsSearchingDest(false);
    } else {
      setDestSuggestions([]);
      setShowDestDropdown(false);
    }
  };

  // Seleccionar sugerencia de Destino
  const handleSelectDestSuggestion = (item: LocationSuggestion) => {
    setDestination({
      label: item.name,
      latitude: item.latitude,
      longitude: item.longitude,
    });
    setDestSearchText(item.name);
    setShowDestDropdown(false);
  };

  // Seleccionar preset rápido
  const handleSelectPreset = (preset: 'QRO_CDMX' | 'QRO_VSA') => {
    setActivePreset(preset);
    setPresetRoute(preset);
  };

  const handleCalculate = async () => {
    await executeSearch();
    const currentState = useRouteStore.getState();
    if (currentState.status === 'success') {
      router.push('/results');
    }
  };

  const isFormValid =
    origin &&
    destination &&
    typeof origin.latitude === 'number' &&
    typeof origin.longitude === 'number' &&
    origin.latitude !== 0 &&
    typeof destination.latitude === 'number' &&
    typeof destination.longitude === 'number' &&
    destination.latitude !== 0 &&
    fuelEfficiencyKmPerLiter > 0 &&
    fuelPricePerLiter > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(16, insets.top + 8),
            paddingBottom: Math.max(56, insets.bottom + 40),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header de la App */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoIconContainer}>
              <Navigation size={22} color="#0F172A" />
            </View>
            <View>
              <Text style={styles.appTitle}>RouteWise</Text>
              <Text style={styles.appSubtitle}>Optimización Inteligente de Casetas & Rutas</Text>
            </View>
          </View>
        </View>

        {/* Presets Rápidos */}
        <Text style={styles.sectionTitle}>RUTAS RÁPIDAS DE PRUEBA</Text>
        <View style={styles.presetRow}>
          <TouchableOpacity
            style={[
              styles.presetChip,
              activePreset === 'QRO_CDMX' && styles.presetChipActive,
            ]}
            onPress={() => handleSelectPreset('QRO_CDMX')}
          >
            <Sparkles size={14} color={activePreset === 'QRO_CDMX' ? Colors.accentPrimary : Colors.textMuted} />
            <Text
              style={[
                styles.presetChipText,
                activePreset === 'QRO_CDMX' && styles.presetChipTextActive,
              ]}
            >
              Querétaro ➔ CDMX
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.presetChip,
              activePreset === 'QRO_VSA' && styles.presetChipActive,
            ]}
            onPress={() => handleSelectPreset('QRO_VSA')}
          >
            <Sparkles size={14} color={activePreset === 'QRO_VSA' ? Colors.accentPrimary : Colors.textMuted} />
            <Text
              style={[
                styles.presetChipText,
                activePreset === 'QRO_VSA' && styles.presetChipTextActive,
              ]}
            >
              Querétaro ➔ Villahermosa
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sección de Trayecto con Autocompletado */}
        <Card elevated style={styles.cardSection}>
          <Text style={styles.cardTitle}>TRAYECTO</Text>

          {/* Campo de Origen */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <MapPin size={16} color="#10B981" />
              <Text style={styles.inputLabel}>Origen</Text>
              {origin.latitude !== 0 && (
                <View style={styles.coordsBadge}>
                  <CheckCircle2 size={12} color="#10B981" />
                  <Text style={styles.coordsBadgeText}>
                    {origin.latitude.toFixed(3)}, {origin.longitude.toFixed(3)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.searchBoxContainer}>
              <TextInput
                style={styles.textInput}
                value={originSearchText}
                onChangeText={handleOriginTextChange}
                onFocus={() => {
                  if (originSuggestions.length > 0) setShowOriginDropdown(true);
                }}
                placeholder="Escribe una ciudad de origen (ej. Querétaro, CDMX)"
                placeholderTextColor={Colors.textMuted}
              />
              {isSearchingOrigin && (
                <ActivityIndicator size="small" color={Colors.accentPrimary} style={styles.searchSpinner} />
              )}
            </View>

            {/* Dropdown de Sugerencias de Origen */}
            {showOriginDropdown && originSuggestions.length > 0 && (
              <View style={styles.dropdownMenu}>
                {originSuggestions.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.dropdownItem}
                    onPress={() => handleSelectOriginSuggestion(item)}
                  >
                    <MapPin size={14} color={Colors.accentPrimary} />
                    <View style={styles.dropdownItemTextCol}>
                      <Text style={styles.dropdownItemTitle}>{item.name}</Text>
                      {item.subtitle && <Text style={styles.dropdownItemSub}>{item.subtitle}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Chips de Ciudades Populares para Origen */}
            <Text style={styles.subLabel}>Sugerencias Rápidas:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cityChipsRow}>
              {POPULAR_CITIES.slice(0, 6).map((city) => (
                <TouchableOpacity
                  key={`orig_${city.id}`}
                  style={styles.cityChip}
                  onPress={() => handleSelectOriginSuggestion(city)}
                >
                  <Text style={styles.cityChipText}>{city.name.split('(')[0].trim()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.divider} />

          {/* Campo de Destino */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Navigation size={16} color="#38BDF8" />
              <Text style={styles.inputLabel}>Destino</Text>
              {destination.latitude !== 0 && (
                <View style={styles.coordsBadge}>
                  <CheckCircle2 size={12} color="#38BDF8" />
                  <Text style={styles.coordsBadgeText}>
                    {destination.latitude.toFixed(3)}, {destination.longitude.toFixed(3)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.searchBoxContainer}>
              <TextInput
                style={styles.textInput}
                value={destSearchText}
                onChangeText={handleDestTextChange}
                onFocus={() => {
                  if (destSuggestions.length > 0) setShowDestDropdown(true);
                }}
                placeholder="Escribe una ciudad de destino (ej. Guadalajara, Villahermosa)"
                placeholderTextColor={Colors.textMuted}
              />
              {isSearchingDest && (
                <ActivityIndicator size="small" color={Colors.accentPrimary} style={styles.searchSpinner} />
              )}
            </View>

            {/* Dropdown de Sugerencias de Destino */}
            {showDestDropdown && destSuggestions.length > 0 && (
              <View style={styles.dropdownMenu}>
                {destSuggestions.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.dropdownItem}
                    onPress={() => handleSelectDestSuggestion(item)}
                  >
                    <Navigation size={14} color={Colors.accentPrimary} />
                    <View style={styles.dropdownItemTextCol}>
                      <Text style={styles.dropdownItemTitle}>{item.name}</Text>
                      {item.subtitle && <Text style={styles.dropdownItemSub}>{item.subtitle}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Chips de Ciudades Populares para Destino */}
            <Text style={styles.subLabel}>Sugerencias Rápidas:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cityChipsRow}>
              {POPULAR_CITIES.slice(0, 8).map((city) => (
                <TouchableOpacity
                  key={`dest_${city.id}`}
                  style={styles.cityChip}
                  onPress={() => handleSelectDestSuggestion(city)}
                >
                  <Text style={styles.cityChipText}>{city.name.split('(')[0].trim()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Acordeón opcional de Coordenadas Manuales */}
          <TouchableOpacity
            style={styles.coordsAccordionToggle}
            onPress={() => setShowManualCoords(!showManualCoords)}
          >
            <Sliders size={12} color={Colors.textMuted} />
            <Text style={styles.coordsAccordionText}>
              {showManualCoords ? 'Ocultar Coordenadas Manuales' : 'Editar Coordenadas Manualmente (Avanzado)'}
            </Text>
            {showManualCoords ? <ChevronUp size={14} color={Colors.textMuted} /> : <ChevronDown size={14} color={Colors.textMuted} />}
          </TouchableOpacity>

          {showManualCoords && (
            <View style={styles.manualCoordsContainer}>
              <Text style={styles.manualCoordsHint}>Origen Coords:</Text>
              <View style={styles.coordsRow}>
                <TextInput
                  style={styles.coordInput}
                  value={String(origin.latitude)}
                  onChangeText={(val) => setOrigin({ ...origin, latitude: parseFloat(val) || 0 })}
                  keyboardType="numeric"
                  placeholder="Lat"
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  style={styles.coordInput}
                  value={String(origin.longitude)}
                  onChangeText={(val) => setOrigin({ ...origin, longitude: parseFloat(val) || 0 })}
                  keyboardType="numeric"
                  placeholder="Lon"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <Text style={[styles.manualCoordsHint, { marginTop: 8 }]}>Destino Coords:</Text>
              <View style={styles.coordsRow}>
                <TextInput
                  style={styles.coordInput}
                  value={String(destination.latitude)}
                  onChangeText={(val) => setDestination({ ...destination, latitude: parseFloat(val) || 0 })}
                  keyboardType="numeric"
                  placeholder="Lat"
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  style={styles.coordInput}
                  value={String(destination.longitude)}
                  onChangeText={(val) => setDestination({ ...destination, longitude: parseFloat(val) || 0 })}
                  keyboardType="numeric"
                  placeholder="Lon"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>
          )}
        </Card>

        {/* Sección de Vehículo */}
        <Card elevated style={styles.cardSection}>
          <Text style={styles.cardTitle}>CONFIGURACIÓN DE VEHÍCULO</Text>

          <Text style={styles.subLabel}>Tipo de Vehículo</Text>
          <View style={styles.optionRow}>
            {[
              { type: 'automovil', label: 'Automóvil' },
              { type: 'motocicleta', label: 'Moto' },
              { type: 'autobus', label: 'Autobús' },
              { type: 'camion_2_ejes', label: 'Camión' },
            ].map((v) => (
              <TouchableOpacity
                key={v.type}
                style={[
                  styles.optionButton,
                  vehicleType === v.type && styles.optionButtonActive,
                ]}
                onPress={() => setVehicleType(v.type as VehicleType)}
              >
                <Text
                  style={[
                    styles.optionText,
                    vehicleType === v.type && styles.optionTextActive,
                  ]}
                >
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.subLabel}>Combustible</Text>
          <View style={styles.optionRow}>
            {[
              { type: 'gasolina_regular', label: 'Magna' },
              { type: 'gasolina_premium', label: 'Premium' },
              { type: 'diesel', label: 'Diésel' },
            ].map((f) => (
              <TouchableOpacity
                key={f.type}
                style={[
                  styles.optionButton,
                  fuelType === f.type && styles.optionButtonActive,
                ]}
                onPress={() => setFuelType(f.type as FuelType)}
              >
                <Text
                  style={[
                    styles.optionText,
                    fuelType === f.type && styles.optionTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.numberRow}>
            <View style={styles.numberInputGroup}>
              <Text style={styles.subLabel}>Rendimiento (km/L)</Text>
              <TextInput
                style={styles.numberInput}
                value={String(fuelEfficiencyKmPerLiter)}
                onChangeText={(v) => setFuelEfficiencyKmPerLiter(parseFloat(v) || 0)}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.numberInputGroup}>
              <Text style={styles.subLabel}>Precio Gasolina ($/L)</Text>
              <TextInput
                style={styles.numberInput}
                value={String(fuelPricePerLiter)}
                onChangeText={(v) => setFuelPricePerLiter(parseFloat(v) || 0)}
                keyboardType="numeric"
              />
            </View>
          </View>
        </Card>

        {/* Sección de Estrategia */}
        <Card elevated style={styles.cardSection}>
          <Text style={styles.cardTitle}>ESTRATEGIA DE RUTA</Text>

          <View style={styles.strategyContainer}>
            {[
              { mode: 'BALANCED', label: 'Equilibrada', desc: 'Mejor relación tiempo / costo', icon: Zap },
              { mode: 'MONEY', label: 'Ahorro Máximo', desc: 'Prioriza menor costo directo', icon: Coins },
              { mode: 'TIME', label: 'Más Rápida', desc: 'Prioriza llegar en menor tiempo', icon: Clock },
            ].map((s) => {
              const IconComp = s.icon;
              const isSelected = preferenceStrategy === s.mode;
              return (
                <TouchableOpacity
                  key={s.mode}
                  style={[
                    styles.strategyCard,
                    isSelected && styles.strategyCardActive,
                  ]}
                  onPress={() => setPreferenceStrategy(s.mode as RoutePreferenceMode)}
                >
                  <View style={styles.strategyHeader}>
                    <IconComp size={18} color={isSelected ? Colors.accentPrimary : Colors.textMuted} />
                    <Text
                      style={[
                        styles.strategyTitle,
                        isSelected && styles.strategyTitleActive,
                      ]}
                    >
                      {s.label}
                    </Text>
                  </View>
                  <Text style={styles.strategyDesc}>{s.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowAdvanced(!showAdvanced)}
          >
            <Sliders size={14} color={Colors.accentPrimary} />
            <Text style={styles.advancedToggleText}>
              {showAdvanced ? 'Ocultar Valor del Tiempo' : 'Ajustar Valor del Tiempo ($120/hr)'}
            </Text>
          </TouchableOpacity>

          {showAdvanced && (
            <View style={styles.timeValueBox}>
              <Text style={styles.subLabel}>Valor de tu tiempo ($ MXN / hora)</Text>
              <TextInput
                style={styles.numberInput}
                value={String(timeValue)}
                onChangeText={(v) => setTimeValue(parseFloat(v) || 0)}
                keyboardType="numeric"
              />
              <Text style={styles.timeValueHint}>
                Utilizado para calcular el costo generalizado de cada hora de viaje.
              </Text>
            </View>
          )}
        </Card>

        {/* Banner de Error */}
        {status === 'error' && error && (
          <View style={styles.errorBanner}>
            <AlertTriangle size={20} color="#EF4444" />
            <View style={styles.errorTextContainer}>
              <Text style={styles.errorTitle}>
                {error.statusCode ? `Error HTTP ${error.statusCode}` : 'Error de Conexión'}
              </Text>
              <Text style={styles.errorMessage}>{error.message}</Text>
            </View>
            <TouchableOpacity style={styles.retryBtn} onPress={handleCalculate}>
              <RefreshCw size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Botón de Cálculo */}
        <Button
          title={status === 'loading' ? 'CALCULANDO OPTIMIZACIÓN...' : 'CALCULAR RUTAS OPTIMIZADAS'}
          variant="primary"
          size="lg"
          loading={status === 'loading'}
          disabled={!isFormValid || status === 'loading'}
          onPress={handleCalculate}
          style={styles.calculateBtn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
  header: {
    marginTop: 10,
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  appSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.backgroundCard,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  presetChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: Colors.accentPrimary,
  },
  presetChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: Colors.accentPrimary,
    fontWeight: '800',
  },
  cardSection: {
    marginBottom: 14,
    padding: 16,
  },
  cardTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inputLabel: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  coordsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  coordsBadgeText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  searchBoxContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  textInput: {
    backgroundColor: Colors.backgroundPrimary,
    color: Colors.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  searchSpinner: {
    position: 'absolute',
    right: 12,
  },
  dropdownMenu: {
    backgroundColor: Colors.backgroundCard,
    borderColor: Colors.borderSubtle,
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    maxHeight: 180,
    overflow: 'hidden',
    zIndex: 99,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  dropdownItemTextCol: {
    flex: 1,
  },
  dropdownItemTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownItemSub: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  cityChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  cityChip: {
    backgroundColor: Colors.backgroundPrimary,
    borderColor: Colors.borderSubtle,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cityChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  coordsAccordionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 4,
  },
  coordsAccordionText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  manualCoordsContainer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: Colors.backgroundPrimary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  manualCoordsHint: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  coordsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  coordInput: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    color: Colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginVertical: 12,
  },
  subLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionButton: {
    backgroundColor: Colors.backgroundPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  optionButtonActive: {
    backgroundColor: Colors.accentPrimary,
    borderColor: Colors.accentPrimary,
  },
  optionText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  optionTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  numberRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  numberInputGroup: {
    flex: 1,
  },
  numberInput: {
    backgroundColor: Colors.backgroundPrimary,
    color: Colors.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  strategyContainer: {
    gap: 8,
  },
  strategyCard: {
    backgroundColor: Colors.backgroundPrimary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  strategyCardActive: {
    borderColor: Colors.accentPrimary,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  strategyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  strategyTitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  strategyTitleActive: {
    color: Colors.textPrimary,
  },
  strategyDesc: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 6,
  },
  advancedToggleText: {
    color: Colors.accentPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  timeValueBox: {
    marginTop: 8,
    backgroundColor: Colors.backgroundPrimary,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  timeValueHint: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },
  errorTextContainer: {
    flex: 1,
  },
  errorTitle: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
  },
  errorMessage: {
    color: Colors.textPrimary,
    fontSize: 12,
    marginTop: 2,
  },
  retryBtn: {
    backgroundColor: '#EF4444',
    padding: 8,
    borderRadius: 8,
  },
  calculateBtn: {
    marginTop: 4,
  },
});
