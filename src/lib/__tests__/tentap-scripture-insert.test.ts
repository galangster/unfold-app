import { buildTenTapScriptureInsertJS } from '../tentap-scripture-insert';

describe('buildTenTapScriptureInsertJS', () => {
  it('inserts scripture text and italic reference at the saved selection', () => {
    const js = buildTenTapScriptureInsertJS({
      reference: '1 Samuel 17:45-47',
      text: 'David said to the Philistine',
    });

    expect(js).toContain("typeof window.__savedSelection === 'number'");
    expect(js).toContain('.setTextSelection(pos)');
    expect(js).toContain("type: 'blockquote'");
    expect(js).toContain("text: \"David said to the Philistine\"");
    expect(js).toContain("marks: [{ type: 'italic' }]");
    expect(js).toContain("text: \"\\u2014 1 Samuel 17:45-47\"");
    expect(js).toContain('delete window.__savedSelection');
  });

  it('normalizes scripture text newlines before injection', () => {
    const js = buildTenTapScriptureInsertJS({
      reference: 'John 3:16',
      text: 'For God so loved\nthe world',
    });

    expect(js).toContain('For God so loved the world');
    expect(js).not.toContain('For God so loved\nthe world');
  });

  it('escapes values as JavaScript literals instead of hand-built quoted strings', () => {
    const js = buildTenTapScriptureInsertJS({
      reference: "John 3:16's promise",
      text: 'He said "love" \\ abide',
    });

    expect(js).toContain('He said \\"love\\" \\\\ abide');
    expect(js).toContain("\\u2014 John 3:16's promise");
    expect(js).not.toContain("text: 'He said");
  });
});
