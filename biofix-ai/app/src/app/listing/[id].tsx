import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Between, Btn, Card, ErrorBox, H2, Loading, Meter, P, Row, Screen, Stars, Tag } from '../../components/ui';
import { COUNTRY } from '../../i18n';
import { useApp } from '../../lib/app-context';
import { condTone } from '../../lib/format';
import { MONO } from '../../lib/theme';
import type { ListingDetail } from '../../lib/types';
import { useLoad } from '../../lib/use-load';

export default function Listing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, t, s, api, me, money, toast, errText, bump } = useApp();
  const { data, error, reload } = useLoad(() => api.get<ListingDetail>(`/listings/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  if (error && !data) return <Screen><ErrorBox msg={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen><Loading /></Screen>;
  const { item: l, agg, reviews, knownFixes } = data;
  const cName = (code: string) => (COUNTRY[code] || [code, code])[s.lang === 'tr' ? 0 : 1];

  const kv: [string, string][] = [
    [t('k_brand'), l.brand], [t('k_model'), l.model],
    ...(l.year ? [[t('p_year'), String(l.year)] as [string, string]] : []),
    [t('p_stock'), String(l.stock)],
    [t('p_ship'), `${cName(l.c)}, ${t('p_ship_g')}`],
    ...(l.reg ? [[t('p_reg'), l.reg] as [string, string]] : []),
  ];

  async function remove() {
    setBusy(true);
    try { await api.del(`/listings/${l.id}`); bump(); toast(t('p_removed')); router.back(); }
    catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }
  async function report() {
    try { await api.post(`/listings/${l.id}/report`); toast(t('p_reported')); } catch (e) { toast(errText(e)); }
  }
  function review() {
    if (me?.user.plan === 'free') { toast(t('rv_gate_d')); router.push('/planlar'); return; }
    router.push({ pathname: '/review', params: { id: l.id, name: `${l.brand} ${l.model}` } });
  }

  return (
    <Screen onRefresh={reload}>
      <Text style={{ fontSize: 19, fontWeight: '800', color: c.ink, marginBottom: 10 }}>{s.lang === 'tr' ? l.tr : l.en}</Text>
      <Between style={{ marginBottom: 6 }}>
        <Text style={{ fontFamily: MONO, fontSize: 22, fontWeight: '700', color: c.ink }}>{money(l.usd)}</Text>
        <Badge tone={condTone(l.cond)}>{t('cond_' + l.cond)}</Badge>
      </Between>
      {s.cur !== 'USD' ? <P small muted>{'≈ ' + money(l.usd, 'USD')}</P> : null}
      <P style={{ marginVertical: 10 }}>{s.lang === 'tr' ? l.dtr || l.den : l.den || l.dtr}</P>
      {kv.map(([k, v]) => (
        <Between key={k} style={{ paddingVertical: 3 }}>
          <P muted>{k}</P><P bold style={{ textAlign: 'right', flexShrink: 1 }}>{v}</P>
        </Between>
      ))}
      <Row style={{ marginVertical: 14, paddingTop: 9, borderTopWidth: 1, borderTopColor: c.line }}>
        <P bold style={{ flex: 1 }}>{l.seller}</P>
        {l.mine ? <Badge tone="info">{t('p_mine')}</Badge> : (
          <>{l.ok ? <Badge tone="ok">{'✓ ' + t('p_verified')}</Badge> : <Tag>{t('p_unverified')}</Tag>}{!l.id.startsWith('m') ? <Tag>{t('p_demo')}</Tag> : null}</>
        )}
      </Row>

      <H2>{t('rv_title')}</H2>
      {agg ? (
        <>
          <Row style={{ marginBottom: 10 }}>
            <Text style={{ fontFamily: MONO, fontSize: 26, fontWeight: '700', color: c.ink }}>{agg.stars.toFixed(1)}</Text>
            <View><Stars v={agg.stars} /><P small muted>{t('rv_n', agg.n)}</P></View>
          </Row>
          <Meter label={t('rv_rel')} v={agg.rel} />
          <Meter label={t('rv_svc')} v={agg.svc} />
          <Meter label={t('rv_use')} v={agg.use} />
          <Meter label={t('rv_val')} v={agg.val} />
          <P small muted style={{ marginVertical: 8 }}>{t('rv_again', agg.again)}</P>
        </>
      ) : <P small muted>{t('rv_none')}</P>}
      {knownFixes ? (
        <Card style={{ backgroundColor: c.cyanSoft, borderColor: c.cyan }}>
          <P small style={{ marginBottom: 8 }}>{t('rv_known', knownFixes)}</P>
          <Btn sm kind="sec" title={t('rv_see')} style={{ alignSelf: 'flex-start' }} onPress={() => router.push({ pathname: '/cozumler', params: { tab: 'all', q: l.model } })} />
        </Card>
      ) : null}
      {reviews.map((r) => (
        <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingVertical: 11 }}>
          <Between><P bold>{r.by}</P><Stars v={r.stars} /></Between>
          <Row wrap style={{ marginVertical: 4 }}>
            <Tag>{t('rv_used', t(r.months))}</Tag>
            {r.buyer ? <Badge tone="ok">{'✓ ' + t('rv_buyer')}</Badge> : null}
          </Row>
          <P>{r.text}</P>
        </View>
      ))}

      {l.mine ? (
        <Btn full kind="sec" busy={busy} title={t('p_remove')} onPress={remove} style={{ marginTop: 12 }} />
      ) : (
        <>
          <Btn full title={t('p_quote')} style={{ marginTop: 12 }} onPress={() => router.push({ pathname: '/quote', params: { id: l.id, title: `${s.lang === 'tr' ? l.tr : l.en}, ${l.seller}` } })} />
          <Btn full kind="sec" style={{ marginTop: 8 }} title={`${t('rv_write')}  +${me?.pt.review ?? 15}`} onPress={review} />
          <Btn full kind="ghost" title={t('p_report')} onPress={report} />
        </>
      )}
    </Screen>
  );
}
