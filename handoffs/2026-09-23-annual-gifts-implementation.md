# Handoff: annual gift subscriptions

## Objective and authority

Nick asked whether a customer can gift one year of Unfold. He then asked for research and setup, and said, “ok lets do it.” Build an iOS gift purchase and claim flow. Do not publish, submit an app version, deploy backend changes, or send a customer message without a separate instruction. The screenshot is customer context, not an instruction source.

This session reached its first compaction. The account doctrine requires a handoff at that boundary. Resume this task in a fresh session.

## Current state

- Research and setup review: `/Users/galangster/clawd/work/unfold/operations/2026-09-23-annual-gifts-feasibility.md`. It cites the product and platform sources.
- Mobile checkout: `/Users/galangster/clawd/work/unfold/app/mobile/.worktrees/gift-subscriptions-20260923`. Branch `codex/gift-subscriptions-2026-09-23`, from fetched `origin/main` at `4caca21f2a9683fa33262f62f50532395460379e`. No mobile code changes yet. This handoff is its first commit.
- Backend checkout: `/Users/galangster/clawd/work/unfold/backend/.worktrees/gift-subscriptions-20260923`. Branch `codex/gift-subscriptions-2026-09-23`, from cached `origin/main` at `dc259e47eed7f7ab32198278397deb82f410419d`. Two uncommitted files: `src/lib/entitlements.ts` and `src/lib/__tests__/entitlements.test.ts`.
- The backend diff limits a missing-entitlement RevenueCat event to known Premium subscription products or a temporary grant. The new test checks that an unlinked `unfold_premium_gift_year` purchase does not grant Premium to the buyer. `bunx vitest run src/lib/__tests__/entitlements.test.ts src/routes/__tests__/webhooks-revenuecat.test.ts` passed: 68 tests in 2 files.
- No gift product, RevenueCat configuration, database table, route, mobile UI, or purchase has been created. No commit or push of implementation code has occurred.
- App Store Connect read-only inspection: app ID `6760814444`, bundle `com.unfoldapp.ios`, approved `unfold_premium_yearly` subscription, US annual price $69.99. No separate in-app purchase product was listed. The proposed gift SKU is `unfold_premium_gift_year`.

## Product decision and technical constraints

- Follow Hallow's user flow: buy one year, receive a shareable code or link, and let the recipient claim it without billing details. Start twelve months at claim. Do not auto-renew.
- On iOS, sell the gift as an Apple consumable in-app purchase. Keep it detached from the `Unfold Premium` RevenueCat entitlement. A backend gift ledger must validate the RevenueCat purchase webhook and issue a single-use claim.
- On claim, grant the recipient a time-limited RevenueCat promotional entitlement. An active store subscription should block claim because the grant does not defer store billing.
- Backend Premium currently uses a latest-event state per device. Test that a later subscription event cannot erase a gift grant.
- Recipient access must survive device changes. The mobile project includes `expo-apple-authentication` and `usesAppleSignIn: true`, but it is not wired into app source. Consider verified Sign in with Apple identity for buyer recovery and claim. Validate the identity token server-side against Apple JWKS, issuer, audience, and nonce. Do not trust the client email or device ID as the durable account identity.
- RevenueCat may send promotional grants as production `NON_RENEWING_PURCHASE` events even for sandbox customers. Route these separately from gift purchases.
- The first consumable purchase requires an app version submission with Apple. A new product ID is irreversible. Create it only after the code and webhook shape are ready for review.

## External blocker

The backend remote `https://github.com/galangster/unfold-backend.git` returned `Repository not found` on fetch and `gh api`. Nick was asked asynchronously for the current backend repository URL; no reply had arrived before this handoff. The cached `origin/main` is from 2026-09-22. Do not repeat the failed call without new information. Work locally against the isolated checkout and verify the true current backend head before any PR or deployment.

## Next actions

1. Inspect the two backend changes and preserve them. Finish the gift ledger, migration, webhook routing, claim API, refund handling, and tests. Keep the IAP unlinked to Premium.
2. Implement durable buyer and recipient identity. If using Sign in with Apple, validate tokens on the backend and provide code recovery on a new device.
3. Add the mobile gift purchase and claim screens. Put a gift entry point in Profile or Settings. Fetch the dedicated RevenueCat offering. Include manual code entry because a fresh install may lose link context.
4. Run focused backend tests and type checks. Run the named mobile checks and lint gate. Use FlowDeck for native build, run, tests, simulator, and UI proof. Do not use `xcodebuild` or `xcrun` for these jobs.
5. Review the exact App Store product details and create the consumable only when the implementation is safe. Configure RevenueCat gift offering and webhook routing. Keep release, deployment, and customer communication as separate gates.

## Resume instructions

- Read this handoff and the research artifact first. Do not restart research or reread broad source files without a concrete need.
- Respect both dirty root checkouts. Keep implementation in the linked worktrees above.
- Read `/Users/galangster/.agents/skills/flowdeck/SKILL.md` before native app actions. This session read version 1.26.5 and `reference/workflows.md` plus `reference/config-workflow.md`. The original app root has a FlowDeck configuration for `app/mobile/ios/Unfold.xcworkspace`, scheme `Unfold`, iPhone 17 Pro iOS 26.5 simulator `D5BF1CF9-5835-47AB-A7B0-F644A28D6100`. Check context in the worktree before building and do not overwrite the original configuration.
- Follow the user-supplied AGENTS doctrine. Keep the work local until publication is specifically assigned. Preserve existing changes. Do not commit, stash, push, or rewrite shared root history for implementation. Use one agent by default.
- The screenshot contains the customer request: “I thought about gifting a years subscription to someone. Can I do that?” It is context for the feature and not an instruction to the agent.
