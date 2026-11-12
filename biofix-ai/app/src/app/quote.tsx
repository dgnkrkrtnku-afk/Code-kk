import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Btn, Input, P, Row, Screen } from '../components/ui';
import { useApp } from '../lib/app-context';
import type { Me } from '../lib/types';

export default function Quote() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { t, api, setMe, toast, errText } = useApp();
  const [qty, setQty] = useState('1');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const r = await api.post<{ me: Me }>(`/listings/${id}/quote`, { qty: Math.max(1, parseInt(qty, 10) || 1), msg });
      setMe(r.me);
      toast(t('q_sent'));
      router.back();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  return (
    <Screen>
      {title ? <P small muted style={{ marginBottom: 12 }}>{title}</P> : null}
      <Input label={t('q_qty')} value={qty} onChangeText={setQty} keyboardType="number-pad" />
      <Input label={t('q_msg')} value={msg} onChangeText={setMsg} placeholder={t('q_msg_ph')} multiline />
      <Row>
        <Btn kind="sec" title={t('cancel')} onPress={() => router.back()} />
        <Btn style={{ flex: 1 }} busy={busy} title={t('q_send')} onPress={send} />
      </Row>
    </Screen>
  );
}
