import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthScreen } from '../components/AuthScreen';
import { AppProvider, CONFIG_ERROR, useApp } from '../lib/app-context';
import { startBilling, stopBilling } from '../lib/billing';

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
  const { ready, c, dark, t, token, me, api, setMe } = useApp();
  const userId = me?.user.id;
  const playOn = !!me?.billing.google;

  // Google Play connection lives as long as someone is signed in.
  useEffect(() => {
    if (!token || !me || !userId) return;
    void startBilling({ api, userId, catalog: me.billing, onMe: setMe });
    return stopBilling;
    // Restart only when the account or the server's Play setup changes, not on every profile refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, userId, playOn]);

  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.cyan} /></View>;
  }
  if (CONFIG_ERROR) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 28, backgroundColor: c.bg }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.ink, marginBottom: 8 }}>{t('e_config_t')}</Text>
        <Text style={{ fontSize: 14, color: c.muted, lineHeight: 21 }}>{t('e_config_d')}</Text>
      </View>
    );
  }
  if (!token) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <AuthScreen />
        <Toast />
      </View>
    );
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
        <Stack.Screen name="puan" options={{ title: t('b_points_t') }} />
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
