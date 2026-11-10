import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Between, Btn, Card, H1, Note, P, PointsBanner, Screen, Seg, Sheet, Sub } from '../components/ui';
import { useApp } from '../lib/app-context';
import { planName } from '../lib/format';
import { MONO } from '../lib/theme';
import type { Me, PlanId } from '../lib/types';

const ORDER: PlanId[] = ['free', 'pro', 'trainer', 'biz', 'org'];
const WHO: Record<PlanId, string> = { free: 'pl_free_w', pro: 'pl_pro_w', trainer: 'pl_tr_w', biz: 'pl_biz_w', org: 'pl_org_w' };
const FEATS: Record<PlanId, string[]> = {
  free: ['f_q5', 'f_teach', 'f_buy'],
  pro: ['f_qinf', 'f_photo', 'f_teach', 'f_review', 'f_buy'],
  trainer: ['f_pro', 'f_course', 'f_payout'],
  biz: ['f_pro', 'f_sell50', 'f_badge'],
  org: ['f_pro', 'f_seats', 'f_sellinf', 'f_course_in', 'f_sla'],
};

export default function Plans() {
  const { c, t, me, setMe, api, money, num, toast, errText } = useApp();
  const [pick, setPick] = useState<PlanId | null>(null);
  const [busy, setBusy] = useState('');
  if (!me) return <Screen><P muted>{t('loading')}</P></Screen>;

  const yr = me.user.billing === 'year';
  const price = (k: PlanId) => me.plans[k].usd * (yr ? 10 : 1);
  const pts = (usd: number) => Math.round(usd * me.ptPerUsd);

  async function setBilling(b: 'month' | 'year') {
    try { setMe(await api.patch<Me>('/me', { billing: b })); } catch (e) { toast(errText(e)); }
  }
  async function choose(k: PlanId, how: 'card' | 'pts') {
    setBusy(how);
    try {
      setMe(await api.post<Me>('/me/plan', { plan: k, how }));
      setPick(null);
      toast(t('pl_done', t(planName(k))));
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy('');
    }
  }

  return (
    <Screen>
      <H1>{t('pl_title')}</H1>
      <Sub>{t('pl_sub')}</Sub>
      <PointsBanner action={<Btn sm kind="sec" title={t('c_teach')} onPress={() => router.push('/teach')} />} />
      <Seg value={me.user.billing} onChange={setBilling} options={[{ value: 'month', label: t('pl_m') }, { value: 'year', label: t('pl_y') }]} />
      {ORDER.map((k) => {
        const cur = me.user.plan === k;
        const p = me.plans[k];
        return (
          <Card key={k} style={cur ? { borderColor: c.cyan, borderWidth: 2 } : null}>
            <Between>
              <Text style={{ fontWeight: '800', fontSize: 16, color: c.ink }}>{t(planName(k))}</Text>
              {cur ? <Badge tone="info">{t('pl_cur')}</Badge> : null}
            </Between>
            <P small muted>{t(WHO[k])}</P>
            <Text style={{ fontFamily: MONO, fontSize: 24, fontWeight: '700', color: c.ink, marginTop: 8 }}>
              {p.usd ? money(price(k)) : t('pl_free')}
              {p.usd ? <Text style={{ fontSize: 12.5, fontWeight: '500', color: c.muted }}>{' ' + t(yr ? 'pl_yr' : 'pl_mo')}</Text> : null}
            </Text>
            {p.usd ? <P small muted mono>{`${num(pts(price(k)))} ${t('pts')}`}</P> : null}
            <View style={{ marginVertical: 10 }}>
              {FEATS[k].map((f) => (
                <Text key={f} style={{ color: c.ink, fontSize: 13.5, paddingVertical: 3 }}>
                  <Text style={{ color: c.ok, fontWeight: '700' }}>{'✓  '}</Text>{t(f, 100 - me.fee)}
                </Text>
              ))}
            </View>
            {cur ? null : <Btn full kind={k === 'free' ? 'sec' : 'pri'} title={t('pl_pick')} onPress={() => setPick(k)} />}
          </Card>
        );
      })}
      <Note>{t('h_rates')}</Note>

      <Sheet visible={!!pick} onClose={() => setPick(null)} title={pick ? t('pl_conf_t', t(planName(pick))) : ''}>
        {pick ? (
          <>
            <P style={{ marginBottom: 14 }}>{t('pl_conf_d')}</P>
            <Btn full busy={busy === 'card'} title={me.plans[pick].usd ? t('pl_card') : t('pl_pick')} onPress={() => choose(pick, 'card')}
              disabled={!!me.plans[pick].usd && !me.demoPayments} />
            {me.plans[pick].usd ? (
              <Btn full kind="sec" style={{ marginTop: 8 }} busy={busy === 'pts'} disabled={me.user.points < pts(price(pick))}
                title={t('pl_pts', num(pts(price(pick))))} onPress={() => choose(pick, 'pts')} />
            ) : null}
            <Btn full kind="ghost" title={t('cancel')} onPress={() => setPick(null)} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
