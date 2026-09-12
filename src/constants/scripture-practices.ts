export type ScripturePracticeKind =
  | 'notes'
  | 'sequence'
  | 'notice'
  | 'pause'
  | 'memory'
  | 'compare'
  | 'retell'
  | 'trace';

export interface ScripturePracticeStep {
  id: string;
  title: string;
  prompt: string;
  inputLabel?: string;
  choices?: readonly string[];
}

export interface ScripturePractice {
  id: string;
  title: string;
  intro: string;
  kind: ScripturePracticeKind;
  steps: readonly ScripturePracticeStep[];
}

function practice(
  id: string,
  title: string,
  kind: ScripturePracticeKind,
  intro: string,
  steps: readonly ScripturePracticeStep[],
): ScripturePractice {
  return { id, title, intro, kind, steps };
}

export const SCRIPTURE_PRACTICES: Readonly<Record<string, ScripturePractice>> = {
  expository: practice(
    'expository',
    'Walk the lines',
    'sequence',
    'Move through the passage in order. Name what each sentence is doing before you decide what the whole means.',
    [
      {
        id: 'clauses',
        title: 'Name each move',
        prompt: 'In order, what does each clause or sentence do?',
        inputLabel: 'What each line does',
      },
      {
        id: 'center',
        title: 'The line that carries it',
        prompt: 'Which sentence carries the most in this span? Copy it as written.',
        inputLabel: 'The line you would keep',
      },
      {
        id: 'today',
        title: 'What you will remember',
        prompt: 'What from this walk do you want to remember when you close the book?',
        inputLabel: 'What you will remember',
      },
    ],
  ),

  inductive_oia: practice(
    'inductive_oia',
    'Inductive study',
    'notes',
    'Write what you see before you decide what it means. Then offer one careful reading, and one place it meets your day.',
    [
      {
        id: 'observe',
        title: 'Observe',
        prompt: 'What is on the page that you might have rushed past? People, repeated words, a surprise, a silence.',
        inputLabel: 'What you notice',
      },
      {
        id: 'interpret',
        title: 'Interpret',
        prompt: 'Given those observations, what might this passage be saying?',
        inputLabel: 'A careful reading',
      },
      {
        id: 'apply',
        title: 'Apply',
        prompt: 'Head, heart, or hands: where does this touch a real part of your day?',
        inputLabel: 'Where this meets you',
      },
    ],
  ),

  word_study: practice(
    'word_study',
    'Word study',
    'notice',
    'Choose one word that is actually on the page. Notice how the sentence around it changes that word.',
    [
      {
        id: 'choose',
        title: 'Choose a word on the page',
        prompt: 'Which word in this passage keeps asking for your attention?',
        inputLabel: 'The word',
        choices: ['A verb that moves the scene', 'A name or title', 'A repeated word', 'A small word that changes the tone'],
      },
      {
        id: 'neighbors',
        title: 'How context changes it',
        prompt: 'How do the surrounding words change this one? Quote a short phrase that holds it.',
        inputLabel: 'The phrase around it',
      },
      {
        id: 'carry',
        title: 'Why this word today',
        prompt: 'Why might this word matter for you today?',
        inputLabel: 'Why it stays with you',
      },
    ],
  ),

  rhetorical_analysis: practice(
    'rhetorical_analysis',
    'Mark the echo',
    'notice',
    'Listen for what the writing itself repeats, mirrors, or suddenly turns.',
    [
      {
        id: 'pattern',
        title: 'Find the craft',
        prompt: 'What is the text doing with sound or shape?',
        choices: ['A repeated word or phrase', 'A mirrored pair of lines', 'A sudden turn', 'A question left open'],
      },
      {
        id: 'quote',
        title: 'Copy the echo',
        prompt: 'Write the repeated or mirrored line exactly as it appears.',
        inputLabel: 'The line as written',
      },
      {
        id: 'effect',
        title: 'What the echo does',
        prompt: 'What does that pattern do to you as a reader?',
        inputLabel: 'What it does',
      },
    ],
  ),

  manuscript: practice(
    'manuscript',
    'Manuscript reading',
    'sequence',
    'Read it as one continuous stretch. Verse numbers are gone, so the movement can stand together.',
    [
      {
        id: 'whole',
        title: 'Hear the whole span',
        prompt: 'Read the verses as one paragraph. What is the single movement from start to finish?',
        inputLabel: 'The movement you heard',
      },
      {
        id: 'seam',
        title: 'Where it shifts',
        prompt: 'Where does the tone or speaker change? Name that shift in your own words.',
        inputLabel: 'The shift',
      },
      {
        id: 'keep',
        title: 'One sentence to keep',
        prompt: 'If you could keep only one sentence from this span, which would it be?',
        inputLabel: 'The sentence',
      },
    ],
  ),

  typological: practice(
    'typological',
    'Name the type',
    'trace',
    'Name the pattern you see in today’s scene. Then sit with related passages from today’s reading.',
    [
      {
        id: 'scene',
        title: 'What this scene shows',
        prompt: 'In this passage alone, what person, act, or image seems to stand for something larger?',
        inputLabel: 'The type you see here',
      },
      {
        id: 'support',
        title: 'Related passages',
        prompt: 'What do related passages from today’s reading add to the pattern you named?',
        inputLabel: 'What they add',
      },
      {
        id: 'care',
        title: 'What remains open',
        prompt: 'What about this pattern still feels like a question?',
        inputLabel: 'What remains a question',
      },
    ],
  ),

  cross_reference: practice(
    'cross_reference',
    'Cross-reference',
    'trace',
    'Begin with today’s passage. Then open related passages from today’s reading and listen for what they add.',
    [
      {
        id: 'home',
        title: 'Today’s passage first',
        prompt: 'In a sentence, what is this day’s passage doing before you leave it?',
        inputLabel: 'This passage in a sentence',
      },
      {
        id: 'listed',
        title: 'Open a related passage',
        prompt: 'Choose a related passage from today’s reading. What do you hear there?',
        inputLabel: 'What you hear there',
      },
      {
        id: 'return',
        title: 'Come back',
        prompt: 'Returning to today’s passage, what is clearer now?',
        inputLabel: 'What you bring back',
      },
    ],
  ),

  historical_cultural: practice(
    'historical_cultural',
    'The setting it names',
    'notice',
    'Gather the setting the passage itself names: a place, a people, a custom, or none of these.',
    [
      {
        id: 'named',
        title: 'What the text locates',
        prompt: 'What place, people, or custom does this passage actually name?',
        choices: [
          'A place the text names',
          'A people the text names',
          'A practice the text names',
          'The text does not name a setting',
        ],
      },
      {
        id: 'quote',
        title: 'Copy the clue',
        prompt: 'Write the short phrase that gives that setting. If there is none, say so.',
        inputLabel: 'The phrase, or none',
      },
      {
        id: 'limit',
        title: 'What remains unnamed',
        prompt: 'What about this world does the passage leave unnamed?',
        inputLabel: 'What remains unnamed',
      },
    ],
  ),

  lectio_divina: practice(
    'lectio_divina',
    'Lectio divina',
    'pause',
    'Read slowly. Notice a word or phrase. Pray it, then rest with it.',
    [
      {
        id: 'first',
        title: 'First reading',
        prompt: 'Read the passage once. What word or phrase simply landed?',
        inputLabel: 'The phrase that landed',
      },
      {
        id: 'second',
        title: 'Notice and pray',
        prompt: 'Read it again. Stay with that phrase. What do you want to say to God about it?',
        inputLabel: 'A word to God',
      },
      {
        id: 'rest',
        title: 'Rest',
        prompt: 'Rest with the phrase. You may write a sentence, or simply remain here.',
        inputLabel: 'An optional sentence',
      },
    ],
  ),

  ignatian_contemplation: practice(
    'ignatian_contemplation',
    'Stand in the scene',
    'retell',
    'Enter the scene in prayer. Let imagination help you linger, while staying clear about what the text names.',
    [
      {
        id: 'place',
        title: 'Where you stand',
        prompt: 'Using the people, places, and actions named here, where are you standing in this scene?',
        inputLabel: 'Your place in the scene',
      },
      {
        id: 'see',
        title: 'Pray with what you notice',
        prompt: 'As you pray, what do you see or hear? Which of those details does the passage itself mention?',
        inputLabel: 'What you notice',
      },
      {
        id: 'remain',
        title: 'Remain a moment',
        prompt: 'Stay with one person the text names. What do you want to say?',
        inputLabel: 'An optional word',
      },
    ],
  ),

  scripture_meditation: practice(
    'scripture_meditation',
    'Scripture meditation',
    'memory',
    'Choose a short span from today’s passage. Carry the words themselves, then look at them again.',
    [
      {
        id: 'choose',
        title: 'Choose the short span',
        prompt: 'Which 1–3 verses from today’s passage will you carry?',
        inputLabel: 'The verses you will carry',
      },
      {
        id: 'hide',
        title: 'Say what you remember',
        prompt: 'Without looking, say as much as you remember. Missing words are welcome.',
        inputLabel: 'What you remember',
      },
      {
        id: 'show',
        title: 'Look again',
        prompt: 'Look at the same words again. What did you hold, and what do you want to see once more?',
        inputLabel: 'What you want to see again',
      },
    ],
  ),

  breath_prayer: practice(
    'breath_prayer',
    'Breath prayer',
    'pause',
    'Find a short phrase in today’s verse and copy it as written. Let it ride a breath only if that helps.',
    [
      {
        id: 'copy',
        title: 'Copy a short phrase',
        prompt: 'Write 4–8 words taken from the verse. Keep them as they are.',
        inputLabel: 'The phrase as written',
      },
      {
        id: 'breathe',
        title: 'Breathe the phrase',
        prompt: 'If it helps, let that phrase ride a breath in and a breath out. Stop whenever you like.',
        inputLabel: 'Optional note',
      },
      {
        id: 'keep',
        title: 'Take it with you',
        prompt: 'Would you like to keep this phrase with you today? You may also leave it here.',
        inputLabel: 'Keep, or leave',
      },
    ],
  ),

  soap_journal: practice(
    'soap_journal',
    'SOAP journal',
    'notes',
    'Move through four familiar slots: Scripture, observation, application, and a short prayer.',
    [
      {
        id: 'scripture',
        title: 'Scripture',
        prompt: 'Write the verse or short span you are sitting with.',
        inputLabel: 'Scripture',
      },
      {
        id: 'observation',
        title: 'Observation',
        prompt: 'What do you notice before you apply it?',
        inputLabel: 'Observation',
      },
      {
        id: 'application',
        title: 'Application',
        prompt: 'Where might this meet a real hour of your day?',
        inputLabel: 'Application',
      },
      {
        id: 'prayer',
        title: 'Prayer',
        prompt: 'Speak to God about what you saw. Short is enough.',
        inputLabel: 'Prayer',
      },
    ],
  ),

  verse_mapping: practice(
    'verse_mapping',
    'Verse mapping',
    'sequence',
    'Choose one verse and map the words, any related passages from today’s reading, and one small way to live it.',
    [
      {
        id: 'words',
        title: 'The words',
        prompt: 'Copy the verse. Circle or list the words that feel load-bearing.',
        inputLabel: 'Words you marked',
      },
      {
        id: 'links',
        title: 'Related passages',
        prompt: 'What do related passages from today’s reading add to this verse?',
        inputLabel: 'What they add',
      },
      {
        id: 'live',
        title: 'A small living',
        prompt: 'What is one concrete way this verse could shape an ordinary hour?',
        inputLabel: 'One small living',
      },
    ],
  ),

  swedish_method: practice(
    'swedish_method',
    'Swedish method',
    'notice',
    'Mark one shine, one confusion, and one way to live. The confusion may stay a confusion.',
    [
      {
        id: 'mark',
        title: 'Choose a mark',
        prompt: 'What kind of mark is this line asking for?',
        choices: ['A word that shines', 'A word that confuses', 'A word to live'],
      },
      {
        id: 'write',
        title: 'Write the mark',
        prompt: 'Copy the phrase and say why you marked it that way.',
        inputLabel: 'The phrase and why',
      },
      {
        id: 'live',
        title: 'One living, if any',
        prompt: 'If a way to live is clear today, write it. If not, let the confusion stand.',
        inputLabel: 'A living, or not yet',
      },
    ],
  ),

  discovery_bible_study: practice(
    'discovery_bible_study',
    'Discovery Bible Study',
    'notes',
    'Read the passage aloud. Say what it shows about God and people, then one small step, then whom you might tell.',
    [
      {
        id: 'says',
        title: 'What it says',
        prompt: 'In your own words, what happens or is said here? What does this show about God, and about people?',
        inputLabel: 'The text in your words',
      },
      {
        id: 'obey',
        title: 'A possible obedience',
        prompt: 'If this is true, what is one thing you could do? Keep it small enough for this week.',
        inputLabel: 'One possible step',
      },
      {
        id: 'share',
        title: 'Someone to tell',
        prompt: 'Is there a person you might tell this story to? You may leave this blank.',
        inputLabel: 'Optional name',
      },
    ],
  ),

  topical: practice(
    'topical',
    'This passage’s own word',
    'notice',
    'Stay with what this passage uniquely says, even if you arrived looking for a theme.',
    [
      {
        id: 'unique',
        title: 'This text’s own claim',
        prompt: 'What does this passage say that you would not have if you only had a topic label?',
        inputLabel: 'What this text uniquely says',
        choices: ['A promise this text makes', 'A command this text gives', 'A picture this text paints', 'A limit this text sets'],
      },
      {
        id: 'resist',
        title: 'What you almost imported',
        prompt: 'What other passage are you tempted to bring in? What would you lose if you did?',
        inputLabel: 'What you almost brought in',
      },
      {
        id: 'keep',
        title: 'Keep this day’s word',
        prompt: 'Write one sentence that only this passage could have given you today.',
        inputLabel: 'This day’s sentence',
      },
    ],
  ),

  character_study: practice(
    'character_study',
    'Character study',
    'retell',
    'Watch one person this scene actually shows, and the choice they make here.',
    [
      {
        id: 'person',
        title: 'Who the text shows',
        prompt: 'Which person does this passage actually show acting or speaking?',
        inputLabel: 'The person named here',
      },
      {
        id: 'choice',
        title: 'The choice they make',
        prompt: 'What choice do they make in this scene? Quote or closely paraphrase the action.',
        inputLabel: 'The choice',
      },
      {
        id: 'near',
        title: 'Near, not like',
        prompt: 'Where does that choice sit near your own life, without making their story yours?',
        inputLabel: 'A careful nearness',
      },
    ],
  ),

  thematic_thread: practice(
    'thematic_thread',
    'This day’s strand',
    'trace',
    'Name what this day adds to the thread. Then listen to related passages from today’s reading.',
    [
      {
        id: 'today',
        title: 'This day’s strand',
        prompt: 'What does today’s passage add that yesterday could not have said?',
        inputLabel: 'What this day adds',
      },
      {
        id: 'listed',
        title: 'Related passages',
        prompt: 'What do related passages from today’s reading add to this strand?',
        inputLabel: 'What they add',
      },
      {
        id: 'hold',
        title: 'Hold the new piece',
        prompt: 'Write one sentence you could carry as this day’s addition to the thread.',
        inputLabel: 'This day’s addition',
      },
    ],
  ),

  narrative_study: practice(
    'narrative_study',
    'Find the story’s turn',
    'retell',
    'Find the turn the narrator writes. Watch the scene before it, at it, and after it.',
    [
      {
        id: 'before',
        title: 'Before the turn',
        prompt: 'How does the scene stand before anything changes?',
        inputLabel: 'The before',
      },
      {
        id: 'turn',
        title: 'The story’s turn',
        prompt: 'Where does the story turn? Point to the action or speech that changes the direction.',
        inputLabel: 'The turn',
      },
      {
        id: 'after',
        title: 'After',
        prompt: 'What is different after that turn, according to the narrator?',
        inputLabel: 'The after',
      },
    ],
  ),

  poetry_psalms: practice(
    'poetry_psalms',
    'Find the volta',
    'notice',
    'Listen for who is addressed, then for the turn in feeling. A poem may end mid-cry.',
    [
      {
        id: 'voice',
        title: 'Who is speaking',
        prompt: 'Who does the poem address, as the lines themselves say?',
        choices: ['God', 'The self', 'A congregation or city', 'An enemy or threat', 'The poem does not name the hearer'],
      },
      {
        id: 'volta',
        title: 'The volta',
        prompt: 'Where does the feeling or argument turn? Copy the line if you can.',
        inputLabel: 'The turning line',
      },
      {
        id: 'stay',
        title: 'Stay with the poem',
        prompt: 'What may remain unresolved? A psalm can end mid-cry.',
        inputLabel: 'What you will let stand',
      },
    ],
  ),

  wisdom_study: practice(
    'wisdom_study',
    'A pattern, not a promise',
    'notice',
    'Hear the saying as a way of life. State the pattern, then one small wise act it invites.',
    [
      {
        id: 'pattern',
        title: 'The pattern',
        prompt: 'What way of life does this saying describe?',
        choices: ['A pattern to notice', 'A warning, not a promise', 'A way to walk today', 'A limit on easy answers'],
      },
      {
        id: 'not-promise',
        title: 'Not a contract',
        prompt: 'What would it mean to treat this as wisdom rather than a bargain with God?',
        inputLabel: 'How you hear it',
      },
      {
        id: 'walk',
        title: 'A wise next step',
        prompt: 'What is one small wise act this saying could invite?',
        inputLabel: 'A small wise act',
      },
    ],
  ),

  prophetic_study: practice(
    'prophetic_study',
    'Speaker, hearer, crisis',
    'notice',
    'Name the speaker, the hearer, and the trouble only as this oracle names them.',
    [
      {
        id: 'names',
        title: 'As the text names them',
        prompt: 'Who is speaking, who is addressed, and what trouble is named?',
        choices: [
          'The speaker the text names',
          'The hearer the text names',
          'The crisis the text names',
          'One of these is not named',
        ],
      },
      {
        id: 'quote',
        title: 'The named crisis',
        prompt: 'Copy the phrase that names the trouble, or write that the trouble is unnamed.',
        inputLabel: 'The named trouble, or unnamed',
      },
      {
        id: 'now',
        title: 'A careful now',
        prompt: 'What from this naming still presses on you today?',
        inputLabel: 'What still presses',
      },
    ],
  ),

  epistle_study: practice(
    'epistle_study',
    'Follow a therefore',
    'sequence',
    'Follow one therefore, because, or so that in this letter unit. See what mercy it rests on, and what life it asks.',
    [
      {
        id: 'because',
        title: 'Find the hinge',
        prompt: 'Which therefore, because, or so that is doing the work in this span?',
        inputLabel: 'The hinge word',
      },
      {
        id: 'before',
        title: 'What it rests on',
        prompt: 'What claim or mercy sits before that hinge, in this unit?',
        inputLabel: 'What comes before',
      },
      {
        id: 'after',
        title: 'What it asks',
        prompt: 'What life does the writer attach after the hinge?',
        inputLabel: 'What comes after',
      },
    ],
  ),

  redemptive_historical: practice(
    'redemptive_historical',
    'This scene on the long line',
    'trace',
    'Place this scene on the long line from creation to restoration, using what this passage says.',
    [
      {
        id: 'here',
        title: 'Where this text stands',
        prompt: 'From this passage alone, are we nearer wound, promise, rescue, or waiting?',
        inputLabel: 'Where this text stands',
      },
      {
        id: 'listed',
        title: 'Related passages',
        prompt: 'What do related passages from today’s reading add to where this scene stands?',
        inputLabel: 'What they add',
      },
      {
        id: 'one-line',
        title: 'One honest placement',
        prompt: 'Write one sentence that places this scene on that longer line.',
        inputLabel: 'One sentence',
      },
    ],
  ),

  covenant_study: practice(
    'covenant_study',
    'Promise or sign',
    'trace',
    'Name the promise or sign the passage itself mentions. Then see what related passages from today’s reading add.',
    [
      {
        id: 'named',
        title: 'What is named',
        prompt: 'Does this passage mention a promise, a sign, a party, or none of these?',
        inputLabel: 'What the passage mentions',
      },
      {
        id: 'quote',
        title: 'The words themselves',
        prompt: 'Copy the promise or sign as written. If none is named, write that plainly.',
        inputLabel: 'The words, or none',
      },
      {
        id: 'support',
        title: 'Related passages',
        prompt: 'What do related passages from today’s reading add to this promise or sign?',
        inputLabel: 'What they add',
      },
    ],
  ),

  parable_study: practice(
    'parable_study',
    'The one surprise',
    'retell',
    'Retell the parable thinly, then name the one surprise. Leave the scenery as scenery unless the passage explains it.',
    [
      {
        id: 'story',
        title: 'Tell the story thinly',
        prompt: 'Retell the parable using only the actions the text states.',
        inputLabel: 'The story as told',
      },
      {
        id: 'surprise',
        title: 'The surprise',
        prompt: 'What is the one turn that would have startled a first hearer?',
        inputLabel: 'The surprise',
      },
      {
        id: 'leave',
        title: 'Leave the scenery',
        prompt: 'Which details work as scenery, and which does the passage itself explain?',
        inputLabel: 'Scenery, or explained',
      },
    ],
  ),

  lament_study: practice(
    'lament_study',
    'Walk the lament',
    'pause',
    'Walk the lament as far as it goes. Finish where you actually are. Praise is welcome when it is honest.',
    [
      {
        id: 'address',
        title: 'Address and complaint',
        prompt: 'Who is addressed, and what hurt or protest does the text voice?',
        inputLabel: 'Address and complaint',
      },
      {
        id: 'ask',
        title: 'Trust or petition, if present',
        prompt: 'If the text turns toward trust or a request, name that turn. If it does not, stay where it stays.',
        inputLabel: 'Trust, petition, or still the cry',
      },
      {
        id: 'unforced',
        title: 'Where you actually are',
        prompt: 'If praise or trust is honest now, write it. If not, let the lament stand.',
        inputLabel: 'Where you actually are',
      },
    ],
  ),

  comparative_translation: practice(
    'comparative_translation',
    'BSB and KJV side by side',
    'compare',
    'Set the same verse in the BSB and the KJV. Notice a real difference in word or rhythm.',
    [
      {
        id: 'same-verse',
        title: 'The same verse',
        prompt: 'Open the same verse in the BSB and the KJV.',
        inputLabel: 'The verse reference',
      },
      {
        id: 'difference',
        title: 'A real difference',
        prompt: 'What word or rhythm actually differs between BSB and KJV? Quote both sides.',
        inputLabel: 'BSB and KJV difference',
      },
      {
        id: 'hear',
        title: 'What the difference does',
        prompt: 'What does that difference do to how you hear the verse?',
        inputLabel: 'How it sounds now',
      },
    ],
  ),

  praying_psalms: practice(
    'praying_psalms',
    'Praying the Psalms',
    'pause',
    'Pray some of the psalm’s lines as your own words. Skip any line that is not yours to pray today.',
    [
      {
        id: 'choose',
        title: 'Choose lines you can pray',
        prompt: 'Which lines can you say without pretending? Copy them.',
        inputLabel: 'Lines you can pray',
      },
      {
        id: 'voice',
        title: 'Say them as yours',
        prompt: 'Pray those lines in your own pronouns if you want. Leave the rest of the psalm on the page.',
        inputLabel: 'Your praying of the lines',
      },
      {
        id: 'rest',
        title: 'Close without forcing',
        prompt: 'You may sit a moment, or simply amen.',
        inputLabel: 'Optional closing word',
      },
    ],
  ),

  storytelling_renarration: practice(
    'storytelling_renarration',
    'Retell the story',
    'retell',
    'Gather the people, places, and actions the passage names. Then tell the story again in your own words.',
    [
      {
        id: 'facts',
        title: 'The facts on the page',
        prompt: 'List the people, places, and actions the passage names.',
        inputLabel: 'Named facts',
      },
      {
        id: 'retell',
        title: 'Tell it again',
        prompt: 'Retell the story in a short paragraph that uses only those facts.',
        inputLabel: 'Your retelling',
      },
      {
        id: 'check',
        title: 'Check the edges',
        prompt: 'What did you almost add that the text never said?',
        inputLabel: 'What you almost added',
      },
    ],
  ),

  examen_with_scripture: practice(
    'examen_with_scripture',
    'Examen with Scripture',
    'notes',
    'Keep one verse from today beside a walk back through your hours.',
    [
      {
        id: 'verse',
        title: 'The verse beside the day',
        prompt: 'Which verse from today’s passage will sit beside your review?',
        inputLabel: 'The verse',
      },
      {
        id: 'review',
        title: 'Where the verse met the day',
        prompt: 'Where did you notice this truth at work, and where did you resist or forget it?',
        inputLabel: 'Notice and resistance',
      },
      {
        id: 'release',
        title: 'Release the day',
        prompt: 'Name one thing for tomorrow, then release the rest of the day.',
        inputLabel: 'Optional tomorrow, then rest',
      },
    ],
  ),
};

export function getScripturePractice(methodId?: string): ScripturePractice | null {
  if (!methodId) return null;
  return Object.prototype.hasOwnProperty.call(SCRIPTURE_PRACTICES, methodId) ? SCRIPTURE_PRACTICES[methodId] : null;
}
