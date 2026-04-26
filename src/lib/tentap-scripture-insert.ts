export type TenTapScriptureInsert = {
  reference: string;
  text: string;
};

function normalizeScriptureText(text: string): string {
  return text.replace(/\n/g, ' ');
}

function toJavaScriptStringLiteral(value: string): string {
  return JSON.stringify(value);
}

function toScriptureReferenceLiteral(reference: string): string {
  return toJavaScriptStringLiteral(`— ${reference}`).replace(/^"—/, '"\\u2014');
}

export function buildTenTapScriptureInsertJS({ reference, text }: TenTapScriptureInsert): string {
  const scriptureText = toJavaScriptStringLiteral(normalizeScriptureText(text));
  const scriptureReference = toScriptureReferenceLiteral(reference);

  return `
      (function() {
        var pos = typeof window.__savedSelection === 'number'
          ? window.__savedSelection
          : window.editor.state.doc.content.size - 1;
        // Clamp to valid range
        var maxPos = window.editor.state.doc.content.size - 1;
        if (pos > maxPos) pos = maxPos;
        if (pos < 0) pos = 0;
        window.editor
          .chain()
          .focus()
          .setTextSelection(pos)
          .insertContent({
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: ${scriptureText} },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'italic' }],
                    text: ${scriptureReference},
                  },
                ],
              },
            ],
          })
          .run();
        delete window.__savedSelection;
      })();
    `;
}
