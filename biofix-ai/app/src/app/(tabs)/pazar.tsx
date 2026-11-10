import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Between, Btn, Card, Empty, ErrorBox, H1, Input, Loading, P, Pill, Row, Screen, Select, Sub, Tag } from '../../components/ui';
import { COUNTRY } from '../../i18n';
import { qs } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { condTone } from '../../lib/format';
import { takePendingMarketQuery } from '../../lib/market-query';
import { MONO } from '../../lib/theme';
import type { ListingView } from '../../lib/types';
import { useLoad } from '../../lib/use-load';

const CATS = ['all', 'device', 'part', 'cons', 'acc'] as const;
const CONDS = ['all', 'new', 'used', 'refurb'] as const;

export default function Market() {
  const { c, t, api, s, money } = useApp();
  const [cat, setCat] = useState<(typeof CATS)[number]>('all');
  const [cond, setCond] = useState<(typeof CONDS)[number]>('all');
  const [country, setCountry] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const cName = (code: string) => (COUNTRY[code] || [code, code])[s.lang === 'tr' ? 0 : 1];

  useFocusEffect(useCallback(() => {
    const pending = takePendingMarketQuery();
    if (pending !== null) { setQ(pending); setDebounced(pending); setCat('all'); setCond('all'); setCountry(''); }
  }, []));
  useEffect(() => { const h = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(h); }, [q]);

  const { data, error, loading, reload } = useLoad(
    () => api.get<{ items: ListingView[]; countries: string[] }>('/listings' + qs({ cat, cond, country, q: debounced })),
    [cat, cond, country, debounced],
  );

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <Between>
        <H1>{t('p_title')}</H1>
        <Btn sm title={'+ ' + t('p_sell')} onPress={() => router.push('/sell')} />
      </Between>
      <Sub>{t('p_sub')}</Sub>
      <Input value={q} onChangeText={setQ} placeholder={t('p_search')} autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 12 }}>
        {CATS.map((k) => <Pill key={k} on={cat === k} label={t('cat_' + k)} onPress={() => setCat(k)} />)}
      </ScrollView>
      <Row style={{ gap: 10 }}>
        <Select half value={cond} onChange={setCond} options={CONDS.map((k) => ({ value: k, label: t('cond_' + k) }))} />
        <Select
          half
          value={country}
          onChange={setCountry}
          options={[{ value: '', label: t('p_any_country') }, ...(data?.countries ?? []).map((k) => ({ value: k, label: cName(k) }))]}
        />
      </Row>

      {error && !data ? <ErrorBox msg={error} onRetry={reload} /> : !data ? <Loading /> : (
        <>
          <P small muted style={{ marginBottom: 8 }}>{t('p_count', data.items.length)}</P>
          {data.items.length ? data.items.map((l) => (
            <Pressable key={l.id} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: l.id } })}>
              <Card>
                <Between style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: 14.5, color: c.ink }}>{s.lang === 'tr' ? l.tr : l.en}</Text>
                    <P small muted style={{ marginTop: 3 }}>{`${l.brand} ${l.model}${l.year ? ', ' + l.year : ''}`}</P>
                  </View>
                  <Text style={{ fontFamily: MONO, fontWeight: '700', fontSize: 17, color: c.ink }}>{money(l.usd)}</Text>
                </Between>
                <Row wrap style={{ marginTop: 8 }}>
                  <Badge tone={condTone(l.cond)}>{t('cond_' + l.cond)}</Badge>
                  <Tag>{t('cat_' + l.cat)}</Tag>
                  <Tag>{cName(l.c)}</Tag>
                  {l.rating ? (
                    <Text style={{ color: c.ink, fontSize: 12.5 }}>
                      <Text style={{ color: c.warn }}>★ </Text>
                      <Text style={{ fontFamily: MONO, fontWeight: '700' }}>{l.rating.stars.toFixed(1)}</Text>
                      <Text style={{ color: c.muted }}>{` (${l.rating.n})`}</Text>
                    </Text>
                  ) : null}
                </Row>
                <Row style={{ marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: c.line }}>
                  <P small muted style={{ flex: 1 }}>{l.seller}</P>
                  {l.mine ? <Badge tone="info">{t('p_mine')}</Badge> : l.ok ? <Badge tone="ok">{'✓ ' + t('p_verified')}</Badge> : null}
                </Row>
              </Card>
            </Pressable>
          )) : <Empty>{t('p_none')}</Empty>}
        </>
      )}
    </Screen>
  );
}
