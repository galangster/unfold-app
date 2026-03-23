# Build 31 — What to Test

## New: AI Companion Chat (Ask Tab)
- **Ask tab** is now live in the bottom navigation (chat bubble icon)
- Tap to open the companion chat — you'll see a rotating greeting and 4 starter prompts
- Send messages and get real-time streaming responses from the AI companion
- **Voice input**: tap the mic icon in the empty text field to dictate messages
- Try tapping verse references in responses (e.g. [Romans 8:28]) — opens a scripture sheet
- Follow-up suggestion chips appear after each response
- Test the stop button while the AI is generating a response

## UI Changes
- Send button is now an arrow-up circle (like ChatGPT/Claude)
- Header shows the animated companion orb instead of "Ask" text
- Prayer card now reads "Help me put my prayer into words" instead of "Pray with me"
- 50 rotating greeting messages in the empty state

## Backend
- New SSE streaming endpoint for companion chat
- Graceful fallback to non-streaming if SSE fails
- Crisis keyword detection for safety monitoring

## Things to Look For
- Does the streaming feel smooth or does it lag?
- Do verse taps work correctly in companion responses?
- Does voice input transcribe accurately?
- Any crashes when opening/closing the Ask tab?
- How does the companion orb animation look in the header?
