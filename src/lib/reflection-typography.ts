export type ReflectionFontSize = 'small' | 'medium' | 'large';

const REFLECTION_BASE_BODY_SIZE: Record<ReflectionFontSize, number> = {
  small: 15,
  medium: 17,
  large: 20,
};

export type ReflectionTypography = {
  questionFontSize: number;
  questionLineHeight: number;
  responseFontSize: number;
  responseLineHeight: number;
  previewFontSize: number;
  previewLineHeight: number;
};

/**
 * Reflection prompts should follow the reader's Small/Medium/Large preference,
 * but stay a touch quieter than the main devotional body so stacked questions
 * do not dominate the screen.
 */
export function getReflectionTypography(fontSize: ReflectionFontSize): ReflectionTypography {
  const body = REFLECTION_BASE_BODY_SIZE[fontSize];
  const preview = Math.max(12, body - 2);

  return {
    questionFontSize: body,
    questionLineHeight: Math.round(body * 1.65),
    responseFontSize: body,
    responseLineHeight: Math.round(body * 1.55),
    previewFontSize: preview,
    previewLineHeight: Math.round(preview * 1.5),
  };
}
