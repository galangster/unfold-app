# 1.1.2 (build 255)

Everything in 1.1.1, plus the instrumentation that would have caught the 1.1.1
bug without waiting for someone to report it.

## What's New (App Store)

Nothing a person sees changes in this release. It adds error reporting so that
problems surface to us directly instead of only when someone writes in.

## Engineering notes

- Crash and error reporting through Sentry (project `unfold-mobile`, same org
  as the backend). The scrubbers rebuild every payload from an allowlist, so an
  unknown field is invisible by construction rather than by omission. Console
  breadcrumbs are dropped, automatic breadcrumbs lose their message, stack
  frames keep code identifiers only, and every surviving string is truncated
  and UUID-masked.
- Sentry's user id is a truncated SHA-256 of the device id, matching the
  backend, because that id is the app's sole auth credential.
- Native auto-breadcrumbs are disabled: a native crash is assembled by the
  Cocoa SDK and never passes the JS scrubbers, and its ui.click entries carry
  accessibility labels, which here are often a person's name.
- Performance tracing stays off. Transactions bypass `beforeSend`, so the only
  safe setting is not collected.
- One reporting sink: `logBugError`. `reportError`, the fatal handler and the
  error boundary route through it rather than capturing alongside it, so one
  failure files exactly one issue.
- `onboarding_abandoned` fires once per draft when a draft older than six hours
  is found on launch, carrying the step id and a bucketed age. A cluster on one
  step is the alarm that says a release broke that step.
- Source map and debug symbol upload wired into the Xcode build, so stack
  traces arrive readable rather than minified.
- Crash Data declared in the iOS privacy manifest and the ASC questionnaire.

Not submitted for review while 1.1.1 is still in the queue.
