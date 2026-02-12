# Unfold

A personalized devotional app that generates spiritually tailored daily reflections based on your unique circumstances.

## Features

- **Theme Categories**: Choose a spiritual focus for your devotional journey
  - **16 Themes**: Trust, Identity, Rest, Purpose, Healing, Gratitude, Surrender, Courage, Hope, Presence, Conviction, Joy, Lament, Justice, Discipline, Wonder
  - Each theme includes tailored scripture sources and tone guidance
  - Wide emotional range: from comforting (rest, healing) to challenging (conviction, discipline) to raw (lament, justice)

- **Devotional Types**: Different structural approaches for variety
  - **Personal Journey**: Crafted around your story (default)
  - **Book Study**: Walk through a book of the Bible (Philippians, James, Ruth, etc.)
  - **Character Study**: Learn from biblical figures (David, Ruth, Moses, Peter, etc.)
  - **Psalm Journey**: Immersive journey through the Psalms
  - **Beatitudes**: Walking through Jesus' revolutionary blessings
  - **Fruit of the Spirit**: Exploring Galatians 5 character traits
  - **Lord's Prayer**: Unpacking the Lord's Prayer phrase by phrase
  - **Names of God**: Discovering God through His names
  - **Parables**: Jesus' stories and their Kingdom meaning

- **Writing Style Onboarding**: Initial 3-question flow to personalize how devotionals are written
  - **Faith Background**: Exploring, growing, or grounded — determines theological depth
  - **Tone Preference**: Like a friend (warm), straight to the point (direct), or with beauty (poetic)
  - **Content Depth**: Simple, balanced, or theological deep-dives
- **Bible Translation Selection**: Choose your preferred Bible translation (NIV, ESV, KJV, NLT) during onboarding or in settings — all scripture in devotionals will use your selected translation style
- **Personalized Onboarding**: Conversational intake that captures your identity, situation, and emotional state
  - **Theme & Type Selection**: Optional exploration step before discovery questions — pick a theme, a study style, or let the app guide you
  - **Differentiated Study Flows**: When you choose a specific study type (Book Study or Character Study), you'll pick the specific book or character, and the discovery questions adapt to center on WHY you chose that particular study
  - **Fully Adaptive AI Questions**: Discovery questions are generated entirely by AI based on your previous answers — no templates, no repetition, every conversation feels unique
  - **Write-More Encouragement**: Gentle nudge appears when answers are short, encouraging users to share more for better personalization
  - **Dynamic Duration Subtexts**: Choice options have varied metaphorical descriptions that change each session
  - **Inline Submit Button**: Send button inside text areas for smoother flow
  - **Adaptive AI Questions**: Questions build naturally on your previous answers, creating a meaningful conversation that helps you discover what devotional you need
- **Smart Returning User Flow**: Skips already-answered questions (name, about me) when creating new devotionals
- **AI-Generated Devotionals**: Claude-powered devotional content with literary depth and varied openings
- **Scripture Variety Tracking**: Automatically tracks previously used scriptures across all devotionals to ensure fresh, diverse passages — you'll never see the same primary scripture repeated
- **Progressive Loading**: Day 1 generates first as its own micro-batch for fastest time-to-read — "Start Reading Now" button appears immediately while remaining days generate in the background
  - Smart batch planning: Day 1 alone, then follow-up batches of 3-10 days depending on reading duration
  - Day 1 ready notification sent if user is in background
  - 5-minute timeout on API requests with automatic retry
- **Time-Appropriate Content**: Devotionals scale to match your chosen reading time:
  - **5 minutes**: Focused scripture, brief reflection, 1 theologian quote, 1 reflection question
  - **15 minutes**: Primary + cross-reference scriptures, rich reflection (600-800 words), 2-3 quotes from theologians/authors, historical context, 2-3 reflection questions
  - **30 minutes**: Extended passages, deep reflection (1200-1600 words), 4-5 quotes, word studies, cultural context, 4-5 progressive reflection questions, closing prayer
- **Sacred Reading Experience**: Elegant typography, swipe navigation, smooth completion animations
- **Smart Date Labels**: Shows "Today" or "Tomorrow" based on when you last completed a reading
- **Journaling**: Optional reflections with auto-save
- **Share Devotional**: Share individual devotional days as beautiful images or text quotes
  - Generates a shareable card with day title, scripture, quotable line, and app branding
  - Share image adapts to light/dark mode with matching color schemes
  - "Download Free" CTA encourages friends to get the app
  - Share as image (for Instagram, iMessage, etc.) or as text
- **Reading Experience Enhancements**: Smooth gradient fade at bottom with animated bouncing chevron to encourage scrolling
- **Wallpaper Creation**: Generate shareable phone wallpapers with day title and app branding
- **Local-First Storage**: Devotionals and journal entries persist locally (capped at 200 scriptures to prevent unbounded growth)
- **Profile Editing**: Edit your name and "About You" in Settings — this info shapes how devotionals are written, so users can update it anytime (e.g., change from "dad" to a different context)
- **Push Notifications**: Day 1 ready notification and full devotional completion notification sent when user is in background
- **Premium Features**:
  - Daily reminder notifications (with test button)
  - Unlimited Journeys (free tier: 1 journey)
  - **Custom Accent Colors**: 7 curated color themes (Gold, Ocean, Rose, Forest, Lavender, Ember, Slate) that change the accent color throughout the entire app
  - **Custom Reading Fonts**: 5 premium typefaces (Source Serif, EB Garamond, Lora, Crimson Text, Merriweather) for the devotional reading experience
  - **Wallpaper Share Styles**: 6 wallpaper styles (Midnight free; Parchment, Ocean, Forest, Dusk, Clay premium) for sharing quotes with unique color palettes and typography
  - **Extended Journal Prompts**: AI-powered "Go Deeper" button in journal that generates 3 personalized follow-up reflection questions based on what you wrote and the devotional context
  - **Bookmarks / Saved Passages**: Bookmark any devotional day while reading to save the scripture passage; browse all saved passages from the home screen with a dedicated Saved Passages screen
  - **Streak Tracking & Stats**: Dedicated stats screen showing reading streak, days completed, scriptures read, journeys finished, themes explored, journal entries, with motivational scripture quotes
- **App Store Review**: Rate app button in settings opens App Store review page

## Architecture

```
src/
├── app/                    # Expo Router screens
│   ├── _layout.tsx        # Root layout with fonts & theme
│   ├── index.tsx          # Welcome screen
│   ├── style-onboarding.tsx # Writing style preferences (3 questions)
│   ├── onboarding.tsx     # Situation & devotional preferences
│   ├── generating.tsx     # AI generation progress
│   ├── paywall.tsx        # Premium subscription UI
│   └── (main)/            # Main app screens
│       ├── home.tsx       # Dashboard
│       ├── reading.tsx    # Daily devotional reader
│       ├── journal.tsx    # Reflection input
│       ├── wallpaper.tsx  # Quote wallpaper generator
│       ├── past-devotionals.tsx
│       ├── my-responses.tsx
│       ├── journal-detail.tsx # Individual journal entry view
│       ├── stats.tsx         # Streak tracking & stats (premium)
│       ├── saved-passages.tsx # Bookmarked scripture passages (premium)
│       └── settings.tsx
├── components/
│   ├── TypewriterText.tsx # Sacred typewriter animation
│   ├── GlassMenu.tsx      # iOS liquid glass bottom sheet
│   ├── ShareDevotionalModal.tsx # Share devotional as image/text
│   ├── CompletionCelebration.tsx # Day/series completion animation
│   ├── ThemeTypeSelector.tsx # Theme and type selection UI
│   └── reading/           # Reading screen components
│       ├── DayMenu.tsx    # Day navigation menu
│       ├── ReadingBottomNav.tsx # Bottom navigation bar
│       └── DevotionalContent.tsx # Main devotional content renderer
├── constants/
│   ├── colors.ts          # Dark mode color system
│   ├── fonts.ts           # Typography configuration
│   ├── onboarding-questions.ts # Discovery question library
│   └── devotional-types.ts # Theme categories & devotional types
└── lib/
    ├── store.ts           # Zustand + AsyncStorage persistence
    ├── theme.tsx          # Theme provider with accent color support
    ├── useReadingFont.ts  # Reading font hook for premium font switching
    └── devotional-service.ts # Claude API integration
```

## Design System

**Colors**: Dark and light theme support with warm tones
- Dark: #0A0A0A background, warm off-white (#F5F0EB) text with opacity hierarchy
- Light: #FAF7F2 (warm cream) background, warm dark (#1C1710) text
- Accent: Warm gold (#C8A55C dark / #9A7B3C light) — used for progress bars, decorative lines, section labels, scripture references, and CTAs
- Elevated background: #141210 (dark) for cards and surfaces

**Typography**:
- Display: Instrument Serif (titles, drop caps, hero text)
- Body: Source Serif Pro (devotional text, reading content)
- Mono: JetBrains Mono (references, metadata, section labels)
- UI: Inter (buttons, labels, navigation)

**Signature Design Elements**:
- Gold accent line (1.5px) — appears on welcome, home, reading, completion, paywall screens
- Drop cap on devotional body text (first letter in display serif, accent color)
- Editorial left-border quotes (2px accent)
- Scripture references in monospace with accent color
- Animated progress bar with accent color fill

## Environment Variables

- `ANTHROPIC_API_KEY` - Claude API key (backend only, never exposed to client)
- `RESEND_API_KEY` - Resend API key (backend only, used for automatic bug-report emails)
- `BUG_REPORT_TO_EMAIL` - Destination inbox for automatic bug reports (defaults to `nicholasgalang@gmail.com`)
- `BUG_REPORT_FROM_EMAIL` - Sender identity for bug-report emails
- `EXPO_PUBLIC_VIBECODE_BACKEND_URL` - Backend server URL for API proxy

## Backend

The backend server (Hono + Bun) proxies all AI API calls to keep keys secure:
- `POST /api/generate/devotional` - Proxies devotional generation to Anthropic
- `POST /api/generate/adaptive-question` - Proxies adaptive question generation to Anthropic
- `POST /api/generate/journal-prompts` - Generates AI-powered follow-up journal reflection questions (premium)
- `POST /api/bug-report/email` - Sends bug report bundle + triage summary to support inbox via Resend

## Future Integrations

- **RevenueCat**: Set up in Payments tab for subscription handling
- **ElevenLabs**: Audio narration (not yet implemented)
