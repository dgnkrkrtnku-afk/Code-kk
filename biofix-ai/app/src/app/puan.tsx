import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Card, H1, Note, P, PointsBanner, Screen, Sub, WarnBox } from '../components/ui';
import { useApp } from '../lib/app-context';
import { billingReady, buyPack, loadPrices, playBillingSupported, type PlayPrices } from '../lib/billing';
import { MONO } from '../lib/theme';
import type { Me } from '../lib/types';

/** Buy point packs. Points pay for training programs and plans. */
export default function Points() {
  const { c, t, me, setMe, api, money, num, toast, errText } = useApp();
  const [busy, setBusy] = useState('');
  const [prices, setPrices] = useState<PlayPrices | null>(null);
  const canPlay = playBillingSupported && !!me?.billing.google;

  useEffect(() => {
    if (!canPlay) return;
    let alive = true;
    const load = () => { if (billingReady()) loadPrices().then((p) => { if (alive) setPrices(p); }); };
    load();
    const retry = setTimeout(load, 1500);
    return () => { alive = false; clearTimeout(retry); };
  }, [canPlay]);

  if (!me) return <Screen><P muted>{t('loading')}</P></Screen>;

  async function buy(productId: string, points: number) {
    setBusy(productId);
    try {
      if (canPlay) await buyPack(productId); // the server credits the points after verifying with Google
      else setMe((await api.post<{ me: Me }>('/billing/demo/points', { productId })).me);
      toast(t('b_bought', num(points)));
    } catch (e) {
      if ((e as { code?: string }).code !== 'cancelled') toast(errText(e));
    } finally {
      setBusy('');
    }
  }

  const available = canPlay || me.demoPayments;
  return (
    <Screen>
      <H1>{t('b_points_t')}</H1>
      <Sub>{t('b_points_d')}</Sub>
      <PointsBanner action={null} />
      {!available ? <WarnBox>{t('b_unavailable')}</WarnBox> : null}
      {me.billing.packs.map((p) => (
        <Card key={p.productId}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: MONO, fontSize: 19, fontWeight: '700', color: c.ink }}>{t('b_pack', num(p.points))}</Text>
              <P small muted>{prices?.packs[p.productId] ?? money(p.points / me.ptPerUsd)}</P>
            </View>
            <Btn
              title={t(canPlay ? 'b_buy' : 'b_buy_demo')} busy={busy === p.productId}
              disabled={!available || (canPlay && !billingReady()) || (!!busy && busy !== p.productId)}
              onPress={() => buy(p.productId, p.points)}
            />
          </View>
        </Card>
      ))}
      <Note>{t(canPlay ? 'b_play_pay' : me.demoPayments ? 'b_demo_note' : 'b_unavailable')}</Note>
    </Screen>
  );
}
