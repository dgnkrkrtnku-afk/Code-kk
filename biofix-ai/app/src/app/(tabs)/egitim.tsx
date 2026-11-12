import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Badge, Between, Btn, Card, ErrorBox, H1, Loading, P, Row, Screen, Stars, Stat, Sub, Tag } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { MONO } from '../../lib/theme';
import type { CourseView } from '../../lib/types';
import { useLoad } from '../../lib/use-load';

export default function Training() {
  const { c, t, api, me, money, num } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.get<{ items: CourseView[] }>('/courses').then((r) => r.items), []);
  const can = !!me?.plan.teach;
  const mine = (data ?? []).filter((x) => x.mine);
  const fee = me?.fee ?? 20;
  const salesCount = mine.reduce((a, x) => a + (x.sales ?? 0), 0);
  const earned = mine.reduce((a, x) => a + (x.sales ?? 0) * x.usd * (100 - fee) / 100, 0);

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <Between>
        <H1>{t('e_title')}</H1>
        {can ? <Btn sm title={'+ ' + t('e_create')} onPress={() => router.push('/course-new')} /> : null}
      </Between>
      <Sub>{t('e_sub')}</Sub>
      {!can ? (
        <Card>
          <P style={{ marginBottom: 10 }}>{t('e_gate')}</P>
          <Btn sm kind="sec" title={t('e_plans')} onPress={() => router.push('/planlar')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}
      {mine.length ? (
        <Row style={{ marginBottom: 14 }}>
          <Stat value={String(mine.length)} label={t('e_mine')} />
          <Stat value={String(salesCount)} label={t('e_sales')} />
          <Stat value={money(earned)} label={t('e_earn')} />
        </Row>
      ) : null}

      {error && !data ? <ErrorBox msg={error} onRetry={reload} /> : !data ? <Loading /> : data.map((co) => (
        <Pressable key={co.id} onPress={() => router.push({ pathname: '/course/[id]', params: { id: co.id } })}>
          <Card>
            <Between style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', fontSize: 15, color: c.ink }}>{co.title}</Text>
                <P small muted>{co.by}</P>
              </View>
              {co.owned
                ? <Badge tone={co.mine ? 'info' : 'ok'}>{t(co.mine ? 'e_yours' : 'e_owned')}</Badge>
                : <Text style={{ fontFamily: MONO, fontWeight: '700', fontSize: 17, color: c.ink }}>{money(co.usd)}</Text>}
            </Between>
            <Row wrap style={{ marginTop: 8 }}>
              <Tag>{t('cat_' + co.cat)}</Tag><Tag>{t('lv_' + co.level)}</Tag>
              <Tag>{t('e_lessons', co.lessonCount)}</Tag><Tag>{t('e_hours', co.hours)}</Tag>
            </Row>
            <Row style={{ marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: c.line }}>
              {co.rating ? <><Stars v={co.rating} /><Text style={{ fontFamily: MONO, fontWeight: '700', color: c.ink }}>{co.rating.toFixed(1)}</Text></> : null}
              <View style={{ flex: 1 }} />
              <P small muted>{t('e_enrolled', num(co.n))}</P>
            </Row>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
