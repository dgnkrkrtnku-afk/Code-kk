import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Card, Empty, H1, H2, Input, Note, P, Screen, Select, SetRow, Sheet, Tag, Toggle, WarnBox } from '../../components/ui';
import { RATES, unlimited, useApp, type Currency } from '../../lib/app-context';
import { planName } from '../../lib/format';
import { MONO } from '../../lib/theme';
import type { Me } from '../../lib/types';

export default function Account() {
  const { c, t, s, update, me, setMe, meError, refreshMe, api, money, num, toast, errText, bump } = useApp();
  const [server, setServer] = useState(s.apiUrl);
  const [name, setName] = useState(s.name);
  const [admin, setAdmin] = useState(s.adminToken);
  const [confirmReset, setConfirmReset] = useState(false);

  function saveConn() {
    update({ apiUrl: server.trim(), name: name.trim(), adminToken: admin.trim() });
    toast(t('h_saved'));
  }

  async function reset() {
    try {
      setMe(await api.post<Me>('/me/reset'));
      bump();
      toast(t('h_reset_d'));
    } catch (e) {
      toast(errText(e));
    }
    setConfirmReset(false);
  }

  const plan = me?.plan;
  return (
    <Screen onRefresh={refreshMe}>
      <H1>{t('h_acc')}</H1>
      {meError ? <WarnBox>{meError}</WarnBox> : null}
      <Card style={{ paddingVertical: 2 }}>
        <SetRow label={t('h_plan')}>
          <Btn kind="ghost" sm title={me ? t(planName(me.user.plan)) : '—'} onPress={() => router.push('/planlar')} />
        </SetRow>
        <SetRow label={t('h_pts')}>
          <Btn kind="ghost" sm title={num(me?.user.points ?? 0)} onPress={() => router.push('/cozumler')} />
        </SetRow>
        <SetRow label={t('h_usage')}>
          <Text style={{ fontFamily: MONO, color: c.ink }}>
            {me && plan ? (unlimited(plan.quota) ? String(me.user.usedToday) : `${me.user.usedToday} / ${plan.quota}`) : '—'}
          </Text>
        </SetRow>
        <SetRow label={t('h_lang')}>
          <Select compact value={s.lang} onChange={(v) => update({ lang: v })} options={[{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }]} />
        </SetRow>
        <SetRow label={t('h_cur2')}>
          <Select<Currency> compact value={s.cur} onChange={(v) => update({ cur: v })} options={(Object.keys(RATES) as Currency[]).map((k) => ({ value: k, label: k }))} />
        </SetRow>
        <SetRow label={t('h_theme')}>
          <Select
            compact value={s.theme} onChange={(v) => update({ theme: v })}
            options={[{ value: 'system', label: t('th_sys') }, { value: 'light', label: t('th_light') }, { value: 'dark', label: t('th_dark') }]}
          />
        </SetRow>
        <SetRow label={t('h_contrast')} last={!me?.isAdmin}>
          <Toggle value={s.contrast} onChange={(v) => update({ contrast: v })} />
        </SetRow>
        {me?.isAdmin ? (
          <SetRow label={t('h_dev')} last>
            <Btn sm kind="sec" title={t('h_open')} onPress={() => router.push('/gelistirici')} />
          </SetRow>
        ) : null}
      </Card>

      <H2>{t('h_quotes')}</H2>
      {me?.user.quotes.length ? (
        <Card style={{ paddingVertical: 2 }}>
          {me.user.quotes.map((q, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, borderBottomWidth: i === me.user.quotes.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              <View style={{ flex: 1 }}>
                <P bold style={{ fontSize: 13.5 }}>{q.title}</P>
                <P small muted>{`${q.seller}, ${q.qty} × ${money(q.usd)}`}</P>
              </View>
              <Tag>{q.date}</Tag>
            </View>
          ))}
        </Card>
      ) : <Empty>{t('h_quotes_e')}</Empty>}

      <H2>{t('h_server')}</H2>
      <Card>
        <Input label={t('h_server')} value={server} onChangeText={setServer} placeholder={t('h_server_ph')} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Input label={t('h_name')} value={name} onChangeText={setName} placeholder={t('h_name_ph')} maxLength={40} />
        <Input label={t('h_admin')} value={admin} onChangeText={setAdmin} placeholder={t('h_admin_ph')} autoCapitalize="none" secureTextEntry />
        <Btn kind="sec" title={t('h_save')} onPress={saveConn} />
      </Card>

      <Note>{t('h_disc')}</Note>
      <Note>{t('h_rates')}</Note>
      <Btn kind="sec" full title={t('h_reset')} onPress={() => setConfirmReset(true)} />

      <Sheet visible={confirmReset} onClose={() => setConfirmReset(false)} title={t('h_reset')}>
        <P style={{ marginBottom: 14 }}>{t('h_reset_c')}</P>
        <Btn full title={t('h_reset')} onPress={reset} />
        <Btn full kind="ghost" title={t('cancel')} onPress={() => setConfirmReset(false)} />
      </Sheet>
    </Screen>
  );
}
