import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Btn, Card, Details, ErrorBox, H1, H2, Input, Loading, Note, P, Row, Screen, Select, SetRow, Stat, Sub, Tag } from '../components/ui';
import { qs } from '../lib/api';
import { useApp } from '../lib/app-context';
import { pickImage, pickManual } from '../lib/media';
import { setDocDraft } from '../lib/doc-draft';
import { MONO } from '../lib/theme';
import type { AdminOverview, Source } from '../lib/types';
import { useLoad } from '../lib/use-load';

/** Developer panel: manuals, search test, training revenue. Unlocked by the admin token. */
export default function Developer() {
  const { c, t, api, me, money, toast, errText, bump } = useApp();
  const { data, setData, error, reload } = useLoad(() => api.get<AdminOverview>('/admin/overview'), []);
  const [busy, setBusy] = useState('');
  const [test, setTest] = useState('');
  const [hits, setHits] = useState<(Source & { type: string })[] | null>(null);

  useEffect(() => {
    if (!test.trim()) { setHits(null); return; }
    const h = setTimeout(() => {
      api.get<{ hits: (Source & { type: string })[] }>('/admin/search' + qs({ q: test })).then((r) => setHits(r.hits)).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(h);
  }, [test, api]);

  async function fromFile() {
    try {
      const f = await pickManual();
      if (!f) return;
      if (f.pdfBase64) {
        setBusy(t('k_reading'));
        const r = await api.post<{ text: string }>('/admin/extract-pdf', { data: f.pdfBase64 });
        setDocDraft({ name: f.name, text: r.text });
      } else {
        setDocDraft({ name: f.name, text: f.text || '' });
      }
      router.push('/doc-new');
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy('');
    }
  }

  async function fromPage() {
    if (!me?.ai) { toast(t('k_ocr_need')); return; }
    try {
      const img = await pickImage('camera', 2000);
      if (img === 'denied') { toast(t('e_perm')); return; }
      if (!img) return;
      setBusy(t('k_ocr'));
      const r = await api.post<{ text: string }>('/admin/ocr', { image: { data: img.data, mediaType: img.mediaType } });
      setDocDraft({ name: '', text: r.text });
      router.push('/doc-new');
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy('');
    }
  }

  async function del(id: string) {
    try {
      await api.del(`/admin/docs/${id}`);
      toast(t('k_deleted'));
      bump();
      reload();
    } catch (e) { toast(errText(e)); }
  }

  async function verify(id: string) {
    try {
      await api.post(`/admin/listings/${id}/verify`);
      bump();
      reload();
    } catch (e) { toast(errText(e)); }
  }

  async function setFee(fee: number) {
    try {
      await api.patch('/admin/fee', { fee });
      setData((d) => (d ? { ...d, fee } : d));
      bump();
    } catch (e) { toast(errText(e)); }
  }

  if (error && !data) return <Screen><ErrorBox msg={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen><Loading /></Screen>;

  return (
    <Screen onRefresh={reload}>
      <H1>{t('d_title')}</H1>
      <Sub>{t('d_sub')}</Sub>

      <H2>{t('d_rev')}</H2>
      <Row style={{ marginBottom: 12 }}>
        <Stat value={money(data.totalSales)} label={t('d_total')} />
        <Stat value={money(data.totalFee)} label={t('d_fee')} />
      </Row>
      <Card style={{ paddingVertical: 2 }}>
        <SetRow label={t('d_rate')} last={!data.sales.length}>
          <Select compact value={String(data.fee)} onChange={(v) => setFee(Number(v))} options={[10, 15, 20, 25, 30].map((n) => ({ value: String(n), label: `%${n}` }))} />
        </SetRow>
        {data.sales.length ? data.sales.slice(0, 6).map((x, i) => (
          <SetRow key={i} label={`${x.title}\n${x.date}, ${money(x.usd)}`} last={i === Math.min(data.sales.length, 6) - 1}>
            <Text style={{ fontFamily: MONO, color: c.ok, fontWeight: '700' }}>{'+' + money(x.fee)}</Text>
          </SetRow>
        )) : <View style={{ paddingVertical: 10 }}><P small muted>{t('d_nosale')}</P></View>}
      </Card>

      <H2>{t('d_man')}</H2>
      <Row style={{ marginBottom: 12 }}>
        <Stat value={String(data.docs.length)} label={t('k_docs')} />
        <Stat value={String(data.chunkCount)} label={t('k_chunks')} />
        <Stat value={String(data.solCount)} label={t('k_sols')} />
      </Row>
      <Card>
        <Row>
          <Btn kind="sec" style={{ flex: 1 }} title={t('k_paste')} onPress={() => { setDocDraft({ name: '', text: '' }); router.push('/doc-new'); }} />
          <Btn kind="sec" style={{ flex: 1 }} title={t('k_file')} onPress={fromFile} />
        </Row>
        {me?.ai ? <Btn kind="sec" full style={{ marginTop: 8 }} title={t('k_page')} onPress={fromPage} /> : null}
        {busy ? <Row style={{ marginTop: 10 }}><ActivityIndicator size="small" color={c.cyan} /><P small muted>{busy}</P></Row> : null}
        <Note>{t('k_right')}</Note>
      </Card>
      {data.docs.map((d) => (
        <Card key={d.id}>
          <Row style={{ alignItems: 'flex-start' }} gap={11}>
            <View style={{ width: 38, height: 46, borderRadius: 6, backgroundColor: c.sunk, borderColor: c.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: MONO, fontSize: 10, fontWeight: '700', color: c.muted }}>{d.kind === 'sample' ? 'ÖRN' : 'DOC'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <P bold>{d.title}</P>
              <P small muted>{`${d.brand} ${d.model}`.trim()}</P>
              <Row wrap style={{ marginTop: 6 }}>
                <Tag>{`${d.chunks} ${t('k_chunks').toLocaleLowerCase()}`}</Tag>
                <Tag>{t(d.kind === 'sample' ? 'k_sample' : 'k_manual')}</Tag>
              </Row>
            </View>
            <Btn kind="ghost" sm title={t('k_del')} onPress={() => del(d.id)} />
          </Row>
        </Card>
      ))}

      <H2>{t('d_pending')}</H2>
      {data.pendingListings.length ? data.pendingListings.map((l) => (
        <Card key={l.id}>
          <P bold>{l.title}</P>
          <P small muted>{`${l.seller} · ${l.brand} ${l.model}`.trim()}</P>
          <Row style={{ marginTop: 8 }}>
            <Btn sm kind="sec" title={t('h_open')} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: l.id } })} />
            <Btn sm title={t('d_verify')} onPress={() => verify(l.id)} />
          </Row>
        </Card>
      )) : <P small muted>{t('d_none_pending')}</P>}
      <Note>{t('d_pending_d')}</Note>

      <H2>{t('k_test')}</H2>
      <Card>
        <Input value={test} onChangeText={setTest} placeholder={t('k_test_ph')} />
        {hits === null ? null : hits.length ? hits.map((h, i) => (
          <Details key={i} title={`${h.title}${h.h ? ' / ' + h.h : ''}`}><P small muted selectable>{h.t}</P></Details>
        )) : <P small muted>{t('k_test_none')}</P>}
      </Card>

      <H2>{t('d_mod')}</H2>
      <Note>{t('d_mod_d')}</Note>
    </Screen>
  );
}
