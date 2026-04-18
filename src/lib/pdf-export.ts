import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { logger } from '@/lib/logger';
import type { Devotional } from './store';

const DEFAULT_ACCENT = '#5B8DEF';
const BODY_COLOR = '#2A2A2E';
const MUTED_COLOR = '#8E8E93';
const HEADING_COLOR = '#1C1C1E';

/** Escape HTML special characters to prevent injection in the generated PDF */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Validate that a string is a valid hex color; fall back to default */
function safeAccentColor(color: string | undefined): string {
  if (!color) return DEFAULT_ACCENT;
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : DEFAULT_ACCENT;
}

/** Options for customizing the PDF workbook export */
export interface PDFExportOptions {
  accentColor?: string;
  journalEntries?: {
    dayNumber: number;
    content: string;
    questionResponses?: { question: string; response: string }[];
  }[];
  checkIns?: {
    dayNumber: number;
    mood: number;
    moodLabel: string;
  }[];
}

/** Sanitize a devotional title into a safe filename */
function sanitizeFilename(title: string): string {
  return title
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Get the accent-light color (10% opacity version for backgrounds) */
function accentLight(accent: string): string {
  // Convert hex to rgba with low opacity
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.08)`;
}

/** Map mood number to emoji */
function moodEmoji(mood: number): string {
  switch (mood) {
    case 1: return '\u{1F61E}'; // disappointed
    case 2: return '\u{1F614}'; // pensive
    case 3: return '\u{1F642}'; // slightly smiling
    case 4: return '\u{1F60A}'; // smiling
    case 5: return '\u{1F64F}'; // folded hands / grateful
    default: return '\u{1F642}';
  }
}

/** Generate lined writing space HTML (empty lines with bottom borders) */
function generateLinedSpace(lineCount: number, accent: string): string {
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(`<div class="writing-line"></div>`);
  }
  return lines.join('');
}

// Generate HTML content for the PDF
function generateDevotionalHTML(devotional: Devotional, options?: PDFExportOptions): string {
  const accent = safeAccentColor(options?.accentColor);
  const accentBg = accentLight(accent);
  const journalMap = new Map<number, PDFExportOptions['journalEntries']>();
  const checkInMap = new Map<number, PDFExportOptions['checkIns']>();

  // Index journal entries by day number
  if (options?.journalEntries) {
    for (const entry of options.journalEntries) {
      if (!journalMap.has(entry.dayNumber)) {
        journalMap.set(entry.dayNumber, []);
      }
      journalMap.get(entry.dayNumber)!.push(entry);
    }
  }

  // Index check-ins by day number
  if (options?.checkIns) {
    for (const checkIn of options.checkIns) {
      if (!checkInMap.has(checkIn.dayNumber)) {
        checkInMap.set(checkIn.dayNumber, []);
      }
      checkInMap.get(checkIn.dayNumber)!.push(checkIn);
    }
  }

  const days = devotional.days.map((day, index) => {
    const pageNumber = index + 2; // cover is page 1
    const dayJournals = journalMap.get(day.dayNumber) ?? [];
    const dayCheckIns = checkInMap.get(day.dayNumber) ?? [];

    const crossRefsHTML = day.crossReferences?.length
      ? `
        <div class="section related-scripture">
          <h4>Related Scripture</h4>
          ${day.crossReferences
            .map(
              (ref) => `
            <div class="cross-ref">
              <span class="ref-label">${escapeHTML(ref.reference)}</span>
              <p class="ref-text">${escapeHTML(ref.text)}</p>
            </div>
          `
            )
            .join('')}
        </div>
      `
      : '';

    const quotesHTML = day.quotes?.length
      ? `
        <div class="section quotes">
          ${day.quotes
            .map(
              (quote) => `
            <blockquote>
              <p>&ldquo;${escapeHTML(quote.text)}&rdquo;</p>
              <cite>&mdash; ${escapeHTML(quote.author)}</cite>
            </blockquote>
          `
            )
            .join('')}
        </div>
      `
      : '';

    const contextHTML = day.contextNote
      ? `
        <div class="section context">
          <h4>Historical Context</h4>
          <p>${escapeHTML(day.contextNote)}</p>
        </div>
      `
      : '';

    const wordStudyHTML = day.wordStudy
      ? `
        <div class="section word-study">
          <h4>Word Study</h4>
          <p class="word-study-term"><strong>${escapeHTML(day.wordStudy.term)}</strong> <em>(${escapeHTML(day.wordStudy.original)})</em></p>
          <p>${escapeHTML(day.wordStudy.meaning)}</p>
        </div>
      `
      : '';

    // Go Deeper: Reflection questions with lined writing space + journal entries
    const reflectionHTML = day.reflectionQuestions?.length
      ? `
        <div class="section reflection go-deeper">
          <h4>Go Deeper</h4>
          <ol>
            ${day.reflectionQuestions
              .map((q, qIndex) => {
                // Find any journal response for this question
                const journalResponse = dayJournals
                  .flatMap((j) => j.questionResponses ?? [])
                  .find((qr) => qr.question === q);

                const responseHTML = journalResponse
                  ? `<div class="journal-response"><em>${escapeHTML(journalResponse.response)}</em></div>`
                  : '';

                return `
                  <div class="question-block">
                    <li>${escapeHTML(q)}</li>
                    ${responseHTML}
                    <div class="writing-space">
                      ${generateLinedSpace(6, accent)}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </ol>
        </div>
      `
      : '';

    // My Reflections: Show journal content if it exists and wasn't covered by question responses
    const generalJournalContent = dayJournals
      .filter((j) => j.content && j.content.trim().length > 0)
      .map((j) => j.content);

    const myReflectionsHTML = generalJournalContent.length > 0
      ? `
        <div class="section my-reflections">
          <h4>My Reflections</h4>
          ${generalJournalContent.map((content) => `<p class="journal-text"><em>${escapeHTML(content)}</em></p>`).join('')}
        </div>
      `
      : '';

    const prayerHTML = day.closingPrayer
      ? `
        <div class="section prayer">
          <h4>A Prayer</h4>
          <p class="prayer-text">${escapeHTML(day.closingPrayer)}</p>
        </div>
      `
      : '';

    const quotableHTML = day.quotableLine
      ? `
        <div class="quotable">
          <p>&ldquo;${escapeHTML(day.quotableLine)}&rdquo;</p>
        </div>
      `
      : '';

    // Check-in mood for the day
    const checkInHTML = dayCheckIns.length > 0
      ? `
        <div class="section check-in-summary">
          <h4>Check-In</h4>
          <div class="mood-display">
            ${dayCheckIns.map((ci) => `<span class="mood-chip">${moodEmoji(ci.mood)} ${escapeHTML(ci.moodLabel)}</span>`).join(' ')}
          </div>
        </div>
      `
      : '';

    // My Prayer section with lined writing space
    const myPrayerHTML = `
      <div class="section my-prayer">
        <h4>My Prayer</h4>
        <div class="writing-space">
          ${generateLinedSpace(8, accent)}
        </div>
      </div>
    `;

    return `
      <div class="day page-break">
        <div class="day-header">
          <span class="day-number">Day ${day.dayNumber}</span>
          <h2 class="day-title">${escapeHTML(day.title)}</h2>
          <div class="title-rule"></div>
        </div>

        <div class="scripture">
          <span class="scripture-ref">${escapeHTML(day.scriptureReference)}</span>
          <p class="scripture-text">&ldquo;${escapeHTML(day.scriptureText)}&rdquo;</p>
        </div>

        <div class="body-text">
          ${escapeHTML(day.bodyText || '')
            .split('\n\n')
            .filter((p) => p.trim())
            .map((p) => `<p>${p}</p>`)
            .join('')}
        </div>

        ${quotableHTML}
        ${crossRefsHTML}
        ${quotesHTML}
        ${contextHTML}
        ${wordStudyHTML}
        ${reflectionHTML}
        ${myReflectionsHTML}
        ${checkInHTML}
        ${prayerHTML}
        ${myPrayerHTML}

        <div class="page-footer">
          <span class="footer-brand">Unfold</span>
          <span class="footer-page">${pageNumber}</span>
        </div>
      </div>
    `;
  });

  // My Journey summary page
  const completedDays = devotional.days.filter((d) => d.isRead).length;
  const totalCheckIns = options?.checkIns ?? [];
  const moodCounts = new Map<string, { count: number; emoji: string }>();

  for (const ci of totalCheckIns) {
    const key = ci.moodLabel;
    if (!moodCounts.has(key)) {
      moodCounts.set(key, { count: 0, emoji: moodEmoji(ci.mood) });
    }
    moodCounts.get(key)!.count++;
  }

  const moodSummaryHTML = moodCounts.size > 0
    ? `
      <div class="journey-mood-summary">
        <h4>My Mood Over Time</h4>
        <div class="mood-grid">
          ${Array.from(moodCounts.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .map(
              ([label, { count, emoji }]) => `
              <div class="mood-item">
                <span class="mood-emoji">${emoji}</span>
                <span class="mood-label">${escapeHTML(label)}</span>
                <span class="mood-count">${count} ${count === 1 ? 'day' : 'days'}</span>
              </div>
            `
            )
            .join('')}
        </div>
      </div>
    `
    : '';

  const journeySummaryPage = `
    <div class="journey-page page-break">
      <div class="day-header">
        <span class="day-number">Summary</span>
        <h2 class="day-title">My Series</h2>
        <div class="title-rule"></div>
      </div>

      <div class="journey-stats">
        <div class="stat-card">
          <span class="stat-value">${completedDays}</span>
          <span class="stat-label">of ${devotional.totalDays} days completed</span>
        </div>
      </div>

      ${moodSummaryHTML}

      <div class="section final-reflection">
        <h4>Final Reflection</h4>
        <p class="reflection-prompt">As you look back on this series, what has God revealed to you? What will you carry forward?</p>
        <div class="writing-space writing-space-large">
          ${generateLinedSpace(12, accent)}
        </div>
      </div>

      <div class="page-footer">
        <span class="footer-brand">Unfold</span>
        <span class="footer-page">${devotional.days.length + 2}</span>
      </div>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHTML(devotional.title)} - Unfold</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');

        @page {
          margin: 0.75in;
          size: letter;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 11pt;
          line-height: 1.7;
          color: ${BODY_COLOR};
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          orphans: 3;
          widows: 3;
        }

        /* ===========================
           RUNNING FOOTER (hidden — not supported in expo-print WebKit)
           =========================== */

        .running-footer {
          display: none;
        }

        /* ===========================
           COVER PAGE
           =========================== */

        .cover {
          background-color: #ffffff;
          margin: -0.75in;
          padding: 2in 1.2in 1.2in 1.2in;
          min-height: 100vh;
          page-break-after: always;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
        }

        .cover-content {
          text-align: center;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .cover-accent-line {
          width: 50px;
          height: 1.5px;
          background-color: ${accent};
          margin: 0 auto 0.4in auto;
        }

        .cover h1 {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 34pt;
          font-weight: normal;
          color: ${HEADING_COLOR};
          letter-spacing: 0.01em;
          line-height: 1.2;
          margin-bottom: 0.35in;
        }

        .cover .subtitle {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 9pt;
          color: ${MUTED_COLOR};
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-bottom: 0.25in;
        }

        .cover .accent-divider {
          width: 30px;
          height: 1px;
          background-color: ${accent};
          margin: 0 auto;
        }

        .cover-bottom {
          text-align: center;
          padding-top: 0.8in;
        }

        .cover .prepared-for {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          color: ${MUTED_COLOR};
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 0.12in;
        }

        .cover .prepared-name {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 15pt;
          color: ${BODY_COLOR};
          font-weight: normal;
          margin-bottom: 0.8in;
        }

        .cover .brand-logo {
          display: block;
          margin: 0 auto;
          width: 40px;
          height: auto;
          opacity: 0.85;
        }

        /* ===========================
           PAGE BREAKS
           =========================== */

        .page-break {
          page-break-before: always;
        }

        /* ===========================
           DAY PAGES
           =========================== */

        .day {
          padding-top: 0.6in;
          position: relative;
        }

        .day-header {
          margin-bottom: 0.35in;
        }

        .day-number {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: ${MUTED_COLOR};
          display: block;
          margin-bottom: 0.08in;
        }

        .day-title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 24pt;
          font-weight: normal;
          line-height: 1.25;
          color: ${HEADING_COLOR};
          margin-bottom: 0.12in;
        }

        .title-rule {
          width: 50px;
          height: 2px;
          background-color: ${accent};
          margin-top: 0.08in;
        }

        /* ===========================
           SCRIPTURE BLOCK
           =========================== */

        .scripture {
          margin: 0.3in 0;
          padding: 0.2in 0.3in;
          border-left: 3px solid ${accent};
          background-color: ${accentBg};
          page-break-inside: avoid;
        }

        .scripture-ref {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: ${accent};
          display: block;
          margin-bottom: 0.06in;
        }

        .scripture-text {
          font-family: Georgia, 'Times New Roman', serif;
          font-style: italic;
          font-size: 11pt;
          color: #3A3A3C;
          line-height: 1.8;
        }

        /* ===========================
           BODY TEXT
           =========================== */

        .body-text {
          margin: 0.3in 0;
        }

        .body-text p {
          font-size: 11pt;
          line-height: 1.7;
          margin-bottom: 0.15in;
          text-align: justify;
          color: ${BODY_COLOR};
          orphans: 3;
          widows: 3;
        }

        /* ===========================
           QUOTABLE / PULL QUOTE
           =========================== */

        .quotable {
          margin: 0.35in 0.4in;
          padding: 0.25in 0;
          text-align: center;
          border-top: 1px solid #E5E5EA;
          border-bottom: 1px solid #E5E5EA;
          page-break-inside: avoid;
        }

        .quotable p {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          font-size: 14pt;
          line-height: 1.5;
          color: ${accent};
        }

        /* ===========================
           SECTIONS (shared)
           =========================== */

        .section {
          margin: 0.25in 0;
          padding: 0.2in 0.25in;
          background-color: #FAFAFA;
          border-radius: 4px;
          page-break-inside: avoid;
        }

        .section h4 {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: ${MUTED_COLOR};
          margin-bottom: 0.12in;
          padding-bottom: 0.06in;
          border-bottom: 1px solid #EBEBEB;
        }

        .section p {
          font-size: 11pt;
          line-height: 1.65;
          color: ${BODY_COLOR};
        }

        /* ===========================
           RELATED SCRIPTURE
           =========================== */

        .related-scripture .cross-ref {
          margin-bottom: 0.15in;
          padding-left: 0.2in;
          border-left: 2px solid ${accent};
        }

        .related-scripture .cross-ref:last-child {
          margin-bottom: 0;
        }

        .ref-label {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: ${accent};
          display: block;
          margin-bottom: 0.04in;
        }

        .ref-text {
          font-style: italic;
          font-size: 10pt;
          color: #555;
          line-height: 1.6;
        }

        /* ===========================
           BLOCKQUOTES
           =========================== */

        blockquote {
          margin: 0.15in 0;
          padding: 0.12in 0.2in;
          border-left: 2px solid ${accent};
          background-color: transparent;
          page-break-inside: avoid;
        }

        blockquote p {
          font-style: italic;
          font-size: 10pt;
          color: #444;
          line-height: 1.6;
        }

        blockquote cite {
          display: block;
          font-family: Helvetica, Arial, sans-serif;
          font-size: 9pt;
          color: ${MUTED_COLOR};
          margin-top: 0.06in;
          font-style: normal;
        }

        /* ===========================
           WORD STUDY
           =========================== */

        .word-study .word-study-term {
          font-size: 11pt;
          margin-bottom: 0.06in;
        }

        /* ===========================
           GO DEEPER / REFLECTION QUESTIONS
           =========================== */

        .go-deeper {
          page-break-inside: avoid;
        }

        .go-deeper ol {
          padding-left: 0.3in;
          list-style-type: decimal;
        }

        .go-deeper li {
          font-size: 10pt;
          line-height: 1.65;
          margin-bottom: 0.04in;
          color: ${BODY_COLOR};
          padding-left: 0.06in;
        }

        .journal-response {
          margin: 0.06in 0 0.1in 0;
          padding: 0.08in 0.15in;
          border-left: 2px solid ${accent};
          background-color: ${accentBg};
          border-radius: 2px;
        }

        .journal-response em {
          font-size: 10pt;
          line-height: 1.55;
          color: #555;
        }

        /* ===========================
           WRITING LINES (for Go Deeper + My Prayer)
           =========================== */

        .writing-space {
          margin: 0.1in 0 0.15in 0;
          page-break-inside: avoid;
        }

        .writing-line {
          height: 0.32in;
          border-bottom: 1px solid #E0E0E0;
        }

        .writing-space-large .writing-line {
          height: 0.35in;
        }

        /* ===========================
           QUESTION BLOCK (question + writing lines as atomic unit)
           =========================== */

        .question-block {
          page-break-inside: avoid;
        }

        /* ===========================
           MY REFLECTIONS (journal entries)
           =========================== */

        .my-reflections .journal-text {
          font-size: 10pt;
          line-height: 1.6;
          color: #555;
          margin-bottom: 0.12in;
          padding: 0.1in 0.15in;
          border-left: 2px solid ${accent};
          background-color: ${accentBg};
          border-radius: 2px;
        }

        /* ===========================
           CHECK-IN SUMMARY
           =========================== */

        .check-in-summary .mood-display {
          display: flex;
          flex-wrap: wrap;
          gap: 0.1in;
        }

        .mood-chip {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 10pt;
          color: ${BODY_COLOR};
          background-color: #F0F0F0;
          padding: 0.04in 0.12in;
          border-radius: 0.1in;
          display: inline-block;
        }

        /* ===========================
           MY PRAYER SECTION
           =========================== */

        .my-prayer {
          background-color: transparent;
          border: none;
          border-top: 1px solid #E5E5EA;
          border-radius: 0;
          padding-top: 0.2in;
          page-break-inside: avoid;
        }

        /* ===========================
           REFLECTION QUESTIONS (legacy compat)
           =========================== */

        .reflection ol {
          padding-left: 0.3in;
          list-style-type: decimal;
        }

        .reflection li {
          font-size: 10pt;
          line-height: 1.65;
          margin-bottom: 0.1in;
          color: ${BODY_COLOR};
          padding-left: 0.06in;
        }

        /* ===========================
           PRAYER
           =========================== */

        .prayer {
          background-color: transparent;
          border: none;
          border-top: 1px solid #E5E5EA;
          border-radius: 0;
          padding-top: 0.2in;
          page-break-inside: avoid;
        }

        .prayer-text {
          font-family: Georgia, 'Times New Roman', serif;
          font-style: italic;
          font-size: 11pt;
          line-height: 1.75;
          color: #555;
          text-align: left;
        }

        /* ===========================
           PAGE FOOTER (inline at bottom of each day)
           =========================== */

        .page-footer {
          margin-top: 0.5in;
          padding-top: 0.1in;
          border-top: 1px solid #E5E5EA;
          display: flex;
          justify-content: space-between;
          font-family: Helvetica, Arial, sans-serif;
          font-size: 7pt;
          color: #C7C7CC;
        }

        .page-footer .footer-brand {
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }

        .page-footer .footer-page {
          letter-spacing: 0.05em;
        }

        /* ===========================
           CONTEXT SECTION
           =========================== */

        .context p {
          font-size: 10pt;
          line-height: 1.65;
        }

        /* ===========================
           MY JOURNEY SUMMARY PAGE
           =========================== */

        .journey-page {
          padding-top: 0.6in;
          position: relative;
        }

        .journey-stats {
          margin: 0.35in 0;
          display: flex;
          justify-content: center;
        }

        .stat-card {
          text-align: center;
          padding: 0.3in 0.45in;
          border: 2px solid ${accent};
          border-radius: 8px;
          background-color: ${accentBg};
        }

        .stat-value {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 36pt;
          font-weight: normal;
          color: ${accent};
          display: block;
          line-height: 1.1;
        }

        .stat-label {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 9pt;
          color: ${MUTED_COLOR};
          letter-spacing: 0.05em;
          margin-top: 0.1in;
          display: block;
        }

        .journey-mood-summary {
          margin: 0.35in 0;
          padding: 0.2in 0.25in;
          background-color: #FAFAFA;
          border-radius: 4px;
        }

        .journey-mood-summary h4 {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: ${MUTED_COLOR};
          margin-bottom: 0.12in;
          padding-bottom: 0.06in;
          border-bottom: 1px solid #EBEBEB;
        }

        .mood-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.12in;
        }

        .mood-item {
          display: flex;
          align-items: center;
          gap: 0.06in;
          padding: 0.05in 0.12in;
          background-color: #F0F0F0;
          border-radius: 0.1in;
        }

        .mood-emoji {
          font-size: 14pt;
        }

        .mood-label {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 9pt;
          color: ${BODY_COLOR};
        }

        .mood-count {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          color: ${MUTED_COLOR};
          margin-left: 0.04in;
        }

        .final-reflection .reflection-prompt {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          font-size: 11pt;
          color: #555;
          margin-bottom: 0.2in;
          line-height: 1.6;
        }

        /* ===========================
           PRINT HELPERS
           =========================== */

        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .cover {
            background-color: #ffffff !important;
          }

          .scripture {
            background-color: ${accentBg} !important;
            border-left-color: ${accent} !important;
          }

          .quotable p {
            color: ${accent} !important;
          }

          .stat-card {
            border-color: ${accent} !important;
            background-color: ${accentBg} !important;
          }
        }
      </style>
    </head>
    <body>
      <!-- RUNNING FOOTER (repeats on every printed page via position:fixed) -->
      <div class="running-footer">
        <span class="footer-brand">Unfold</span>
      </div>

      <!-- COVER PAGE -->
      <div class="cover">
        <div class="cover-content">
          <div class="cover-accent-line"></div>
          <h1>${escapeHTML(devotional.title)}</h1>
          <p class="subtitle">A ${devotional.totalDays}-Day Devotional Series</p>
          <div class="accent-divider"></div>
        </div>
        <div class="cover-bottom">
          <p class="prepared-for">Prepared for</p>
          <p class="prepared-name">${escapeHTML(devotional.userContext.name)}</p>
          <img class="brand-logo" src="data:image/png;base64,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" alt="Unfold" />
        </div>
      </div>

      <!-- DAY PAGES -->
      ${days.join('')}

      <!-- MY JOURNEY SUMMARY PAGE -->
      ${journeySummaryPage}
    </body>
    </html>
  `;
}

// Export devotional to PDF and share
export async function exportDevotionalToPDF(
  devotional: Devotional,
  options?: PDFExportOptions
): Promise<boolean> {
  try {
    // Guard: devotional must have at least a title and days array
    if (!devotional?.title || !devotional?.days) {
      logger.warn('[PDF Export] Invalid devotional data — missing title or days');
      return false;
    }

    const html = generateDevotionalHTML(devotional, options);

    // Generate PDF (expo-print creates a UUID-named file)
    // margins in points (72 PPI): 0.75in = 54pt
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
      margins: { top: 54, right: 54, bottom: 54, left: 54 },
    });

    logger.log('[PDF Export] Generated PDF at:', uri);

    // Copy the file with a clean name to the cache directory
    const sanitizedTitle = sanitizeFilename(devotional.title);
    const desiredName = `${sanitizedTitle || 'Devotional'}.pdf`;
    let finalUri = uri;

    try {
      const sourceFile = new File(uri);
      const cacheDir = Paths.cache;
      const destFile = new File(cacheDir, desiredName);
      // Remove existing file with same name if present
      if (destFile.exists) {
        destFile.delete();
      }
      sourceFile.move(destFile);
      finalUri = destFile.uri;
      logger.log('[PDF Export] Moved PDF to:', finalUri);
    } catch (moveError: any) {
      logger.warn('[PDF Export] Move failed:', moveError?.message || moveError);
      // Fall back to the original UUID-named file
    }

    // Check if sharing is available
    const isAvailable = await Sharing.isAvailableAsync();

    if (isAvailable) {
      // Share the PDF with the clean filename
      await Sharing.shareAsync(finalUri, {
        mimeType: 'application/pdf',
        dialogTitle: `${devotional.title} - Unfold`,
        UTI: 'com.adobe.pdf',
      });
      return true;
    } else {
      logger.log('[PDF Export] Sharing not available on this platform');
      return false;
    }
  } catch (error) {
    logger.error('[PDF Export] Error:', error);
    return false;
  }
}

// Check if PDF export is supported on this platform
export function isPDFExportSupported(): boolean {
  // PDF export is supported on iOS and Android, not on web
  return Platform.OS !== 'web';
}
