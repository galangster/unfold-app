Build 204 ships the Notebook accessibility and folder-creation QA follow-up.

What to test:
- Bottom tabs are easier for VoiceOver and automation to target, with clearer tab labels and hints.
- Note detail title and body fields expose their current values to accessibility.
- The note More menu exposes Favorite, Move to folder, and Delete as labeled actions.
- Move to folder -> Create new folder uses the shared create-folder sheet instead of the old prompt.
- Creating a folder from the move sheet still saves the note and moves it into the new folder.
- Folder creation, note move, and folder delete cleanup should leave the Notebook inventory intact.

Source: 88474bf Improve notebook accessibility contracts

App Review build attachment is intentionally unchanged.
