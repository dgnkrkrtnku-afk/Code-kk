import { router } from 'expo-router';
import { useState } from 'react';
import { Btn, Input, Note, Row, Screen } from '../components/ui';
import { useApp } from '../lib/app-context';
import { clearDocDraft, getDocDraft } from '../lib/doc-draft';

/** Developer: add a service manual (pasted, from PDF/TXT, or OCR'd page) to the knowledge base. */
export default function DocNew() {
  const { t, api, toast, errText, bump } = useApp();
  const [draft] = useState(getDocDraft);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [name, setName] = useState(draft.name);
  const [text, setText] = useState(draft.text);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || text.trim().length < 20) { toast(t('k_need')); return; }
    setBusy(true);
    try {
      const r = await api.post<{ chunks: number }>('/admin/docs', { title: name, brand, model, text });
      clearDocDraft(); // the text can be megabytes long
      bump();
      toast(t('k_added', name, r.chunks));
      router.back();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  return (
    <Screen>
      <Row style={{ alignItems: 'flex-start' }}>
        <Input half label={t('k_brand')} value={brand} onChangeText={setBrand} />
        <Input half label={t('k_model')} value={model} onChangeText={setModel} />
      </Row>
      <Input label={t('k_name')} value={name} onChangeText={setName} />
      <Input label={t('k_text')} value={text} onChangeText={setText} placeholder={t('k_text_ph')} multiline minHeight={220} />
      <Note>{t('k_right')}</Note>
      <Row>
        <Btn kind="sec" title={t('cancel')} onPress={() => router.back()} />
        <Btn style={{ flex: 1 }} busy={busy} title={t('k_save')} onPress={save} />
      </Row>
    </Screen>
  );
}
