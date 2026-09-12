#!/usr/bin/env python3
"""Regenerate the verse layout from the backend's shipped Bible database."""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('database', type=Path, help='Path to unfold-bible-v1.db')
args = parser.parse_args()
database = args.database.resolve()
connection = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)
layout = {}
for translation in ('BSB', 'KJV'):
    books, omissions = [], {}
    for book in range(1, 67):
        chapters = []
        chapter_rows = connection.execute(
            'SELECT DISTINCT chapter FROM verses WHERE translation=? AND book_id=? ORDER BY chapter',
            (translation, book),
        ).fetchall()
        book_row = connection.execute('SELECT chapter_count FROM books WHERE id=?', (book,)).fetchone()
        expected_chapters = list(range(1, book_row[0] + 1)) if book_row else []
        if not expected_chapters or [row[0] for row in chapter_rows] != expected_chapters:
            raise ValueError(f'Invalid chapter sequence: {translation} book {book}')
        for (chapter,) in chapter_rows:
            verses = [row[0] for row in connection.execute(
                'SELECT verse FROM verses WHERE translation=? AND book_id=? AND chapter=? ORDER BY verse',
                (translation, book, chapter),
            )]
            if not verses or len(verses) != len(set(verses)):
                raise ValueError(f'Invalid verse layout: {translation} {book}:{chapter}')
            chapters.append(max(verses))
            missing = sorted(set(range(1, max(verses) + 1)) - set(verses))
            if missing:
                omissions[f'{book}:{chapter}'] = missing
        if not chapters:
            raise ValueError(f'Missing book: {translation} {book}')
        books.append(chapters)
    layout[translation] = {'lastVerses': books, 'omissions': omissions}

lines = [
    '// Generated from unfold-bible-v1.db. Verse layout contains no Bible wording.',
    '// Source SHA-256: ' + hashlib.sha256(database.read_bytes()).hexdigest(),
    '// Preserve translation-specific omissions. See BSB Matthew 17:20-22.',
    "export const BIBLE_VERSE_LAYOUT: Readonly<Record<'BSB' | 'KJV', {",
    '  lastVerses: readonly (readonly number[])[];',
    '  omissions: Readonly<Record<string, readonly number[]>>;',
    '}>> = {',
]
for translation, data in layout.items():
    lines += [f'  {translation}: {{', '    lastVerses: [']
    lines += ['      ' + json.dumps(chapters) + ',' for chapters in data['lastVerses']]
    lines += ['    ],', '    omissions: ' + json.dumps(data['omissions']) + ',', '  },']
lines += ['};', '']
output = Path(__file__).resolve().parents[1] / 'src/constants/bible-verse-layout.ts'
output.write_text('\n'.join(lines))
print(f'Wrote {output}')
