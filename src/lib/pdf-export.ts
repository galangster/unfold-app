import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import type { Devotional } from './store';

const ACCENT_COLOR = '#5B8DEF';
const ACCENT_LIGHT = '#EBF1FD';
const COVER_BG = '#121214';
const COVER_TEXT = '#FFFFFF';
const COVER_SUBTLE = 'rgba(255, 255, 255, 0.45)';
const BODY_COLOR = '#2A2A2E';
const MUTED_COLOR = '#8E8E93';
const HEADING_COLOR = '#1C1C1E';

/** Sanitize a devotional title into a safe filename */
function sanitizeFilename(title: string): string {
  return title
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// Generate HTML content for the PDF
function generateDevotionalHTML(devotional: Devotional): string {
  const days = devotional.days.map((day, index) => {
    const pageNumber = index + 2; // cover is page 1

    const crossRefsHTML = day.crossReferences?.length
      ? `
        <div class="section related-scripture">
          <h4>Related Scripture</h4>
          ${day.crossReferences
            .map(
              (ref) => `
            <div class="cross-ref">
              <span class="ref-label">${ref.reference}</span>
              <p class="ref-text">${ref.text}</p>
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
              <p>&ldquo;${quote.text}&rdquo;</p>
              <cite>&mdash; ${quote.author}</cite>
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
          <p>${day.contextNote}</p>
        </div>
      `
      : '';

    const wordStudyHTML = day.wordStudy
      ? `
        <div class="section word-study">
          <h4>Word Study</h4>
          <p class="word-study-term"><strong>${day.wordStudy.term}</strong> <em>(${day.wordStudy.original})</em></p>
          <p>${day.wordStudy.meaning}</p>
        </div>
      `
      : '';

    const reflectionHTML = day.reflectionQuestions?.length
      ? `
        <div class="section reflection">
          <h4>For Reflection</h4>
          <ol>
            ${day.reflectionQuestions.map((q) => `<li>${q}</li>`).join('')}
          </ol>
        </div>
      `
      : '';

    const prayerHTML = day.closingPrayer
      ? `
        <div class="section prayer">
          <h4>A Prayer</h4>
          <p class="prayer-text">${day.closingPrayer}</p>
        </div>
      `
      : '';

    const quotableHTML = day.quotableLine
      ? `
        <div class="quotable">
          <p>&ldquo;${day.quotableLine}&rdquo;</p>
        </div>
      `
      : '';

    return `
      <div class="day page-break">
        <div class="day-header">
          <span class="day-number">Day ${day.dayNumber}</span>
          <h2 class="day-title">${day.title}</h2>
          <div class="title-rule"></div>
        </div>

        <div class="scripture">
          <span class="scripture-ref">${day.scriptureReference}</span>
          <p class="scripture-text">&ldquo;${day.scriptureText}&rdquo;</p>
        </div>

        <div class="body-text">
          ${day.bodyText
            .split('\n\n')
            .map((p) => `<p>${p}</p>`)
            .join('')}
        </div>

        ${quotableHTML}
        ${crossRefsHTML}
        ${quotesHTML}
        ${contextHTML}
        ${wordStudyHTML}
        ${reflectionHTML}
        ${prayerHTML}

        <div class="page-footer">
          <span class="footer-brand">Unfold</span>
          <span class="footer-page">${pageNumber}</span>
        </div>
      </div>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${devotional.title} - Unfold</title>
      <style>
        @page {
          margin: 1in;
          size: letter;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 12pt;
          line-height: 1.7;
          color: ${BODY_COLOR};
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* ===========================
           COVER PAGE
           =========================== */

        .cover {
          background-color: ${COVER_BG};
          margin: -1in;
          padding: 2.5in 1.5in 1.5in 1.5in;
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
          width: 60px;
          height: 2px;
          background-color: ${ACCENT_COLOR};
          margin: 0 auto 0.5in auto;
        }

        .cover h1 {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 36pt;
          font-weight: normal;
          color: ${COVER_TEXT};
          letter-spacing: 0.02em;
          line-height: 1.2;
          margin-bottom: 0.4in;
        }

        .cover .subtitle {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 11pt;
          color: ${COVER_SUBTLE};
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-bottom: 0.3in;
        }

        .cover .accent-divider {
          width: 40px;
          height: 1px;
          background-color: ${ACCENT_COLOR};
          margin: 0 auto;
        }

        .cover-bottom {
          text-align: center;
          padding-top: 1in;
        }

        .cover .prepared-for {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 9pt;
          color: rgba(255, 255, 255, 0.35);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 0.15in;
        }

        .cover .prepared-name {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 16pt;
          color: rgba(255, 255, 255, 0.8);
          font-weight: normal;
          margin-bottom: 1in;
        }

        .cover .brand {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          color: rgba(255, 255, 255, 0.2);
          letter-spacing: 0.35em;
          text-transform: uppercase;
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
          padding: 0;
          position: relative;
          min-height: calc(100vh - 2in);
        }

        .day-header {
          margin-bottom: 0.4in;
        }

        .day-number {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: ${MUTED_COLOR};
          display: block;
          margin-bottom: 0.1in;
        }

        .day-title {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 24pt;
          font-weight: normal;
          line-height: 1.25;
          color: ${HEADING_COLOR};
          margin-bottom: 0.15in;
        }

        .title-rule {
          width: 50px;
          height: 2px;
          background-color: ${ACCENT_COLOR};
          margin-top: 0.1in;
        }

        /* ===========================
           SCRIPTURE BLOCK
           =========================== */

        .scripture {
          margin: 0.35in 0;
          padding: 0.25in 0.35in;
          border-left: 3px solid ${ACCENT_COLOR};
          background-color: ${ACCENT_LIGHT};
        }

        .scripture-ref {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: ${ACCENT_COLOR};
          display: block;
          margin-bottom: 0.08in;
        }

        .scripture-text {
          font-family: Georgia, 'Times New Roman', serif;
          font-style: italic;
          font-size: 12pt;
          color: #3A3A3C;
          line-height: 1.8;
        }

        /* ===========================
           BODY TEXT
           =========================== */

        .body-text {
          margin: 0.35in 0;
        }

        .body-text p {
          font-size: 12pt;
          line-height: 1.7;
          margin-bottom: 0.18in;
          text-align: justify;
          color: ${BODY_COLOR};
        }

        /* ===========================
           QUOTABLE / PULL QUOTE
           =========================== */

        .quotable {
          margin: 0.45in 0.5in;
          padding: 0.3in 0;
          text-align: center;
          border-top: 1px solid #E5E5EA;
          border-bottom: 1px solid #E5E5EA;
        }

        .quotable p {
          font-family: Georgia, 'Times New Roman', serif;
          font-style: italic;
          font-size: 15pt;
          line-height: 1.5;
          color: ${ACCENT_COLOR};
        }

        /* ===========================
           SECTIONS (shared)
           =========================== */

        .section {
          margin: 0.3in 0;
          padding: 0.25in 0.3in;
          background-color: #FAFAFA;
          border-radius: 4px;
        }

        .section h4 {
          font-family: Helvetica, Arial, sans-serif;
          font-size: 8pt;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: ${MUTED_COLOR};
          margin-bottom: 0.15in;
          padding-bottom: 0.08in;
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
          margin-bottom: 0.2in;
          padding-left: 0.2in;
          border-left: 2px solid ${ACCENT_COLOR};
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
          color: ${ACCENT_COLOR};
          display: block;
          margin-bottom: 0.04in;
        }

        .ref-text {
          font-style: italic;
          font-size: 11pt;
          color: #555;
          line-height: 1.6;
        }

        /* ===========================
           BLOCKQUOTES
           =========================== */

        blockquote {
          margin: 0.2in 0;
          padding: 0.15in 0.25in;
          border-left: 2px solid ${ACCENT_COLOR};
          background-color: transparent;
        }

        blockquote p {
          font-style: italic;
          font-size: 11pt;
          color: #444;
          line-height: 1.6;
        }

        blockquote cite {
          display: block;
          font-family: Helvetica, Arial, sans-serif;
          font-size: 9pt;
          color: ${MUTED_COLOR};
          margin-top: 0.08in;
          font-style: normal;
        }

        /* ===========================
           WORD STUDY
           =========================== */

        .word-study .word-study-term {
          font-size: 12pt;
          margin-bottom: 0.08in;
        }

        /* ===========================
           REFLECTION QUESTIONS
           =========================== */

        .reflection ol {
          padding-left: 0.35in;
          list-style-type: decimal;
        }

        .reflection li {
          font-size: 11pt;
          line-height: 1.65;
          margin-bottom: 0.12in;
          color: ${BODY_COLOR};
          padding-left: 0.08in;
        }

        /* ===========================
           PRAYER
           =========================== */

        .prayer {
          background-color: transparent;
          border: none;
          border-top: 1px solid #E5E5EA;
          border-radius: 0;
          padding-top: 0.25in;
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
          margin-top: 0.6in;
          padding-top: 0.15in;
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
          font-size: 11pt;
          line-height: 1.65;
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
            background-color: ${COVER_BG} !important;
          }

          .scripture {
            background-color: ${ACCENT_LIGHT} !important;
            border-left-color: ${ACCENT_COLOR} !important;
          }

          .quotable p {
            color: ${ACCENT_COLOR} !important;
          }
        }
      </style>
    </head>
    <body>
      <!-- COVER PAGE -->
      <div class="cover">
        <div class="cover-content">
          <div class="cover-accent-line"></div>
          <h1>${devotional.title}</h1>
          <p class="subtitle">A ${devotional.totalDays}-Day Devotional Journey</p>
          <div class="accent-divider"></div>
        </div>
        <div class="cover-bottom">
          <p class="prepared-for">Prepared for</p>
          <p class="prepared-name">${devotional.userContext.name}</p>
          <p class="brand">Unfold</p>
        </div>
      </div>

      <!-- DAY PAGES -->
      ${days.join('')}
    </body>
    </html>
  `;
}

// Export devotional to PDF and share
export async function exportDevotionalToPDF(devotional: Devotional): Promise<boolean> {
  try {
    const html = generateDevotionalHTML(devotional);

    // Generate PDF (expo-print creates a UUID-named file)
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    console.log('[PDF Export] Generated PDF at:', uri);

    // Rename the file from UUID to the devotional title
    const sanitizedTitle = sanitizeFilename(devotional.title);
    const fileName = sanitizedTitle || 'Devotional';
    const directory = uri.substring(0, uri.lastIndexOf('/') + 1);
    const renamedUri = `${directory}${fileName}.pdf`;

    try {
      await FileSystem.moveAsync({
        from: uri,
        to: renamedUri,
      });
      console.log('[PDF Export] Renamed PDF to:', renamedUri);
    } catch (renameError) {
      // If rename fails, fall back to the original UUID-named file
      console.warn('[PDF Export] Could not rename file, using original:', renameError);
    }

    const finalUri = await FileSystem.getInfoAsync(renamedUri).then(
      (info) => (info.exists ? renamedUri : uri)
    );

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
      console.log('[PDF Export] Sharing not available on this platform');
      return false;
    }
  } catch (error) {
    console.error('[PDF Export] Error:', error);
    return false;
  }
}

// Check if PDF export is supported on this platform
export function isPDFExportSupported(): boolean {
  // PDF export is supported on iOS and Android, not on web
  return Platform.OS !== 'web';
}
