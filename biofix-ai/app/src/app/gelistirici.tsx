import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Btn, Card, Details, ErrorBox, H1, H2, Input, Loading, Note, P, Row, Screen, Select, SetRow, Stat, Sub, Tag } from '../components/ui';
import { ApiError, qs } from '../lib/api';
import { useApp } from '../lib/app-context';
import { pickImage, pickImages, pickManual } from '../lib/media';
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

  // The screen may be left while a long AI job is running; stop touching its state then.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // While the AI is still indexing a manual, keep the list fresh.
  const indexing = !!data?.docs.some((d) => d.ai?.status === 'running');
  useEffect(() => {
    if (!indexing) return;
    const h = setInterval(reload, 2500);
    return () => clearInterval(h);
  }, [indexing, reload]);

  /** Wait for the server to finish reading a scanned PDF, showing how far it is. */
  async function waitForJob(id: string): Promise<string> {
    type Job = { status: 'running' | 'done' | 'failed'; done: number; total: number; text: string; error: string };
    let dropped = 0;
    for (;;) {
      let j: Job;
      try {
        j = await api.get<Job>(`/admin/jobs/${id}`);
        dropped = 0;
      } catch (e) {
        // The reading goes on at the server; a short loss of signal should not throw away minutes of work.
        if ((e as ApiError).code !== 'network' || ++dropped > 8) throw e;
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (!alive.current) throw new ApiError('cancelled');
      setBusy(t('k_reading_ai', j.done, j.total));
      if (j.status === 'done') return j.text;
      if (j.status === 'failed') throw new ApiError(j.error && j.error !== 'generic' ? j.error : 'job_failed');
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  /** Add a manual from a file. `ai` forces the AI to read a PDF even when it has a text layer (tables, diagrams, poor scans). */
  async function fromFile(ai = false) {
    try {
      const f = await pickManual();
      if (!f) return;
      let text = '';
      setBusy(t('k_reading'));
      if (f.kind === 'text') {
        // Decoded on the server: old text files are often not UTF-8, which is all a phone can read.
        text = (await api.post<{ text: string }>('/admin/ingest-text', { data: f.data }, undefined, 120_000)).text;
      } else {
        const r = await api.post<{ mode: 'text' | 'ai'; scanned: number; text?: string; job?: string }>('/admin/ingest-pdf', { data: f.data, name: f.name, ai }, undefined, 240_000);
        text = r.mode === 'ai' && r.job ? await waitForJob(r.job) : r.text || '';
        // Without AI on the server the scanned pages of a mixed manual are missing from the text: say so.
        if (r.mode === 'text' && r.scanned > 0) toast(t('k_scanned_n', r.scanned));
      }
      if (!alive.current) return;
      setDocDraft({ name: f.name, text });
      router.push('/doc-new');
    } catch (e) {
      if ((e as { code?: string }).code !== 'cancelled') toast(errText(e));
    } finally {
      if (alive.current) setBusy('');
    }
  }

  /** Add a manual from photographed pages: one from the camera, or several from the gallery in page order. */
  async function fromPages(source: 'camera' | 'library') {
    if (!me?.ai) { toast(t('k_ocr_need')); return; }
    try {
      const got = source === 'camera' ? await pickImage('camera', 2000) : await pickImages(12, 2000);
      if (got === 'denied') { toast(t('e_perm')); return; }
      const pages = Array.isArray(got) ? got : got ? [got] : [];
      if (!pages.length) return;
      const texts: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        setBusy(pages.length > 1 ? t('k_ocr_n', i + 1, pages.length) : t('k_ocr'));
        const r = await api.post<{ text: string }>('/admin/ocr', { image: { data: pages[i].data, mediaType: pages[i].mediaType } }, undefined, 300_000);
        if (!alive.current) return;
        texts.push(r.text);
      }
      setDocDraft({ name: '', text: texts.join('\n\n') });
      router.push('/doc-new');
    } catch (e) {
      toast(errText(e));
    } finally {
      if (alive.current) setBusy('');
    }
  }

  async function indexDoc(id: string) {
    try {
      await api.post(`/admin/docs/${id}/index`);
      reload();
    } catch (e) { toast(errText(e)); }
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

      <H2>{t('d_accounts')}</H2>
      <Row style={{ marginBottom: 6 }}>
        <Stat value={String(data.accounts.verified)} label={t('d_acc_ok')} />
        <Stat value={String(data.accounts.pending)} label={t('d_acc_wait')} />
      </Row>
      <Note>{t('d_acc_d')}</Note>

      <H2>{t('d_man')}</H2>
      <Row style={{ marginBottom: 12 }}>
        <Stat value={String(data.docs.length)} label={t('k_docs')} />
        <Stat value={String(data.chunkCount)} label={t('k_chunks')} />
        <Stat value={String(data.solCount)} label={t('k_sols')} />
      </Row>
      <Card>
        <Row>
          <Btn kind="sec" style={{ flex: 1 }} title={t('k_paste')} onPress={() => { setDocDraft({ name: '', text: '' }); router.push('/doc-new'); }} />
          <Btn kind="sec" style={{ flex: 1 }} title={t('k_file')} disabled={!!busy} onPress={() => fromFile()} />
        </Row>
        {data.ai ? (
          <>
            <Row style={{ marginTop: 8 }}>
              <Btn kind="sec" style={{ flex: 1 }} title={t('k_page')} disabled={!!busy} onPress={() => fromPages('camera')} />
              <Btn kind="sec" style={{ flex: 1 }} title={t('k_pages')} disabled={!!busy} onPress={() => fromPages('library')} />
            </Row>
            <Btn kind="sec" full style={{ marginTop: 8 }} title={t('k_pdf_ai')} disabled={!!busy} onPress={() => fromFile(true)} />
            <P small muted style={{ marginTop: 8 }}>{t('k_pdf_ai_d')}</P>
          </>
        ) : null}
        {busy ? <Row style={{ marginTop: 10 }}><ActivityIndicator size="small" color={c.cyan} /><P small muted>{busy}</P></Row> : null}
        <Note>{t('k_right')}</Note>
        {data.ai ? <Note>{t('k_ai_d')}</Note> : null}
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
                {d.codes ? <Tag>{t('k_codes_n', d.codes)}</Tag> : null}
              </Row>
              {/* The AI pass that makes this manual findable from a fault description in either language. */}
              {d.ai?.status === 'running' ? (
                <Row style={{ marginTop: 8 }}><ActivityIndicator size="small" color={c.cyan} /><P small muted>{t('k_ai_running', d.ai.done, d.ai.total)}</P></Row>
              ) : d.ai?.status === 'done' ? (
                <P small style={{ marginTop: 8, color: c.ok }}>{'✓ ' + t('k_ai_done')}</P>
              ) : data.ai ? (
                <Row wrap style={{ marginTop: 8 }}>
                  {d.ai?.status === 'failed' ? <P small style={{ color: c.bad }}>{t('k_ai_failed')}</P> : null}
                  <Btn sm kind="sec" title={t('k_ai_run')} onPress={() => indexDoc(d.id)} />
                </Row>
              ) : null}
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
