import { router } from 'expo-router';
import { useState } from 'react';
import { Btn, Check, Input, P, Row, Screen, Select } from '../components/ui';
import { COUNTRY } from '../i18n';
import { RATES, useApp, type Currency } from '../lib/app-context';
import { parsePrice } from '../lib/format';

type Cat = 'device' | 'part' | 'cons' | 'acc';
type Cond = 'new' | 'used' | 'refurb';

export default function Sell() {
  const { t, s, api, me, toast, errText, bump } = useApp();
  const [cat, setCat] = useState<Cat>('device');
  const [cond, setCond] = useState<Cond>('new');
  const [f, setF] = useState({ name: '', brand: '', model: '', year: '', stock: '1', price: '', reg: '', desc: '' });
  const [cur, setCur] = useState<Currency>(s.cur);
  const [country, setCountry] = useState('TR');
  const [decl, setDecl] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const cName = (code: string) => COUNTRY[code][s.lang === 'tr' ? 0 : 1];

  if (me && !me.plan.sell) {
    return (
      <Screen>
        <P bold style={{ fontSize: 17, marginBottom: 8 }}>{t('s_gate_t')}</P>
        <P style={{ marginBottom: 14 }}>{t('s_gate_d')}</P>
        <Btn full title={t('e_plans')} onPress={() => router.replace('/planlar')} />
        <Btn full kind="ghost" title={t('cancel')} onPress={() => router.back()} />
      </Screen>
    );
  }

  async function save() {
    const price = parsePrice(f.price);
    if (!f.name.trim() || !(price > 0) || !decl) { toast(t('s_need')); return; }
    setBusy(true);
    try {
      await api.post('/listings', {
        cat, cond, name: f.name, brand: f.brand, model: f.model, year: parseInt(f.year, 10) || 0,
        stock: parseInt(f.stock, 10) || 1, usd: price / RATES[cur], country, reg: f.reg, desc: f.desc, declared: true,
      });
      bump();
      toast(t('s_done'));
      router.back();
    } catch (e) {
      const code = (e as { code?: string }).code;
      toast(code === 'listing_limit' && me ? t('s_limit', me.plan.sell) : errText(e));
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <Row style={{ alignItems: 'flex-start' }}>
        <Select<Cat> half label={t('s_cat')} value={cat} onChange={setCat} options={(['device', 'part', 'cons', 'acc'] as const).map((k) => ({ value: k, label: t('cat_' + k) }))} />
        <Select<Cond> half label={t('cond_all')} value={cond} onChange={setCond} options={(['new', 'used', 'refurb'] as const).map((k) => ({ value: k, label: t('cond_' + k) }))} />
      </Row>
      <Input label={t('s_name')} value={f.name} onChangeText={set('name')} />
      <Row style={{ alignItems: 'flex-start' }}>
        <Input half label={t('k_brand')} value={f.brand} onChangeText={set('brand')} />
        <Input half label={t('k_model')} value={f.model} onChangeText={set('model')} />
      </Row>
      <Row style={{ alignItems: 'flex-start' }}>
        <Input half label={t('p_year')} value={f.year} onChangeText={set('year')} keyboardType="number-pad" />
        <Input half label={t('p_stock')} value={f.stock} onChangeText={set('stock')} keyboardType="number-pad" />
      </Row>
      <Row style={{ alignItems: 'flex-start' }}>
        <Input half label={t('s_price')} value={f.price} onChangeText={set('price')} keyboardType="decimal-pad" />
        <Select<Currency> half label={t('s_cur')} value={cur} onChange={setCur} options={(Object.keys(RATES) as Currency[]).map((k) => ({ value: k, label: k }))} />
      </Row>
      <Row style={{ alignItems: 'flex-start' }}>
        <Select half label={t('s_country')} value={country} onChange={setCountry} options={Object.keys(COUNTRY).map((k) => ({ value: k, label: cName(k) }))} />
        <Input half label={t('p_reg')} value={f.reg} onChangeText={set('reg')} />
      </Row>
      <Input label={t('s_desc')} value={f.desc} onChangeText={set('desc')} multiline />
      <Check value={decl} onChange={setDecl} label={t('s_decl')} />
      <Row>
        <Btn kind="sec" title={t('cancel')} onPress={() => router.back()} />
        <Btn style={{ flex: 1 }} busy={busy} title={t('s_publish')} onPress={save} />
      </Row>
    </Screen>
  );
}
