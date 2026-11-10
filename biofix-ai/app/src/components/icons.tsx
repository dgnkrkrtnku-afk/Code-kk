import Svg, { Circle, Path } from 'react-native-svg';

const P = {
  asistan: ['M2 12h5l2.5-7 4 14 2.5-7H22'],
  cozumler: ['M9 18h6M10 21h4', 'M12 3a6 6 0 0 0-3 11c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a6 6 0 0 0-3-11z'],
  egitim: ['M2 9l10-5 10 5-10 5z', 'M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5'],
  pazar: ['M4 9l1.5-5h13L20 9', 'M4 9v11h16V9', 'M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9'],
  hesap: ['M4 21c0-4 4-6 8-6s8 2 8 6'],
  cam: ['M4 8h3l2-2h6l2 2h3v11H4z'],
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, color, size = 21 }: { name: IconName; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {P[name].map((d) => <Path key={d} d={d} />)}
      {name === 'hesap' ? <Circle cx={12} cy={8} r={4} /> : null}
      {name === 'cam' ? <Circle cx={12} cy={13} r={3.5} /> : null}
    </Svg>
  );
}
