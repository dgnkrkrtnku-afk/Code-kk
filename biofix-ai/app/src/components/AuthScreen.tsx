import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CAN_EDIT_SERVER, PRIVACY_URL, useApp } from '../lib/app-context';
import type { AuthResult } from '../lib/types';
import { Icon } from './icons';
import { Btn, Card, Details, Input, P, WarnBox } from './ui';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

/** Shown instead of the app while nobody is signed in. */
export function AuthScreen() {
  const { c, t, s, update, api, signIn, errText, toast } = useApp();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [server, setServer] = useState(s.apiUrl);

  function go(m: Mode) { setMode(m); setErr(''); setInfo(''); setPassword(''); setCode(''); }

  async function submit() {
    setErr('');
    const mail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { setErr(t('au_e_email')); return; }
    if (mode === 'register' && name.trim().length < 2) { setErr(t('au_e_name')); return; }
    if (mode !== 'forgot' && mode !== 'login' && password.length < 8) { setErr(t('au_e_weak')); return; }
    if (mode === 'reset' && !/^\d{6}$/.test(code.trim())) { setErr(t('au_e_code')); return; }
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await api.post('/auth/forgot', { email: mail });
        go('reset');
        setInfo(t('au_code_sent'));
      } else {
        const body = mode === 'login' ? { email: mail, password }
          : mode === 'register' ? { email: mail, password, name: name.trim() }
            : { email: mail, code: code.trim(), password };
        signIn(await api.post<AuthResult>(`/auth/${mode}`, body));
      }
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const title = { login: 'au_title_in', register: 'au_title_up', forgot: 'au_forgot_t', reset: 'au_forgot_t' }[mode];
  const action = { login: 'au_login', register: 'au_register', forgot: 'au_send_code', reset: 'au_reset' }[mode];
  const link = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ paddingVertical: 10 }}>
      <Text style={{ color: c.cyan, fontWeight: '600', fontSize: 14, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28, maxWidth: 480, width: '100%', alignSelf: 'center' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: c.navy, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="asistan" color={c.onNavy} size={19} />
            </View>
            <Text style={{ fontWeight: '800', fontSize: 21, color: c.ink }}>BioFix AI</Text>
          </View>
          <Pressable
            accessibilityLabel="Dil / Language"
            onPress={() => update({ lang: s.lang === 'tr' ? 'en' : 'tr' })}
            style={{ borderColor: c.line, borderWidth: 1, backgroundColor: c.surface, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 }}
          >
            <Text style={{ color: c.ink, fontWeight: '600', fontSize: 12 }}>{s.lang.toUpperCase()}</Text>
          </Pressable>
        </View>

        <Text style={{ fontSize: 24, fontWeight: '800', color: c.ink, letterSpacing: -0.3 }}>{t(title)}</Text>
        <P muted style={{ marginTop: 4, marginBottom: 18 }}>{mode === 'forgot' ? t('au_forgot_d') : t('au_sub')}</P>

        <Card>
          {info ? <P small style={{ marginBottom: 12 }}>{info}</P> : null}
          {mode === 'register' ? (
            <>
              <Input label={t('au_name')} value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={40} />
              <P small muted style={{ marginTop: -6, marginBottom: 12 }}>{t('au_name_hint')}</P>
            </>
          ) : null}
          <Input
            label={t('au_email')} value={email} onChangeText={setEmail} keyboardType="email-address" inputMode="email"
            autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" maxLength={254}
          />
          {mode === 'reset' ? (
            <Input label={t('au_code')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" />
          ) : null}
          {mode !== 'forgot' ? (
            <View>
              <Input
                label={t(mode === 'reset' ? 'au_new_pass' : 'au_pass')} value={password} onChangeText={setPassword}
                secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} maxLength={200}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                textContentType={mode === 'login' ? 'password' : 'newPassword'}
                placeholder={mode === 'login' ? undefined : t('au_pass_hint')}
                onSubmitEditing={submit} returnKeyType="go"
              />
              <Pressable onPress={() => setShow(!show)} accessibilityRole="button" style={{ position: 'absolute', right: 4, top: 0, padding: 2 }}>
                <Text style={{ color: c.cyan, fontSize: 12.5, fontWeight: '600' }}>{t(show ? 'hide' : 'show')}</Text>
              </Pressable>
            </View>
          ) : null}
          {err ? <WarnBox>{err}</WarnBox> : null}
          <Btn full title={t(action)} busy={busy} onPress={submit} style={{ marginTop: 4 }} />
          {mode === 'register' && PRIVACY_URL ? (
            <P small muted style={{ marginTop: 10, textAlign: 'center' }}>{t('au_agree')}</P>
          ) : null}
        </Card>

        {mode === 'login' ? (
          <>
            {link(t('au_to_register'), () => go('register'))}
            {link(t('au_forgot'), () => go('forgot'))}
          </>
        ) : null}
        {mode === 'register' ? link(t('au_to_login'), () => go('login')) : null}
        {mode === 'forgot' ? link(t('au_have_code'), () => go('reset')) : null}
        {mode === 'forgot' || mode === 'reset' ? link(t('au_back'), () => go('login')) : null}
        {PRIVACY_URL ? link(t('au_privacy'), () => { Linking.openURL(PRIVACY_URL).catch(() => {}); }) : null}

        {CAN_EDIT_SERVER ? (
          <View style={{ marginTop: 18 }}>
            <Details title={t('h_server')}>
              <Input value={server} onChangeText={setServer} placeholder={t('h_server_ph')} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              <P small muted style={{ marginBottom: 10 }}>{t('h_server_dev')}</P>
              <Btn kind="sec" sm title={t('h_save')} onPress={() => { update({ apiUrl: server.trim() }); toast(t('h_saved')); }} />
            </Details>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
