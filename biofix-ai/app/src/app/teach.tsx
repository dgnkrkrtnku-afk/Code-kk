import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image } from 'react-native';
import { Btn, Input, P, Row, Screen } from '../components/ui';
import { useApp } from '../lib/app-context';
import { pickImage } from '../lib/media';
import type { ImagePayload, Me, SolutionView } from '../lib/types';

/** "Teach a solution" form. Prefilled from the assistant (device + fault). */
export default function Teach() {
  const p = useLocalSearchParams<{ dev?: string; q?: string }>();
  const { t, api, setMe, toast, errText, bump } = useApp();
  const parts = (p.dev || '').split(' ');
  const [brand, setBrand] = useState(parts[0] || '');
  const [model, setModel] = useState(parts.slice(1).join(' '));
  const [sym, setSym] = useState(p.q || '');
  const [steps, setSteps] = useState('');
  const [part, setPart] = useState('');
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState<ImagePayload | null>(null);
  const [busy, setBusy] = useState(false);

  async function addPhoto(src: 'camera' | 'library') {
    const r = await pickImage(src, 900).catch(() => null);
    if (r === 'denied') toast(t('e_perm'));
    else if (r) setPhoto(r);
  }

  async function save() {
    if (!(brand.trim() || model.trim()) || sym.trim().length < 5 || steps.trim().length < 20) { toast(t('f_need')); return; }
    setBusy(true);
    try {
      const r = await api.post<{ item: SolutionView; me: Me; awarded: number }>('/solutions', {
        brand, model, symptom: sym, steps, part, code,
        photo: photo ? { data: photo.data, mediaType: photo.mediaType } : null,
      });
      setMe(r.me);
      bump();
      toast(r.awarded ? t('f_saved', r.awarded, r.me.pt.verified) : t('f_saved_cap', r.me.pt.verified));
      router.dismissTo({ pathname: '/cozumler', params: { tab: 'mine', q: '' } });
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Row style={{ alignItems: 'flex-start' }}>
        <Input half label={t('k_brand')} value={brand} onChangeText={setBrand} />
        <Input half label={t('k_model')} value={model} onChangeText={setModel} />
      </Row>
      <Input label={t('f_sym')} value={sym} onChangeText={setSym} placeholder={t('f_sym_ph')} />
      <Input label={t('f_steps')} value={steps} onChangeText={setSteps} placeholder={t('f_steps_ph')} multiline minHeight={150} />
      <Row style={{ alignItems: 'flex-start' }}>
        <Input half label={t('f_part')} value={part} onChangeText={setPart} />
        <Input half label={t('f_code')} value={code} onChangeText={setCode} autoCapitalize="characters" />
      </Row>
      {photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10, marginBottom: 8 }} /> : null}
      {photo ? <P small muted style={{ marginBottom: 8 }}>{t('a_photo_privacy')}</P> : null}
      <Row style={{ marginBottom: 12 }}>
        <Btn kind="sec" style={{ flex: 1 }} title={photo ? '✓ ' + t('f_photo_ok') : t('f_photo')} onPress={() => addPhoto('library')} />
        <Btn kind="sec" title={t('camera')} onPress={() => addPhoto('camera')} />
      </Row>
      <Row>
        <Btn kind="sec" title={t('cancel')} onPress={() => router.back()} />
        <Btn style={{ flex: 1 }} busy={busy} title={t('f_save')} onPress={save} />
      </Row>
    </Screen>
  );
}
