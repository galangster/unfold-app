# Unfold - Product Requirements Document (PRD)
## Comprehensive Specification for Swift Native Rebuild

**Version**: 2.0  
**Date**: 2025-02-25  
**Platform**: iOS, iPadOS, macOS, watchOS  
**Framework**: SwiftUI (Pure)  
**Backend**: AI API Integration (GLaD/Claude Haiku)  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Strategy](#2-platform-strategy)
3. [Design System](#3-design-system)
4. [Architecture Overview](#4-architecture-overview)
5. [User Flows](#5-user-flows)
6. [Feature Specifications](#6-feature-specifications)
7. [Data Models](#7-data-models)
8. [Backend Integration](#8-backend-integration)
9. [Monetization](#9-monetization)
10. [Widget & Complications](#10-widget--complications)
11. [Apple Watch](#11-apple-watch)
12. [Technical Implementation](#12-technical-implementation)

---

## 1. Executive Summary

### 1.1 App Philosophy
Unfold is a personalized devotional app that uses AI to craft custom spiritual content based on user context. The app creates a "spiritual director in your pocket" experience through:

- **Adaptive questioning** that adjusts to user needs (2-8 questions, confidence-based)
- **AI-generated devotionals** with literary quality (Wendell Berry meets Henri Nouwen)
- **Premium audio narration** with word-level highlighting (Cartesia TTS)
- **Streak-based engagement** with social sharing

### 1.2 Key Differentiators
1. **Not templated content** - Every devotional is unique and generated in real-time
2. **Deep personalization** - Uses user context (name, situation, emotions, study preferences)
3. **Editorial quality** - Avoids "AI slop" with distinctive typography and warm aesthetic
4. **Conversational onboarding** - Feels like talking to a spiritual director, not filling a form

### 1.3 Success Metrics
- Day 1 retention: Target 40%+
- Premium conversion: Target 5-8%
- Streak retention: 7-day streak = 60% 30-day retention
- Generation completion: >95% success rate

---

## 2. Platform Strategy

### 2.1 Platform Matrix

| Platform | Primary Use | Key Features | Technical Approach |
|----------|-------------|--------------|-------------------|
| **iOS** | Main experience | Full feature set, widgets | Native SwiftUI |
| **iPad** | Extended reading | Split View, Stage Manager support | Adaptive layouts |
| **Mac** | Deep study | Keyboard shortcuts, menu bar | Mac Catalyst with native menus |
| **Watch** | Quick engagement | Complications, glanceable content | WatchKit + SwiftUI |

### 2.2 Universal App Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SHARED CORE (Swift Package)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Data Models  │  │ Business     │  │ AI/Backend       │  │
│  │ (User,       │  │ Logic        │  │ Integration      │  │
│  │ Devotional)  │  │ (Generation, │  │ (GLaD API)       │  │
│  └──────────────┘  │ Confidence)  │  └──────────────────┘  │
│  ┌──────────────┐  └──────────────┘  ┌──────────────────┐  │
│  │ Sync Engine  │                      │ RevenueCat       │  │
│  │ (iCloud/     │                      │ (Subscription)   │  │
│  │ Sign In)     │                      └──────────────────┘  │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐           ┌────▼────┐          ┌────▼────┐
   │ iOS App │           │iPad App │          │ Mac App │
   │ SwiftUI │           │SwiftUI  │          │SwiftUI  │
   │         │           │Adaptive │          │+Menus   │
   └─────────┘           └─────────┘          └─────────┘
        │
   ┌────▼────┐
   │ Watch   │
   │ App     │
   │(watchOS)│
   └─────────┘
```

### 2.3 Device-Specific Considerations

**iPhone**
- Bottom sheet for audio player
- Swipe gestures for day navigation
- Haptic feedback throughout
- Safe area insets for notch/Dynamic Island

**iPad**
- Two-column layout in landscape (devotional list + reader)
- Popovers for settings/actions
- Keyboard shortcuts (Space = play/pause, ←/→ = day navigation)
- Drag and drop for sharing

**Mac**
- Menu bar: File, Edit, View, Devotional, Window, Help
- Toolbar with play/pause, bookmark, share
- Touch Bar support (play controls, day scrubber)
- Keyboard shortcuts fully mapped

**Apple Watch**
- Complications: Streak count, today's verse
- Glance: Quick read of current day's scripture
- Notifications: Daily reminder with scripture preview

---

## 3. Design System

### 3.1 Color Palette

#### Accent Themes (7 Options - Premium)
| Theme | Dark Mode | Light Mode | Use Case |
|-------|-----------|------------|----------|
| **Gold** (Default) | #C8A55C | #9A7B3C | Warm, traditional spiritual |
| **Ocean** | #5B9BD5 | #3A6FA0 | Calm, contemplative |
| **Rose** | #D4828F | #A8596A | Gentle, feminine |
| **Forest** | #6DAF7B | #4A8A5A | Growth, nature |
| **Lavender** | #9B8EC4 | #7568A6 | Mystical, creative |
| **Ember** | #D4895C | #A86840 | Passion, energy |
| **Slate** | #8A9BAE | #5E7185 | Modern, minimalist |

#### Dark Mode Colors
```swift
struct DarkColors {
    static let background = Color(#colorLiteral(red: 0.039, green: 0.039, blue: 0.039, alpha: 1))        // #0A0A0A
    static let backgroundPure = Color(#colorLiteral(red: 0, green: 0, blue: 0, alpha: 1))                  // #000000
    static let backgroundElevated = Color(#colorLiteral(red: 0.078, green: 0.071, blue: 0.063, alpha: 1)) // #141210
    
    static let text = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 1))               // #F5F0EB
    static let textMuted = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 0.6))
    static let textSubtle = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 0.4))
    static let textHint = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 0.25))
    
    static let inputBackground = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 0.05))
    static let buttonBackground = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 0.08))
    static let buttonBackgroundPressed = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 0.14))
    
    static let border = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 0.08))
    static let borderFocused = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 0.18))
    
    static let glassBackground = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 0.12))
    static let glassBorder = Color(#colorLiteral(red: 0.961, green: 0.941, blue: 0.922, alpha: 0.18))
}
```

#### Light Mode Colors
```swift
struct LightColors {
    static let background = Color(#colorLiteral(red: 0.98, green: 0.969, blue: 0.949, alpha: 1))         // #FAF7F2
    static let backgroundPure = Color(#colorLiteral(red: 1, green: 1, blue: 1, alpha: 1))                  // #FFFFFF
    static let backgroundElevated = Color(#colorLiteral(red: 1, green: 1, blue: 1, alpha: 1))             // #FFFFFF
    
    static let text = Color(#colorLiteral(red: 0.11, green: 0.09, blue: 0.063, alpha: 1))                 // #1C1710
    static let textMuted = Color(#colorLiteral(red: 0.11, green: 0.09, blue: 0.063, alpha: 0.62))
    static let textSubtle = Color(#colorLiteral(red: 0.11, green: 0.09, blue: 0.063, alpha: 0.42))
    
    static let inputBackground = Color(#colorLiteral(red: 0.11, green: 0.09, blue: 0.063, alpha: 0.04))
    static let border = Color(#colorLiteral(red: 0.11, green: 0.09, blue: 0.063, alpha: 0.07))
}
```

### 3.2 Typography System

#### Font Families (Premium Feature - User Selectable)

| Font | Style | Use Case |
|------|-------|----------|
| **Instrument Serif** (Default) | Elegant serif | Titles, Scripture text |
| **EB Garamond** | Classic serif | Traditional reading experience |
| **Lora** | Modern serif | Contemporary spiritual content |
| **Crimson Text** | Literary serif | Poetic/prophetic content |
| **Merriweather** | Readable serif | Extended reading sessions |
| **Inter** | Sans-serif | UI elements, minimal aesthetic |

#### Type Scale
```swift
struct Typography {
    // Display (Scripture, Day Titles)
    static let displayLarge = Font.system(size: 36, weight: .regular, design: .serif)
    static let displayMedium = Font.system(size: 32, weight: .regular, design: .serif)
    static let displaySmall = Font.system(size: 28, weight: .regular, design: .serif)
    
    // Scripture Text
    static let scriptureLarge = Font.system(size: 19, weight: .regular, design: .serif)
    static let scriptureMedium = Font.system(size: 17, weight: .regular, design: .serif)
    static let scriptureSmall = Font.system(size: 15, weight: .regular, design: .serif)
    
    // Body Text (Devotional Content)
    static let bodyLarge = Font.system(size: 20, weight: .regular, design: .default)
    static let bodyMedium = Font.system(size: 17, weight: .regular, design: .default)
    static let bodySmall = Font.system(size: 15, weight: .regular, design: .default)
    
    // UI Labels
    static let uiRegular = Font.system(size: 16, weight: .regular)
    static let uiMedium = Font.system(size: 16, weight: .medium)
    static let uiSemiBold = Font.system(size: 16, weight: .semibold)
    
    // Monospace (User Input)
    static let monoRegular = Font.system(size: 16, weight: .regular, design: .monospaced)
}
```

#### Font Size Options (User Preference)
- **Small**: Body 15pt, Scripture 15pt, Title 28pt
- **Medium** (Default): Body 17pt, Scripture 17pt, Title 32pt
- **Large**: Body 20pt, Scripture 19pt, Title 36pt

### 3.3 Spacing System

```swift
struct Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
    static let xxl: CGFloat = 48
    
    // Section spacing
    static let section: CGFloat = 40
    static let screenPadding: CGFloat = 20
}
```

### 3.4 Animation System

#### Timing Functions
```swift
struct AnimationTiming {
    // Standard UI transitions
    static let standard = Animation.easeInOut(duration: 0.25)
    
    // Emphasis (celebrations, important actions)
    static let emphasis = Animation.spring(response: 0.4, dampingFraction: 0.7)
    
    // Typewriter effect (question text)
    static let typewriterDelay: Double = 0.03 // per character
    
    // Page transitions
    static let pageTransition = Animation.easeOut(duration: 0.3)
    
    // Haptic feedback
    static let hapticLight = UIImpactFeedbackGenerator(style: .light)
    static let hapticMedium = UIImpactFeedbackGenerator(style: .medium)
    static let hapticSuccess = UINotificationFeedbackGenerator()
}
```

#### Animation Patterns
1. **Page transitions**: Slide from right, fade in
2. **Button presses**: Scale 0.97, opacity 0.8
3. **Streak celebration**: Bounce + confetti
4. **Audio word highlighting**: Smooth scroll to word with fade highlight
5. **Question appearance**: Typewriter character-by-character reveal

---

## 4. Architecture Overview

### 4.1 App Architecture (Clean Architecture)

```
┌────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Views       │ │ ViewModels  │ │ States      │ │ Animations│ │
│  │ (SwiftUI)   │ │ (Observable)│ │ (@State,    │ │ (Matched  │ │
│  │             │ │             │ │ @Published) │ │ Geometry) │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                          DOMAIN LAYER                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Use Cases   │ │ Repositories│ │ Entities    │ │ Domain    │ │
│  │ (Generate   │ │ Protocols   │ │ (User,      │ │ Services  │ │
│  │  Devotional)│ │             │ │ Devotional) │ │           │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Local DB    │ │ Cloud Sync  │ │ API Clients │ │ Caching   │ │
│  │ (Core Data/ │ │ (iCloud/    │ │ (GLaD,      │ │ (Images,  │ │
│  │  SwiftData) │ │  Sign In)   │ │ RevenueCat) │ │  Audio)   │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 State Management

**Primary Store**: `@Observable` class (SwiftUI native) or `ObservableObject`

```swift
@Observable
class AppState {
    // User
    var user: UserProfile?
    
    // Current session
    var currentDevotional: Devotional?
    var currentDay: Int = 1
    
    // Navigation
    var navigationPath = NavigationPath()
    
    // Generation state
    var isGenerating: Bool = false
    var generationProgress: String = ""
    
    // Audio state
    var isPlaying: Bool = false
    var audioProgress: Double = 0
}
```

**Persistence Strategy**:
- SwiftData for structured data (devotionals, bookmarks, highlights)
- UserDefaults for preferences (theme, font size, settings)
- Keychain for sensitive data (RevenueCat purchaser info)
- File system for audio files (cached)

### 4.3 Dependency Injection

```swift
// Container pattern
struct DIContainer {
    let devotionalService: DevotionalServiceProtocol
    let audioService: AudioServiceProtocol
    let subscriptionService: SubscriptionServiceProtocol
    let syncService: SyncServiceProtocol
    
    static let shared = DIContainer(
        devotionalService: DevotionalService(),
        audioService: CartesiaAudioService(),
        subscriptionService: RevenueCatService(),
        syncService: CloudKitSyncService()
    )
}

// Environment injection
struct ServicesKey: EnvironmentKey {
    static let defaultValue = DIContainer.shared
}

extension EnvironmentValues {
    var services: DIContainer {
        get { self[ServicesKey.self] }
        set { self[ServicesKey.self] = newValue }
    }
}
```

---

## 5. User Flows

### 5.1 Onboarding Flow (Detailed)

```
┌────────────────────────────────────────────────────────────────────────┐
│                         ONBOARDING SEQUENCE                             │
└────────────────────────────────────────────────────────────────────────┘

[Screen 1] Name Input
├─ Question: "What's your name?"
├─ Subtext: "Just your first name is perfect."
├─ Input: Single line text, max 30 chars
└─ Validation: Non-empty

[Screen 2] Bible Translation
├─ Question: "Which Bible translation do you prefer?"
├─ Options: NIV, ESV, KJV, NLT (scrollable cards)
├─ Default: NIV
└─ Persistence: Saved to user profile

[Screen 3] About Me
├─ Question: "Tell me about yourself."
├─ Subtext: "The more you share, the more personal your devotionals become."
├─ Input: Multi-line text, placeholder provided
├─ Speech-to-Text: Available (premium feature indicator)
└─ Validation: Min 10 chars recommended

[Screen 4] Path Selection (EDITORIAL LAYOUT)
├─ Three options with varied visual treatment:
│  ├─ "A theme or topic" (Larger, icon right, asymmetric)
│  ├─ "A style of study" (Medium, icon left, balanced)
│  └─ "Just guide me" (Smaller, muted, text-focused)
└─ Selection determines next path

[Branch A] Theme Selection (if "theme" chosen)
├─ Display: Pill-shaped buttons, grouped by category
│  ├─ Inner Life: trust, identity, rest, presence
│  ├─ Heart & Emotion: healing, joy, gratitude, lament, hope
│  └─ Growth & Action: purpose, courage, conviction, surrender, discipline, justice, wonder
├─ Selection: 1-3 themes
├─ Continue button appears when ≥1 selected
└─ Max 3 themes

[Branch B] Study Type Selection (if "study" chosen)
├─ Featured (full width, prominent):
│  ├─ Personal Journey
│  ├─ Book Study
│  └─ Character Study
├─ Grid (2-column, compact):
│  ├─ Psalm Journey, Beatitudes, Fruit of Spirit
│  ├─ Lord's Prayer, Names of God, Seasons
│  └─ Parables
└─ If Book/Character selected → Subject Selection

[Branch C] Direct to Adaptive (if "guided" chosen)
└─ Skip to adaptive questions immediately

[Subject Selection] (Conditional)
├─ Book Study: List of Bible books with descriptions
├─ Character Study: List of biblical characters
└─ Continue to adaptive questions

[Adaptive Discovery] (2-8 questions, dynamic)
├─ Opening question always: "What's been on your heart lately?" (or study-specific)
├─ Subsequent questions generated by AI based on:
│  ├─ Confidence scores (spiritual, emotional, practical, topic)
│  ├─ Previous answers
│  └─ Selected study type/theme
├─ Exit when:
│  ├─ Confidence ≥ 75/100 AND questions ≥ 2
│  ├─ Questions = 8 (hard cap)
│  └─ User manually continues
└─ Progress shown as percentage, not "X of Y"

[Screen 5] Reading Duration
├─ Options: 5 min, 15 min, 30 min
├─ Dynamic options based on study type
└─ Affects content length in generation

[Screen 6] Series Length
├─ Options: 3, 7, 14, 30 days
└─ Affects batch generation plan

[Screen 7] Reminder Time (Optional)
├─ Options: Early morning, Morning, Midday, Evening, Night
├─ Skippable
└─ Requires notification permission

[Completion] Generating Screen
├─ Shows progress: "Reading your story...", "Selecting scripture...", "Writing day 1..."
├─ Day 1 ready first (~30 seconds)
├─ Remaining days generate in background
└─ Auto-navigates to reading when Day 1 ready
```

### 5.2 Main App Flow

```
[Home Screen]
├─ Current devotional card (large, prominent)
├─ Streak box (7-day visualization)
├─ Quick actions: Continue reading, Start new
└─ Past devotionals section

[Reading Screen]
├─ Scripture section (prominent, accent border)
├─ Body text (scrollable)
├─ Bottom nav:
│  ├─ Home, Audio, Bookmark, Share, Journal
│  └─ Day navigation (prev/next arrows)
├─ Gestures:
│  ├─ Swipe left: Next day
│  ├─ Swipe right: Previous day
│  └─ Pull up: Show actions
└─ Completion celebration when finished

[Journal Screen]
├─ Reflection questions (from devotional)
├─ Free-form journal entry
├─ Auto-saves as draft
└─ Linked to specific day

[Settings Screen]
├─ Profile editing
├─ Preferences (font, theme, tone, depth)
├─ Premium features (if subscribed)
│  ├─ Accent color selection
│  ├─ Reading font selection
│  ├─ Voice selection (audio)
│  └─ Wallpaper styles
├─ Notifications
├─ Data export/delete
└─ About/Legal
```

---

## 6. Feature Specifications

### 6.1 Devotional Generation System

#### Confidence-Based Adaptive Questions

**Algorithm Overview**:
```swift
struct ConfidenceScorer {
    func calculate(qa: [QA]) -> ConfidenceResult {
        // Four dimensions, each 0-25 points
        let spiritual = scoreSpiritualContext(qa)      // Keywords like god, jesus, faith
        let emotional = scoreEmotionalClarity(qa)      // Feeling words, explanation depth
        let practical = scorePracticalNeed(qa)         // Need/want/help mentions
        let topic = scoreTopicDepth(qa)                // Specificity, length
        
        let total = spiritual + emotional + practical + topic
        let gap = identifyBiggestGap([spiritual, emotional, practical, topic])
        
        return ConfidenceResult(total: total, gap: gap)
    }
    
    func shouldExit(qa: [QA], confidence: ConfidenceResult) -> Bool {
        return qa.count >= 2 && confidence.total >= 75 
            || qa.count >= 8 // Hard cap
    }
}
```

**Question Pools**:
1. **spiritual_opening**: "What drew you to this study/theme?" (explore motivation)
2. **emotional_exploration**: "What does that feel like underneath?" (go deeper)
3. **practical_need**: "What would help right now?" (identify desire)
4. **topic_specific**: Connect to chosen study type/theme
5. **clarification**: Follow-up on vague answers
6. **summarization**: "So you're looking for..." (confirm understanding)

**AI Prompt Structure**:
```
System: You are a warm spiritual guide having a conversation.
Context: User selected {studyType}, previously answered {qaHistory}
Confidence: {scores}/100, biggest gap is {gap}
Task: Generate ONE follow-up question that targets the gap
Rules:
- Must reference study choice if applicable
- Never start with "And"
- Open-ended, not leading
- Subtext should be warm and inviting
```

#### Batch Generation Strategy

**Goal**: Day 1 ready in < 30 seconds, remaining days in background

```swift
struct GenerationBatcher {
    func createPlan(totalDays: Int, readingDuration: Int) -> [Batch] {
        // Always generate Day 1 separately for fast time-to-read
        var batches = [Batch(start: 1, end: 1)]
        
        // Remaining days in appropriate batch sizes
        let batchSize = readingDuration == 30 ? 2 
                       : readingDuration == 15 ? 5 
                       : 7
        
        var current = 2
        while current <= totalDays {
            let end = min(current + batchSize - 1, totalDays)
            batches.append(Batch(start: current, end: end))
            current = end + 1
        }
        
        return batches
    }
}
```

**Retry Strategy**:
- 3 retry levels with progressively simpler prompts
- Level 0: Full personalization
- Level 1: Reduced context, focus on quality writing
- Level 2: Minimal context, functional generation

### 6.2 Audio Player System

#### Features
- **Streaming TTS**: Cartesia API with word-level timestamps
- **Word Highlighting**: Synchronized scroll and highlight
- **Playback Controls**: Play/pause, skip ±15s, speed (0.5x-2x)
- **Background Audio**: Works with screen off, controls in Control Center
- **Download for Offline**: Premium feature

#### Technical Spec
```swift
protocol AudioService {
    func stream(content: String, voice: Voice) async throws -> AudioStream
    func play() async
    func pause() async
    func seek(to: TimeInterval) async
    func setSpeed(_ speed: Float) async
    
    var wordTimestamps: [WordTimestamp] { get }
    var currentWordIndex: Int { get }
    var progress: Double { get }
}

struct WordTimestamp {
    let word: String
    let startTime: TimeInterval
    let endTime: TimeInterval
    let index: Int
}
```

### 6.3 Streak System

#### Mechanics
- **Daily Streak**: Read at least one devotional per day
- **Weekend Amnesty**: Option to exclude weekends (user preference)
- **Streak Freezes**: Save streak if miss a day (premium, limited)
- **Longest Streak**: All-time record tracking

#### Visual Representation
- 7-day view showing Mon-Sun
- Filled circles for completed days
- Today highlighted with accent border
- Flame icon with current count

#### Engagement Triggers
- Push notification before streak breaks
- Celebration animation on milestone (7, 30, 100 days)
- Social sharing of streak achievements

### 6.4 Highlighting & Bookmarks

#### Highlighting
- **Creation**: Long-press on text → select range → choose color
- **Colors**: 4 options (Yellow, Green, Blue, Pink)
- **Storage**: Saved with devotional ID, day number, range
- **Review**: All highlights accessible from settings

#### Bookmarks
- **Quick Bookmark**: Tap bookmark icon on any day
- **Note**: Optional note attached to bookmark
- **Access**: From home screen or reading view

### 6.5 Social Sharing

#### Shareable Content
1. **Quote Cards**: Extracted quotable lines with elegant typography
2. **Streak Milestones**: Celebration graphics
3. **Devotional Completion**: "I just finished..." cards

#### Formats
- Image (for Instagram Stories, etc.)
- Text (for messaging apps)
- Link (deep link to app)

### 6.6 Journal System

#### Features
- **Reflection Questions**: Pre-populated from devotional
- **Free Writing**: Open-ended entry per day
- **Auto-save**: Drafts preserved automatically
- **History**: Browse past journal entries
- **Export**: PDF or text export (premium)

---

## 7. Data Models

### 7.1 Core Entities

```swift
// MARK: - User
struct UserProfile: Codable, Identifiable {
    let id: String
    var name: String
    var aboutMe: String
    
    // Preferences
    var bibleTranslation: BibleTranslation
    var fontSize: FontSize
    var themeMode: ThemeMode
    var accentTheme: AccentThemeId
    var readingFont: ReadingFontId
    var writingStyle: WritingStylePreferences
    
    // Onboarding
    var hasCompletedOnboarding: Bool
    var hasCompletedStyleOnboarding: Bool
    
    // Premium
    var isPremium: Bool
    var subscriptionExpiry: Date?
    
    // Streak
    var streakCount: Int
    var longestStreak: Int
    var lastReadDate: Date?
    var streakFreezes: Int
    var weekendAmnesty: Bool
    
    // Next devotional preferences
    var selectedTheme: ThemeCategory?
    var selectedType: DevotionalType?
    var selectedStudySubject: String?
}

// MARK: - Devotional
struct Devotional: Codable, Identifiable {
    let id: String
    var title: String
    var totalDays: Int
    var currentDay: Int
    var days: [DevotionalDay]
    let createdAt: Date
    
    // Context used for generation
    var userContext: UserContextSnapshot
    var themeCategory: ThemeCategory?
    var devotionalType: DevotionalType?
    var studySubject: String?
    
    // Generation state
    var isFullyGenerated: Bool
    var generationError: String?
}

struct DevotionalDay: Codable, Identifiable {
    let id: String
    let dayNumber: Int
    var title: String
    var scriptureReference: String
    var scriptureText: String
    var bodyText: String
    var quotableLine: String
    
    // Enhanced content
    var quotes: [Quote]?
    var crossReferences: [CrossReference]?
    var reflectionQuestions: [String]?
    var contextNote: String?
    var closingPrayer: String?
    
    // Reading state
    var isRead: Bool
    var readAt: Date?
}

// MARK: - Supporting Types
struct Quote: Codable {
    let text: String
    let author: String
}

struct CrossReference: Codable {
    let reference: String
    let text: String
}

struct Highlight: Codable, Identifiable {
    let id: String
    let devotionalId: String
    let dayNumber: Int
    let range: NSRange
    let color: HighlightColor
    let createdAt: Date
}

struct Bookmark: Codable, Identifiable {
    let id: String
    let devotionalId: String
    let dayNumber: Int
    var note: String?
    let createdAt: Date
}

struct JournalEntry: Codable, Identifiable {
    let id: String
    let devotionalId: String
    let dayNumber: Int
    var content: String
    let questions: [String]
    var lastModified: Date
}
```

### 7.2 Enums

```swift
enum BibleTranslation: String, Codable, CaseIterable {
    case niv = "NIV"
    case esv = "ESV"
    case kjv = "KJV"
    case nlt = "NLT"
}

enum FontSize: String, Codable {
    case small, medium, large
}

enum ThemeMode: String, Codable {
    case light, dark, system
}

enum AccentThemeId: String, Codable, CaseIterable {
    case gold, ocean, rose, forest, lavender, ember, slate
}

enum ReadingFontId: String, Codable, CaseIterable {
    case sourceSerif = "source-serif"
    case garamond = "garamond"
    case lora = "lora"
    case crimson = "crimson"
    case merriweather = "merriweather"
    case inter = "inter"
}

enum WritingTone: String, Codable {
    case warm, direct, poetic
}

enum ContentDepth: String, Codable {
    case simple, balanced, theological
}

enum FaithBackground: String, Codable {
    case new, growing, mature
}

enum ThemeCategory: String, Codable, CaseIterable {
    case trust, identity, rest, presence
    case healing, joy, gratitude, lament, hope
    case purpose, courage, conviction, surrender, discipline, justice, wonder
}

enum DevotionalType: String, Codable, CaseIterable {
    case personal = "personal"
    case bookStudy = "book_study"
    case characterStudy = "character_study"
    case psalmJourney = "psalm_journey"
    case beatitudes = "beatitudes"
    case fruitOfSpirit = "fruit_of_spirit"
    case lordsPrayer = "lords_prayer"
    case namesOfGod = "names_of_god"
    case seasons = "seasons"
    case parables = "parables"
}

enum HighlightColor: String, Codable {
    case yellow, green, blue, pink
}
```

---

## 8. Backend Integration

### 8.1 GLaD API Integration

**Endpoint**: `/api/generate/devotional`  
**Method**: POST  
**Model**: Claude Haiku (fast, cost-effective)  
**Timeout**: 180 seconds  
**Max Tokens**: 12,000

**Request Structure**:
```json
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 12000,
  "system": "[Detailed system prompt with writing persona]",
  "messages": [
    {
      "role": "user",
      "content": "[User prompt with context, theme, scripture guidance]"
    }
  ]
}
```

**Response Handling**:
- Parse JSON from response
- Validate structure (title, days array)
- Map to Devotional model
- Store locally

**Fallback Strategy**:
1. Try GLaD API
2. If timeout/failure, retry with simplified prompt
3. If still failing, show error with retry option
4. Queue for background retry

### 8.2 Cartesia Audio API

**Endpoint**: `/api/audio/stream`  
**Features**:
- Word-level timestamps
- Multiple voices (different personas)
- Streaming playback
- Caching for offline

### 8.3 RevenueCat Integration

**Products**:
- Monthly subscription
- Annual subscription (with discount)

**Entitlements**:
- Unlimited devotionals
- Audio narration
- Custom themes/fonts
- Advanced features

**Implementation**:
```swift
protocol SubscriptionService {
    func getOfferings() async throws -> Offerings
    func purchase(_ package: Package) async throws -> PurchaseResult
    func restorePurchases() async throws -> Bool
    func checkSubscriptionStatus() async -> Bool
}
```

---

## 9. Monetization

### 9.1 Freemium Model

**Free Tier**:
- 1 active devotional at a time
- 5-minute readings only
- Basic themes (Gold only)
- Basic fonts (2 options)
- No audio narration
- No widgets
- No iCloud sync

**Premium Tier ($X.99/month or $XX.99/year)**:
- Unlimited devotionals
- All reading durations (5/15/30 min)
- All accent themes (7 colors)
- All reading fonts (6 options)
- Expressive AI narration
- Widgets & Live Activities
- iCloud sync across devices
- Advanced journal features
- Export/print devotionals

### 9.2 Paywall Strategy

**Triggers**:
- Try to create 2nd devotional (free limit reached)
- Try to select 30-minute reading (free limited to 5 min)
- Try to change theme/font (premium feature)
- Try to enable audio (premium feature)

**Paywall Design**:
- Full-screen modal
- Feature list with checkmarks
- Monthly/Yearly toggle
- Clear pricing
- Restore purchases option
- Close button (not aggressive)

### 9.3 Retention Mechanics

- **7-day free trial** for annual subscriptions
- **Streak rewards**: Milestone celebrations
- **Re-engagement**: Push notifications for lapsed users
- **Social proof**: Share completed devotionals

---

## 10. Widget & Complications

### 10.1 Home Screen Widgets

**Small Widget (1x1)**:
- Current streak count
- Flame icon with number

**Medium Widget (2x1)**:
- Today's scripture reference
- Tap to open app

**Large Widget (2x2)**:
- Full verse of the day
- Beautiful typography
- Accent color border

**Lock Screen Widgets (iOS 16+)**:
- Streak count (circular)
- Today's verse (rectangular)
- Next reading time (inline)

### 10.2 Live Activities

**During Generation**:
- Shows progress: "Writing Day 1..."
- Cancel button
- Tap opens app

**During Audio Playback**:
- Play/pause controls
- Progress bar
- Current scripture reference

### 10.3 Apple Watch Complications

**Graphic Circular**:
- Streak ring progress
- Flame icon center

**Graphic Rectangular**:
- "Day X of Y"
- Today's verse reference

**Graphic Corner**:
- Streak count only
- Accent color

**Modular Small**:
- Icon + streak number

---

## 11. Apple Watch

### 11.1 App Structure

**Main View**:
- Current devotional list
- Tap to see day summary
- Checkmark if completed

**Day Detail**:
- Scripture reference
- Brief excerpt (first sentence)
- "Read on iPhone" button
- Mark as read

**Complications**:
- Streak display
- Today's verse glance

### 11.2 Notifications

**Daily Reminder**:
- Scripture preview
- "Tap to read full devotional"
- Deep link to reading screen

**Streak Warning**:
- "You're about to lose your 5-day streak!"
- Quick open button

### 11.3 HealthKit Integration (Future)

- Mindfulness minutes logged
- Reading streak as activity
- Breathing exercise integration

---

## 12. Technical Implementation

### 12.1 Project Structure

```
Unfold/
├── App/
│   ├── UnfoldApp.swift
│   └── Info.plist
├── Core/
│   ├── Models/
│   ├── Services/
│   └── Utilities/
├── Features/
│   ├── Onboarding/
│   ├── Reading/
│   ├── Journal/
│   ├── Settings/
│   └── Widgets/
├── DesignSystem/
│   ├── Colors.swift
│   ├── Typography.swift
│   ├── Components/
│   └── Animations/
├── Resources/
│   ├── Fonts/
│   ├── Assets.xcassets/
│   └── Localizations/
└── UnfoldWatch/
    ├── App/
    └── Complications/
```

### 12.2 Key Frameworks

- **SwiftUI**: UI framework (100%)
- **SwiftData**: Local persistence
- **CloudKit**: Sync (premium)
- **RevenueCat**: Subscriptions
- **AVFoundation**: Audio playback
- **WidgetKit**: Home screen widgets
- **ActivityKit**: Live Activities
- **WatchConnectivity**: Watch pairing

### 12.3 Performance Targets

- **Launch time**: < 2 seconds
- **Time to interactive**: < 3 seconds
- **Day 1 generation**: < 30 seconds
- **Audio start**: < 3 seconds
- **Scroll FPS**: 60fps
- **Memory usage**: < 200MB typical

### 12.4 Accessibility

- VoiceOver support throughout
- Dynamic Type support
- Reduced Motion support
- High Contrast support
- Switch Control support

### 12.5 Security

- Keychain for sensitive data
- Certificate pinning for API
- On-device text processing (no PII to analytics)
- GDPR/CCPA compliant data handling

---

## Appendix A: API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate/devotional` | POST | Generate devotional series |
| `/api/generate/adaptive-question` | POST | Generate next question |
| `/api/audio/stream` | POST | Stream TTS audio |
| `/api/user/sync` | POST | Sync user data |

## Appendix B: Notification Types

| Type | Trigger | Content |
|------|---------|---------|
| Daily Reminder | Scheduled time | Scripture preview + open prompt |
| Streak Warning | 8pm if not read | Streak at risk warning |
| Generation Complete | Background done | Day ready notification |
| Re-engagement | 7 days inactive | "We miss you" + new feature highlight |

## Appendix C: Analytics Events

| Event | Properties |
|-------|------------|
| `onboarding_started` | source |
| `onboarding_completed` | duration, path |
| `devotional_generated` | length, duration, success |
| `day_read` | day_number, devotional_id |
| `streak_milestone` | count |
| `premium_subscribed` | plan, source |
| `audio_played` | duration, completion_rate |

---

**End of PRD**
