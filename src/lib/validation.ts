/**
 * Input validation utilities for Unfold
 */

export const INPUT_LIMITS = {
  NAME: { min: 1, max: 50 },
  SHORT_TEXT: { min: 1, max: 100 },
  LONG_TEXT: { min: 0, max: 2000 },
  STUDY_SUBJECT: { min: 1, max: 100 },
} as const;

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a name input
 */
export function validateName(name: string): ValidationResult {
  const trimmed = name.trim();
  
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Please enter your name' };
  }
  
  if (trimmed.length > INPUT_LIMITS.NAME.max) {
    return { isValid: false, error: `Name must be ${INPUT_LIMITS.NAME.max} characters or less` };
  }
  
  // Allow letters, spaces, hyphens, apostrophes
  const validPattern = /^[\p{L}\s'-]+$/u;
  if (!validPattern.test(trimmed)) {
    return { isValid: false, error: 'Name contains invalid characters' };
  }
  
  return { isValid: true };
}

/**
 * Validates short text input (about me, current situation, etc.)
 */
export function validateShortText(text: string): ValidationResult {
  const trimmed = text.trim();
  
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Please provide a response' };
  }
  
  if (trimmed.length > INPUT_LIMITS.SHORT_TEXT.max) {
    return { isValid: false, error: `Response must be ${INPUT_LIMITS.SHORT_TEXT.max} characters or less` };
  }
  
  return { isValid: true };
}

/**
 * Validates long text input (discovery questions)
 */
export function validateLongText(text: string, minLength = 0): ValidationResult {
  const trimmed = text.trim();
  
  if (minLength > 0 && trimmed.length < minLength) {
    return { isValid: false, error: `Please provide at least ${minLength} characters` };
  }
  
  if (trimmed.length > INPUT_LIMITS.LONG_TEXT.max) {
    return { isValid: false, error: `Response must be ${INPUT_LIMITS.LONG_TEXT.max} characters or less` };
  }
  
  return { isValid: true };
}

/**
 * Validates study subject input
 */
export function validateStudySubject(subject: string): ValidationResult {
  const trimmed = subject.trim();
  
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Please enter a subject' };
  }
  
  if (trimmed.length > INPUT_LIMITS.STUDY_SUBJECT.max) {
    return { isValid: false, error: `Subject must be ${INPUT_LIMITS.STUDY_SUBJECT.max} characters or less` };
  }
  
  return { isValid: true };
}

/**
 * Sanitizes input text to prevent injection and normalize
 * Note: This does NOT trim trailing spaces to avoid cursor jumping during typing
 */
export function sanitizeInput(text: string): string {
  return text
    // Remove zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Normalize multiple spaces (but preserve trailing spaces for cursor position)
    .replace(/[ \t]+/g, ' ');
}

/**
 * Truncates text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
