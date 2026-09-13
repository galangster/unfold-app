import Svg, {
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  COMPANION_EYES,
  HALO,
  PEARL,
  VIEWBOX_ATTR,
  type CompanionExpression,
} from '@/lib/companion-avatar-model';

interface CompanionIdentityProps {
  width: number;
  height: number;
  expression: CompanionExpression;
  gradientId: string;
  part?: 'all' | 'eyes' | 'halo';
}

/** Gold halo and one pair of eyes. Fades after the body splits, returns after merge. */
export function CompanionIdentity({
  width,
  height,
  expression,
  gradientId,
  part = 'all',
}: CompanionIdentityProps) {
  const eyes = COMPANION_EYES[expression];

  return (
    <Svg width={width} height={height} viewBox={VIEWBOX_ATTR} pointerEvents="none">
      {part !== 'halo' ? (
        <Defs>
          <LinearGradient id={`${gradientId}-eye`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={PEARL.eye} />
            <Stop offset="1" stopColor={PEARL.eyeDeep} />
          </LinearGradient>
          <ClipPath id={`${gradientId}-lidL`}>
            <Rect x={-8} y={eyes.left.lidY} width={16} height={eyes.left.lidH} />
          </ClipPath>
          <ClipPath id={`${gradientId}-lidR`}>
            <Rect x={-8} y={eyes.right.lidY} width={16} height={eyes.right.lidH} />
          </ClipPath>
        </Defs>
      ) : null}

      {part !== 'eyes' ? <G transform={HALO.transform}>
        <Ellipse
          cx={HALO.cx}
          cy={HALO.cy}
          rx={HALO.rx}
          ry={HALO.ry}
          fill="none"
          stroke={PEARL.halo}
          strokeWidth={HALO.strokeWidth}
          opacity={HALO.opacity}
        />
      </G> : null}

      {part !== 'halo' && eyes.left.visible ? (
        <G transform={eyes.left.matrix}>
          <G clipPath={`url(#${gradientId}-lidL)`}>
            <Path d={eyes.left.d} fill="#000000" opacity={0.22} transform="translate(0, 0.5)" />
            <Path d={eyes.left.d} fill={`url(#${gradientId}-eye)`} />
          </G>
        </G>
      ) : null}

      {part !== 'halo' && eyes.right.visible ? (
        <G transform={eyes.right.matrix}>
          <G clipPath={`url(#${gradientId}-lidR)`}>
            <Path d={eyes.right.d} fill="#000000" opacity={0.22} transform="translate(0, 0.5)" />
            <Path d={eyes.right.d} fill={`url(#${gradientId}-eye)`} />
          </G>
        </G>
      ) : null}
    </Svg>
  );
}
