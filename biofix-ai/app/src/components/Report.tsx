import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useApp } from '../lib/app-context';
import { setPendingMarketQuery } from '../lib/market-query';
import { MONO } from '../lib/theme';
import type { Diagnosis, HistoryItem, Level, Reading } from '../lib/types';
import { SourceBox } from './QuickResults';
import { SolutionCard } from './SolutionCard';
import { Badge, Btn, Card, Input, P, Row, Tag, WarnBox, type Tone } from './ui';

const LVL: Record<Level, [Tone, string, string]> = {
  high: ['ok', 'c_high', '●●●'], medium: ['warn', 'c_mid', '●●○'], low: ['bad', 'c_low', '●○○'],
};

export function TeachCta({ onTeach }: { onTeach: () => void }) {
  const { t, me } = useApp();
  return (
    <Card>
      <P bold>{t('r_teach_t')}</P>
      <P small muted style={{ marginTop: 4, marginBottom: 10 }}>{t('r_teach_d')}</P>
      <Btn full title={`${t('r_teach_b')}  +${me?.pt.teach ?? 20}`} onPress={onTeach} />
    </Card>
  );
}

const VERDICT: Record<Reading['status'], [Tone, string, string]> = {
  ok: ['ok', '✓', 'rd_ok'], low: ['bad', '↓', 'rd_low'], high: ['bad', '↑', 'rd_high'], unknown: ['info', '?', 'rd_unknown'],
};

/**
 * Where the technician enters what was measured at a step. The server compares it with the value
 * the step expects and answers at once: within range, low or high.
 */
function ReadingRow({ x, i, onChange }: { x: HistoryItem; i: number; onChange: (x: HistoryItem) => void }) {
  const { c, t, api, toast, errText } = useApp();
  const saved = x.readings?.[i];
  const [value, setValue] = useState(saved?.value ?? '');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false); // leaving the field and pressing Save both ask to save: once is enough

  async function save() {
    const v = value.trim();
    if (sending.current || v === (saved?.value ?? '')) return;
    sending.current = true;
    setBusy(true);
    try {
      onChange((await api.post<{ item: HistoryItem }>(`/history/${x.id}/readings`, { i, value: v })).item);
    } catch (e) {
      toast(errText(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const v = saved ? VERDICT[saved.status] : null;
  return (
    <View style={{ marginTop: 7 }}>
      <Row gap={7} style={{ alignItems: 'center' }}>
        <Input
          half value={value} onChangeText={setValue} placeholder={t('rd_ph')} accessibilityLabel={`${t('rd_ph')} ${i + 1}`}
          onSubmitEditing={save} onBlur={save} returnKeyType="done" autoCapitalize="none" autoCorrect={false} maxLength={60}
          style={{ paddingVertical: 7, fontSize: 14 }}
        />
        <Btn sm kind="sec" title={t('rd_save')} busy={busy} onPress={save} style={{ marginBottom: 12 }} />
      </Row>
      {v && saved ? (
        <Row wrap gap={7} style={{ marginTop: -5 }}>
          <Badge tone={v[0]}>{`${v[1]} ${t(v[2])}`}</Badge>
          {saved.deviation !== null && saved.deviation !== 0 ? (
            <Text style={{ fontFamily: MONO, fontSize: 12, color: c.muted }}>{t('rd_dev', (saved.deviation > 0 ? '+' : '') + String(saved.deviation).replace('.', ','))}</Text>
          ) : null}
        </Row>
      ) : null}
    </View>
  );
}

/**
 * The diagnosis "work order" (föy). While the AI is still writing, `x` is null and `res` holds
 * what has arrived so far; the sections fill in from top to bottom.
 */
export function Report({ x, res, dev, onChange, onTeach, onRegenerate }: {
  x: HistoryItem | null; res: Diagnosis; dev: string; onChange: (x: HistoryItem) => void; onTeach: () => void;
  /** Ask the AI again instead of showing the stored answer. */
  onRegenerate?: () => void;
}) {
  const { c, t, api, me, errText } = useApp();
  const [fq, setFq] = useState('');
  const [live, setLive] = useState<{ q: string; a: string } | null>(null); // the follow-up answer being written
  const [fErr, setFErr] = useState('');
  const r = res;
  const streaming = !x;
  const ref = (n: number | null) => (n && x?.srcs[n - 1] ? <Text style={{ fontFamily: MONO, fontSize: 11, color: c.cyan }}>{` [${n}]`}</Text> : null);

  function toggleStep(i: number) {
    if (!x) return;
    const done = !x.done[i];
    onChange({ ...x, done: { ...x.done, [i]: done } });
    api.patch(`/history/${x.id}/steps`, { i, done }).catch(() => {});
  }

  async function ask(text = fq) {
    const q = text.trim();
    if (!q || live || !x) return;
    setFErr('');
    setLive({ q, a: '' });
    try {
      await api.stream(`/history/${x.id}/follow-up`, { q }, (e) => {
        if (e.type === 'delta') setLive((p) => (p ? { ...p, a: p.a + e.text } : p));
        else if (e.type === 'done' && e.item) { onChange(e.item); setFq(''); }
      });
    } catch (e) {
      setFErr(errText(e));
    } finally {
      setLive(null);
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
          <Text style={{ color: c.onNavy, fontWeight: '700', fontSize: 14.5 }}>{(x?.dev ?? dev) || t('a_dev_any')}</Text>
          {x ? (
            <Text style={{ color: c.onNavy, opacity: 0.85, fontFamily: MONO, fontSize: 11.5, marginTop: 2 }}>
              {`${x.date}  #${x.id.slice(-5).toUpperCase()}${x.attached ? `  📎 ${x.attached.photos ? x.attached.photos + ' 📷 ' : ''}${x.attached.file}` : ''}`}
            </Text>
          ) : (
            <Row style={{ marginTop: 3 }} gap={7}>
              <ActivityIndicator size="small" color={c.onNavy} />
              <Text style={{ color: c.onNavy, opacity: 0.9, fontSize: 12 }}>{t('a_ai_writing')}</Text>
            </Row>
          )}
        </View>
        <View style={{ padding: 14 }}>
          {/* Confidence and grounding are only meaningful once the answer is complete. */}
          {x ? (
            <Row wrap style={{ marginBottom: 10 }}>
              <Badge tone={LVL[r.confidence][0]}>{`${LVL[r.confidence][2]} ${t('r_conf')}: ${t(LVL[r.confidence][1])}`}</Badge>
              {r.grounded ? <Badge tone="info">{'✓ ' + t('r_grounded')}</Badge> : <Badge tone="warn">{'⚠ ' + t('r_generic')}</Badge>}
            </Row>
          ) : null}
          {x?.stored ? (
            <Row wrap style={{ backgroundColor: c.sunk, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 10 }}>
              <P small muted style={{ flex: 1, minWidth: 180 }}>{'⚡ ' + t('a_stored')}</P>
              {onRegenerate ? <Btn kind="ghost" sm title={t('a_regen')} onPress={onRegenerate} /> : null}
            </Row>
          ) : null}
          <P style={{ fontSize: 15, lineHeight: 22 }}>{r.summary}</P>

          {r.firstAction ? (
            <View style={{ backgroundColor: c.okBg, borderColor: c.ok, borderWidth: 1, borderRadius: 11, padding: 11, marginTop: 12 }}>
              <Text style={{ color: c.ok, fontWeight: '700', fontSize: 12, marginBottom: 3 }}>{'▶ ' + t('a_first')}</Text>
              <Text style={{ color: c.ink, fontWeight: '600', fontSize: 14.5, lineHeight: 21 }}>{r.firstAction}</Text>
            </View>
          ) : null}

          {/* What the supplied data shows: readings in the report, lines of an attached log, photos. */}
          {r.findings?.length ? <H3>{t('fd_title')}</H3> : null}
          {r.findings?.map((f, i) => (
            <Row key={i} style={{ alignItems: 'flex-start', marginBottom: 9 }} gap={10}>
              <Badge tone={f.status === 'abnormal' ? 'bad' : f.status === 'normal' ? 'ok' : 'warn'}>{t('fd_' + f.status)}</Badge>
              <View style={{ flex: 1 }}>
                <P bold selectable>{f.observation}</P>
                {f.meaning ? <P small muted>{f.meaning}</P> : null}
              </View>
            </Row>
          ))}

          {r.causes.length ? <H3>{t('r_causes')}</H3> : null}
          {r.causes.map((cs, i) => (
            <Row key={i} style={{ alignItems: 'flex-start', marginBottom: 9 }} gap={10}>
              <Badge tone={LVL[cs.likelihood][0]}>{LVL[cs.likelihood][2]}</Badge>
              <View style={{ flex: 1 }}><P bold>{cs.title}</P><P small muted>{cs.why}</P></View>
            </Row>
          ))}

          {r.steps.length ? <H3>{t('r_steps')}</H3> : null}
          {r.steps.map((s, i) => {
            const done = !!x?.done[i];
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 11, paddingVertical: 10, borderBottomWidth: i === r.steps.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <Pressable
                  accessibilityRole="checkbox" accessibilityState={{ checked: done, disabled: streaming }} accessibilityLabel={String(i + 1)}
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
                  {x && s.measure ? <ReadingRow key={`${x.id}:${i}`} x={x} i={i} onChange={onChange} /> : null}
                </View>
              </View>
            );
          })}
          {x && me?.ai && Object.keys(x.readings ?? {}).length ? (
            <Btn full kind="sec" style={{ marginTop: 10 }} title={t('rd_reassess')} busy={!!live} onPress={() => ask(t('rd_question'))} />
          ) : null}

          {r.parts.length || x ? <H3>{t('r_parts')}</H3> : null}
          {r.parts.length ? r.parts.map((p, i) => (
            <Row key={i} style={{ alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: i === r.parts.length - 1 ? 0 : 1, borderBottomColor: c.line }} gap={10}>
              <Badge tone={p.action === 'replace' ? 'bad' : 'info'}>{p.action === 'replace' ? '⟳ ' + t('r_replace') : '◎ ' + t('r_check')}</Badge>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontWeight: '700', fontSize: 14, color: c.ink }}>{p.name}{ref(p.source)}</Text>
                {p.code ? <Tag>{p.code}</Tag> : null}
                {p.note ? <P small muted>{p.note}</P> : null}
                {x ? <Btn kind="ghost" sm title={t('r_find')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => findPart(p.name)} /> : null}
              </View>
            </Row>
          )) : x ? <P small muted>{t('r_none_parts')}</P> : null}

          {r.warnings.length ? <H3>{t('r_warn')}</H3> : null}
          {r.warnings.map((w, i) => <WarnBox key={i}>{w}</WarnBox>)}

          {x?.sols.length ? <H3>{t('r_comm')}</H3> : null}
          {x?.sols.map((s) => <SolutionCard key={s.id} s={s} />)}

          {x?.srcs.length ? <H3>{t('r_src')}</H3> : null}
          {x?.srcs.map((s, i) => <SourceBox key={i} n={i + 1} title={s.title} h={s.h} text={s.t} />)}

          {x && me?.ai ? (
            <>
              <H3>{t('r_follow')}</H3>
              {r.questions?.length ? (
                <View style={{ marginBottom: 10 }}>
                  <P small muted style={{ marginBottom: 6 }}>{t('a_questions')}</P>
                  {r.questions.map((qn, i) => (
                    <Pressable
                      key={i} accessibilityRole="button" onPress={() => setFq(qn + ' ')}
                      style={{ borderColor: c.cyan, borderWidth: 1, backgroundColor: c.cyanSoft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11, marginBottom: 6 }}
                    >
                      <Text style={{ color: c.cyan, fontWeight: '600', fontSize: 13 }}>{qn}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Row style={{ alignItems: 'flex-start' }}>
                <Input half value={fq} onChangeText={setFq} placeholder={t('r_follow_ph')} onSubmitEditing={() => ask()} returnKeyType="send" />
                <Btn title={t('r_ask')} busy={!!live} onPress={() => ask()} />
              </Row>
              {fErr ? <WarnBox>{fErr}</WarnBox> : null}
              {[...x.follow, ...(live ? [live] : [])].map((f, i) => (
                <View key={i} style={{ backgroundColor: c.sunk, borderRadius: 10, padding: 11, marginTop: 10 }}>
                  <P bold>{f.q}</P>
                  <P selectable style={{ marginTop: 4 }}>{f.a || '…'}</P>
                </View>
              ))}
            </>
          ) : null}
        </View>
      </View>
      {x ? <TeachCta onTeach={onTeach} /> : null}
    </>
  );
}
