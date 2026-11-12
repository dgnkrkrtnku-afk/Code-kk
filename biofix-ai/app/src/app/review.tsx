import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Btn, Card, Check, Input, P, Row, Screen, Select, SetRow } from '../components/ui';
import { useApp } from '../lib/app-context';
import type { Me } from '../lib/types';

type Months = 'rv_m1' | 'rv_m2' | 'rv_m3';

export default function Review() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { t, api, setMe, toast, errText, bump } = useApp();
  const [v, setV] = useState({ stars: '5', rel: '5', svc: '5', use: '5', val: '5' });
  const [months, setMonths] = useState<Months>('rv_m1');
  const [text, setText] = useState('');
  const [again, setAgain] = useState(true);
  const [decl, setDecl] = useState(false);
  const [busy, setBusy] = useState(false);
  const starOpts = [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${'★'.repeat(n)} ${n}` }));

  async function save() {
    if (!decl || text.trim().length < 10) { toast(t('rv_need')); return; }
    setBusy(true);
    try {
      const r = await api.post<{ awarded: number; me: Me }>(`/listings/${id}/reviews`, {
        stars: +v.stars, rel: +v.rel, svc: +v.svc, use: +v.use, val: +v.val, again, months, text, declared: true,
      });
      setMe(r.me);
      bump();
      toast(t('rv_saved', r.awarded));
      router.back();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  const rows: [keyof typeof v, string][] = [['stars', 'rv_overall'], ['rel', 'rv_rel'], ['svc', 'rv_svc'], ['use', 'rv_use'], ['val', 'rv_val']];
  return (
    <Screen>
      {name ? <P small muted style={{ marginBottom: 10 }}>{name}</P> : null}
      <Card style={{ paddingVertical: 2 }}>
        {rows.map(([k, label]) => (
          <SetRow key={k} label={t(label)}>
            <Select compact value={v[k]} onChange={(x) => setV({ ...v, [k]: x })} options={starOpts} />
          </SetRow>
        ))}
        <SetRow label={t('rv_months')} last>
          <Select<Months> compact value={months} onChange={setMonths} options={(['rv_m1', 'rv_m2', 'rv_m3'] as const).map((k) => ({ value: k, label: t(k) }))} />
        </SetRow>
      </Card>
      <Input label={t('rv_text')} value={text} onChangeText={setText} placeholder={t('rv_text_ph')} multiline />
      <Check value={again} onChange={setAgain} label={t('rv_again_q')} />
      <Check value={decl} onChange={setDecl} label={t('rv_decl')} />
      <Row>
        <Btn kind="sec" title={t('cancel')} onPress={() => router.back()} />
        <Btn style={{ flex: 1 }} busy={busy} title={t('rv_save')} onPress={save} />
      </Row>
    </Screen>
  );
}
