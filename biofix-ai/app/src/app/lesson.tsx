import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Btn, ErrorBox, Loading, P, Screen } from '../components/ui';
import { useApp } from '../lib/app-context';
import { MONO } from '../lib/theme';
import type { CourseView } from '../lib/types';
import { useLoad } from '../lib/use-load';

export default function Lesson() {
  const { id, i } = useLocalSearchParams<{ id: string; i: string }>();
  const { c, t, api } = useApp();
  const { data: co, error, reload } = useLoad(() => api.get<{ item: CourseView }>(`/courses/${id}`).then((r) => r.item), [id]);
  if (error && !co) return <Screen><ErrorBox msg={error} onRetry={reload} /></Screen>;
  if (!co?.lessons) return <Screen><Loading /></Screen>;
  const n = Number(i) || 0;
  const l = co.lessons[n];
  const next = n + 1 < co.lessons.length && co.lessons[n + 1].c !== null;
  return (
    <Screen>
      <Text style={{ fontFamily: MONO, color: c.muted, fontSize: 12.5 }}>{`${n + 1} / ${co.lessons.length}`}</Text>
      <Text style={{ fontSize: 19, fontWeight: '800', color: c.ink, marginVertical: 10 }}>{l.t}</Text>
      <P selectable style={{ fontSize: 15, lineHeight: 23 }}>{l.c ?? '🔒'}</P>
      {next ? <Btn full style={{ marginTop: 18 }} title={t('e_next')} onPress={() => router.setParams({ i: String(n + 1) })} /> : null}
      <Btn full kind="ghost" title={t('e_back')} onPress={() => router.back()} />
    </Screen>
  );
}
