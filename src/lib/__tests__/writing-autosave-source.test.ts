import { readFileSync } from 'fs';
import { join } from 'path';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('writing autosave source contract', () => {
  it.each([
    'src/app/(tabs)/(journal)/note-detail.tsx',
    'src/components/notebook/NoteEditor.tsx',
    'src/components/reading/InlineReflectionJournal.tsx',
  ])('wires maxWait autosave and AppState flush in %s', (relativePath) => {
    const source = readSource(relativePath);

    expect(source).toMatch(/import\s*{[^}]*AppState[^}]*}\s*from 'react-native'/s);
    expect(source).toContain("from '@/lib/autosave-controller'");
    expect(source).toContain('createAutosaveController');
    expect(source).toContain('shouldFlushAutosaveOnAppState');
    expect(source).toContain("AppState.addEventListener('change'");
    expect(source).toContain("shouldFlushAutosaveOnAppState(nextState)");
    expect(source).toContain('.flush()');
  });

  it('flushes note-detail through the same current-buffer snapshot path as manual saves', () => {
    const source = readSource('src/app/(tabs)/(journal)/note-detail.tsx');

    expect(source).toContain('await getCurrentEditorHtml()');
    expect(source).toContain('persistCurrentSnapshot({');
    expect(source).toContain('autoSaveAllowEmptyRef.current = true');
    expect(source).toContain('allowEmpty,');
  });
});
