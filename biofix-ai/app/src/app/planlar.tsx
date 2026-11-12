import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Badge, Between, Btn, Card, H1, Note, P, PointsBanner, Screen, Seg, Sheet, Sub, WarnBox } from '../components/ui';
import { useApp } from '../lib/app-context';
import { billingReady, buySubscription, loadPrices, manageSubscriptionUrl, playBillingSupported, type PlayPrices } from '../lib/billing';
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
  const { c, t, me, setMe, api, money, num, date, toast, errText } = useApp();
  const [pick, setPick] = useState<PlanId | null>(null);
  const [busy, setBusy] = useState('');
  const [prices, setPrices] = useState<PlayPrices | null>(null);
  const canPlay = playBillingSupported && !!me?.billing.google;

  useEffect(() => {
    if (!canPlay) return;
    let alive = true;
    // The Play connection may still be opening when the screen appears.
    const load = () => { if (billingReady()) loadPrices().then((p) => { if (alive) setPrices(p); }); };
    load();
    const retry = setTimeout(load, 1500);
    return () => { alive = false; clearTimeout(retry); };
  }, [canPlay]);

  if (!me) return <Screen><P muted>{t('loading')}</P></Screen>;

  const yr = me.user.billing === 'year';
  const period = yr ? 'year' : 'month';
  const price = (k: PlanId) => me.plans[k].usd * (yr ? 10 : 1);
  const pts = (usd: number) => Math.round(usd * me.ptPerUsd);
  const sub = me.user.sub;
  const productOf = (k: PlanId) => (k === 'free' ? '' : me.billing.subs[k]);
  /** Google Play's own price text when we have it, otherwise our list price. */
  const priceText = (k: PlanId) => prices?.subs[productOf(k)]?.[me.billing.basePlans[period]] ?? money(price(k));

  async function setBilling(b: 'month' | 'year') {
    try { setMe(await api.patch<Me>('/me', { billing: b })); } catch (e) { toast(errText(e)); }
  }

  async function finish(how: string, fn: () => Promise<void>, k: PlanId) {
    setBusy(how);
    try {
      await fn();
      setPick(null);
      toast(t('pl_done', t(planName(k))));
    } catch (e) {
      if ((e as { code?: string }).code !== 'cancelled') toast(errText(e));
    } finally {
      setBusy('');
    }
  }

  const viaServer = (k: PlanId, how: 'card' | 'pts') => finish(how, async () => { setMe(await api.post<Me>('/me/plan', { plan: k, how })); }, k);
  const viaPlay = (k: PlanId) => finish('play', () => buySubscription(productOf(k), me.billing.basePlans[period]), k);
  const openPlay = () => {
    if (sub) Linking.openURL(manageSubscriptionUrl(sub.productId, me.billing.packageName)).catch(() => {});
  };

  const status = sub
    ? t(sub.autoRenew ? 'b_renews' : 'b_ends', date(sub.expiresAt))
    : me.user.planUntil ? t('b_until', date(me.user.planUntil)) : '';

  return (
    <Screen>
      <H1>{t('pl_title')}</H1>
      <Sub>{t('pl_sub')}</Sub>
      <PointsBanner action={<Btn sm kind="sec" title={t('b_points_t')} onPress={() => router.push('/puan')} />} />
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
              {p.usd ? priceText(k) : t('pl_free')}
              {p.usd ? <Text style={{ fontSize: 12.5, fontWeight: '500', color: c.muted }}>{' ' + t(yr ? 'pl_yr' : 'pl_mo')}</Text> : null}
            </Text>
            {p.usd ? <P small muted mono>{`${num(pts(price(k)))} ${t('pts')}`}</P> : null}
            {cur && status ? <P small muted style={{ marginTop: 4 }}>{status}</P> : null}
            <View style={{ marginVertical: 10 }}>
              {FEATS[k].map((f) => (
                <Text key={f} style={{ color: c.ink, fontSize: 13.5, paddingVertical: 3 }}>
                  <Text style={{ color: c.ok, fontWeight: '700' }}>{'✓  '}</Text>{t(f, 100 - me.fee)}
                </Text>
              ))}
            </View>
            {cur
              ? (sub ? <Btn full kind="sec" title={t('b_manage')} onPress={openPlay} /> : p.usd ? <Btn full kind="sec" title={t('b_extend')} onPress={() => setPick(k)} /> : null)
              : <Btn full kind={k === 'free' ? 'sec' : 'pri'} title={t('pl_pick')} onPress={() => setPick(k)} />}
          </Card>
        );
      })}
      <Note>{t('h_rates')}</Note>

      <Sheet visible={!!pick} onClose={() => setPick(null)} title={pick ? t('pl_conf_t', t(planName(pick))) : ''}>
        {pick === 'free' ? (
          sub ? (
            <>
              <P style={{ marginBottom: 14 }}>{t('b_e_manage')}</P>
              <Btn full title={t('b_manage')} onPress={openPlay} />
            </>
          ) : (
            <>
              <P style={{ marginBottom: 14 }}>{t('b_free_c')}</P>
              <Btn full busy={busy === 'card'} title={t('pl_pick')} onPress={() => viaServer('free', 'card')} />
            </>
          )
        ) : pick ? (
          <>
            {/* 1. Real payment through Google Play */}
            {canPlay ? (
              <>
                <P small muted style={{ marginBottom: 12 }}>{t('b_terms')}</P>
                <Btn full busy={busy === 'play'} disabled={!billingReady()} title={`${t(sub ? 'b_change' : 'b_subscribe')}  ${priceText(pick)}${t(yr ? 'pl_yr' : 'pl_mo')}`} onPress={() => viaPlay(pick)} />
              </>
            ) : me.demoPayments ? (
              <>
                <P small muted style={{ marginBottom: 12 }}>{t('pl_conf_d')}</P>
                <Btn full busy={busy === 'card'} disabled={!!sub} title={t('pl_card')} onPress={() => viaServer(pick, 'card')} />
              </>
            ) : (
              <WarnBox>{t('b_unavailable')}</WarnBox>
            )}
            {/* 2. Points (not while a Play subscription is running) */}
            {sub ? (
              <P small muted style={{ marginTop: 12 }}>{t('b_e_manage')}</P>
            ) : (
              <>
                <Btn full kind="sec" style={{ marginTop: 8 }} busy={busy === 'pts'} disabled={me.user.points < pts(price(pick))}
                  title={t('pl_pts', num(pts(price(pick))))} onPress={() => viaServer(pick, 'pts')} />
                <P small muted style={{ marginTop: 8 }}>{t('b_pts_terms', t(yr ? 'b_period_y' : 'b_period_m'))}</P>
                {me.user.points < pts(price(pick)) ? (
                  <Btn full kind="ghost" title={t('b_points_t')} onPress={() => { setPick(null); router.push('/puan'); }} />
                ) : null}
              </>
            )}
          </>
        ) : null}
        <Btn full kind="ghost" title={t('cancel')} onPress={() => setPick(null)} />
      </Sheet>
    </Screen>
  );
}
