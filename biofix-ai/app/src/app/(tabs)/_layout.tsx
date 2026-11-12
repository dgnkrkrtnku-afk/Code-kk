import { Link, Tabs } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from '../../components/icons';
import { useApp } from '../../lib/app-context';
import { MONO } from '../../lib/theme';

function HeaderBrand() {
  const { c } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: c.navy, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="asistan" color={c.onNavy} size={14} />
      </View>
      <Text style={{ fontWeight: '800', fontSize: 16, color: c.ink }}>BioFix AI</Text>
    </View>
  );
}

function HeaderRight() {
  const { c, s, update, num, me } = useApp();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginRight: 12 }}>
      <Link href="/cozumler" asChild>
        <Pressable style={{ borderColor: c.cyan, borderWidth: 1, backgroundColor: c.cyanSoft, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 }}>
          <Text style={{ color: c.cyan, fontFamily: MONO, fontWeight: '600', fontSize: 12 }}>{'★ ' + num(me?.user.points ?? 0)}</Text>
        </Pressable>
      </Link>
      <Pressable
        accessibilityLabel="Dil / Language"
        onPress={() => update({ lang: s.lang === 'tr' ? 'en' : 'tr' })}
        style={{ borderColor: c.line, borderWidth: 1, backgroundColor: c.surface, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 }}
      >
        <Text style={{ color: c.ink, fontWeight: '600', fontSize: 12 }}>{s.lang.toUpperCase()}</Text>
      </Pressable>
    </View>
  );
}

const TABS: { name: string; icon: IconName; key: string }[] = [
  { name: 'index', icon: 'asistan', key: 'nav_a' },
  { name: 'cozumler', icon: 'cozumler', key: 'nav_c' },
  { name: 'egitim', icon: 'egitim', key: 'nav_e' },
  { name: 'pazar', icon: 'pazar', key: 'nav_p' },
  { name: 'hesap', icon: 'hesap', key: 'nav_h' },
];

export default function TabsLayout() {
  const { c, t } = useApp();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTitle: () => <HeaderBrand />,
        headerTitleAlign: 'left',
        headerRight: () => <HeaderRight />,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        tabBarActiveTintColor: c.cyan,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: t(tab.key), tabBarIcon: ({ color }) => <Icon name={tab.icon} color={String(color ?? c.muted)} /> }}
        />
      ))}
    </Tabs>
  );
}
