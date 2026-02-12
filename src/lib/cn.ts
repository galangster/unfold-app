import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Prevents orphan words (single words on the last line) by replacing
 * the last space with a non-breaking space.
 * Also handles the last 2-3 words if the final word is short.
 */
export function preventOrphan(text: string): string {
  if (!text || typeof text !== 'string') return text;

  const trimmed = text.trim();
  const words = trimmed.split(' ');

  if (words.length <= 2) return trimmed;

  // Check if the last word is short (4 chars or less)
  const lastWord = words[words.length - 1];
  const secondLastWord = words[words.length - 2];

  // If last word is very short, join last 3 words with non-breaking spaces
  if (lastWord.length <= 4 && secondLastWord.length <= 4 && words.length > 3) {
    const beforeLast = words.slice(0, -3).join(' ');
    const lastThree = words.slice(-3).join('\u00A0');
    return `${beforeLast} ${lastThree}`;
  }

  // Otherwise, just join the last two words with non-breaking space
  const beforeLast = words.slice(0, -2).join(' ');
  const lastTwo = words.slice(-2).join('\u00A0');
  return `${beforeLast} ${lastTwo}`;
}
