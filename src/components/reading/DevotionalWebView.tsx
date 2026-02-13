import React, { useRef, useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';
import { FONT_SIZE_VALUES, FontSize, DevotionalDay, Highlight } from '@/lib/store';

interface Quote {
  text: string;
  context: string;
}

interface DevotionalWebViewProps {
  day: DevotionalDay;
  fontSize: FontSize;
  onQuoteSelected?: (quote: Quote) => void;
  existingHighlights?: Highlight[];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTENT_PADDING = 24;

export function DevotionalWebView({ 
  day, 
  fontSize, 
  onQuoteSelected,
  existingHighlights = [] 
}: DevotionalWebViewProps) {
  const { colors, isDark } = useTheme();
  const readingFont = useReadingFont();
  const webViewRef = useRef<WebView>(null);
  const [webViewHeight, setWebViewHeight] = useState(200);

  // Generate unique IDs for highlights
  const highlightIds = useMemo(() => {
    return existingHighlights.map((_, i) => `highlight-${day.dayNumber}-${i}`);
  }, [existingHighlights, day.dayNumber]);

  // Inject JS to report content height and apply highlights
  const injectedJavaScript = useMemo(() => {
    const highlightData = existingHighlights.map((h, i) => ({
      id: highlightIds[i],
      text: h.highlightedText,
    }));

    return `
      function reportHeight() {
        const height = document.body.scrollHeight;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HEIGHT_CHANGE',
          height: height
        }));
      }
      
      // Apply saved highlights
      function applyHighlights() {
        const highlights = ${JSON.stringify(highlightData)};
        highlights.forEach(hl => {
          highlightText(hl.text, hl.id);
        });
      }
      
      // Highlight text by wrapping in mark tags
      function highlightText(searchText, highlightId) {
        if (!searchText || searchText.length < 3) return;
        
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
          if (node.parentElement.tagName !== 'SCRIPT' && 
              node.parentElement.tagName !== 'STYLE' &&
              node.parentElement.tagName !== 'MARK') {
            textNodes.push(node);
          }
        }
        
        for (let i = 0; i < textNodes.length; i++) {
          const textNode = textNodes[i];
          const text = textNode.textContent;
          const index = text.indexOf(searchText);
          
          if (index !== -1) {
            const before = text.substring(0, index);
            const match = text.substring(index, index + searchText.length);
            const after = text.substring(index + searchText.length);
            
            const fragment = document.createDocumentFragment();
            
            if (before) {
              fragment.appendChild(document.createTextNode(before));
            }
            
            const mark = document.createElement('mark');
            mark.id = highlightId;
            mark.textContent = match;
            fragment.appendChild(mark);
            
            if (after) {
              fragment.appendChild(document.createTextNode(after));
            }
            
            textNode.parentNode.replaceChild(fragment, textNode);
            break; // Only highlight first occurrence
          }
        }
      }
      
      // Report height after fonts load and apply highlights
      window.addEventListener('load', () => {
        reportHeight();
        setTimeout(applyHighlights, 100);
      });
      setTimeout(reportHeight, 100);
      setTimeout(reportHeight, 500);
      setTimeout(reportHeight, 1000);
      
      true;
    `;
  }, [existingHighlights, highlightIds]);

  // Generate HTML with exact typography matching
  const htmlContent = useMemo(() => {
    const fontSizes = FONT_SIZE_VALUES[fontSize];
    const bodyFontSize = fontSizes.body;
    const lineHeight = bodyFontSize * 1.75;

    // Get web font name from native font mapping
    const getWebFontName = (nativeFont: string) => {
      const fontMap: Record<string, string> = {
        'SourceSerifPro_400Regular': 'Source Serif 4',
        'EBGaramond_400Regular': 'EB Garamond',
        'Lora_400Regular': 'Lora',
        'Inter_400Regular': 'Inter',
        'CrimsonText_400Regular': 'Crimson Text',
        'Merriweather_400Regular': 'Merriweather',
      };
      return fontMap[readingFont.body] || 'Georgia';
    };

    const webFont = getWebFontName(readingFont.body);
    const bodyColor = isDark ? '#E8E4DC' : '#1A1A1A';
    const mutedColor = isDark ? '#9A958D' : '#6B6560';
    const accentColor = colors.accent;
    const inputBg = isDark ? '#1F1F1F' : '#F5F5F3';
    const highlightBg = isDark ? 'rgba(200, 165, 92, 0.35)' : 'rgba(255, 220, 100, 0.6)';

    // Build body HTML with proper paragraph splitting
    const firstLetter = day.bodyText?.charAt(0) || '';
    const remainingText = day.bodyText?.slice(1) || '';
    const hasDropCap = firstLetter.match(/[A-Za-z]/);
    
    // Split body text into paragraphs and wrap each in <p> tags
    const paragraphs = remainingText
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    const bodyHtml = hasDropCap
      ? `
        <p class="first-paragraph"><span class="drop-cap">${firstLetter}</span>${escapeHtml(paragraphs[0] || '')}</p>
        ${paragraphs.slice(1).map(p => `<p>${escapeHtml(p)}</p>`).join('')}
      `
      : paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');

    // Build quotes section
    const quotesHtml = day.quotes?.length
      ? day.quotes.map(q => `
        <blockquote>
          <svg class="quote-icon" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.5">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3"/>
          </svg>
          <p>${escapeHtml(q.text)}</p>
          <cite>— ${escapeHtml(q.author)}</cite>
        </blockquote>
      `).join('')
      : '';

    // Build context note
    const contextHtml = day.contextNote
      ? `
        <div class="context-box">
          <h3>Historical Context</h3>
          <p>${escapeHtml(day.contextNote)}</p>
        </div>
      `
      : '';

    // Build word study
    const wordStudyHtml = day.wordStudy
      ? `
        <div class="word-study-box">
          <h3>Word Study</h3>
          <div class="word-term">
            <span class="term">${escapeHtml(day.wordStudy.term)}</span>
            <span class="original">(${escapeHtml(day.wordStudy.original)})</span>
          </div>
          <p>${escapeHtml(day.wordStudy.meaning)}</p>
        </div>
      `
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(webFont)}:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }
    
    body {
      font-family: '${webFont}', Georgia, serif;
      font-size: ${bodyFontSize}px;
      line-height: ${lineHeight}px;
      color: ${bodyColor};
      background: transparent;
      padding: 0 ${CONTENT_PADDING}px 60px;
      max-width: 100%;
    }
    
    /* Selection styling */
    ::selection {
      background: ${accentColor}40;
    }
    
    /* Highlight styling */
    mark {
      background: ${highlightBg};
      color: inherit;
      padding: 2px 0;
      border-radius: 2px;
    }
    
    /* Body text with drop cap */
    p {
      margin-bottom: ${lineHeight * 0.8}px;
      font-family: '${webFont}', Georgia, serif;
    }
    
    p.first-paragraph {
      margin-top: 8px;
    }
    
    .drop-cap {
      float: left;
      font-family: Georgia, serif;
      font-size: ${bodyFontSize * 3.2}px;
      line-height: ${bodyFontSize * 3.4}px;
      color: ${accentColor};
      margin-right: 8px;
      margin-top: -4px;
      font-weight: 400;
    }
    
    /* Quotes */
    blockquote {
      margin: 44px 0 24px;
      padding-left: 20px;
      border-left: 2px solid ${accentColor};
      position: relative;
    }
    
    .quote-icon {
      width: 16px;
      height: 16px;
      margin-bottom: 12px;
      opacity: 0.6;
    }
    
    blockquote p {
      font-style: italic;
      margin-bottom: 10px;
    }
    
    blockquote cite {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      color: ${mutedColor};
      font-style: normal;
      letter-spacing: 0.3px;
    }
    
    /* Context box */
    .context-box, .word-study-box {
      margin-top: 44px;
      background: ${inputBg};
      border-radius: 16px;
      padding: 22px;
    }
    
    h3 {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      color: ${accentColor};
      letter-spacing: 1.2px;
      text-transform: uppercase;
      margin-bottom: 14px;
      opacity: 0.8;
      font-weight: 500;
    }
    
    .context-box p, .word-study-box p {
      font-size: ${bodyFontSize - 1}px;
      line-height: ${lineHeight * 0.97}px;
      color: ${mutedColor};
      margin: 0;
    }
    
    /* Word study */
    .word-term {
      margin-bottom: 10px;
    }
    
    .term {
      font-family: Georgia, serif;
      font-size: ${bodyFontSize + 4}px;
      color: ${bodyColor};
      font-weight: 400;
    }
    
    .original {
      font-style: italic;
      font-size: ${bodyFontSize - 2}px;
      color: ${accentColor};
      margin-left: 12px;
      opacity: 0.7;
    }
    
    /* Save quote button (tooltip style above selection) */
    #save-quote-tooltip {
      position: absolute;
      background: ${accentColor};
      color: ${isDark ? '#000' : '#fff'};
      padding: 10px 20px;
      border-radius: 20px;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      box-shadow: 0 4px 20px ${accentColor}60;
      z-index: 1000;
      white-space: nowrap;
      transform: translateY(10px);
    }
    
    #save-quote-tooltip.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }
    
    #save-quote-tooltip::after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 8px solid ${accentColor};
    }
  </style>
</head>
<body>
  ${bodyHtml}
  ${quotesHtml}
  ${contextHtml}
  ${wordStudyHtml}
  
  <button id="save-quote-tooltip">Save Quote</button>
  
  <script>
    let selectedText = '';
    let selectionRange = null;
    const saveBtn = document.getElementById('save-quote-tooltip');
    
    function positionButton() {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Position button above selection
      const top = rect.top - 50;
      const left = rect.left + (rect.width / 2);
      
      saveBtn.style.top = top + 'px';
      saveBtn.style.left = left + 'px';
    }
    
    function checkSelection() {
      const selection = window.getSelection();
      const newText = selection.toString().trim();
      
      if (newText.length > 10 && newText !== selectedText) {
        selectedText = newText;
        selectionRange = selection.getRangeAt(0);
        positionButton();
        saveBtn.classList.add('visible');
      } else if (newText.length <= 10) {
        selectedText = '';
        saveBtn.classList.remove('visible');
      }
    }
    
    // Poll for selection changes (more reliable than event on iOS)
    document.addEventListener('selectionchange', () => {
      setTimeout(checkSelection, 100);
    });
    
    // Also check on touchend
    document.addEventListener('touchend', () => {
      setTimeout(checkSelection, 300);
    });
    
    // Handle save button click
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (selectedText) {
        // Get context (parent paragraph text)
        let context = '';
        if (selectionRange) {
          const container = selectionRange.commonAncestorContainer;
          const element = container.nodeType === 3 ? container.parentElement : container;
          context = element?.textContent?.substring(0, 150) || '';
        }
        
        // Apply highlight immediately
        const mark = document.createElement('mark');
        mark.textContent = selectedText;
        try {
          selectionRange.surroundContents(mark);
        } catch (e) {
          // Complex selection, fallback to simple approach
          console.log('Complex selection, skipping visual highlight');
        }
        
        // Send to React Native
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'QUOTE_SELECTED',
          text: selectedText,
          context: context
        }));
        
        // Clear selection and hide button
        window.getSelection().removeAllRanges();
        saveBtn.classList.remove('visible');
        selectedText = '';
      }
    });
    
    // Hide button when tapping elsewhere
    document.addEventListener('click', (e) => {
      if (e.target !== saveBtn) {
        const selection = window.getSelection();
        if (!selection.toString().trim()) {
          saveBtn.classList.remove('visible');
          selectedText = '';
        }
      }
    });
    
    // Hide on scroll
    window.addEventListener('scroll', () => {
      saveBtn.classList.remove('visible');
    });
  </script>
</body>
</html>
    `;
  }, [day, fontSize, colors, isDark, readingFont, existingHighlights]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'QUOTE_SELECTED' && onQuoteSelected) {
        onQuoteSelected({
          text: data.text,
          context: data.context,
        });
      } else if (data.type === 'HEIGHT_CHANGE') {
        setWebViewHeight(Math.max(data.height, 200));
      }
    } catch (e) {
      console.error('WebView message parse error:', e);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={[styles.webview, { height: webViewHeight }]}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        originWhitelist={['*']}
        injectedJavaScript={injectedJavaScript}
      />
    </View>
  );
}

// Helper to escape HTML
function escapeHtml(text: string): string {
  return text
    .replace(/\u0026/g, '\u0026amp;')
    .replace(/</g, '\u0026lt;')
    .replace(/>/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;')
    .replace(/'/g, '\u0026#039;');
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    marginLeft: -CONTENT_PADDING,
  },
  webview: {
    width: SCREEN_WIDTH,
    backgroundColor: 'transparent',
  },
});
