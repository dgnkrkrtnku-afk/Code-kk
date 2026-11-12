import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '../../components/icons';
import { CodeCards, DataCard, hasData, QuickResults } from '../../components/QuickResults';
import { Report, TeachCta } from '../../components/Report';
import { Btn, Card, H1, H2, Input, P, Row, Screen, Select, Sub, Tag, WarnBox } from '../../components/ui';
import { qs } from '../../lib/api';
import { unlimited, useApp } from '../../lib/app-context';
import { pickAttachment, pickImage, pickImages } from '../../lib/media';
import { MONO } from '../../lib/theme';
import type { DeviceLabel, Diagnosis, FilePayload, HistoryItem, ImagePayload, Quick, QuickList } from '../../lib/types';

const MAX_PHOTOS = 4;
/** Failures that are worth trying again as they are: a busy service, a dropped connection, a garbled answer. */
const TRANSIENT = new Set(['busy', 'timeout', 'network', 'rate_limited', 'invalid_json', 'generic', 'slow_down']);

export default function Assistant() {
  const { c, t, api, me, refreshMe, errText, toast, version } = useApp();
  const [devices, setDevices] = useState<string[]>([]);
  const [dev, setDev] = useState('');
  const [q, setQ] = useState('');
  const [photos, setPhotos] = useState<ImagePayload[]>([]);
  const [file, setFile] = useState<FilePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState('');
  const [quick, setQuick] = useState<Quick | null>(null);     // instant matches, before any AI
  const [partial, setPartial] = useState<Diagnosis | null>(null); // the AI answer while it is being written
  const [cur, setCur] = useState<HistoryItem | null>(null);   // the finished, saved diagnosis
  const [aiOff, setAiOff] = useState(false);                   // the answer was instant results only
  // The AI could not answer; the instant results stay on screen. 'retry': trying again may well work.
  const [failed, setFailed] = useState<'' | 'retry' | 'final'>('');
  const [shortcuts, setShortcuts] = useState<QuickList | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const ctlRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([api.get<{ devices: string[] }>('/devices'), api.get<{ items: HistoryItem[] }>('/history')]);
      setDevices(d.devices);
      setHistory(h.items);
    } catch { /* the status line shows connection problems */ }
  }, [api]);
  // `version` changes when something was added elsewhere in the app (a manual, a taught solution).
  useEffect(() => { load(); }, [load, me?.user.id, version]);

  // Shortcuts for the selected device: faults others solved on it, and its error codes.
  const shortcutsFor = useRef('');
  useEffect(() => {
    if (shortcutsFor.current !== dev) setShortcuts(null); // another device: the old chips would be wrong
    shortcutsFor.current = dev;
    if (!dev) return;
    let alive = true;
    api.get<QuickList>('/quick' + qs({ dev })).then((r) => { if (alive) setShortcuts(r); }).catch(() => {});
    return () => { alive = false; };
  }, [api, dev, version]);

  const plan = me?.plan;
  const status = !me
    ? { dot: c.muted, text: t('a_ai_wait') }
    : me.ai ? { dot: c.ok, text: t('a_ai_ok') } : { dot: c.warn, text: t('a_ai_none') };
  /** Photos and files are read by the AI, on plans that include it. */
  const canAttach = () => {
    if (plan?.photo) return true;
    toast(t('e_photo_plan'));
    return false;
  };

  async function addPhotos(src: 'camera' | 'library') {
    if (!canAttach()) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { toast(t('a_photos_max')); return; }
    try {
      const got = src === 'camera' ? await pickImage('camera') : await pickImages(room);
      if (got === 'denied') toast(t('e_perm'));
      else if (got) setPhotos((p) => [...p, ...(Array.isArray(got) ? got : [got])].slice(0, MAX_PHOTOS));
    } catch (e) {
      toast(errText(e));
    }
  }

  async function addFile() {
    if (!canAttach()) return;
    try {
      const f = await pickAttachment();
      if (f === 'too_big') toast(t('a_file_big'));
      else if (f === 'image') toast(t('a_file_image'));
      else if (f) setFile(f);
    } catch (e) {
      toast(errText(e));
    }
  }

  /** Photograph the device label and let the AI pick the device, instead of scrolling through the list. */
  async function scanLabel() {
    try {
      const img = await pickImage('camera', 1600);
      if (img === 'denied') { toast(t('e_perm')); return; }
      if (!img) return;
      setScanning(true);
      const r = await api.post<DeviceLabel>('/identify-device', { image: { data: img.data, mediaType: img.mediaType } }, undefined, 120_000);
      if (r.device) { setDev(r.device); toast(t('a_label_ok', r.device)); }
      else if (r.label) { setDev(r.label); toast(t('a_label_new', r.label)); }
      else toast(t('a_label_none'));
    } catch (e) {
      toast(errText(e));
    } finally {
      setScanning(false);
    }
  }

  /** `fresh`: ask the AI again even when a stored answer exists. */
  async function solve(text = q, fresh = false) {
    setErr('');
    if (!text.trim() && !photos.length && !file) { toast(t('a_need')); return; }
    if (me?.ai && plan && !unlimited(plan.quota) && me.user.usedToday >= plan.quota) { setErr(t('a_limit')); return; }
    setBusy(true); setQuick(null); setPartial(null); setCur(null); setAiOff(false); setFailed('');
    const ctl = new AbortController();
    ctlRef.current = ctl;
    // Photos and files take time to upload on a mobile connection. What the manuals and other technicians
    // already say needs none of that: ask for it separately so it is on screen while the upload runs.
    if (photos.length || file) {
      api.post<{ quick: Quick }>('/search', { q: text, dev }, ctl.signal)
        .then((r) => { if (!ctl.signal.aborted) setQuick((now) => now ?? r.quick); })
        .catch(() => { /* the full answer brings the instant results too */ });
    }
    try {
      await api.stream('/diagnose', {
        q: text, dev, fresh,
        images: photos.map((p) => ({ data: p.data, mediaType: p.mediaType })),
        file,
      }, (e) => {
        if (e.type === 'quick') setQuick(e.quick);
        else if (e.type === 'partial') setPartial(e.res);
        else if (e.type === 'done') {
          setPartial(null);
          if (e.item) {
            const item = e.item;
            setCur(item);
            setHistory((h) => [item, ...h.filter((x) => x.id !== item.id)]);
            // The saved record says what was attached; the next fault must not silently carry these along.
            setPhotos([]); setFile(null);
          } else setAiOff(true);
        }
      }, ctl.signal);
      refreshMe();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setPartial(null);
      if (code !== 'cancelled') {
        setErr(code === 'quota' ? t('a_limit') : errText(e));
        // Whatever was found without AI is still an answer: keep it on screen, in full.
        setFailed(code && TRANSIENT.has(code) ? 'retry' : 'final');
      }
    } finally {
      ctl.abort(); // ends the separate search too, if it is still running
      setBusy(false);
      if (ctlRef.current === ctl) ctlRef.current = null;
    }
  }

  /** A shortcut chip: fill in the fault and look it up straight away. */
  const run = (text: string) => { setQ(text); void solve(text); };
  const teachFrom = () => router.push({ pathname: '/teach', params: { dev, q } });
  const deviceOptions = [
    { value: '', label: t('a_dev_any') },
    ...[...new Set([...devices, ...(dev ? [dev] : [])])].map((d) => ({ value: d, label: d })),
  ];
  const chip = { borderColor: c.line, borderWidth: 1, backgroundColor: c.surface, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 } as const;

  return (
    <Screen>
      <H1>{t('a_title')}</H1>
      <Sub>{t('a_sub')}</Sub>
      <Row style={{ marginBottom: 12 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: status.dot }} />
        <P small muted style={{ flex: 1 }}>{status.text}</P>
        {me && plan ? (
          <Text style={{ fontFamily: MONO, color: c.muted, fontSize: 12 }}>
            {unlimited(plan.quota) ? t('a_quota_inf') : t('a_quota', me.user.usedToday, plan.quota)}
          </Text>
        ) : null}
      </Row>

      <Card>
        <Row style={{ alignItems: 'flex-end' }}>
          <Select half label={t('a_dev')} value={dev} onChange={setDev} options={deviceOptions} />
          {me?.ai ? (
            <Btn kind="sec" busy={scanning} title={t('a_label')} icon={scanning ? null : <Icon name="cam" color={c.ink} size={17} />} onPress={scanLabel} style={{ marginBottom: 12 }} />
          ) : null}
        </Row>

        {shortcuts && (shortcuts.faults.length || shortcuts.codes.length) ? (
          <View style={{ marginBottom: 12 }}>
            {shortcuts.faults.length ? (
              <>
                <P small muted style={{ marginBottom: 6 }}>{t('a_solved')}</P>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: shortcuts.codes.length ? 10 : 0 }}>
                  {shortcuts.faults.map((f) => (
                    <Pressable key={f.id} accessibilityRole="button" disabled={busy} onPress={() => run(f.symptom)} style={[chip, { maxWidth: '100%' }]}>
                      <Text style={{ color: c.ink, fontSize: 12.5, fontWeight: '600' }} numberOfLines={2}>
                        {f.status === 'ver' ? <Text style={{ color: c.ok }}>✓ </Text> : null}{f.symptom}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {shortcuts.codes.length ? (
              <>
                <P small muted style={{ marginBottom: 6 }}>{t('a_codes')}</P>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                  {shortcuts.codes.map((k) => (
                    <Pressable key={k.code} accessibilityRole="button" accessibilityLabel={`${k.code}: ${k.text}`} disabled={busy} onPress={() => run(k.code)} style={chip}>
                      <Text style={{ color: c.cyan, fontFamily: MONO, fontWeight: '700', fontSize: 12.5 }}>{k.code}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </View>
        ) : null}

        <Input label={t('a_q')} value={q} onChangeText={setQ} placeholder={t('a_q_ph')} multiline />

        {photos.length || file ? (
          <View style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {photos.map((p, i) => (
                <Pressable key={p.uri + i} accessibilityRole="button" accessibilityLabel={t('rm')} onPress={() => setPhotos((all) => all.filter((_, j) => j !== i))}>
                  <Image source={{ uri: p.uri }} style={{ width: 58, height: 58, borderRadius: 8 }} />
                  <View style={{ position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: c.bg, fontSize: 12, fontWeight: '800' }}>×</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            {file ? (
              <Row style={{ backgroundColor: c.sunk, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 10, marginTop: photos.length ? 8 : 0 }}>
                <P small style={{ flex: 1 }}>{'📎 ' + file.name}</P>
                <Btn kind="ghost" sm title={t('rm')} onPress={() => setFile(null)} />
              </Row>
            ) : null}
            <P small muted style={{ marginTop: 8 }}>{t('a_photo_privacy')}</P>
          </View>
        ) : null}

        {me?.ai ? (
          <Row wrap style={{ marginBottom: 10 }}>
            <Btn kind="sec" sm title={t('camera')} icon={<Icon name="cam" color={c.ink} size={16} />} onPress={() => addPhotos('camera')} />
            <Btn kind="sec" sm title={t('a_photo')} onPress={() => addPhotos('library')} />
            <Btn kind="sec" sm title={t('a_file')} onPress={addFile} />
          </Row>
        ) : null}
        {busy
          ? <Btn kind="sec" full title={t('a_stop')} onPress={() => ctlRef.current?.abort()} />
          : <Btn full title={t('a_go')} onPress={() => solve()} />}
      </Card>

      {err ? (
        <View>
          <WarnBox>{failed && quick ? `${err} ${t('a_ai_failed')}` : err}</WarnBox>
          {failed === 'retry' ? <Btn kind="sec" full style={{ marginBottom: 12 }} title={t('a_retry')} onPress={() => solve()} /> : null}
        </View>
      ) : null}

      {/* 1. Instant: what the manuals and other technicians already say. */}
      {busy && !quick ? (
        <Card accent={c.cyan}><Row><ActivityIndicator size="small" color={c.cyan} /><P bold>{t('loading')}</P></Row></Card>
      ) : null}
      {quick && (busy || aiOff || failed) ? (
        <>
          <H2 style={{ marginTop: 6 }}>{t('a_quick')}</H2>
          <QuickResults quick={quick} full={aiOff || !!failed} />
          {aiOff ? <TeachCta onTeach={teachFrom} /> : null}
        </>
      ) : null}
      {/* With the finished report: what the attached data contains, and what the manual says about its codes. */}
      {cur && hasData(cur.data) ? <DataCard data={cur.data} /> : null}
      {cur?.codes?.length ? <CodeCards codes={cur.codes} /> : null}

      {/* 2. The AI diagnosis, shown while it is written and then as the saved record. */}
      {busy && quick && !partial && me?.ai ? (
        <Card accent={c.cyan}>
          <Row><ActivityIndicator size="small" color={c.cyan} /><P bold>{t('a_ai_writing')}</P></Row>
          <P small muted style={{ marginTop: 6 }}>{t('a_long')}</P>
        </Card>
      ) : null}
      {partial && !cur ? <Report x={null} res={partial} dev={dev} onChange={setCur} onTeach={teachFrom} /> : null}
      {cur ? (
        <Report
          key={cur.id} x={cur} res={cur.res} dev={cur.dev} onTeach={teachFrom} onRegenerate={() => solve(cur.q, true)}
          onChange={(item) => { setCur(item); setHistory((h) => h.map((x) => (x.id === item.id ? item : x))); }}
        />
      ) : null}

      {history.length ? (
        <>
          <H2>{t('h_title')}</H2>
          <Card style={{ paddingVertical: 2 }}>
            {history.slice(0, 8).map((x, i) => (
              <Pressable
                key={x.id}
                onPress={() => {
                  setCur(x); setQ(x.q); setDev(x.dev); setErr(''); setPartial(null); setAiOff(false); setFailed('');
                  setQuick(null);
                }}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 11, borderBottomWidth: i === Math.min(history.length, 8) - 1 ? 0 : 1, borderBottomColor: c.line }}
              >
                <View style={{ flex: 1 }}>
                  <P bold style={{ fontSize: 13.5 }}>{x.q.slice(0, 70) || '📎'}</P>
                  {x.dev ? <P small muted>{x.dev}</P> : null}
                </View>
                <Tag>{x.date}</Tag>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
