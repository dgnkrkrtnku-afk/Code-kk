import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../lib/app-context';

function Toast() {
  const { toastMsg, c } = useApp();
  const insets = useSafeAreaInsets();
  if (!toastMsg) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 86 + insets.bottom, alignItems: 'center' }}>
      <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.ink, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, maxWidth: 508 }}>
        <Text style={{ color: c.bg, fontSize: 13.5, fontWeight: '600', textAlign: 'center' }}>{toastMsg}</Text>
      </View>
    </View>
  );
}

function Shell() {
  const { ready, c, dark, t } = useApp();
  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.cyan} /></View>;
  }
  const modal = { presentation: 'modal' as const };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.ink,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: c.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="planlar" options={{ title: t('pl_title') }} />
        <Stack.Screen name="gelistirici" options={{ title: t('d_title') }} />
        <Stack.Screen name="listing/[id]" options={{ title: t('p_title') }} />
        <Stack.Screen name="course/[id]" options={{ title: t('e_title') }} />
        <Stack.Screen name="lesson" options={{ title: t('e_curr') }} />
        <Stack.Screen name="teach" options={{ ...modal, title: t('f_title') }} />
        <Stack.Screen name="sell" options={{ ...modal, title: t('s_title') }} />
        <Stack.Screen name="review" options={{ ...modal, title: t('rv_form') }} />
        <Stack.Screen name="quote" options={{ ...modal, title: t('q_title') }} />
        <Stack.Screen name="course-new" options={{ ...modal, title: t('ef_title') }} />
        <Stack.Screen name="doc-new" options={{ ...modal, title: t('k_form') }} />
      </Stack>
      <Toast />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </SafeAreaProvider>
  );
}
