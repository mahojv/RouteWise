import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../src/theme/colors';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.backgroundPrimary }}>
      <SafeAreaProvider style={{ flex: 1 }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: Colors.backgroundPrimary,
            },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Búsqueda' }} />
          <Stack.Screen name="results" options={{ title: 'Resultados' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
