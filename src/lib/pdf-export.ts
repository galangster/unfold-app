import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Devotional } from './store';
import { FontFamily } from '@/constants/fonts';

// Generate HTML content for the PDF
function generateDevotionalHTML(devotional: Devotional): string {
  const days = devotional.days.map((day, index) => {
    const crossRefsHTML = day.crossReferences?.length
      ? `
        <div class="section cross-refs">
          <h4>Related Scripture</h4>
          ${day.crossReferences
            .map(
              (ref) => `
            <div class="cross-ref">
              <span class="ref-label">${ref.reference}</span>
              <p class="ref-text">"${ref.text}"</p>
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
              <p>"${quote.text}"</p>
              <cite>— ${quote.author}</cite>
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
          <p><strong>${day.wordStudy.term}</strong> <em>(${day.wordStudy.original})</em></p>
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

    return `
      <div class="day ${index > 0 ? 'page-break' : ''}">
        <div class="day-header">
          <span class="day-number">Day ${day.dayNumber}</span>
          <h2 class="day-title">${day.title}</h2>
        </div>

        <div class="scripture">
          <span class="scripture-ref">${day.scriptureReference}</span>
          <p class="scripture-text">"${day.scriptureText}"</p>
        </div>

        <div class="body-text">
          ${day.bodyText.split('\n\n').map((p) => `<p>${p}</p>`).join('')}
        </div>

        ${crossRefsHTML}
        ${quotesHTML}
        ${contextHTML}
        ${wordStudyHTML}
        ${reflectionHTML}
        ${prayerHTML}

        <div class="quotable">
          <p>"${day.quotableLine}"</p>
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
          line-height: 1.6;
          color: #1a1612;
          background: #fff;
        }

        .cover {
          text-align: center;
          padding: 2in 0.5in;
          page-break-after: always;
        }

        .cover h1 {
          font-size: 32pt;
          font-weight: normal;
          margin-bottom: 0.5in;
          letter-spacing: 0.02em;
        }

        .cover .subtitle {
          font-size: 12pt;
          color: #666;
          margin-bottom: 1in;
        }

        .cover .prepared-for {
          font-size: 10pt;
          color: #999;
          margin-top: 2in;
        }

        .cover .prepared-for strong {
          display: block;
          font-size: 14pt;
          color: #333;
          margin-top: 0.25in;
        }

        .page-break {
          page-break-before: always;
        }

        .day {
          padding: 0.25in 0;
        }

        .day-header {
          margin-bottom: 0.3in;
          border-bottom: 1px solid #e0e0e0;
          padding-bottom: 0.2in;
        }

        .day-number {
          font-size: 9pt;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #999;
          display: block;
          margin-bottom: 0.1in;
        }

        .day-title {
          font-size: 20pt;
          font-weight: normal;
          line-height: 1.2;
        }

        .scripture {
          margin: 0.3in 0;
          padding: 0.2in 0.3in;
          background: #f8f8f6;
          border-left: 3px solid #ddd;
        }

        .scripture-ref {
          font-size: 9pt;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #666;
          display: block;
          margin-bottom: 0.1in;
        }

        .scripture-text {
          font-style: italic;
          color: #444;
          line-height: 1.7;
        }

        .body-text {
          margin: 0.3in 0;
        }

        .body-text p {
          margin-bottom: 0.15in;
          text-align: justify;
        }

        .section {
          margin: 0.3in 0;
          padding: 0.2in;
          background: #fafaf8;
          border-radius: 4px;
        }

        .section h4 {
          font-size: 9pt;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #666;
          margin-bottom: 0.15in;
          font-weight: 600;
        }

        .cross-ref {
          margin-bottom: 0.15in;
        }

        .ref-label {
          font-size: 9pt;
          font-weight: 600;
          color: #666;
        }

        .ref-text {
          font-style: italic;
          color: #555;
          margin-top: 0.05in;
        }

        blockquote {
          margin: 0.2in 0;
          padding-left: 0.2in;
          border-left: 2px solid #ccc;
        }

        blockquote p {
          font-style: italic;
          color: #333;
        }

        blockquote cite {
          display: block;
          font-size: 10pt;
          color: #666;
          margin-top: 0.1in;
          font-style: normal;
        }

        .reflection ol {
          padding-left: 0.3in;
        }

        .reflection li {
          margin-bottom: 0.1in;
          font-style: italic;
        }

        .prayer-text {
          font-style: italic;
          text-align: center;
          color: #333;
        }

        .quotable {
          margin-top: 0.4in;
          padding: 0.2in 0.3in;
          text-align: center;
          border-top: 1px solid #e0e0e0;
          border-bottom: 1px solid #e0e0e0;
        }

        .quotable p {
          font-style: italic;
          font-size: 12pt;
          color: #333;
        }

        .footer {
          text-align: center;
          margin-top: 1in;
          padding-top: 0.3in;
          border-top: 1px solid #e0e0e0;
          font-size: 9pt;
          color: #999;
        }
      </style>
    </head>
    <body>
      <div class="cover">
        <h1>${devotional.title}</h1>
        <p class="subtitle">A ${devotional.totalDays}-Day Devotional Journey</p>
        <p class="prepared-for">
          Prepared for<br>
          <strong>${devotional.userContext.name}</strong>
        </p>
      </div>

      ${days.join('')}

      <div class="footer">
        <p>Created with Unfold</p>
      </div>
    </body>
    </html>
  `;
}

// Export devotional to PDF and share
export async function exportDevotionalToPDF(devotional: Devotional): Promise<boolean> {
  try {
    const html = generateDevotionalHTML(devotional);

    // Generate PDF
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    console.log('[PDF Export] Generated PDF at:', uri);

    // Check if sharing is available
    const isAvailable = await Sharing.isAvailableAsync();

    if (isAvailable) {
      // Share the PDF
      await Sharing.shareAsync(uri, {
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
