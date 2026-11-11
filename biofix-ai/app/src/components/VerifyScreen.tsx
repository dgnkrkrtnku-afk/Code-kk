import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../lib/app-context';
import type { Me } from '../lib/types';
import { Icon } from './icons';
import { Btn, Card, Input, P, WarnBox } from './ui';

/**
 * Shown after sign-up (and after signing in to an account that never finished it): the user proves
 * the address is theirs by typing the code we e-mailed. Nothing else in the app is reachable until then.
 */
export function VerifyScreen() {
  const { c, t, me, setMe, api, signOut, errText, toast } = useApp();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function verify() {
    setErr('');
    if (!/^\d{6}$/.test(code.trim())) { setErr(t('au_e_code')); return; }
    setBusy('verify');
    try {
      setMe(await api.post<Me>('/auth/verify', { code: code.trim() }));
      toast(t('ev_done'));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy('');
    }
  }

  async function resend() {
    setErr('');
    setBusy('resend');
    try {
      await api.post('/auth/resend');
      setCode('');
      toast(t('ev_resent'));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy('');
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28, maxWidth: 480, width: '100%', alignSelf: 'center' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 26 }}>
          <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: c.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="asistan" color={c.onNavy} size={19} />
          </View>
          <Text style={{ fontWeight: '800', fontSize: 21, color: c.ink }}>BioFix AI</Text>
        </View>

        <Text style={{ fontSize: 24, fontWeight: '800', color: c.ink, letterSpacing: -0.3 }}>{t('ev_title')}</Text>
        <P muted style={{ marginTop: 6 }}>{t('ev_sub')}</P>
        <P bold selectable style={{ marginTop: 4, marginBottom: 18 }}>{me?.user.email ?? ''}</P>

        <Card>
          <Input
            label={t('au_code')} value={code} onChangeText={setCode} keyboardType="number-pad" inputMode="numeric" maxLength={6}
            autoComplete="one-time-code" textContentType="oneTimeCode" onSubmitEditing={verify} returnKeyType="go"
          />
          {err ? <WarnBox>{err}</WarnBox> : null}
          <Btn full title={t('ev_verify')} busy={busy === 'verify'} onPress={verify} />
          <Btn full kind="ghost" title={t('ev_resend')} busy={busy === 'resend'} onPress={resend} />
        </Card>

        <P small muted style={{ marginTop: 6, marginBottom: 14 }}>{t('ev_hint')}</P>
        <Btn full kind="sec" title={t('ev_other')} busy={busy === 'out'} onPress={() => { setBusy('out'); void signOut(); }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
