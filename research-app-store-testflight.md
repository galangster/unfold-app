# App Store Connect & TestFlight Review/Approval Process — Deep Research Report

**Date**: 2026-03-14
**Context**: Unfold App (AI Devotional) — Expo SDK 55, React Native 0.83, RevenueCat subscriptions
**Purpose**: Comprehensive guide for smooth TestFlight and App Store submission

---

## Table of Contents

1. [TestFlight Internal vs External Testing](#1-testflight-internal-vs-external-testing)
2. [Beta Review Requirements & Timeline](#2-beta-review-requirements--timeline)
3. [Required Metadata & Configuration](#3-required-metadata--configuration)
4. [Privacy Policy & Nutrition Labels](#4-privacy-policy--nutrition-labels)
5. [Export Compliance (Encryption)](#5-export-compliance-encryption)
6. [App Store Review Guidelines — Key Sections](#6-app-store-review-guidelines--key-sections)
7. [AI App-Specific Requirements (2025-2026)](#7-ai-app-specific-requirements-2025-2026)
8. [Bible/Religious App Considerations](#8-biblereligious-app-considerations)
9. [In-App Purchase & Subscription Requirements](#9-in-app-purchase--subscription-requirements)
10. [Common Rejection Reasons & How to Avoid Them](#10-common-rejection-reasons--how-to-avoid-them)
11. [Expo/React Native Specific Gotchas](#11-exporeact-native-specific-gotchas)
12. [2025-2026 Guideline Changes](#12-2025-2026-guideline-changes)
13. [Pre-Submission Checklist for Unfold](#13-pre-submission-checklist-for-unfold)
14. [Sources](#14-sources)

---

## 1. TestFlight Internal vs External Testing

### Internal Testing
- **Limit**: Up to 100 testers per app
- **Who**: Must be App Store Connect team members (Admin, App Manager, Developer, Marketing, or Sales roles)
- **Review**: NO beta app review required — builds available immediately after processing (minutes to ~1 hour)
- **Access**: Testers get access to every build uploaded
- **Best for**: Team members, immediate iteration, no waiting

### External Testing
- **Limit**: Up to 10,000 testers per app
- **Who**: Anyone — invited via email or public link (no Apple Developer account needed)
- **Review**: YES — first build requires full Beta App Review (subsequent builds may skip review)
- **Timeline**: First review typically 24-48 hours; subsequent builds often a few hours to 24 hours
- **Groups**: Can organize testers into groups with different builds
- **Public links**: Can generate shareable links; can cap tester count

### Key Differences Summary

| Aspect | Internal | External |
|--------|----------|----------|
| Tester limit | 100 | 10,000 |
| App Review required | No | Yes (first build) |
| Must be ASC member | Yes | No |
| Build availability | Immediate | After review |
| Public link support | No | Yes |

### Build Duration
- Each build is available for testing for **90 days** from upload
- After 90 days, the build auto-expires
- If submitted to App Store without expiring, testers retain access even after public release

### Recommendation for Unfold
**Start with internal testing** (no review needed) for the team. When ready for broader TestFlight distribution, submit for external review. The first external build triggers Beta App Review — make it count.

---

## 2. Beta Review Requirements & Timeline

### What Beta App Review Checks
Beta App Review is a "mini-review" that verifies:
- App doesn't crash on launch
- App follows App Review Guidelines (same as full App Store review)
- No placeholder content or broken flows
- Privacy policy is provided
- Export compliance is declared

### Current Review Times (2025-2026)
- **First external build**: 24-48 hours (sometimes faster, sometimes longer)
- **Subsequent builds**: A few hours to 24 hours
- **Delays reported**: Some developers in mid-2025 reported 3-10 day waits (especially macOS)
- **Track live times**: https://www.runway.team/appreviewtimes

### What Triggers a New Review
- First build for external testers: always reviewed
- Subsequent builds: may or may not be reviewed (Apple decides)
- Significant changes to beta build should be resubmitted

### Tips for Fast Approval
1. Submit during weekdays (Apple reviewers work business hours, though global)
2. Provide clear, complete beta test information
3. Include demo credentials if login is required
4. Don't submit on Friday afternoon — you may wait through the weekend
5. Ensure the app doesn't crash on first launch (this is an instant rejection)

---

## 3. Required Metadata & Configuration

### For TestFlight (External Testing)

**Required fields:**
- Beta App Description (what the beta version offers)
- What to Test (explanation of features testers should focus on)
- Feedback Email (where testers send feedback)
- Beta App Review Information (notes for the reviewer)
- Privacy Policy URL
- Contact Information
- Demo Account (if login required)

**Optional but recommended:**
- Screenshots (pulled from approved App Store version if available)
- App category

### For App Store Submission

**Required fields:**
- App Name (max 30 characters)
- Subtitle (max 30 characters)
- Description (4000 characters max)
- Keywords (100 characters max, comma-separated)
- What's New (for updates)
- Support URL
- Marketing URL (optional)
- Privacy Policy URL (REQUIRED)
- Category (primary required, secondary optional)
- Age Rating (complete questionnaire — see updated 2025 tiers below)
- Screenshots (at least one set for each required device size)
- App Icon (1024x1024, no alpha/transparency)
- Build (uploaded via Xcode or EAS)
- Pricing & Availability
- App Privacy details (nutrition labels)
- Contact Information for App Review
- Demo Account credentials (if app requires login)
- Notes for Review

### Age Rating Updates (2025)
Apple introduced new age tiers in 2025:
- **4+** (no objectionable content)
- **9+** (mild content)
- **13+** (NEW — moderate content)
- **16+** (NEW — mature content)
- **18+** (NEW — adult content)

The old 12+ and 17+ ratings have been replaced. All developers must respond to the updated age-rating questionnaire by **January 31, 2026**.

**For Unfold**: A devotional app with no violence, gambling, or mature content will likely be **4+**. If AI-generated content could include mature themes, consider **9+** or **13+** and implement appropriate content safeguards.

### Screenshots Requirements
- iPhone 6.9" display (required): 1320 x 2868 or 2868 x 1320
- iPhone 6.3" display (required): 1206 x 2622 or 2622 x 1206
- iPad 13" display (if supporting iPad): 2064 x 2752 or 2752 x 2064
- Format: PNG or JPEG, no alpha
- Min 3 screenshots, max 10 per localization

---

## 4. Privacy Policy & Nutrition Labels

### Privacy Policy Requirements

**A privacy policy URL is REQUIRED for:**
- All new App Store submissions
- All TestFlight external testing
- Must be accessible both in App Store Connect metadata AND within the app

**The privacy policy must include:**
- What data the app collects
- How data is collected
- How data is used
- Third parties data is shared with (especially AI services — see Section 7)
- Data retention and deletion policies
- How users can revoke consent or request deletion
- Contact information for privacy questions

**For Unfold specifically, disclose:**
- User's personal story/struggles (collected during onboarding)
- Email address (if collected)
- Usage data / analytics
- Data sent to AI providers (Grok/xAI, Anthropic/Claude) for devotional generation
- Data sent to Cartesia for TTS
- Firebase Analytics / Crashlytics data
- RevenueCat purchase data

### App Privacy Nutrition Labels

In App Store Connect, you must answer a questionnaire about data collection. Categories include:

| Data Type | Applies to Unfold? |
|-----------|-------------------|
| Contact Info (email) | Yes, if collecting email |
| User Content (text input) | Yes — onboarding responses, journal entries |
| Usage Data | Yes — app interaction analytics |
| Diagnostics (crash data) | Yes — if using Crashlytics or expo-updates |
| Identifiers (device ID) | Possibly — depends on analytics SDK |
| Purchases | Yes — RevenueCat tracks purchases |
| Location | No (unless added later) |
| Health & Fitness | No |

**Key distinction**: Data processed ONLY on-device does not need to be declared as "collected." Data sent to external servers (including AI APIs) DOES.

**Important**: Apple now actively verifies privacy labels against actual app behavior using automated scanning. Inaccurate labels can trigger rejection.

### Account Deletion Requirement
If your app allows account creation, you MUST provide in-app account deletion. This has been enforced since June 2022.
- Must be initiated from within the app (not just "email us")
- Must actually delete data, not just deactivate
- Regulated industries (finance, healthcare) get an exception for additional verification flows

**For Unfold**: If using Firebase Auth (Apple Sign In, anonymous auth), you need a "Delete Account" option in settings that calls Firebase's delete user API and removes associated data.

---

## 5. Export Compliance (Encryption)

### The Question
Every upload to App Store Connect triggers: "Does your app use encryption?"

### For Most Apps (Including Unfold)
If your app ONLY uses:
- HTTPS/TLS for network calls (URLSession, fetch, axios)
- Standard iOS encryption APIs for data at rest

Then your app uses **exempt encryption** and you should answer:
- "Does your app use encryption?" → **Yes**
- "Does your app qualify for any exemptions?" → **Yes**
- Select exemption: *"(b) Limited to intellectual property and copyright protection"* or *"(d) Authentication, digital signature, or decryption of data"*

### Expo Configuration
Add to `app.json` to skip the compliance dialog on every upload:

```json
{
  "expo": {
    "ios": {
      "config": {
        "usesNonExemptEncryption": false
      }
    }
  }
}
```

This sets `ITSAppUsesNonExemptEncryption` to `NO` in Info.plist, telling Apple your app only uses exempt encryption.

**Note**: There's a known React Native issue where `pod install` can remove manually-added Info.plist entries. The Expo config approach above is the reliable method.

### Annual Self-Classification Report
If your app uses HTTPS (which Unfold does), you are technically required to submit a **year-end self-classification report** to the US Bureau of Industry and Security (BIS). This is a bureaucratic requirement that many indie developers overlook, but it exists. File by February 1 each year.

---

## 6. App Store Review Guidelines — Key Sections

### Guideline 1.1 — Safety: Objectionable Content
- No offensive, insensitive, upsetting, or mean-spirited content
- **1.1.1**: No defamatory or discriminatory content about religion, race, gender, etc.
- **1.1.5**: No inflammatory religious commentary or inaccurate/misleading quotations of religious texts
- **For Unfold**: AI-generated devotional content must not produce inflammatory or inaccurate religious text

### Guideline 1.2 — Safety: User-Generated Content
If your app has user-generated content (UGC), you need:
- Content filtering/moderation
- Mechanism for reporting objectionable content
- Ability to block abusive users
- Developer contact info for reporting
- **For Unfold**: If users share journal entries or devotionals, this applies. If content is private/personal only, it may not.

### Guideline 2.1 — Performance: App Completeness
**This is the #1 rejection reason (40%+ of all rejections).**
- App must be complete and fully functional
- No placeholder content, "coming soon" screens, or test data
- All features described in metadata must work
- App must not crash on any supported device
- Backend services must be live and responsive

### Guideline 2.3 — Performance: Accurate Metadata
- Screenshots must reflect actual app experience
- Description must match what the app does
- No misleading claims about features
- **Price consistency**: metadata price must match in-app price exactly

### Guideline 3.1.1 — Business: In-App Purchase
- All digital content/features must use Apple's IAP system
- Must include "Restore Purchases" button that works after reinstall on clean device
- Subscriptions must clearly show pricing, duration, and cancellation terms
- **For Unfold**: Premium features gated by RevenueCat must use Apple IAP

### Guideline 3.1.2 — Business: Subscriptions
- Auto-renewable subscriptions are only for services providing "dynamic, ongoing value"
- Must clearly explain what the subscription includes
- Users must see full pricing before purchase
- **For Unfold**: AI devotional generation = ongoing dynamic value. This is a strong fit for subscriptions.

### Guideline 4.2 — Design: Minimum Functionality
- Apps must provide features beyond a repackaged website
- Must leverage native iOS capabilities
- No "web view wrapper" apps
- **For Unfold**: Native Expo/RN app with offline capabilities, push notifications, haptics — this is fine.

### Guideline 5.1.1 — Legal: Data Collection and Storage
- Privacy policy required in metadata AND in-app
- Account deletion required if account creation exists
- Must explain all data collection clearly
- Must get consent before collecting sensitive data

### Guideline 5.1.2 — Legal: Data Use and Sharing
- Must disclose data shared with third parties
- **5.1.2(i)** (NEW Nov 2025): Must explicitly disclose data shared with third-party AI services
- Must obtain explicit permission before sharing with AI
- **For Unfold**: This is CRITICAL — see Section 7

---

## 7. AI App-Specific Requirements (2025-2026)

### Guideline 5.1.2(i) — Third-Party AI Data Sharing

Effective November 13, 2025, this is the biggest new requirement for AI apps like Unfold.

### What Qualifies as "Third-Party AI"
- Large language models (GPT, Claude, Grok, Gemini, Llama)
- Generative AI systems (image, audio, video generation)
- ML platforms (AWS, Google Cloud, Azure AI services)
- Voice/speech processing (TTS like Cartesia, transcription)
- AI-powered analysis tools

### What DOESN'T Trigger This
- On-device processing (Core ML, Create ML)
- First-party AI services you fully operate
- Public API requests with no personal data

### Three Mandatory Requirements

**1. Explicit Disclosure**
- Name the SPECIFIC AI provider (not generic "service providers")
- Example: "Your devotional content is generated by xAI's Grok model"
- Must be PROMINENT — not buried in privacy policy
- Must be in the app UI, not just in legal documents

**2. Explicit Permission**
- Obtain consent BEFORE any data transmission to AI
- Separate consent for different AI categories (text generation vs TTS)
- Users must be able to decline without losing ALL functionality

**3. User Control**
- Settings showing which AI features are enabled
- Which providers receive data
- Ability to revoke permissions at any time

### Implementation for Unfold

**Consent flow needed:**
During onboarding or before first devotional generation, show a modal like:

> "Unfold creates your personalized devotionals using AI. When you share your story and preferences:
> - Your responses are sent to xAI (Grok) to generate devotional content
> - Audio narration is generated by Cartesia TTS
>
> Your data is used only for generating your devotionals and is not stored by these providers.
>
> [Learn More] [Accept & Continue] [Decline]"

**In Settings:**
- Add an "AI & Privacy" section showing active AI providers
- Allow toggling AI features off (with graceful degradation)

### AI Content Transparency
- Apps using AI must clearly explain how AI works
- Users should know when content is AI-generated
- No misleading claims about AI capabilities
- **For Unfold**: Consider a subtle "AI-generated" indicator on devotionals, or mention in onboarding that content is AI-powered

### Reviewer Consistency Check
Apple reviewers compare three things "line by line":
1. Onboarding screens (permission requests)
2. App Privacy questionnaire (in App Store Connect)
3. Actual app behavior (what data actually flows where)

**Mismatches between these three trigger rejection.** Consistency is more important than complexity.

---

## 8. Bible/Religious App Considerations

### Content Guidelines for Religious Apps

**Guideline 1.1.5 — Religious Content**
- No inflammatory religious commentary
- No inaccurate or misleading quotations of religious texts
- **For Unfold**: AI-generated devotionals must accurately quote scripture. Implement validation that scripture references are real and accurately quoted.

**Guideline 1.1.1 — No Discrimination**
- Content must not be defamatory toward any religious group
- Must not humiliate, intimidate, or harm targeted groups
- **For Unfold**: AI persona should be inclusive, non-judgmental, non-sectarian (or clearly state denomination if applicable)

### Successful Religious App Patterns
Many Bible/devotional apps thrive on the App Store (YouVersion Bible, Glorify, Hallow, Pray.com, Duomo). Key patterns:
- Clear value proposition (daily devotionals, Bible reading plans, prayer)
- Accurate scripture quotation
- Respectful, non-inflammatory tone
- Strong privacy practices
- Free tier with premium upgrades

### Potential Issues for AI Devotionals
1. **AI hallucination of scripture**: If the AI fabricates Bible verses or attributes incorrect quotes, this could violate 1.1.5. Implement server-side validation of scripture references.
2. **Personalized content gone wrong**: If AI generates content based on user's "struggles" that becomes inflammatory or harmful, it could be flagged.
3. **Age rating**: If AI content could touch on sensitive topics (depression, addiction, grief), consider appropriate age rating.

### Recommendations for Unfold
- Validate all scripture references against a Bible API before displaying
- Include content guardrails in AI prompts to prevent inflammatory output
- Use the persona system to maintain respectful, encouraging tone
- Consider adding a disclaimer: "AI-generated devotional content. Scripture quotations are from [translation]."

---

## 9. In-App Purchase & Subscription Requirements

### Pre-Submission Setup

1. **Sign all agreements**: Paid Applications Agreement in App Store Connect must be active
2. **Create products in App Store Connect**: Set up subscription groups, pricing, and descriptions
3. **Status must be "Ready to Submit"**: Products should be in this state during testing
4. **Submit with app**: First-time IAPs must be submitted alongside the app binary for review
5. **Provide screenshot**: Upload a screenshot of your paywall for each IAP product

### Subscription-Specific Requirements

**Guideline 3.1.2(a) — Permissible Uses:**
- Subscriptions must provide ongoing, dynamic value
- Content libraries, streaming, productivity tools, cloud storage
- AI-generated personalized content (Unfold's use case) qualifies

**Required Subscription Disclosures:**
- Clear pricing before purchase (exact amount + billing period)
- Renewal terms (auto-renewing, frequency)
- How to cancel
- Free trial length and what happens after
- **Must appear on the paywall screen itself, not just in terms**

**Restore Purchases:**
- Must include a working "Restore Purchases" button
- Must work on a clean device after reinstall
- Reviewer will test this

### RevenueCat-Specific Checklist

From RevenueCat's launch checklist:
1. Replace Test Store API key with iOS-specific key before submission (**using Test Store key in production will crash**)
2. Verify all products fetch correctly in sandbox
3. Confirm purchases unlock content immediately
4. Test subscription expiration and renewal
5. Test purchase restoration after uninstall/reinstall
6. Include subscription disclosure in app description
7. Complete App Privacy disclosures for purchase data

### Common IAP Rejection Scenarios

- **Products not approved**: IAPs submitted alongside app but not yet reviewed — wait for approval
- **"Cannot connect to iTunes Store"**: Apple's sandbox environment down — resubmit or explain to reviewer
- **Price mismatch**: Metadata says $4.99 but paywall shows $5.99 — instant rejection
- **Content not unlocked**: Entitlement mapping is wrong in RevenueCat
- **Missing Restore Purchases**: Guaranteed rejection
- **24-hour propagation delay**: New products can take up to 24 hours to work on App Store servers after first release

### For Unfold
- Ensure RevenueCat is configured with production API keys
- Paywall must show exact prices from RevenueCat (dynamic pricing from App Store Connect)
- "Restore Purchases" button must be accessible and functional
- Premium features must gracefully degrade for free users (no crashes)
- Subscription description must be in the App Store listing

---

## 10. Common Rejection Reasons & How to Avoid Them

### #1: Guideline 2.1 — App Completeness (~40% of rejections)

**What triggers it:**
- App crashes on launch or during core flow
- Placeholder text ("Lorem ipsum", "Coming soon")
- Features mentioned in description don't work
- Empty screens or broken navigation
- Backend server is down during review

**How to avoid:**
- Do a "reviewer run": fresh install → complete main flow → test all features
- Remove ALL debug/placeholder content
- Ensure backend services are live and stable
- Test on multiple device sizes
- **For Unfold**: Walk through entire flow — onboarding → devotional generation → reading → audio playback → subscription purchase → settings

### #2: Guideline 2.3 — Accurate Metadata

**What triggers it:**
- Screenshots showing features that don't exist
- Description claims that don't match functionality
- Misleading app name or subtitle

**How to avoid:**
- Take screenshots from actual app (not mockups with fake content)
- Description should match exactly what the app does today, not future plans
- Don't mention features in beta or development

### #3: Guideline 3.1.1 — In-App Purchase Issues

**What triggers it:**
- Digital content sold outside IAP system
- Missing "Restore Purchases"
- Purchases don't unlock content
- Sandbox environment issues during review

**How to avoid:**
- Use Apple IAP for all digital content/features
- Test Restore Purchases on clean device
- Include clear review notes if IAP behavior depends on account state
- Consider providing a promo code or test account with premium access for reviewer

### #4: Privacy & Data Issues

**What triggers it:**
- No privacy policy URL
- Privacy labels don't match actual data collection
- Missing consent for data sharing
- No account deletion option

**How to avoid:**
- Host privacy policy at stable URL (not localhost)
- Fill out privacy questionnaire accurately
- Add AI data consent flow (Section 7)
- Implement account deletion in settings

### #5: Guideline 4.2 — Minimum Functionality

**What triggers it:**
- App is just a web wrapper
- App has very limited native functionality
- Could be a website instead

**How to avoid (Unfold is fine here):**
- Use native features: push notifications, haptics, offline mode
- Expo/RN native components = genuine native app
- Offline reading capability is a strong differentiator

### Developer Tips from the Community

1. **Provide thorough review notes**: Explain your app's concept, business model, and how to access key features
2. **Include test credentials**: If login required, provide working demo account
3. **Be transparent about AI**: Proactively explain AI usage in review notes
4. **Respond quickly to rejections**: Use Resolution Center, fix issues completely, resubmit
5. **Don't argue — fix**: If rejected, address the specific issue rather than debating the guideline
6. **Appeal only for misunderstandings**: If the reviewer clearly misunderstood your app's functionality

---

## 11. Expo/React Native Specific Gotchas

### iPad Rendering
- Even with `ios.supportsTablet: false`, your app renders at phone resolution on iPad
- Apple may reject if elements don't render properly on iPad
- Test on iPad simulator to verify usability

### expo-updates and Privacy Labels
- If using `expo-updates` (OTA updates), you must declare:
  - "Yes, we collect data from this app"
  - Specify "Crash Data" under Diagnostics
  - This is because expo-updates may collect crash/update metadata

### Export Compliance in app.json
```json
{
  "expo": {
    "ios": {
      "config": {
        "usesNonExemptEncryption": false
      }
    }
  }
}
```
This prevents the "Missing Compliance" warning after every upload.

### EAS Build Considerations
- Use production profile for App Store/TestFlight builds
- Verify provisioning profiles match your App Store Connect app
- Distribution certificate must be valid
- Check that bundle identifier matches exactly

### Info.plist Entries
- RN/Expo may overwrite custom Info.plist entries during build
- Use `expo.ios.infoPlist` in app.json for reliable configuration
- Permission usage descriptions (camera, microphone, etc.) must be set

### React Native Specific
- Hermes engine is required for App Store builds (default in Expo SDK 55)
- Test the release build, not just development — behavior can differ
- Ensure no `console.log` spam in production (can slow app and leak info)

---

## 12. 2025-2026 Guideline Changes

### November 2025 Updates

1. **Guideline 5.1.2(i) — AI Data Sharing**: Must disclose and get consent for data shared with third-party AI (see Section 7)
2. **Guideline 4.1(c) — Clone Apps**: Cannot use another developer's icon, brand, or product name without approval
3. **Age Rating Overhaul**: New 13+, 16+, 18+ tiers (replacing 12+ and 17+); updated questionnaire required by Jan 31, 2026
4. **Creator App Age Controls**: Apps generating content must implement age-based content restriction

### April 2026 SDK Requirements

Starting **April 28, 2026**, all submissions must:
- Use iOS 26 / iPadOS 26 SDK or later
- Be built with Xcode 26 or later
- Support Dark Mode, Dynamic Type, and proper screen scaling

**For Unfold**: Currently on Expo SDK 55. Ensure Expo SDK supports iOS 26 SDK when required. This deadline is ~6 weeks away.

### Privacy & Transparency Trend
- Apple is increasingly verifying privacy labels with automated scanning
- Mismatches between declared and actual behavior are caught more frequently
- Third-party SDK data collection must also be declared
- Privacy manifests are required for apps using "Required Reason APIs"

---

## 13. Pre-Submission Checklist for Unfold

### Before TestFlight (External) Submission

**App Functionality:**
- [ ] App launches without crash on iPhone SE, iPhone 15/16/17, and iPad
- [ ] Complete onboarding flow works end-to-end (all 9 how-it-works pages → onboarding questions → devotional generation)
- [ ] Daily devotional displays correctly with all content
- [ ] Audio playback works (play, pause, skip, speed change)
- [ ] Streak system functions correctly
- [ ] Settings screen fully functional
- [ ] All navigation paths work (no dead ends)
- [ ] No placeholder text, "Lorem ipsum", or debug UI
- [ ] No console.log spam in production build
- [ ] Backend services are live and responsive

**Authentication:**
- [ ] Apple Sign In works
- [ ] Anonymous/guest mode works
- [ ] Account deletion implemented and functional
- [ ] Demo account credentials prepared for reviewer

**Subscriptions (RevenueCat):**
- [ ] Production API key (not Test Store key) in release build
- [ ] All IAP products in "Ready to Submit" state in App Store Connect
- [ ] Paywall shows correct prices (from RevenueCat/App Store)
- [ ] Purchases unlock premium content correctly
- [ ] Restore Purchases button exists and works on clean device
- [ ] Subscription terms visible on paywall (price, period, cancellation)
- [ ] IAP products submitted alongside app binary

**Privacy & AI Compliance:**
- [ ] Privacy policy URL hosted and accessible
- [ ] Privacy policy linked in App Store Connect metadata
- [ ] Privacy policy accessible within the app (Settings)
- [ ] App Privacy nutrition labels completed accurately in App Store Connect
- [ ] AI data sharing consent modal implemented (Guideline 5.1.2(i))
  - Names specific providers (xAI/Grok, Cartesia)
  - Explains what data is shared
  - Gets explicit consent before first AI call
  - Users can decline
- [ ] Account deletion available if account creation exists
- [ ] All permissions have clear usage descriptions (Info.plist)

**Metadata:**
- [ ] App name, subtitle, description finalized
- [ ] Keywords optimized (100 char limit)
- [ ] Screenshots taken from actual app (required device sizes)
- [ ] App icon 1024x1024 (no alpha channel)
- [ ] Age rating questionnaire completed (use new 2025 tiers)
- [ ] Category selected (Lifestyle or Reference)
- [ ] Support URL active
- [ ] "What to Test" description written for TestFlight

**Export Compliance:**
- [ ] `usesNonExemptEncryption: false` in app.json
- [ ] Export compliance question answered in App Store Connect

**Review Notes:**
- [ ] Explain app concept (AI-powered personalized daily devotional)
- [ ] Explain business model (free with premium subscription)
- [ ] Provide demo account credentials
- [ ] Mention AI usage proactively: "This app uses xAI's Grok for devotional generation and Cartesia for text-to-speech. Users consent to AI data sharing during onboarding."
- [ ] Note any features that require specific conditions to test

**Technical:**
- [ ] Build uses production EAS profile
- [ ] Bundle identifier matches App Store Connect
- [ ] Version and build numbers are correct
- [ ] Provisioning profiles are valid and up to date
- [ ] No expired certificates
- [ ] Tested on physical device (not just simulator)

---

## 14. Sources

### Apple Official Documentation
- [TestFlight Overview — Apple Developer](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [App Review Guidelines — Apple Developer](https://developer.apple.com/app-store/review/guidelines/)
- [App Privacy Details — Apple Developer](https://developer.apple.com/app-store/app-privacy-details/)
- [Export Compliance Overview — Apple Developer](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)
- [Complying with Encryption Export Regulations — Apple Developer](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)
- [Overview of Submitting for Review — Apple Developer](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/overview-of-submitting-for-review/)
- [Updated App Review Guidelines (Nov 2025) — Apple Developer](https://developer.apple.com/news/?id=ey6d8onl)
- [Age Ratings Values and Definitions — Apple Developer](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)
- [Invite External Testers — Apple Developer](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/)
- [ITSAppUsesNonExemptEncryption — Apple Developer](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)

### Review Guidelines & Checklists
- [App Store Review Guidelines 2025: Checklist + Top Rejection Reasons — NextNative](https://nextnative.dev/blog/app-store-review-guidelines)
- [iOS App Store Review Guidelines 2026 — TheAppLaunchpad](https://theapplaunchpad.com/blog/app-store-review-guidelines)
- [App Store Review Checklist for 2025 — AppInstitute](https://appinstitute.com/app-store-review-checklist/)
- [App Store Review Guidelines 2025: Essential AI App Rules — OpenForge](https://openforge.io/app-store-review-guidelines-2025-essential-ai-app-rules/)
- [2025 Guide to Submitting Your iOS App — DaydreamSoft](https://www.daydreamsoft.com/blog/ios-app-submission-process-a-2025-guide-for-developers)

### Rejections & Troubleshooting
- [The Ultimate Guide to App Store Rejections — RevenueCat](https://www.revenuecat.com/blog/growth/the-ultimate-guide-to-app-store-rejections/)
- [Apple App Store Rejections — RevenueCat Docs](https://www.revenuecat.com/docs/test-and-launch/app-store-rejections)
- [Top Reasons iOS Apps Get Rejected in 2026 — EITBiz](https://www.eitbiz.com/blog/top-reasons-ios-apps-get-rejected-by-the-app-store-and-fixes/)
- [iOS App Store Review Guidelines: How to Pass — AppFollow](https://appfollow.io/blog/app-store-review-guidelines)
- [Guideline 4.2 Rejection: Minimum Functionality — iOSSubmissionGuide](https://iossubmissionguide.com/guideline-4-2-minimum-functionality/)
- [Tips from App Review — Apple Developer Forums](https://developer.apple.com/forums/thread/810791)

### AI & Privacy (2025-2026)
- [Apple's Guideline 5.1.2(i): AI Data Sharing Rule — DEV Community](https://dev.to/arshtechpro/apples-guideline-512i-the-ai-data-sharing-rule-that-will-impact-every-ios-developer-1b0p)
- [Apple's New Guidelines Clamp Down on Third-Party AI — TechCrunch](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai/)
- [Apple Updates App Review Guidelines: AI Data Sharing — TechRepublic](https://www.techrepublic.com/article/news-apple-app-review-guidelines-ai-data-sharing/)
- [App Store Privacy Policy Requirements 2025 — iOSSubmissionGuide](https://iossubmissionguide.com/app-store-privacy-policy-requirements)

### Subscriptions & IAP
- [App Subscription Launch Checklist — RevenueCat Docs](https://www.revenuecat.com/docs/test-and-launch/launch-checklist)
- [iOS Product Setup — RevenueCat Docs](https://www.revenuecat.com/docs/getting-started/entitlements/ios-products)
- [App Review Rejection Guideline 3.1.2 — RevenueCat Community](https://community.revenuecat.com/general-questions-7/app-review-rejection-guideline-3-1-2-ongoing-value-6617)

### Expo/React Native
- [App Stores Best Practices — Expo Docs](https://docs.expo.dev/distribution/app-stores/)
- [Submit to App Stores — Expo Docs](https://docs.expo.dev/deploy/submit-to-app-stores/)
- [ITSAppUsesNonExemptEncryption Issue — React Native GitHub](https://github.com/facebook/react-native/issues/41898)
- [Fix Missing Compliance Warning — Code With Andrea](https://codewithandrea.com/tips/fix-missing-compliance-warning/)

### Review Times
- [Live App Store and TestFlight Review Times — Runway](https://www.runway.team/appreviewtimes)
- [Slow TestFlight Beta App Review — Michael Tsai](https://mjtsai.com/blog/2025/05/19/slow-testflight-beta-app-review/)
