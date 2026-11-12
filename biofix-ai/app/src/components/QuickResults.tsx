import { Text, View } from 'react-native';
import { useApp } from '../lib/app-context';
import { MONO } from '../lib/theme';
import type { CodeHit, DataDigest, Quick } from '../lib/types';
import { SolutionCard } from './SolutionCard';
import { Details, Empty, H2, P } from './ui';

/** What a manual says about an error code: the fastest possible answer, shown before anything else. */
export function CodeCards({ codes }: { codes: CodeHit[] }) {
  const { c, t } = useApp();
  return (
    <>
      {codes.map((k, i) => (
        <View key={`${k.code}-${i}`} style={{ backgroundColor: c.cyanSoft, borderColor: c.cyan, borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <View style={{ backgroundColor: c.cyan, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3 }}>
              <Text style={{ fontFamily: MONO, fontWeight: '700', fontSize: 14, color: c.surface }}>{k.code}</Text>
            </View>
            <Text style={{ color: c.cyan, fontWeight: '700', fontSize: 12.5 }}>{t('a_code')}</Text>
          </View>
          <P selectable style={{ fontSize: 14.5, lineHeight: 21 }}>{k.text}</P>
          <P small muted style={{ marginTop: 6 }}>{[k.device, k.title].filter(Boolean).join(' · ')}</P>
        </View>
      ))}
    </>
  );
}

const ARROW = { up: '↗', down: '↘', flat: '→' } as const;

/**
 * What an attached log or table contains, worked out by the server without AI: how long it covers,
 * how many errors, which codes how often, and how each reading moved.
 */
export function DataCard({ data }: { data: DataDigest }) {
  const { c, t, num } = useApp();
  const cell = { fontFamily: MONO, fontSize: 12.5, color: c.ink } as const;
  const head = { fontSize: 11, color: c.muted, fontWeight: '600' } as const;
  return (
    <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 10 }}>
      <Text style={{ color: c.ink, fontWeight: '700', fontSize: 14 }}>{'📊 ' + t('dt_title')}</Text>
      <P small muted style={{ marginTop: 3 }}>
        {[t(data.kind === 'table' ? 'dt_table' : 'dt_log', num(data.lines)), data.from ? `${data.from} → ${data.to}` : ''].filter(Boolean).join(' · ')}
      </P>
      {data.errors || data.warnings ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
          {data.errors ? <Pill fg={c.bad} bg={c.badBg} text={t('dt_errors', num(data.errors))} /> : null}
          {data.warnings ? <Pill fg={c.warn} bg={c.warnBg} text={t('dt_warnings', num(data.warnings))} /> : null}
        </View>
      ) : null}

      {data.codes.length ? (
        <View style={{ marginTop: 11 }}>
          <Text style={head}>{t('dt_codes')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 5 }}>
            {data.codes.map((k) => (
              <View key={k.code} accessibilityLabel={`${k.code} × ${k.count}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderColor: c.cyan, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontFamily: MONO, fontWeight: '700', fontSize: 12.5, color: c.cyan }}>{k.code}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 12.5, color: c.ink }}>{'×' + num(k.count)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {data.series.length ? (
        <View style={{ marginTop: 11 }}>
          <Text style={head}>{t('dt_series')}</Text>
          {data.series.map((s, i) => (
            <View key={i} style={{ paddingVertical: 7, borderBottomWidth: i === data.series.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: c.ink, fontWeight: '600', fontSize: 13.5, flexShrink: 1 }}>{s.name}{s.unit ? ` (${s.unit})` : ''}</Text>
                <Text accessibilityLabel={t('dt_' + s.trend)} style={{ color: s.trend === 'flat' ? c.muted : c.warn, fontWeight: '800', fontSize: 14 }}>{ARROW[s.trend]}</Text>
                <Text style={{ color: s.trend === 'flat' ? c.muted : c.warn, fontSize: 11.5, fontWeight: '600' }}>{t('dt_' + s.trend)}</Text>
              </View>
              <Text style={[cell, { marginTop: 3 }]}>
                {`${t('dt_min')} ${num(s.min)}  ${t('dt_mean')} ${num(s.mean)}  ${t('dt_max')} ${num(s.max)}  ${t('dt_last')} ${num(s.last)}  n=${num(s.n)}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {data.repeated.length ? (
        <View style={{ marginTop: 11 }}>
          <Text style={head}>{t('dt_repeated')}</Text>
          {data.repeated.map((r, i) => (
            <Text key={i} style={[cell, { marginTop: 4 }]} selectable>{`×${num(r.count)}  ${r.text}`}</Text>
          ))}
        </View>
      ) : null}
      <P small muted style={{ marginTop: 10 }}>{t('dt_note')}</P>
    </View>
  );
}

function Pill({ fg, bg, text }: { fg: string; bg: string; text: string }) {
  return (
    <View style={{ backgroundColor: bg, borderColor: fg, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: 11.5, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

/** A digest is worth a card when it holds more than "the file has N lines". */
export const hasData = (d?: DataDigest | null): d is DataDigest =>
  !!d && (d.codes.length > 0 || d.series.length > 0 || d.repeated.length > 0 || d.errors > 0 || d.warnings > 0);

export function SourceBox({ title, h, text, n }: { title: string; h: string; text: string; n?: number }) {
  const { c } = useApp();
  return (
    <Details title={<Text>{n ? <Text style={{ color: c.cyan, fontFamily: MONO }}>{`[${n}] `}</Text> : null}{title}{h ? ` / ${h}` : ''}</Text>}>
      <P small muted selectable>{text}</P>
    </Details>
  );
}

/**
 * Matches found in the knowledge base without any AI. `full` is used when they are the whole answer
 * (no AI on the server, or the AI could not answer); otherwise a short version is shown while the AI is still writing.
 */
export function QuickResults({ quick, full }: { quick: Quick; full?: boolean }) {
  const { t } = useApp();
  const sols = full ? quick.sols : quick.sols.slice(0, 2);
  const docs = full ? quick.docs : quick.docs.slice(0, 3);
  const data = hasData(quick.data) ? quick.data : null;
  if (!quick.codes.length && !sols.length && !docs.length && !data) return full ? <Empty>{t('off_none')}</Empty> : null;
  return (
    <>
      {data ? <DataCard data={data} /> : null}
      <CodeCards codes={quick.codes} />
      {sols.length ? <H2 style={{ marginTop: 6 }}>{t('r_comm')}</H2> : null}
      {sols.map((s, i) => <SolutionCard key={s.id} s={s} open={full && i === 0} />)}
      {docs.length ? <H2 style={{ marginTop: 6 }}>{t('off_sec')}</H2> : null}
      {docs.map((d, i) => <SourceBox key={i} title={d.title} h={d.h} text={d.t} />)}
    </>
  );
}
