import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { SolutionCard } from '../../components/SolutionCard';
import { Btn, Card, Details, Empty, ErrorBox, H1, H2, Input, Loading, P, PointsBanner, Row, Screen, Seg, Sub } from '../../components/ui';
import { qs } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { MONO } from '../../lib/theme';
import type { SolutionView } from '../../lib/types';
import { useLoad } from '../../lib/use-load';

type TabV = 'verify' | 'all' | 'mine';

export default function Solutions() {
  const { c, t, api, me, num } = useApp();
  const params = useLocalSearchParams<{ tab?: TabV; q?: string }>();
  const [tab, setTab] = useState<TabV>('verify');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  // Deep links from other screens ("See solutions", after teaching).
  useEffect(() => {
    if (params.tab) setTab(params.tab);
    if (params.q !== undefined) { setQ(params.q); setDebounced(params.q); }
  }, [params.tab, params.q]);
  useEffect(() => { const h = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(h); }, [q]);

  const { data, setData, error, loading, reload } = useLoad(
    () => api.get<{ items: SolutionView[] }>('/solutions' + qs({ tab, q: debounced })).then((r) => r.items),
    [tab, debounced],
  );

  const pt = me?.pt;
  const replace = (s: SolutionView) => setData((d) => d?.map((x) => (x.id === s.id ? s : x)) ?? null);
  const remove = (id: string) => setData((d) => d?.filter((x) => x.id !== id) ?? null);

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <H1>{t('c_title')}</H1>
      <Sub>{t('c_sub')}</Sub>
      <PointsBanner action={<Btn sm kind="sec" title={t('c_use')} onPress={() => router.push('/planlar')} />} />
      <Btn full title={`${t('c_teach')}  +${pt?.teach ?? 20}`} onPress={() => router.push('/teach')} style={{ marginBottom: 12 }} />
      <Details title={t('c_how')}>
        {([['c_h1', pt?.teach], ['c_h2', pt?.verified], ['c_h3', pt?.vote], ['c_h4', pt?.review]] as const).map(([k, n]) => (
          <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <P small>{t(k)}</P>
            <Text style={{ fontFamily: MONO, color: c.ok, fontWeight: '700' }}>{`+${n ?? ''}`}</Text>
          </Row>
        ))}
      </Details>
      <Seg<TabV>
        value={tab}
        onChange={setTab}
        options={[{ value: 'verify', label: t('c_tab_v') }, { value: 'all', label: t('c_tab_a') }, { value: 'mine', label: t('c_tab_m') }]}
      />
      <Input value={q} onChangeText={setQ} placeholder={t('c_search')} autoCorrect={false} />

      {error && !data ? <ErrorBox msg={error} onRetry={reload} /> : !data ? <Loading /> : data.length ? (
        data.map((s) => <SolutionCard key={s.id} s={s} onChange={replace} onDelete={remove} />)
      ) : (
        <Empty>{t({ verify: 'c_none_v', all: 'c_none_a', mine: 'c_none_m' }[tab])}</Empty>
      )}

      <H2>{t('led')}</H2>
      <Card style={{ paddingVertical: 4 }}>
        {(me?.user.ledger ?? []).slice(0, 8).map((l, i) => (
          <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
            <P small style={{ flex: 1 }}>{t(l.why)} <Text style={{ color: c.muted }}>{l.date}</Text></P>
            <Text style={{ fontFamily: MONO, fontWeight: '700', color: l.n < 0 ? c.bad : c.ok }}>{(l.n > 0 ? '+' : '') + num(l.n)}</Text>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
