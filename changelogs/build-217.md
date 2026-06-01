Premium restore/purchase entitlement fix for internal TestFlight QA.

- Refreshes RevenueCat CustomerInfo after purchase/restore if Apple initially returns no active Unfold Premium entitlement.
- Keeps restore truthful when the sandbox subscription is actually expired.
- Makes activation failure copy explicit: Apple did not return an active subscription.

QA focus:
- Install this build, create or use an active sandbox/TestFlight subscription, then confirm purchase/restore unlocks Premium.
- If restore still says no active subscription, verify the sandbox subscription has not expired before retrying.
