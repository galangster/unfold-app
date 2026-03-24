import React from 'react';

type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

/**
 * Clone a React icon element with standardized size and color props.
 * Returns null if no icon provided, passes through non-element nodes.
 */
export function renderIcon(
  icon: React.ReactNode | undefined,
  props: { size: number; color: string; weight?: IconWeight }
): React.ReactNode | null {
  if (!icon) return null;
  if (!React.isValidElement(icon)) return icon;
  return React.cloneElement(icon as React.ReactElement<any>, props);
}
