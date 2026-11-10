// Small design-system primitives mirroring the prototype's CSS classes.
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../lib/app-context';
import { MONO } from '../lib/theme';

export function Screen({ children, onRefresh, refreshing }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  const { c } = useApp();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useApp();
  return <Text style={[{ fontSize: 22, fontWeight: '800', color: c.ink, marginTop: 4, marginBottom: 4, letterSpacing: -0.3 }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useApp();
  return <Text style={[{ fontSize: 15, fontWeight: '700', color: c.ink, marginTop: 22, marginBottom: 8 }, style]}>{children}</Text>;
}
export function Sub({ children }: { children: ReactNode }) {
  const { c } = useApp();
  return <Text style={{ color: c.muted, fontSize: 13.5, marginBottom: 16, lineHeight: 20 }}>{children}</Text>;
}
export function P({ children, style, muted, small, mono, bold, selectable }: {
  children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; small?: boolean; mono?: boolean; bold?: boolean; selectable?: boolean;
}) {
  const { c } = useApp();
  return (
    <Text
      selectable={selectable}
      style={[{
        color: muted ? c.muted : c.ink, fontSize: small ? 12.5 : 14, lineHeight: small ? 18 : 20,
        fontFamily: mono ? MONO : undefined, fontWeight: bold ? '700' : '400',
      }, style]}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: string }) {
  const { c } = useApp();
  return (
    <View style={[{
      backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12,
    }, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null, style]}>
      {children}
    </View>
  );
}

export function Row({ children, style, wrap, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}
export function Between({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

type BtnKind = 'pri' | 'sec' | 'ghost';
export function Btn({ title, onPress, kind = 'pri', sm, full, disabled, busy, style, icon }: {
  title: string; onPress?: () => void; kind?: BtnKind; sm?: boolean; full?: boolean; disabled?: boolean; busy?: boolean;
  style?: StyleProp<ViewStyle>; icon?: ReactNode;
}) {
  const { c } = useApp();
  const bg = kind === 'pri' ? c.navy : kind === 'sec' ? c.surface : 'transparent';
  const fg = kind === 'pri' ? c.onNavy : kind === 'sec' ? c.ink : c.cyan;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled || busy ? undefined : onPress}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        backgroundColor: bg, borderColor: kind === 'sec' ? c.line : 'transparent', borderWidth: 1.5,
        borderRadius: sm ? 9 : 11, paddingVertical: sm ? 7 : 11, paddingHorizontal: kind === 'ghost' ? 8 : sm ? 12 : 16,
        minHeight: sm ? 38 : 46, opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      }, full ? { alignSelf: 'stretch' } : null, style]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon}
      <Text style={{ color: fg, fontWeight: '700', fontSize: sm ? 13 : 14.5, textAlign: 'center' }}>{title}</Text>
    </Pressable>
  );
}

export type Tone = 'ok' | 'bad' | 'warn' | 'info';
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const { c } = useApp();
  const fg = { ok: c.ok, bad: c.bad, warn: c.warn, info: c.cyan }[tone];
  const bg = { ok: c.okBg, bad: c.badBg, warn: c.warnBg, info: c.cyanSoft }[tone];
  return (
    <View style={{ borderColor: fg, borderWidth: 1, backgroundColor: bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 11.5, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  const { c } = useApp();
  return (
    <View style={{ backgroundColor: c.sunk, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: MONO, fontSize: 11, color: c.muted }}>{children}</Text>
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const { c } = useApp();
  return <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.muted, marginBottom: 5 }}>{children}</Text>;
}

export function Input(props: TextInputProps & { label?: string; multiline?: boolean; minHeight?: number; half?: boolean }) {
  const { c } = useApp();
  const { label, minHeight, style, half, ...rest } = props;
  return (
    <View style={{ marginBottom: 12, flex: half ? 1 : undefined, minWidth: 0 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        placeholderTextColor={c.muted}
        {...rest}
        style={[{
          borderColor: c.line, borderWidth: 1, backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
          fontSize: 15, color: c.ink, minHeight: rest.multiline ? minHeight ?? 96 : undefined, textAlignVertical: rest.multiline ? 'top' : 'center',
        }, style]}
      />
    </View>
  );
}

/** Dropdown rendered as a bottom-sheet list (no native picker dependency). */
export function Select<V extends string>({ label, value, options, onChange, compact, half }: {
  label?: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; compact?: boolean; half?: boolean;
}) {
  const { c, t } = useApp();
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: compact ? 0 : 12, flex: half ? 1 : undefined, minWidth: 0 }}>
      {label ? <Label>{label}</Label> : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{ borderColor: c.line, borderWidth: 1, backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: compact ? 8 : 11, flexDirection: 'row', alignItems: 'center' }}
      >
        <Text style={{ color: c.ink, fontSize: 15, flex: compact ? undefined : 1 }} numberOfLines={1}>{cur?.label ?? '—'}</Text>
        <Text style={{ color: c.muted, marginLeft: 6 }}>▾</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label || t('pick')}>
        {options.map((o) => (
          <Pressable key={o.value} onPress={() => { onChange(o.value); setOpen(false); }} style={{ paddingVertical: 13, borderBottomColor: c.line, borderBottomWidth: 1, flexDirection: 'row' }}>
            <Text style={{ color: o.value === value ? c.cyan : c.ink, fontWeight: o.value === value ? '700' : '400', fontSize: 15, flex: 1 }}>{o.label}</Text>
            {o.value === value ? <Text style={{ color: c.cyan }}>✓</Text> : null}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const { c } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 18 + insets.bottom, maxHeight: '80%' }}>
        {title ? <Text style={{ fontSize: 17, fontWeight: '700', color: c.ink, marginBottom: 8 }}>{title}</Text> : null}
        <ScrollView>{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function Seg<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  const { c } = useApp();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.sunk, borderRadius: 11, padding: 3, gap: 3, marginBottom: 14 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1, borderRadius: 9, paddingVertical: 9, backgroundColor: on ? c.surface : 'transparent' }}>
            <Text style={{ textAlign: 'center', fontWeight: '600', fontSize: 13, color: on ? c.ink : c.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const { c } = useApp();
  return (
    <Pressable onPress={onPress} style={{ borderColor: on ? c.navy : c.line, borderWidth: 1, backgroundColor: on ? c.navy : c.surface, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 }}>
      <Text style={{ color: on ? c.onNavy : c.ink, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const { c } = useApp();
  return (
    <View style={{ borderColor: c.line, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, padding: 22, marginBottom: 12 }}>
      <Text style={{ color: c.muted, textAlign: 'center', fontSize: 13.5 }}>{children}</Text>
    </View>
  );
}

export function WarnBox({ children }: { children: ReactNode }) {
  const { c } = useApp();
  return (
    <View style={{ backgroundColor: c.warnBg, borderColor: c.warn, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 7, flexDirection: 'row', gap: 8 }}>
      <Text style={{ color: c.warn }}>⚠</Text>
      <Text style={{ color: c.warn, fontSize: 13, flex: 1, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  const { c } = useApp();
  return (
    <View style={{ borderLeftColor: c.line, borderLeftWidth: 3, paddingLeft: 10, marginVertical: 12 }}>
      <Text style={{ color: c.muted, fontSize: 12.5, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

/** Collapsible block — the prototype's <details>. */
export function Details({ title, children, defaultOpen, link }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; link?: boolean }) {
  const { c } = useApp();
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <View style={link ? { marginTop: 6 } : { borderColor: c.line, borderWidth: 1, borderRadius: 10, marginBottom: 7 }}>
      <Pressable onPress={() => setOpen(!open)} style={{ padding: link ? 0 : 10, flexDirection: 'row', gap: 6 }}>
        <Text style={{ color: link ? c.cyan : c.ink, fontWeight: '600', fontSize: 13, flex: 1 }}>{open ? '▾ ' : '▸ '}{title}</Text>
      </Pressable>
      {open ? <View style={{ paddingHorizontal: link ? 0 : 11, paddingBottom: link ? 0 : 11, paddingTop: link ? 6 : 0 }}>{children}</View> : null}
    </View>
  );
}

export function SetRow({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  const { c } = useApp();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomColor: c.line, borderBottomWidth: last ? 0 : 1 }}>
      <Text style={{ color: c.ink, fontSize: 14, flexShrink: 1 }}>{label}</Text>
      <View style={{ maxWidth: '60%' }}>{children}</View>
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { c } = useApp();
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: c.cyan, false: c.line }} />;
}

export function Check({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useApp();
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 }} accessibilityRole="checkbox" accessibilityState={{ checked: value }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: value ? c.cyan : c.line, backgroundColor: value ? c.cyan : c.surface, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {value ? <Text style={{ color: c.surface, fontWeight: '800', fontSize: 13 }}>✓</Text> : null}
      </View>
      <Text style={{ color: c.ink, fontSize: 13.5, flex: 1, lineHeight: 19 }}>{label}</Text>
    </Pressable>
  );
}

export function Stars({ v, size = 13 }: { v: number; size?: number }) {
  const { c } = useApp();
  const n = Math.round(v);
  return <Text style={{ color: c.warn, letterSpacing: 1, fontSize: size }}>{'★'.repeat(n) + '☆'.repeat(5 - n)}</Text>;
}

export function Meter({ label, v }: { label: string; v: number }) {
  const { c } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 }}>
      <Text style={{ width: '46%', color: c.ink, fontSize: 13 }}>{label}</Text>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.sunk, overflow: 'hidden' }}>
        <View style={{ width: `${v * 20}%`, height: '100%', backgroundColor: c.cyan }} />
      </View>
      <Text style={{ fontFamily: MONO, width: 30, textAlign: 'right', color: c.ink, fontWeight: '700', fontSize: 12.5 }}>{v.toFixed(1)}</Text>
    </View>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  const { c } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 10 }}>
      <Text style={{ fontFamily: MONO, fontSize: 18, fontWeight: '700', color: c.ink }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={{ fontSize: 11.5, color: c.muted }}>{label}</Text>
    </View>
  );
}

export function Loading() {
  const { c } = useApp();
  return <View style={{ padding: 30 }}><ActivityIndicator color={c.cyan} /></View>;
}

export function ErrorBox({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  const { t } = useApp();
  return (
    <View>
      <WarnBox>{msg}</WarnBox>
      {onRetry ? <Btn kind="sec" sm title={t('retry')} onPress={onRetry} /> : null}
    </View>
  );
}

/** Points banner (navy) used in Solutions and Plans. */
export function PointsBanner({ action }: { action: ReactNode }) {
  const { c, t, num, me } = useApp();
  return (
    <View style={{ backgroundColor: c.navy, borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View>
        <Text style={{ color: c.onNavy, opacity: 0.85, fontSize: 12.5 }}>{t('c_bal')}</Text>
        <Text style={{ color: c.onNavy, fontFamily: MONO, fontSize: 26, fontWeight: '700' }}>{num(me?.user.points ?? 0)}</Text>
      </View>
      {action}
    </View>
  );
}

export const styles = StyleSheet.create({
  fg2: { flexDirection: 'row', gap: 10 },
});
