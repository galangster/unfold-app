export type BubbleTail =
  | {
      edge: 'top' | 'bottom';
      centerX: number;
      width: number;
      height: number;
    }
  | {
      edge: 'right';
      centerY: number;
      width: number;
      height: number;
    }
  | {
      edge: 'left';
      centerY: number;
      width: number;
      height: number;
    }
  | {
      edge: 'bottomRight';
      width: number;
      height: number;
    };

export interface BubbleCornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

interface BuildBubblePathOptions {
  width: number;
  height: number;
  radius: number | BubbleCornerRadii;
  tail?: BubbleTail | null;
  strokeWidth?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function resolveRadii(radius: number | BubbleCornerRadii): BubbleCornerRadii {
  if (typeof radius === 'number') {
    return {
      topLeft: radius,
      topRight: radius,
      bottomRight: radius,
      bottomLeft: radius,
    };
  }

  return radius;
}

function clampRadii(radii: BubbleCornerRadii, width: number, height: number): BubbleCornerRadii {
  const maxRadius = Math.max(0, Math.min(width, height) / 2);

  return {
    topLeft: clamp(radii.topLeft, 0, maxRadius),
    topRight: clamp(radii.topRight, 0, maxRadius),
    bottomRight: clamp(radii.bottomRight, 0, maxRadius),
    bottomLeft: clamp(radii.bottomLeft, 0, maxRadius),
  };
}

/**
 * Builds one continuous speech-bubble outline. Tails are part of the same path
 * as the rounded rectangle so there is no separate triangle/square seam.
 */
export function buildBubblePath({
  width,
  height,
  radius,
  tail = null,
  strokeWidth = 1,
}: BuildBubblePathOptions): string {
  const halfStroke = strokeWidth / 2;
  const left = tail?.edge === 'left' ? tail.width + halfStroke : halfStroke;
  const right = left + width - strokeWidth;
  const bodyTop = tail?.edge === 'top' ? tail.height + halfStroke : halfStroke;
  const bodyBottom = bodyTop + height - strokeWidth;
  const radii = clampRadii(resolveRadii(radius), right - left, bodyBottom - bodyTop);

  const path: string[] = [`M ${left + radii.topLeft} ${bodyTop}`];

  if (tail?.edge === 'top') {
    const halfTail = tail.width / 2;
    const centerX = clamp(
      tail.centerX,
      left + radii.topLeft + halfTail + 2,
      right - radii.topRight - halfTail - 2,
    );
    path.push(
      `L ${centerX - halfTail} ${bodyTop}`,
      `L ${centerX} ${bodyTop - tail.height}`,
      `L ${centerX + halfTail} ${bodyTop}`,
    );
  }

  path.push(
    `L ${right - radii.topRight} ${bodyTop}`,
    `Q ${right} ${bodyTop} ${right} ${bodyTop + radii.topRight}`,
  );

  if (tail?.edge === 'right') {
    const halfTail = tail.height / 2;
    const centerY = clamp(
      tail.centerY,
      bodyTop + radii.topRight + halfTail + 2,
      bodyBottom - radii.bottomRight - halfTail - 2,
    );
    path.push(
      `L ${right} ${centerY - halfTail}`,
      `C ${right + tail.width * 0.36} ${centerY - halfTail * 0.72} ${right + tail.width} ${centerY - halfTail * 0.34} ${right + tail.width} ${centerY}`,
      `C ${right + tail.width} ${centerY + halfTail * 0.34} ${right + tail.width * 0.36} ${centerY + halfTail * 0.72} ${right} ${centerY + halfTail}`,
    );
  }

  if (tail?.edge === 'bottomRight') {
    const tailHeight = Math.min(tail.height, Math.max(8, bodyBottom - bodyTop - radii.topRight - 4));
    const tailBaseY = bodyBottom - tailHeight;
    const tailTipX = right + tail.width;
    const tailTipY = bodyBottom - tailHeight * 0.34;

    path.push(
      `L ${right} ${tailBaseY}`,
      `C ${right} ${bodyBottom - tailHeight * 0.58} ${right + tail.width * 0.48} ${bodyBottom - tailHeight * 0.46} ${tailTipX} ${tailTipY}`,
      `C ${right + tail.width * 0.48} ${bodyBottom - tailHeight * 0.18} ${right + tail.width * 0.14} ${bodyBottom} ${right - radii.bottomRight} ${bodyBottom}`,
    );
  } else {
    path.push(
      `L ${right} ${bodyBottom - radii.bottomRight}`,
      `Q ${right} ${bodyBottom} ${right - radii.bottomRight} ${bodyBottom}`,
    );
  }

  if (tail?.edge === 'bottom') {
    const halfTail = tail.width / 2;
    const centerX = clamp(
      tail.centerX,
      left + radii.bottomLeft + halfTail + 2,
      right - radii.bottomRight - halfTail - 2,
    );
    path.push(
      `L ${centerX + halfTail} ${bodyBottom}`,
      `L ${centerX} ${bodyBottom + tail.height}`,
      `L ${centerX - halfTail} ${bodyBottom}`,
    );
  }

  path.push(
    `L ${left + radii.bottomLeft} ${bodyBottom}`,
    `Q ${left} ${bodyBottom} ${left} ${bodyBottom - radii.bottomLeft}`,
  );

  if (tail?.edge === 'left') {
    const halfTail = tail.height / 2;
    const minCenter = bodyTop + radii.topLeft + halfTail + 2;
    const maxCenter = bodyBottom - radii.bottomLeft - halfTail - 2;
    const centerY = maxCenter >= minCenter ? clamp(tail.centerY, minCenter, maxCenter) : (bodyTop + bodyBottom) / 2;
    const tailTipX = left - tail.width;

    path.push(
      `L ${left} ${centerY + halfTail}`,
      `C ${left - tail.width * 0.42} ${centerY + halfTail * 0.74} ${tailTipX} ${centerY + halfTail * 0.32} ${tailTipX} ${centerY}`,
      `C ${tailTipX} ${centerY - halfTail * 0.32} ${left - tail.width * 0.42} ${centerY - halfTail * 0.74} ${left} ${centerY - halfTail}`,
    );
  }

  path.push(
    `L ${left} ${bodyTop + radii.topLeft}`,
    `Q ${left} ${bodyTop} ${left + radii.topLeft} ${bodyTop}`,
    'Z',
  );

  return path.join(' ');
}
