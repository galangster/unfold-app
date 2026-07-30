import { readFileSync } from 'fs';
import { join } from 'path';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('Phase 9 design source contracts', () => {
  it('removes thick side-tab accent borders from note detail and PDF callouts', () => {
    const sources = [
      ['note-detail', readSource('src/app/(tabs)/(journal)/note-detail.tsx')],
      ['pdf-export', readSource('src/lib/pdf-export.ts')],
    ] as const;

    const bannedSideTabPatterns: RegExp[] = [
      /border-left\s*:\s*(?:[2-9]|\d{2,})(?:\.\d+)?px\s+solid\s+\$\{(?:colors\.)?accent\}/i,
      /borderLeftWidth\s*:\s*(?:2(?:\.\d+)?|[3-9]|\d{2,})/,
      /borderLeftColor\s*:\s*colors\.accent/,
    ];

    for (const [name, source] of sources) {
      for (const pattern of bannedSideTabPatterns) {
        expect(source).not.toEqual(expect.stringMatching(pattern));
      }
    }
  });

  it('reduces obvious uppercase tracked scaffolding in touched design surfaces', () => {
    const noteDetailSource = readSource('src/app/(tabs)/(journal)/note-detail.tsx');
    const pdfExportSource = readSource('src/lib/pdf-export.ts');
    const drawerSource = readSource('src/components/companion/CompanionDrawer.tsx');

    expect(noteDetailSource).not.toContain('currentFolder.name.toUpperCase()');
    expect(noteDetailSource).not.toContain('TAGS');
    expect(noteDetailSource).not.toContain("textTransform: 'uppercase'");
    expect(drawerSource).not.toContain("textTransform: 'uppercase'");
    expect(pdfExportSource).not.toContain('text-transform: uppercase;');
    expect(pdfExportSource).not.toEqual(expect.stringMatching(/letter-spacing:\s*0\.(?:1|12|15|2)em/));
  });

  it('keeps Companion conversation management inside branded app chrome', () => {
    const drawerSource = readSource('src/components/companion/CompanionDrawer.tsx');

    expect(drawerSource).not.toContain('ActionSheetIOS');
    expect(drawerSource).not.toContain('Alert.alert');
    expect(drawerSource).not.toContain('Alert.prompt');
    expect(drawerSource).toContain('ConversationActionPanel');
    expect(drawerSource).toContain('Conversation options');
    expect(drawerSource).toContain('Rename conversation');
    expect(drawerSource).toContain('Delete conversation');
    expect(drawerSource).toContain('selectionColor={colors.accent}');
    expect(drawerSource).toContain('cursorColor={colors.accent}');
  });
});
