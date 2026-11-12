import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Input, P, Row, Screen, Select } from '../components/ui';
import { RATES, useApp } from '../lib/app-context';
import { parsePrice } from '../lib/format';
import { MONO } from '../lib/theme';

export default function CourseNew() {
  const { c, t, s, api, me, money, toast, errText, bump } = useApp();
  const [name, setName] = useState('');
  const [cat, setCat] = useState<'svc' | 'use'>('svc');
  const [level, setLevel] = useState<'b' | 'i' | 'a'>('i');
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState('2');
  const [desc, setDesc] = useState('');
  const [lessons, setLessons] = useState('');
  const [busy, setBusy] = useState(false);
  const usd = parsePrice(price) / RATES[s.cur];
  const fee = me?.fee ?? 20;

  async function save() {
    if (!name.trim() || !(usd > 0) || !lessons.trim()) { toast(t('ef_need')); return; }
    setBusy(true);
    try {
      await api.post('/courses', { title: name, cat, level, hours: parseInt(hours, 10) || 1, usd, desc, lessonsText: lessons });
      bump();
      toast(t('ef_done'));
      router.back();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  return (
    <Screen>
      <Input label={t('ef_name')} value={name} onChangeText={setName} />
      <Row style={{ alignItems: 'flex-start' }}>
        <Select half label={t('ef_cat')} value={cat} onChange={setCat} options={(['svc', 'use'] as const).map((k) => ({ value: k, label: t('cat_' + k) }))} />
        <Select half label={t('ef_level')} value={level} onChange={setLevel} options={(['b', 'i', 'a'] as const).map((k) => ({ value: k, label: t('lv_' + k) }))} />
      </Row>
      <Row style={{ alignItems: 'flex-start' }}>
        <Input half label={`${t('ef_price')} (${s.cur})`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        <Input half label={t('ef_hours')} value={hours} onChangeText={setHours} keyboardType="number-pad" />
      </Row>
      <View style={{ backgroundColor: c.sunk, borderRadius: 10, padding: 10, marginBottom: 12 }}>
        {[[t('sp_price'), usd], [t('sp_fee', fee), usd * fee / 100], [t('sp_you'), usd * (100 - fee) / 100]].map(([k, v]) => (
          <View key={String(k)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
            <P small>{String(k)}</P><Text style={{ fontFamily: MONO, fontWeight: '700', color: c.ink }}>{money(Number(v))}</Text>
          </View>
        ))}
      </View>
      <Input label={t('ef_desc')} value={desc} onChangeText={setDesc} multiline minHeight={70} />
      <Input label={t('ef_lessons')} value={lessons} onChangeText={setLessons} placeholder={t('ef_lessons_ph')} multiline minHeight={170} />
      <Row>
        <Btn kind="sec" title={t('cancel')} onPress={() => router.back()} />
        <Btn style={{ flex: 1 }} busy={busy} title={t('ef_save')} onPress={save} />
      </Row>
    </Screen>
  );
}
