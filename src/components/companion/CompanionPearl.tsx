import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { HEAD, PEARL } from '@/lib/companion-avatar-model';

interface CompanionPearlProps {
  diameter: number;
  gradientId: string;
  highlight?: boolean;
}

/** One satin pearl sphere. Shared fill geometry for the head and split pair. */
export function CompanionPearl({ diameter, gradientId, highlight = true }: CompanionPearlProps) {
  const { cx, cy, r } = HEAD;

  return (
    <Svg
      width={diameter}
      height={diameter}
      viewBox={`${cx - r} ${cy - r} ${r * 2} ${r * 2}`}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id={`${gradientId}-key`} cx="29%" cy="21%" r="92%">
          <Stop offset="0" stopColor={PEARL.lit} />
          <Stop offset="0.5" stopColor={PEARL.mid} />
          <Stop offset="1" stopColor={PEARL.dark} />
        </RadialGradient>
        <RadialGradient id={`${gradientId}-rim`} cx="50%" cy="50%" r="50%">
          <Stop offset="0.78" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.95" stopColor="#FFFFFF" stopOpacity="0.28" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        {highlight ? (
          <RadialGradient id={`${gradientId}-spec`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFDF7" stopOpacity="0.32" />
            <Stop offset="1" stopColor="#FFFDF7" stopOpacity="0" />
          </RadialGradient>
        ) : null}
      </Defs>
      <Circle cx={cx} cy={cy} r={r} fill={`url(#${gradientId}-key)`} />
      {highlight ? <Ellipse cx={16} cy={12} rx={10} ry={6.5} fill={`url(#${gradientId}-spec)`} /> : null}
      <Circle cx={cx} cy={cy} r={r} fill={`url(#${gradientId}-rim)`} />
    </Svg>
  );
}
