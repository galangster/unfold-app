# App Store Connect — App Privacy Questionnaire (Unfold 1.0)

**Source:** E2E audit §10b (PRIV-2/3/4). **Must match** the signed manifest
`ios/Unfold/PrivacyInfo.xcprivacy` (already populated) — Apple's scanner flags
app-label ↔ manifest mismatches, and RevenueCat's own manifest already declares
Purchase History.

Fill in: **App Store Connect → [Unfold] → App Privacy → Edit.**

---

## Step 1 — Data collection
> "Do you or your third-party partners collect data from this app?"

→ **Yes, we collect data from this app.**

## Step 2 — Select the data types (exactly 4 — leave all others unchecked)

| Apple category | Data type to check | What it is |
|---|---|---|
| **User Content** | **Other User Content** | `aboutMe` + Companion chat messages (sent to backend → Anthropic/xAI) |
| **Identifiers** | **Device ID** | persistent auth token |
| **Purchases** | **Purchase History** | RevenueCat subscription state |
| **Diagnostics** | **Other Diagnostic Data** | error/diagnostic payloads |

**Do NOT check anything else** — specifically:
- **Location** → NOT declared. The synced `deviceTimezone` is an IANA timezone string for reminder scheduling, not device location. No CoreLocation/expo-location, no location entitlement. Over-declaring Location on a binary with none of it is its own review risk.
- **Usage Data** → NOT declared. Analytics are mocked / no-op; nothing is transmitted.
- Also leave unchecked: Contact Info, Health & Fitness, Financial Info (beyond Purchases), Contacts, Browsing History, Search History, Sensitive Info, Other Data.

## Step 3 — For EACH of the 4 data types, answer identically
- **Is this data used to track you?** → **No**
- **Is this data linked to the user's identity?** → **Yes, linked to identity**
- **What is it used for?** → **App Functionality** only
  (NOT Analytics, Product Personalization, Advertising, or Developer's Marketing.)

## Result
- **Tracking:** the whole app declares **No tracking** → no ATT prompt, no "Data Used to Track You" section.
- **Data Linked to You:** Other User Content, Device ID, Purchase History, Other Diagnostic Data — all for App Functionality.

## Final cross-check before saving
Confirm these match `ios/Unfold/PrivacyInfo.xcprivacy`:
`NSPrivacyCollectedDataTypeOtherUserContent` · `…DeviceID` · `…PurchaseHistory` · `…OtherDiagnosticData` — each `Linked = true`, `Tracking = false`, purpose `AppFunctionality`. ✓ (verified 2026-06-14)

---

## PRIV-3 — also confirm the live App Store description (do this in the same session)
In **ASC → [Unfold] → 1.0 (Prepare for Submission) → Description**, confirm the live text does **NOT** contain either false claim:
- ❌ "Your data stays on your device"
- ❌ "Optional iCloud backup for prayer journals"

Both are false (onboarding context is sent to the backend → Anthropic/xAI; journal sync is deferred). If either appears, replace the description with the text in **`APP_STORE_METADATA_OPTION_A_DRAFT.md`** (repo root), which omits these claims.

> ⚠️ Do not submit for review until BOTH this questionnaire and the description check are complete (audit §10 gates 3 & 4).
