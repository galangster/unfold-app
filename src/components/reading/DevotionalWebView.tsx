import React, { useRef, useMemo, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';
import { FONT_SIZE_VALUES, FontSize, DevotionalDay, Highlight, HighlightColor } from '@/lib/store';

interface Quote {
  text: string;
  context: string;
  serializedRange?: string;
  color?: HighlightColor;
}

interface DevotionalWebViewProps {
  day: DevotionalDay;
  fontSize: FontSize;
  onQuoteSelected?: (quote: Quote) => void;
  existingHighlights?: Highlight[];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTENT_PADDING = 24;

// Color definitions for highlights
const HIGHLIGHT_COLORS = {
  yellow: { light: 'rgba(255, 220, 100, 0.6)', dark: 'rgba(200, 165, 92, 0.35)' },
  green: { light: 'rgba(100, 200, 100, 0.4)', dark: 'rgba(100, 200, 100, 0.25)' },
  blue: { light: 'rgba(100, 150, 255, 0.4)', dark: 'rgba(100, 150, 255, 0.25)' },
  purple: { light: 'rgba(180, 100, 200, 0.4)', dark: 'rgba(180, 100, 200, 0.25)' },
  red: { light: 'rgba(255, 100, 100, 0.4)', dark: 'rgba(255, 100, 100, 0.25)' },
};

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

  // Inject JS to report content height and apply highlights using rangy
  const injectedJavaScript = useMemo(() => {
    // Group highlights by color for rangy deserialization
    const highlightsByColor: Record<string, string[]> = {
      yellow: [],
      green: [],
      blue: [],
      purple: [],
      red: [],
    };
    
    existingHighlights.forEach(h => {
      const color = h.color || 'yellow';
      if (h.serializedRange && highlightsByColor[color]) {
        highlightsByColor[color].push(h.serializedRange);
      }
    });

    return `
      // Wait for rangy to load
      function initRangy() {
        if (typeof rangy === 'undefined') {
          setTimeout(initRangy, 100);
          return;
        }
        
        rangy.init();
        
        // Create highlighter instance
        const highlighter = rangy.createHighlighter(document, 'textContent');
        
        // Add class appliers for each highlight color
        const colorConfigs = ${JSON.stringify(HIGHLIGHT_COLORS)};
        const isDark = ${isDark};
        
        Object.keys(colorConfigs).forEach(color => {
          const bgColor = isDark ? colorConfigs[color].dark : colorConfigs[color].light;
          const applier = rangy.createClassApplier('rangy-highlight-' + color, {
            elementTagName: 'mark',
            elementProperties: {
              style: 'background: ' + bgColor + '; color: inherit; padding: 2px 0; border-radius: 2px;',
              className: 'highlight-' + color
            }
          });
          highlighter.addClassApplier(applier);
        });
        
        // Store highlighter globally
        window.rangyHighlighter = highlighter;
        
        // Deserialize existing highlights by color
        const highlightsByColor = ${JSON.stringify(highlightsByColor)};
        Object.keys(highlightsByColor).forEach(color => {
          const ranges = highlightsByColor[color];
          if (ranges && ranges.length > 0) {
            ranges.forEach(range => {
              if (range) {
                try {
                  highlighter.deserialize(range);
                } catch (e) {
                  console.log('Failed to deserialize highlight:', e);
                }
              }
            });
          }
        });
        
        // Report height after highlights applied
        setTimeout(reportHeight, 100);
      }
      
      function reportHeight() {
        const height = document.body.scrollHeight;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HEIGHT_CHANGE',
          height: height
        }));
      }
      
      // Initialize on load
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRangy);
      } else {
        initRangy();
      }
      
      // Backup height reports
      setTimeout(reportHeight, 500);
      setTimeout(reportHeight, 1000);
      
      // Selection handling
      let selectedText = '';
      let selectionRange = null;
      const toolbar = document.getElementById('highlight-toolbar');
      
      function positionToolbar() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Position toolbar below selection
        let top = rect.bottom + 10;
        let left = rect.left + (rect.width / 2) - 100; // Center 200px toolbar
        
        // Keep toolbar on screen
        if (top < 50) top = rect.bottom + 10;
        if (top > window.innerHeight - 60) top = rect.top - 60;
        if (left < 10) left = 10;
        if (left > window.innerWidth - 210) left = window.innerWidth - 210;
        
        toolbar.style.top = top + 'px';
        toolbar.style.left = left + 'px';
      }
      
      function checkSelection() {
        const selection = window.getSelection();
        const newText = selection.toString().trim();
        
        if (newText.length > 5 && newText !== selectedText) {
          selectedText = newText;
          selectionRange = selection.getRangeAt(0);
          positionToolbar();
          toolbar.classList.add('visible');
        } else if (newText.length <= 5) {
          selectedText = '';
          toolbar.classList.remove('visible');
        }
      }
      
      // Poll for selection changes
      document.addEventListener('selectionchange', () => {
        setTimeout(checkSelection, 100);
      });
      
      document.addEventListener('touchend', () => {
        setTimeout(checkSelection, 200);
      });
      
      // Handle color button clicks
      document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const color = btn.dataset.color;
          if (!selectedText || !window.rangyHighlighter) return;
          
          let context = '';
          if (selectionRange) {
            const container = selectionRange.commonAncestorContainer;
            const element = container.nodeType === 3 ? container.parentElement : container;
            context = element?.textContent?.substring(0, 150) || '';
          }
          
          let highlightApplied = false;
          let serializedHighlight = '';
          
          try {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(selectionRange);
            
            window.rangyHighlighter.highlightSelection('rangy-highlight-' + color, { exclusive: true });
            highlightApplied = true;
            serializedHighlight = window.rangyHighlighter.serialize();
          } catch (e) {
            console.log('Highlight failed:', e);
          }
          
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'QUOTE_SELECTED',
            text: selectedText,
            context: context,
            highlightApplied: highlightApplied,
            serializedRange: serializedHighlight,
            color: color
          }));
          
          window.getSelection().removeAllRanges();
          toolbar.classList.remove('visible');
          selectedText = '';
        });
      });
      
      // Hide toolbar when tapping elsewhere
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#highlight-toolbar')) {
          const selection = window.getSelection();
          if (!selection.toString().trim()) {
            toolbar.classList.remove('visible');
            selectedText = '';
          }
        }
      });
      
      // Hide on scroll
      window.addEventListener('scroll', () => {
        toolbar.classList.remove('visible');
      });
      
      true;
    `;
  }, [existingHighlights, isDark]);

  // Generate HTML with exact typography matching
  const htmlContent = useMemo(() => {
    const fontSizes = FONT_SIZE_VALUES[fontSize];
    const bodyFontSize = fontSizes.body;
    const lineHeight = bodyFontSize * 1.75;

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

    const firstLetter = day.bodyText?.charAt(0) || '';
    const remainingText = day.bodyText?.slice(1) || '';
    const hasDropCap = firstLetter.match(/[A-Za-z]/);
    
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

    const contextHtml = day.contextNote
      ? `
        <div class="context-box">
          <h3>Historical Context</h3>
          <p>${escapeHtml(day.contextNote)}</p>
        </div>
      `
      : '';

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
  
  <!-- Rangy for robust text highlighting -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/rangy/1.3.0/rangy-core.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/rangy/1.3.0/rangy-classapplier.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/rangy/1.3.0/rangy-highlighter.min.js"></script>
  
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }
    
    body {
      font-family: '${webFont}', Georgia, serif;
      font-size: ${bodyFontSize}px;
      line-height: ${lineHeight}px;
      color: ${bodyColor};
      background: transparent;
      padding: 0 ${CONTENT_PADDING}px 60px;
      max-width: 100%;
      -webkit-user-select: text;
      user-select: text;
    }
    
    /* Staggered fade-in animation for paragraphs */
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    p, blockquote, .context-box, .word-study-box {
      opacity: 0;
      animation: fadeInUp 0.5s ease-out forwards;
    }
    
    p:nth-child(1) { animation-delay: 0.05s; }
    p:nth-child(2) { animation-delay: 0.1s; }
    p:nth-child(3) { animation-delay: 0.15s; }
    p:nth-child(4) { animation-delay: 0.2s; }
    p:nth-child(5) { animation-delay: 0.25s; }
    p:nth-child(6) { animation-delay: 0.3s; }
    p:nth-child(7) { animation-delay: 0.35s; }
    p:nth-child(8) { animation-delay: 0.4s; }
    p:nth-child(9) { animation-delay: 0.45s; }
    p:nth-child(10) { animation-delay: 0.5s; }
    p:nth-child(n+11) { animation-delay: 0.55s; }
    
    blockquote { animation-delay: 0.3s; }
    .context-box { animation-delay: 0.35s; }
    .word-study-box { animation-delay: 0.35s; }
    
    /* Selection styling - hide native menu */
    ::selection {
      background: ${accentColor}40;
    }
    
    /* Prevent native context menu on long press */
    p, span, div {
      -webkit-user-select: text;
      user-select: text;
    }
    
    /* Highlight colors */
    mark {
      color: inherit;
      padding: 2px 0;
      border-radius: 2px;
    }
    
    mark.highlight-yellow { background: ${HIGHLIGHT_COLORS.yellow[isDark ? 'dark' : 'light']}; }
    mark.highlight-green { background: ${HIGHLIGHT_COLORS.green[isDark ? 'dark' : 'light']}; }
    mark.highlight-blue { background: ${HIGHLIGHT_COLORS.blue[isDark ? 'dark' : 'light']}; }
    mark.highlight-purple { background: ${HIGHLIGHT_COLORS.purple[isDark ? 'dark' : 'light']}; }
    mark.highlight-red { background: ${HIGHLIGHT_COLORS.red[isDark ? 'dark' : 'light']}; }
    
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
    
    /* Highlight toolbar */
    #highlight-toolbar {
      position: absolute;
      background: ${isDark ? '#2a2a2a' : '#ffffff'};
      border-radius: 24px;
      padding: 8px 12px;
      display: flex;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      transform: translateY(10px);
    }
    
    #highlight-toolbar.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }
    
    .color-btn {
      width: 32px;
      height: 32px;
      border-radius: 16px;
      border: 2px solid transparent;
      cursor: pointer;
      transition: transform 0.1s, border-color 0.2s;
    }
    
    .color-btn:hover {
      transform: scale(1.1);
    }
    
    .color-btn:active {
      transform: scale(0.95);
    }
    
    .color-btn.yellow { background: linear-gradient(135deg, #FFE066, #FFD43B); }
    .color-btn.green { background: linear-gradient(135deg, #69DB7C, #51CF66); }
    .color-btn.blue { background: linear-gradient(135deg, #74C0FC, #4DABF7); }
    .color-btn.purple { background: linear-gradient(135deg, #E599F7, #DA77F2); }
    .color-btn.red { background: linear-gradient(135deg, #FF8787, #FF6B6B); }
  </style>
</head>
<body>
  ${bodyHtml}
  ${quotesHtml}
  ${contextHtml}
  ${wordStudyHtml}
  
  <!-- Highlight color toolbar -->
  <div id="highlight-toolbar">
    <button class="color-btn yellow" data-color="yellow" aria-label="Highlight yellow"></button>
    <button class="color-btn green" data-color="green" aria-label="Highlight green"></button>
    <button class="color-btn blue" data-color="blue" aria-label="Highlight blue"></button>
    <button class="color-btn purple" data-color="purple" aria-label="Highlight purple"></button>
    <button class="color-btn red" data-color="red" aria-label="Highlight red"></button>
  </div>
</body>
</html>
    `;
  }, [day, fontSize, colors, isDark, readingFont]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'QUOTE_SELECTED' && onQuoteSelected) {
        onQuoteSelected({
          text: data.text,
          context: data.context,
          serializedRange: data.serializedRange,
          color: data.color,
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
        androidLayerType="hardware"
        cacheEnabled={true}
        androidCacheMode="LOAD_CACHE_ELSE_NETWORK"
      />
    </View>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
