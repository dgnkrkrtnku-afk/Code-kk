import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Btn, Card, ErrorBox, H2, Loading, P, Screen, Tag } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { MONO } from '../../lib/theme';
import type { CourseView, Me } from '../../lib/types';
import { useLoad } from '../../lib/use-load';

export default function Course() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, t, api, me, setMe, money, num, toast, errText, bump } = useApp();
  const { data: co, setData, error, reload } = useLoad(() => api.get<{ item: CourseView }>(`/courses/${id}`).then((r) => r.item), [id]);
  const [busy, setBusy] = useState('');
  if (error && !co) return <Screen><ErrorBox msg={error} onRetry={reload} /></Screen>;
  if (!co) return <Screen><Loading /></Screen>;
  const fee = me?.fee ?? 20;
  const pp = Math.round(co.usd * (me?.ptPerUsd ?? 50));

  async function buy(how: 'card' | 'pts') {
    setBusy(how);
    try {
      const r = await api.post<{ item: CourseView; me: Me }>(`/courses/${co!.id}/buy`, { how });
      setData(r.item); setMe(r.me); bump(); toast(t('e_bought'));
    } catch (e) { toast(errText(e)); } finally { setBusy(''); }
  }
  async function simulate() {
    setBusy('sim');
    try { const r = await api.post<{ item: CourseView }>(`/courses/${co!.id}/simulate-sale`); setData(r.item); bump(); }
    catch (e) { toast(errText(e)); } finally { setBusy(''); }
  }
  async function remove() {
    setBusy('del');
    try { await api.del(`/courses/${co!.id}`); bump(); router.back(); }
    catch (e) { toast(errText(e)); } finally { setBusy(''); }
  }

  const split = (
    <View style={{ backgroundColor: c.sunk, borderRadius: 10, padding: 10, marginBottom: 12 }}>
      {[[t('sp_price'), co.usd], [t('sp_fee', fee), co.usd * fee / 100], [t('sp_you'), co.usd * (100 - fee) / 100]].map(([k, v]) => (
        <View key={String(k)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
          <P small>{String(k)}</P><Text style={{ fontFamily: MONO, fontWeight: '700', color: c.ink }}>{money(Number(v))}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <Screen onRefresh={reload}>
      <Text style={{ fontSize: 19, fontWeight: '800', color: c.ink }}>{co.title}</Text>
      <P small muted style={{ marginVertical: 6 }}>{`${co.by}, ${t('lv_' + co.level)}, ${t('e_hours', co.hours)}`}</P>
      <P>{co.desc}</P>
      <H2>{t('e_curr')}</H2>
      <Card style={{ paddingVertical: 2 }}>
        {(co.lessons ?? []).map((l, i) => {
          const open = l.c !== null;
          return (
            <Pressable
              key={i}
              disabled={!open}
              onPress={() => router.push({ pathname: '/lesson', params: { id: co.id, i: String(i) } })}
              style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 11, borderBottomWidth: i === co.lessonCount - 1 ? 0 : 1, borderBottomColor: c.line, opacity: open ? 1 : 0.7 }}
            >
              <Text style={{ fontFamily: MONO, fontSize: 12, color: c.muted, width: 22 }}>{i + 1}</Text>
              <P style={{ flex: 1 }}>{l.t}</P>
              {co.owned ? null : <Tag>{i === 0 ? t('e_preview') : '🔒 ' + t('e_locked')}</Tag>}
            </Pressable>
          );
        })}
      </Card>
      {co.mine ? (
        <>
          {split}
          <P small muted style={{ marginBottom: 8 }}>{`${t('e_sales')}: ${co.sales ?? 0}`}</P>
          {me?.demoPayments ? <Btn full kind="sec" busy={busy === 'sim'} title={t('e_sim')} onPress={simulate} /> : null}
          <Btn full kind="ghost" busy={busy === 'del'} title={t('e_del')} onPress={remove} />
        </>
      ) : co.owned ? null : (
        <>
          <Text style={{ fontFamily: MONO, fontSize: 22, fontWeight: '700', color: c.ink, marginVertical: 8 }}>{money(co.usd)}</Text>
          <Btn full busy={busy === 'card'} disabled={!me?.demoPayments} title={t('e_buy')} onPress={() => buy('card')} />
          <Btn full kind="sec" style={{ marginTop: 8 }} busy={busy === 'pts'} disabled={(me?.user.points ?? 0) < pp} title={t('e_buy_pts', num(pp))} onPress={() => buy('pts')} />
        </>
      )}
      {co.canDelete && !co.mine ? <Btn full kind="ghost" busy={busy === 'del'} title={t('e_del')} onPress={remove} /> : null}
    </Screen>
  );
}
