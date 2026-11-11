import { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { useApp } from '../lib/app-context';
import type { Me, SolutionView } from '../lib/types';
import { Badge, Between, Btn, Card, Details, P, Row, Tag, type Tone } from './ui';

const TONE: Record<SolutionView['status'], Tone> = { ver: 'ok', pen: 'warn', rej: 'bad' };
const ICON: Record<SolutionView['status'], string> = { ver: '✓', pen: '◷', rej: '✕' };

/** One community solution with voting, AI pre-check badge and owner/admin actions. */
export function SolutionCard({ s, open, onChange, onDelete }: {
  s: SolutionView; open?: boolean; onChange?: (s: SolutionView) => void; onDelete?: (id: string) => void;
}) {
  const { c, t, api, me, setMe, toast, errText, bump } = useApp();
  const [busy, setBusy] = useState('');
  const pt = me?.pt.vote ?? 5;
  const needOk = me?.needOk ?? 3;

  async function act(kind: 'ok' | 'fail' | 'sim' | 'del' | 'approve') {
    setBusy(kind);
    try {
      if (kind === 'del') {
        await api.del(`/solutions/${s.id}`);
        onDelete?.(s.id);
        toast(t('c_deleted'));
      } else if (kind === 'approve') {
        onChange?.((await api.post<{ item: SolutionView }>(`/admin/solutions/${s.id}/approve`)).item);
      } else if (kind === 'sim') {
        const r = await api.post<{ item: SolutionView; me: Me }>(`/solutions/${s.id}/simulate`);
        const verified = !!me && r.me.user.points - me.user.points >= me.pt.verified;
        setMe(r.me);
        onChange?.(r.item);
        if (verified) toast(t('f_verified', r.me.pt.verified));
      } else {
        const r = await api.post<{ item: SolutionView; me: Me; awarded: number }>(`/solutions/${s.id}/vote`, { v: kind });
        setMe(r.me);
        onChange?.(r.item);
        toast(r.awarded ? t('v_thanks', r.awarded) : t('v_thanks_cap'));
      }
      bump();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy('');
    }
  }

  const aiTone: Tone = s.ai?.v === 'consistent' ? 'ok' : s.ai?.v === 'conflict' ? 'bad' : 'info';
  const aiKey = s.ai?.v === 'consistent' ? 'ai_ok' : s.ai?.v === 'conflict' ? 'ai_conf' : 'ai_unk';

  return (
    <Card accent={s.status === 'ver' ? c.ok : s.status === 'rej' ? c.bad : undefined} style={s.status === 'rej' ? { opacity: 0.85 } : null}>
      <Between>
        <P small muted mono style={{ flex: 1 }}>{`${s.brand} ${s.model}`.trim()}</P>
        <Badge tone={TONE[s.status]}>{`${ICON[s.status]} ${t('st_' + s.status)}`}</Badge>
      </Between>
      <Row wrap style={{ marginTop: 8 }}>
        <Text style={{ fontWeight: '700', fontSize: 14.5, color: c.ink, flexShrink: 1 }}>{s.symptom}</Text>
        {s.code ? <Tag>{s.code}</Tag> : null}
      </Row>
      <Details link title={t('c_show')} defaultOpen={open}>
        <P selectable>{s.steps}</P>
        {s.part ? <P small style={{ marginTop: 8 }}><Text style={{ fontWeight: '700' }}>{t('c_part')}: </Text>{s.part}</P> : null}
        {s.photo ? <Image source={{ uri: s.photo }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10, marginTop: 8 }} resizeMode="cover" /> : null}
        {s.photoNote ? <P small muted style={{ marginTop: 6 }}>{'📷 ' + s.photoNote}</P> : null}
      </Details>
      <P small muted mono style={{ marginTop: 9 }}>{t('c_votes', s.ok, s.fail)}</P>
      {s.status === 'pen' && s.ok < needOk ? <P small muted>{t('c_need', needOk - s.ok)}</P> : null}

      {s.checking ? (
        <Row style={{ marginTop: 8 }}><ActivityIndicator size="small" color={c.cyan} /><P small muted>{t('ai_run')}</P></Row>
      ) : s.ai ? (
        <View style={{ marginTop: 8 }}>
          <Row wrap>
            <Badge tone={aiTone}>{t(aiKey)}</Badge>
            {s.ai.safe ? <Badge tone="bad">{'⚠ ' + t('ai_safe')}</Badge> : null}
          </Row>
          {s.ai.note ? <P small muted style={{ marginTop: 5 }}>{s.ai.note}</P> : null}
          {s.flagged ? <P small muted style={{ marginTop: 5 }}>{t('c_review')}</P> : null}
        </View>
      ) : null}

      <P small muted style={{ marginTop: 8 }}>{`${s.by}, ${s.date}`}</P>
      <Row wrap style={{ marginTop: 9 }}>
        {!s.mine && !s.myVote ? (
          <>
            <Btn sm kind="sec" title={`✓ ${t('v_ok')}  +${pt}`} busy={busy === 'ok'} onPress={() => act('ok')} />
            <Btn sm kind="sec" title={`✕ ${t('v_no')}  +${pt}`} busy={busy === 'fail'} onPress={() => act('fail')} />
          </>
        ) : s.myVote ? (
          <Badge tone="info">{t(s.myVote === 'ok' ? 'v_done_ok' : 'v_done_no')}</Badge>
        ) : null}
        {s.mine && s.status === 'pen' && me?.demoPayments ? <Btn sm kind="sec" title={t('c_sim')} busy={busy === 'sim'} onPress={() => act('sim')} /> : null}
        {s.canReview ? <Btn sm kind="sec" title={t('c_approve')} busy={busy === 'approve'} onPress={() => act('approve')} /> : null}
        {s.canDelete ? <Btn sm kind="ghost" title={t('c_del')} busy={busy === 'del'} onPress={() => act('del')} /> : null}
      </Row>
    </Card>
  );
}
