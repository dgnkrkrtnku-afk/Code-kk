import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Btn, Card, Empty, H1, H2, Input, Note, P, Screen, Select, SetRow, Sheet, Tag, Toggle, WarnBox } from '../../components/ui';
import { CAN_EDIT_SERVER, PRIVACY_URL, RATES, unlimited, useApp, type Currency } from '../../lib/app-context';
import { billingReady, manageSubscriptionUrl, playBillingSupported, restorePurchases } from '../../lib/billing';
import { planName } from '../../lib/format';
import { MONO } from '../../lib/theme';
import type { Me } from '../../lib/types';

export default function Account() {
  const {
    c, t, s, update, me, setMe, meError, refreshMe, api, money, num, date, toast, errText, signOut, forget, adminToken, setAdminToken,
  } = useApp();
  const [server, setServer] = useState(s.apiUrl);
  const [name, setName] = useState(me?.user.name ?? '');
  const [admin, setAdmin] = useState(adminToken);
  const [sheet, setSheet] = useState<'' | 'password' | 'delete'>('');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { setName(me?.user.name ?? ''); }, [me?.user.name]);

  const open = (k: 'password' | 'delete') => { setCur(''); setNext(''); setErr(''); setSheet(k); };

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setErr('');
    try { await fn(); } catch (e) { setErr(errText(e)); if (!sheet) toast(errText(e)); } finally { setBusy(''); }
  }

  const saveName = () => run('name', async () => {
    if (name.trim().length < 2) { toast(t('au_e_name')); return; }
    setMe(await api.patch<Me>('/me', { name: name.trim() }));
    toast(t('h_saved'));
  });

  const changePassword = () => run('password', async () => {
    if (next.length < 8) { setErr(t('au_e_weak')); return; }
    await api.post('/me/password', { current: cur, next });
    setSheet('');
    toast(t('h_pass_changed'));
  });

  const deleteAccount = () => run('delete', async () => {
    await api.post('/me/delete', { password: cur });
    setSheet('');
    forget(); // the server has already ended every session of this account
    toast(t('h_deleted'));
  });

  const restore = () => run('restore', async () => {
    await restorePurchases();
    await refreshMe();
    toast(t('b_restored'));
  });

  function saveDev() {
    if (CAN_EDIT_SERVER) update({ apiUrl: server.trim() });
    setAdminToken(admin.trim());
    toast(t('h_saved'));
  }

  const plan = me?.plan;
  const sub = me?.user.sub;
  const planLine = sub
    ? t(sub.autoRenew ? 'b_renews' : 'b_ends', date(sub.expiresAt))
    : me?.user.planUntil ? t('b_until', date(me.user.planUntil)) : '';

  return (
    <Screen onRefresh={refreshMe}>
      <H1>{t('h_acc')}</H1>
      {meError ? <WarnBox>{meError}</WarnBox> : null}
      <Card style={{ paddingVertical: 2 }}>
        <SetRow label={t('h_plan')}>
          <Btn kind="ghost" sm title={me ? t(planName(me.user.plan)) : '—'} onPress={() => router.push('/planlar')} />
        </SetRow>
        <SetRow label={t('h_pts')}>
          <Btn kind="ghost" sm title={num(me?.user.points ?? 0)} onPress={() => router.push('/puan')} />
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
      {planLine ? <P small muted style={{ marginTop: -4, marginBottom: 8 }}>{`${me ? t(planName(me.user.plan)) : ''}: ${planLine}`}</P> : null}
      {sub && me ? (
        <Btn kind="sec" sm title={t('b_manage')} style={{ alignSelf: 'flex-start', marginBottom: 8 }}
          onPress={() => { Linking.openURL(manageSubscriptionUrl(sub.productId, me.billing.packageName)).catch(() => {}); }} />
      ) : null}
      {playBillingSupported && me?.billing.google && billingReady() ? (
        <Btn kind="ghost" sm busy={busy === 'restore'} title={t('b_restore')} style={{ alignSelf: 'flex-start' }} onPress={restore} />
      ) : null}

      <H2>{t('h_security')}</H2>
      <Card>
        <P small muted>{t('h_email')}</P>
        <P bold selectable>{me?.user.email ?? '—'}</P>
        <P small style={{ color: c.ok, marginBottom: 12 }}>{me?.user.emailVerified ? '✓ ' + t('ev_ok') : ''}</P>
        <Input label={t('h_name')} value={name} onChangeText={setName} placeholder={t('h_name_ph')} maxLength={40} />
        {name.trim() !== (me?.user.name ?? '') ? <Btn kind="sec" sm busy={busy === 'name'} title={t('h_save')} onPress={saveName} style={{ alignSelf: 'flex-start', marginBottom: 12 }} /> : null}
        <Btn kind="sec" full title={t('h_change_pass')} onPress={() => open('password')} />
        <Btn kind="sec" full style={{ marginTop: 8 }} busy={busy === 'out'} title={t('h_logout')} onPress={() => run('out', () => signOut())} />
        <Btn kind="ghost" full busy={busy === 'outall'} title={t('h_logout_all')} onPress={() => run('outall', async () => { await signOut(true); toast(t('h_logged_out_all')); })} />
        {PRIVACY_URL ? <Btn kind="ghost" full title={t('au_privacy')} onPress={() => { Linking.openURL(PRIVACY_URL).catch(() => {}); }} /> : null}
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

      <H2>{t('h_admin')}</H2>
      <Card>
        {CAN_EDIT_SERVER ? (
          <Input label={t('h_server')} value={server} onChangeText={setServer} placeholder={t('h_server_ph')} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        ) : null}
        <Input label={t('h_admin')} value={admin} onChangeText={setAdmin} placeholder={t('h_admin_ph')} autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Btn kind="sec" title={t('h_save')} onPress={saveDev} />
      </Card>

      <Note>{t('h_disc')}</Note>
      <Note>{t('h_rates')}</Note>
      <Btn kind="ghost" full title={t('h_delete')} onPress={() => open('delete')} />

      <Sheet visible={sheet === 'password'} onClose={() => setSheet('')} title={t('h_change_pass')}>
        <Input label={t('h_cur_pass')} value={cur} onChangeText={setCur} secureTextEntry autoCapitalize="none" autoComplete="current-password" maxLength={200} />
        <Input label={t('au_new_pass')} value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" placeholder={t('au_pass_hint')} maxLength={200} />
        {err ? <WarnBox>{err}</WarnBox> : null}
        <Btn full busy={busy === 'password'} title={t('au_reset')} onPress={changePassword} />
        <Btn full kind="ghost" title={t('cancel')} onPress={() => setSheet('')} />
      </Sheet>

      <Sheet visible={sheet === 'delete'} onClose={() => setSheet('')} title={t('h_delete')}>
        <P style={{ marginBottom: 12 }}>{t('h_delete_c')}</P>
        {sub ? <WarnBox>{t('h_delete_sub')}</WarnBox> : null}
        <Input label={t('h_delete_p')} value={cur} onChangeText={setCur} secureTextEntry autoCapitalize="none" autoComplete="current-password" maxLength={200} />
        {err ? <WarnBox>{err}</WarnBox> : null}
        <Btn full busy={busy === 'delete'} disabled={!cur} title={t('h_delete')} onPress={deleteAccount} />
        <Btn full kind="ghost" title={t('cancel')} onPress={() => setSheet('')} />
      </Sheet>
    </Screen>
  );
}
