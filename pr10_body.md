## Issue
In onboarding question 4 (themeType), selecting "A style of study" sometimes advanced immediately using stale state, causing question 5 (studySubject) to load with no selected type and therefore no options.

## Root cause
The main-option cards in themeSelectionMode='none' were calling handleNext() via setTimeout(...) right after setData(...). Because state updates are async, handleNext() could run before selectedMainOption/selectedType were settled.

## Fix
- Removed auto-advance timeout from the three main-option cards.
- For theme selection: set themeSelectionMode('theme') directly.
- For type selection: set themeSelectionMode('type') directly.
- For guided selection: directly start discovery preparation (startDiscoveryPreparation('guided')).

## Expected result
- Choosing "A style of study" reliably shows study types first.
- After choosing a type requiring subjects, Q5 now has subject options rendered consistently.
