# Scripture-first devotional practice

## Decision

Build 281 was submitted before this experiment. The next QA TestFlight build tests optional guided practices. The App Store production profile keeps them off.

The current system selects among 32 methods but renders a common essay schema. The model performs most of the method. The reader mostly receives it. This beta gives the reader a distinct action before the reflection. It keeps existing prose and model routing unchanged.

## Experience

1. Open a devotional. Begin with Scripture appears beside the existing passage.
2. Open the assigned passage in Unfold or use a physical Bible. Read the surrounding chapter when more context helps.
3. Follow a short practice for the assigned method. Write, notice, remember, compare, trace or pause. Every response is optional.
4. Return from the Bible tab to the exact devotional and practice step.
5. Read the original devotional. Practice completion and devotional completion remain separate.

The QA method picker lets Nick try the catalog on the current passage. It does not change the assigned method or generate a new day. Genre suitability still belongs to the existing planner. An arbitrary preview is a control test, not proof that every method fits that passage.

## Method design

The table records the reader action. Several methods share controls while retaining their own questions and sequence. No spiritual scores, right-answer grading or extra streak is added. Lament permits unresolved grief. Imaginative and historical exercises distinguish the text from interpretation.

| Method | Practice | Controls | Reader sequence |
|---|---|---|---|
| `expository` | Walk the lines | sequence | Name each move → The line that carries it → What you will remember |
| `inductive_oia` | Inductive study | notes | Observe → Interpret → Apply |
| `word_study` | Word study | notice | Choose a word on the page → How context changes it → Why this word today |
| `rhetorical_analysis` | Mark the echo | notice | Find the craft → Copy the echo → What the echo does |
| `manuscript` | Manuscript reading | sequence | Hear the whole span → Where it shifts → One sentence to keep |
| `typological` | Name the type | trace | What this scene shows → Related passages → What remains open |
| `cross_reference` | Cross-reference | trace | Today’s passage first → Open a related passage → Come back |
| `historical_cultural` | The setting it names | notice | What the text locates → Copy the clue → What remains unnamed |
| `lectio_divina` | Lectio divina | pause | First reading → Notice and pray → Rest |
| `ignatian_contemplation` | Stand in the scene | retell | Where you stand → Pray with what you notice → Remain a moment |
| `scripture_meditation` | Scripture meditation | memory | Choose the short span → Say what you remember → Look again |
| `breath_prayer` | Breath prayer | pause | Copy a short phrase → Breathe the phrase → Take it with you |
| `soap_journal` | SOAP journal | notes | Scripture → Observation → Application → Prayer |
| `verse_mapping` | Verse mapping | sequence | The words → Related passages → A small living |
| `swedish_method` | Swedish method | notice | Choose a mark → Write the mark → One living, if any |
| `discovery_bible_study` | Discovery Bible Study | notes | What it says → A possible obedience → Someone to tell |
| `topical` | This passage’s own word | notice | This text’s own claim → What you almost imported → Keep this day’s word |
| `character_study` | Character study | retell | Who the text shows → The choice they make → Near, not like |
| `thematic_thread` | This day’s strand | trace | This day’s strand → Related passages → Hold the new piece |
| `narrative_study` | Find the story’s turn | retell | Before the turn → The story’s turn → After |
| `poetry_psalms` | Find the volta | notice | Who is speaking → The volta → Stay with the poem |
| `wisdom_study` | A pattern, not a promise | notice | The pattern → Not a contract → A wise next step |
| `prophetic_study` | Speaker, hearer, crisis | notice | As the text names them → The named crisis → A careful now |
| `epistle_study` | Follow a therefore | sequence | Find the hinge → What it rests on → What it asks |
| `redemptive_historical` | This scene on the long line | trace | Where this text stands → Related passages → One honest placement |
| `covenant_study` | Promise or sign | trace | What is named → The words themselves → Related passages |
| `parable_study` | The one surprise | retell | Tell the story thinly → The surprise → Leave the scenery |
| `lament_study` | Walk the lament | pause | Address and complaint → Trust or petition, if present → Where you actually are |
| `comparative_translation` | BSB and KJV side by side | compare | The same verse → A real difference → What the difference does |
| `praying_psalms` | Praying the Psalms | pause | Choose lines you can pray → Say them as yours → Close without forcing |
| `storytelling_renarration` | Retell the story | retell | The facts on the page → Tell it again → Check the edges |
| `examen_with_scripture` | Examen with Scripture | notes | The verse beside the day → Where the verse met the day → Release the day |

## Scripture and privacy

Practices load wording from the installed BSB or KJV database. They never substitute model verse text. Missing text offers a physical Bible path. Comparison labels each available translation. A chapter-only reference must load the chapter, not just verse one. Translation-specific verse metadata validates complete chapters and ranges. It preserves BSB omissions while rejecting missing expected verses. Regenerate the metadata with `python3 scripts/generate-bible-verse-layout.py <path-to-unfold-bible-v1.db>` when the shipped corpus changes.

Practice notes remain in the existing encrypted local store. They are not sent to generation, sync or analytics. Day and method keys keep drafts separate. Account reset clears them. A bounded cache prevents unlimited storage growth.

## Navigation

A return pointer records the devotional, day, method, host tab and destination. It does not replace Home resume state. The Bible layout offers Return to devotional across its screens. Missing, archived, foreign or unavailable days fail closed. Actual devotional completion and explicit dismissal clear the pointer. Return never relies on an empty back stack.

## Validation

Run behavior tests for all method IDs, persisted draft updates, reset, stale return targets, local Scripture failures and asynchronous race cancellation. Verify Pro and compact simulators, both themes, large text, keyboard visibility, skip and Bible round trips. Required mobile checks and a clean current-head Greptile review precede merge. Verify the signed QA IPA and Apple processing before claiming TestFlight availability.

## Next generation experiment

First collect Nick's observations from this beta. Identify which practices help him notice the passage, which interrupt reading, and which feel repetitive. Optional personal notes must not become telemetry by accident.

Then evaluate a structured practice payload for generated days. The payload should provide a canonical passage range, a grounded focus and method-specific prompts. Validate each reference against the Bible corpus. Require matching verse wording. Avoid unsupported original-language and historical claims.

The essay schema should vary by method. Lectio can use a shorter reflection and prayer. Inductive study should reserve the interpretation until after observation. Memory work should focus on a short excerpt within a larger reading. Compare and trace should use verified secondary passages. Lament should allow an unresolved ending. Narrative methods should preserve what the text states.

Evaluate a small fixed sample across contemplative, analytical, creative and narrative methods. Score Scripture fidelity, personality, rhythm, elegance, restraint and pastoral care separately. Measure repetition across consecutive days. Reuse the current prose model as the reference. Do not infer a model switch from an inconclusive reader preference.

A production rollout needs Nick's feedback on this beta and validated generation changes. This document does not enable those later changes.
