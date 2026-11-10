import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { Icon } from '../../components/icons';
import { SolutionCard } from '../../components/SolutionCard';
import {
  Badge, Btn, Card, Details, Empty, H1, H2, Input, P, Row, Screen, Select, Sub, Tag, WarnBox, type Tone,
} from '../../components/ui';
import { unlimited, useApp } from '../../lib/app-context';
import { pickImage } from '../../lib/media';
import { MONO } from '../../lib/theme';
import type { HistoryItem, ImagePayload, Level, SolutionView, Source } from '../../lib/types';
import { setPendingMarketQuery } from '../../lib/market-query';

const LVL: Record<Level, [Tone, string, string]> = {
  high: ['ok', 'c_high', '●●●'], medium: ['warn', 'c_mid', '●●○'], low: ['bad', 'c_low', '●○○'],
};

export default function Assistant() {
  const { c, t, api, me, refreshMe, errText, toast } = useApp();
  const [devices, setDevices] = useState<string[]>([]);
  const [dev, setDev] = useState('');
  const [q, setQ] = useState('');
  const [photo, setPhoto] = useState<ImagePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cur, setCur] = useState<HistoryItem | null>(null);
  const [offline, setOffline] = useState<{ docs: Source[]; sols: SolutionView[] } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const ctl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([api.get<{ devices: string[] }>('/devices'), api.get<{ items: HistoryItem[] }>('/history')]);
      setDevices(d.devices);
      setHistory(h.items);
    } catch { /* status line shows connection problems */ }
  }, [api]);
  useEffect(() => { load(); }, [load, me?.user.id]);

  const plan = me?.plan;
  const status = !me
    ? { dot: c.muted, text: t('a_ai_wait') }
    : me.ai ? { dot: c.ok, text: t('a_ai_ok') } : { dot: c.warn, text: t('a_ai_none') };

  async function addPhoto(src: 'camera' | 'library') {
    try {
      const p = await pickImage(src);
      if (p === 'denied') toast(t('e_perm'));
      else if (p) setPhoto(p);
    } catch (e) {
      toast(errText(e));
    }
  }

  async function solve() {
    setErr(''); setOffline(null);
    if (!q.trim() && !photo) { toast(t('a_need')); return; }
    if (me?.ai && plan && !unlimited(plan.quota) && me.user.usedToday >= plan.quota) { setErr(t('a_limit')); return; }
    setBusy(true); setCur(null);
    ctl.current = new AbortController();
    try {
      const r = await api.post<{ item?: HistoryItem; offline?: { docs: Source[]; sols: SolutionView[] } }>(
        '/diagnose', { q, dev, image: photo ? { data: photo.data, mediaType: photo.mediaType } : null }, ctl.current.signal,
      );
      if (r.offline) setOffline(r.offline);
      if (r.item) { setCur(r.item); setHistory((h) => [r.item!, ...h.filter((x) => x.id !== r.item!.id)]); }
      refreshMe();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'cancelled') setErr(code === 'quota' ? t('a_limit') : errText(e));
    } finally {
      setBusy(false); ctl.current = null;
    }
  }

  const teachFrom = () => router.push({ pathname: '/teach', params: { dev, q } });

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
        <Select
          label={t('a_dev')}
          value={dev}
          onChange={setDev}
          options={[{ value: '', label: t('a_dev_any') }, ...devices.map((d) => ({ value: d, label: d }))]}
        />
        <Input label={t('a_q')} value={q} onChangeText={setQ} placeholder={t('a_q_ph')} multiline />
        {photo ? (
          <Row style={{ backgroundColor: c.sunk, borderRadius: 9, padding: 7, marginBottom: 10 }}>
            <Image source={{ uri: photo.uri }} style={{ width: 38, height: 38, borderRadius: 6 }} />
            <P small style={{ flex: 1 }}>📷</P>
            <Btn kind="ghost" sm title={t('rm')} onPress={() => setPhoto(null)} />
          </Row>
        ) : null}
        <Row>
          {!photo && me?.ai && plan?.photo ? (
            <>
              <Btn kind="sec" title="" icon={<Icon name="cam" color={c.ink} size={18} />} onPress={() => addPhoto('camera')} />
              <Btn kind="sec" title={t('a_photo')} onPress={() => addPhoto('library')} />
            </>
          ) : null}
          {busy
            ? <Btn kind="sec" title={t('a_stop')} style={{ flex: 1 }} onPress={() => ctl.current?.abort()} />
            : <Btn title={t('a_go')} style={{ flex: 1 }} onPress={solve} />}
        </Row>
      </Card>

      {busy ? (
        <Card accent={c.cyan}>
          <Row><ActivityIndicator size="small" color={c.cyan} /><P bold>{t('loading')}</P></Row>
          <P small muted style={{ marginTop: 6 }}>{t('a_long')}</P>
        </Card>
      ) : null}
      {err ? <WarnBox>{err}</WarnBox> : null}
      {offline ? <OfflineResult o={offline} onTeach={teachFrom} /> : null}
      {cur ? <Report x={cur} onChange={setCur} onTeach={teachFrom} /> : null}

      {history.length ? (
        <>
          <H2>{t('h_title')}</H2>
          <Card style={{ paddingVertical: 2 }}>
            {history.slice(0, 8).map((x, i) => (
              <Pressable
                key={x.id}
                onPress={() => { setCur(x); setQ(x.q); setDev(x.dev); setErr(''); setOffline(null); }}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 11, borderBottomWidth: i === Math.min(history.length, 8) - 1 ? 0 : 1, borderBottomColor: c.line }}
              >
                <View style={{ flex: 1 }}>
                  <P bold style={{ fontSize: 13.5 }} >{x.q.slice(0, 70) || '📷'}</P>
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

function TeachCta({ onTeach }: { onTeach: () => void }) {
  const { t, me } = useApp();
  return (
    <Card>
      <P bold>{t('r_teach_t')}</P>
      <P small muted style={{ marginTop: 4, marginBottom: 10 }}>{t('r_teach_d')}</P>
      <Btn full title={`${t('r_teach_b')}  +${me?.pt.teach ?? 20}`} onPress={onTeach} />
    </Card>
  );
}

function SourceBox({ title, h, text, n }: { title: string; h: string; text: string; n?: number }) {
  const { c } = useApp();
  return (
    <Details title={<Text>{n ? <Text style={{ color: c.cyan, fontFamily: MONO }}>{`[${n}] `}</Text> : null}{title}{h ? ` / ${h}` : ''}</Text>}>
      <P small muted selectable>{text}</P>
    </Details>
  );
}

function OfflineResult({ o, onTeach }: { o: { docs: Source[]; sols: SolutionView[] }; onTeach: () => void }) {
  const { t } = useApp();
  if (!o.docs.length && !o.sols.length) return <><Empty>{t('off_none')}</Empty><TeachCta onTeach={onTeach} /></>;
  return (
    <>
      {o.sols.length ? <><H2>{t('r_comm')}</H2>{o.sols.map((s) => <SolutionCard key={s.id} s={s} open />)}</> : null}
      {o.docs.length ? <><H2>{t('off_sec')}</H2>{o.docs.map((d, i) => <SourceBox key={i} title={d.title} h={d.h} text={d.t} />)}</> : null}
      <TeachCta onTeach={onTeach} />
    </>
  );
}

/** The diagnosis "work order" (föy). */
function Report({ x, onChange, onTeach }: { x: HistoryItem; onChange: (x: HistoryItem) => void; onTeach: () => void }) {
  const { c, t, api, me, errText } = useApp();
  const [fq, setFq] = useState('');
  const [fBusy, setFBusy] = useState(false);
  const [fErr, setFErr] = useState('');
  const r = x.res;
  const ref = (n: number | null) => (n && x.srcs[n - 1] ? <Text style={{ fontFamily: MONO, fontSize: 11, color: c.cyan }}>{` [${n}]`}</Text> : null);

  function toggleStep(i: number) {
    const done = !x.done[i];
    onChange({ ...x, done: { ...x.done, [i]: done } });
    api.patch(`/history/${x.id}/steps`, { i, done }).catch(() => {});
  }

  async function ask() {
    const q = fq.trim();
    if (!q || fBusy) return;
    setFBusy(true); setFErr('');
    try {
      const res = await api.post<{ item: HistoryItem }>(`/history/${x.id}/follow-up`, { q });
      onChange(res.item);
      setFq('');
    } catch (e) {
      setFErr(errText(e));
    } finally {
      setFBusy(false);
    }
  }

  function findPart(name: string) {
    setPendingMarketQuery(name);
    router.push('/pazar');
  }

  const H3 = ({ children }: { children: string }) => (
    <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.ink, marginTop: 18, marginBottom: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.line }}>{children}</Text>
  );

  return (
    <>
      <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
        <View style={{ backgroundColor: c.navy, padding: 13 }}>
          <Text style={{ color: c.onNavy, fontWeight: '700', fontSize: 14.5 }}>{x.dev || t('a_dev_any')}</Text>
          <Text style={{ color: c.onNavy, opacity: 0.85, fontFamily: MONO, fontSize: 11.5, marginTop: 2 }}>{`${x.date}  #${x.id.slice(-5).toUpperCase()}`}</Text>
        </View>
        <View style={{ padding: 14 }}>
          <Row wrap>
            <Badge tone={LVL[r.confidence][0]}>{`${LVL[r.confidence][2]} ${t('r_conf')}: ${t(LVL[r.confidence][1])}`}</Badge>
            {r.grounded ? <Badge tone="info">{'✓ ' + t('r_grounded')}</Badge> : <Badge tone="warn">{'⚠ ' + t('r_generic')}</Badge>}
          </Row>
          <P style={{ fontSize: 15, marginTop: 10, lineHeight: 22 }}>{r.summary}</P>

          {r.causes.length ? <H3>{t('r_causes')}</H3> : null}
          {r.causes.map((cs, i) => (
            <Row key={i} style={{ alignItems: 'flex-start', marginBottom: 9 }} gap={10}>
              <Badge tone={LVL[cs.likelihood][0]}>{LVL[cs.likelihood][2]}</Badge>
              <View style={{ flex: 1 }}><P bold>{cs.title}</P><P small muted>{cs.why}</P></View>
            </Row>
          ))}

          {r.steps.length ? <H3>{t('r_steps')}</H3> : null}
          {r.steps.map((s, i) => {
            const done = !!x.done[i];
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 11, paddingVertical: 10, borderBottomWidth: i === r.steps.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <Pressable
                  accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={String(i + 1)}
                  onPress={() => toggleStep(i)}
                  style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1.5, borderColor: done ? c.ok : c.line, backgroundColor: done ? c.ok : c.surface, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: MONO, fontWeight: '700', fontSize: 12.5, color: done ? c.surface : c.ink }}>{done ? '✓' : i + 1}</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 14, color: done ? c.muted : c.ink, textDecorationLine: done ? 'line-through' : 'none' }}>{s.title}{ref(s.source)}</Text>
                  {s.detail ? <P small muted style={{ marginTop: 2 }}>{s.detail}</P> : null}
                  {s.measure ? (
                    <View style={{ marginTop: 6, backgroundColor: c.sunk, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
                      <Text style={{ fontFamily: MONO, fontSize: 12, color: c.ink }}>{`${t('r_meas')}: ${s.measure}`}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}

          <H3>{t('r_parts')}</H3>
          {r.parts.length ? r.parts.map((p, i) => (
            <Row key={i} style={{ alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: i === r.parts.length - 1 ? 0 : 1, borderBottomColor: c.line }} gap={10}>
              <Badge tone={p.action === 'replace' ? 'bad' : 'info'}>{p.action === 'replace' ? '⟳ ' + t('r_replace') : '◎ ' + t('r_check')}</Badge>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontWeight: '700', fontSize: 14, color: c.ink }}>{p.name}{ref(p.source)}</Text>
                {p.code ? <Tag>{p.code}</Tag> : null}
                {p.note ? <P small muted>{p.note}</P> : null}
                <Btn kind="ghost" sm title={t('r_find')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => findPart(p.name)} />
              </View>
            </Row>
          )) : <P small muted>{t('r_none_parts')}</P>}

          {r.warnings.length ? <H3>{t('r_warn')}</H3> : null}
          {r.warnings.map((w, i) => <WarnBox key={i}>{w}</WarnBox>)}

          {x.sols.length ? <H3>{t('r_comm')}</H3> : null}
          {x.sols.map((s) => <SolutionCard key={s.id} s={s} />)}

          {x.srcs.length ? <H3>{t('r_src')}</H3> : null}
          {x.srcs.map((s, i) => <SourceBox key={i} n={i + 1} title={s.title} h={s.h} text={s.t} />)}

          {me?.ai ? (
            <>
              <H3>{t('r_follow')}</H3>
              <Row style={{ alignItems: 'flex-start' }}>
                <Input half value={fq} onChangeText={setFq} placeholder={t('r_follow_ph')} onSubmitEditing={ask} returnKeyType="send" />
                <Btn title={t('r_ask')} busy={fBusy} onPress={ask} />
              </Row>
              {fErr ? <WarnBox>{fErr}</WarnBox> : null}
              {x.follow.map((f, i) => (
                <View key={i} style={{ backgroundColor: c.sunk, borderRadius: 10, padding: 11, marginTop: 10 }}>
                  <P bold>{f.q}</P>
                  <P selectable style={{ marginTop: 4 }}>{f.a}</P>
                </View>
              ))}
            </>
          ) : null}
        </View>
      </View>
      <TeachCta onTeach={onTeach} />
    </>
  );
}
