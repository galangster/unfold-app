/**
 * Feelings check-in content: twelve words, each with passages that answer it.
 *
 * Scripture is the Berean Standard Bible (public domain), copied verbatim
 * from the approved prototype (design-research/2026-10-06-verse-widgets,
 * src/lib/content.ts), which took it from Unfold's Bible database. Keep every
 * character, including curly quotes and the closing quotes that open in an
 * earlier verse; displayVerses trims those for display.
 *
 * Pure data and helpers: no React or native imports, so the deep-link
 * allowlist and widgets can read it too.
 */

export const FEELINGS_TRANSLATION = 'Berean Standard Bible';

export type Verse = { number: number; text: string };

export type Passage = {
  /** Full reference, e.g. "Philippians 4:6–7". */
  reference: string;
  verses: readonly Verse[];
  /** One complete thought that fits a Lock Screen widget (about 80 characters). */
  lockLine: string;
  /** Reference for lockLine alone, e.g. "Philippians 4:7". */
  lockReference: string;
};

export type Feeling = {
  id: string;
  /** The word on the list, e.g. "Weary". */
  word: string;
  /** How the answer is introduced, e.g. "For the weary". */
  label: string;
  passages: readonly Passage[];
};

function passage(reference: string, lockReference: string, lockLine: string, verses: Verse[]): Passage {
  return { reference, lockReference, lockLine, verses };
}

export const FEELINGS: readonly Feeling[] = [
  {
    id: 'anxious',
    word: 'Anxious',
    label: 'For the anxious',
    passages: [
      passage('1 Peter 5:7', '1 Peter 5:7', 'Cast all your anxiety on Him, because He cares for you.', [
        { number: 7, text: 'Cast all your anxiety on Him, because He cares for you.' },
      ]),
      passage('Philippians 4:6–7', 'Philippians 4:7', 'And the peace of God, which surpasses all understanding, will guard your hearts…', [
        { number: 6, text: 'Be anxious for nothing, but in everything, by prayer and petition, with thanksgiving, present your requests to God.' },
        { number: 7, text: 'And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.' },
      ]),
      passage('Psalm 94:19', 'Psalm 94:19', 'When anxiety overwhelms me, Your consolation delights my soul.', [
        { number: 19, text: 'When anxiety overwhelms me, Your consolation delights my soul.' },
      ]),
    ],
  },
  {
    id: 'weary',
    word: 'Weary',
    label: 'For the weary',
    passages: [
      passage('Matthew 11:28', 'Matthew 11:28', 'Come to Me, all you who are weary and burdened, and I will give you rest.', [
        { number: 28, text: 'Come to Me, all you who are weary and burdened, and I will give you rest.' },
      ]),
      passage('Isaiah 40:29', 'Isaiah 40:29', 'He gives power to the faint and increases the strength of the weak.', [
        { number: 29, text: 'He gives power to the faint and increases the strength of the weak.' },
      ]),
      passage('Psalm 116:7', 'Psalm 116:7', 'Return to your rest, O my soul, for the LORD has been good to you.', [
        { number: 7, text: 'Return to your rest, O my soul, for the LORD has been good to you.' },
      ]),
    ],
  },
  {
    id: 'alone',
    word: 'Alone',
    label: 'For when you feel alone',
    passages: [
      passage('Deuteronomy 31:8', 'Deuteronomy 31:8', 'He will be with you. He will never leave you nor forsake you.', [
        { number: 8, text: 'The LORD Himself goes before you; He will be with you. He will never leave you nor forsake you. Do not be afraid or discouraged.”' },
      ]),
      passage('Psalm 145:18', 'Psalm 145:18', 'The LORD is near to all who call on Him, to all who call out to Him in truth.', [
        { number: 18, text: 'The LORD is near to all who call on Him, to all who call out to Him in truth.' },
      ]),
      passage('Psalm 25:16', 'Psalm 25:16', 'Turn to me and be gracious, for I am lonely and afflicted.', [
        { number: 16, text: 'Turn to me and be gracious, for I am lonely and afflicted.' },
      ]),
    ],
  },
  {
    id: 'grateful',
    word: 'Grateful',
    label: 'For a grateful heart',
    passages: [
      passage('Psalm 107:1', 'Psalm 107:1', 'Give thanks to the LORD, for He is good; His loving devotion endures forever.', [
        { number: 1, text: 'Give thanks to the LORD, for He is good; His loving devotion endures forever.' },
      ]),
      passage('Psalm 118:24', 'Psalm 118:24', 'This is the day that the LORD has made; we will rejoice and be glad in it.', [
        { number: 24, text: 'This is the day that the LORD has made; we will rejoice and be glad in it.' },
      ]),
      passage('1 Thessalonians 5:18', '1 Thessalonians 5:18', 'Give thanks in every circumstance, for this is God’s will for you in Christ Jesus.', [
        { number: 18, text: 'Give thanks in every circumstance, for this is God’s will for you in Christ Jesus.' },
      ]),
    ],
  },
  {
    id: 'afraid',
    word: 'Afraid',
    label: 'For when you’re afraid',
    passages: [
      passage('Isaiah 41:10', 'Isaiah 41:10', 'Do not fear, for I am with you; do not be afraid, for I am your God.', [
        { number: 10, text: 'Do not fear, for I am with you; do not be afraid, for I am your God. I will strengthen you; I will surely help you; I will uphold you with My right hand of righteousness.' },
      ]),
      passage('Psalm 56:3', 'Psalm 56:3', 'When I am afraid, I put my trust in You.', [
        { number: 3, text: 'When I am afraid, I put my trust in You.' },
      ]),
      passage('Psalm 27:1', 'Psalm 27:1', 'The LORD is my light and my salvation— whom shall I fear?', [
        { number: 1, text: 'The LORD is my light and my salvation— whom shall I fear? The LORD is the stronghold of my life— whom shall I dread?' },
      ]),
    ],
  },
  {
    id: 'grieving',
    word: 'Grieving',
    label: 'For the grieving',
    passages: [
      passage('Psalm 34:18', 'Psalm 34:18', 'The LORD is near to the brokenhearted; He saves the contrite in spirit.', [
        { number: 18, text: 'The LORD is near to the brokenhearted; He saves the contrite in spirit.' },
      ]),
      passage('Matthew 5:4', 'Matthew 5:4', 'Blessed are those who mourn, for they will be comforted.', [
        { number: 4, text: 'Blessed are those who mourn, for they will be comforted.' },
      ]),
      passage('Psalm 147:3', 'Psalm 147:3', 'He heals the brokenhearted and binds up their wounds.', [
        { number: 3, text: 'He heals the brokenhearted and binds up their wounds.' },
      ]),
    ],
  },
  {
    id: 'restless',
    word: 'Restless',
    label: 'For a restless mind',
    passages: [
      passage('Psalm 62:1–2', 'Psalm 62:1', 'In God alone my soul finds rest; my salvation comes from Him.', [
        { number: 1, text: 'In God alone my soul finds rest; my salvation comes from Him.' },
        { number: 2, text: 'He alone is my rock and my salvation. He is my fortress; I will never be shaken.' },
      ]),
      passage('Isaiah 26:3', 'Isaiah 26:3', 'You will keep in perfect peace the steadfast of mind, because he trusts in You.', [
        { number: 3, text: 'You will keep in perfect peace the steadfast of mind, because he trusts in You.' },
      ]),
      passage('Psalm 131:2', 'Psalm 131:2', 'Surely I have stilled and quieted my soul…', [
        { number: 2, text: 'Surely I have stilled and quieted my soul; like a weaned child with his mother, like a weaned child is my soul within me.' },
      ]),
    ],
  },
  {
    id: 'hopeful',
    word: 'Hopeful',
    label: 'For the hopeful',
    passages: [
      passage('Romans 15:13', 'Romans 15:13', 'May the God of hope fill you with all joy and peace as you believe in Him…', [
        { number: 13, text: 'Now may the God of hope fill you with all joy and peace as you believe in Him, so that you may overflow with hope by the power of the Holy Spirit.' },
      ]),
      passage('Romans 12:12', 'Romans 12:12', 'Be joyful in hope, patient in affliction, persistent in prayer.', [
        { number: 12, text: 'Be joyful in hope, patient in affliction, persistent in prayer.' },
      ]),
      passage('Lamentations 3:22–23', 'Lamentations 3:23', 'They are new every morning; great is Your faithfulness!', [
        { number: 22, text: 'Because of the loving devotion of the LORD we are not consumed, for His mercies never fail.' },
        { number: 23, text: 'They are new every morning; great is Your faithfulness!' },
      ]),
    ],
  },
  {
    id: 'angry',
    word: 'Angry',
    label: 'For when you’re angry',
    passages: [
      passage('James 1:19–20', 'James 1:19', 'Everyone should be quick to listen, slow to speak, and slow to anger…', [
        { number: 19, text: 'My beloved brothers, understand this: Everyone should be quick to listen, slow to speak, and slow to anger,' },
        { number: 20, text: 'for man’s anger does not bring about the righteousness that God desires.' },
      ]),
      passage('Proverbs 15:1', 'Proverbs 15:1', 'A gentle answer turns away wrath, but a harsh word stirs up anger.', [
        { number: 1, text: 'A gentle answer turns away wrath, but a harsh word stirs up anger.' },
      ]),
    ],
  },
  {
    id: 'uncertain',
    word: 'Uncertain',
    label: 'For when you can’t see the way',
    passages: [
      passage('Proverbs 3:5–6', 'Proverbs 3:6', 'In all your ways acknowledge Him, and He will make your paths straight.', [
        { number: 5, text: 'Trust in the LORD with all your heart, and lean not on your own understanding;' },
        { number: 6, text: 'in all your ways acknowledge Him, and He will make your paths straight.' },
      ]),
      passage('Psalm 32:8', 'Psalm 32:8', 'I will instruct you and teach you the way you should go…', [
        { number: 8, text: 'I will instruct you and teach you the way you should go; I will give you counsel and watch over you.' },
      ]),
    ],
  },
  {
    id: 'ashamed',
    word: 'Ashamed',
    label: 'For when you feel ashamed',
    passages: [
      passage('Romans 8:1', 'Romans 8:1', 'There is now no condemnation for those who are in Christ Jesus.', [
        { number: 1, text: 'Therefore, there is now no condemnation for those who are in Christ Jesus.' },
      ]),
      passage('Psalm 103:12', 'Psalm 103:12', 'As far as the east is from the west, so far has He removed our transgressions from us.', [
        { number: 12, text: 'As far as the east is from the west, so far has He removed our transgressions from us.' },
      ]),
    ],
  },
  {
    id: 'joyful',
    word: 'Joyful',
    label: 'For a joyful heart',
    passages: [
      passage('Psalm 16:11', 'Psalm 16:11', 'You will fill me with joy in Your presence…', [
        { number: 11, text: 'You have made known to me the path of life; You will fill me with joy in Your presence, with eternal pleasures at Your right hand.' },
      ]),
      passage('Zephaniah 3:17', 'Zephaniah 3:17', 'He will rejoice over you with gladness; He will quiet you with His love…', [
        { number: 17, text: 'The LORD your God is among you; He is mighty to save. He will rejoice over you with gladness; He will quiet you with His love; He will rejoice over you with singing.”' },
      ]),
    ],
  },
];

/** The feeling with this id, or undefined for anything else. */
export function getFeeling(id: string | null | undefined): Feeling | undefined {
  return FEELINGS.find((feeling) => feeling.id === id);
}

/** Excerpts can end on a closing quote whose opening sits in an earlier verse. */
export function trimUnmatchedQuotes(text: string): string {
  const opens = (text.match(/“/g) ?? []).length;
  const closes = (text.match(/”/g) ?? []).length;
  return closes > opens ? text.replace(/”(?=[^”]*$)/, '') : text;
}

/** Verses for numbered layouts, with an unmatched closing quote trimmed. */
export function displayVerses(p: Passage): readonly Verse[] {
  const whole = p.verses.map((v) => v.text).join(' ');
  if (trimUnmatchedQuotes(whole) === whole) return p.verses;
  const last = p.verses[p.verses.length - 1];
  return [...p.verses.slice(0, -1), { number: last.number, text: trimUnmatchedQuotes(last.text) }];
}
