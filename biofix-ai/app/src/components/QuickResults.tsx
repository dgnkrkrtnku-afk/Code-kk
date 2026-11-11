import { Text, View } from 'react-native';
import { useApp } from '../lib/app-context';
import { MONO } from '../lib/theme';
import type { CodeHit, Quick } from '../lib/types';
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
 * (no AI on the server); otherwise a short version is shown while the AI is still writing.
 */
export function QuickResults({ quick, full }: { quick: Quick; full?: boolean }) {
  const { t } = useApp();
  const sols = full ? quick.sols : quick.sols.slice(0, 2);
  const docs = full ? quick.docs : quick.docs.slice(0, 3);
  if (!quick.codes.length && !sols.length && !docs.length) return full ? <Empty>{t('off_none')}</Empty> : null;
  return (
    <>
      <CodeCards codes={quick.codes} />
      {sols.length ? <H2 style={{ marginTop: 6 }}>{t('r_comm')}</H2> : null}
      {sols.map((s, i) => <SolutionCard key={s.id} s={s} open={full && i === 0} />)}
      {docs.length ? <H2 style={{ marginTop: 6 }}>{t('off_sec')}</H2> : null}
      {docs.map((d, i) => <SourceBox key={i} title={d.title} h={d.h} text={d.t} />)}
    </>
  );
}
