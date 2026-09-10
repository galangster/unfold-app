# Build 276 (1.1.7) - Notifications that follow your day

Everything in build 275, plus the notification work below. The matching backend changes are not live yet, so server-side pieces (morning push from the server, lapse message, generated act slot and companion nudge) will start once those deploy.

## New

- **Act reminder** - Finish a day whose act names a moment ("tonight after dinner", "at lunch") and one reminder arrives at that moment with the act as the message. Tap it to open the day at the act; choose "I did it" or "Not today". "Remind me in an hour" snoozes once.
- **Check-ins in your own words** - The midday check-in carries the day's carry line or check-in question; the evening wind-down carries the day's act or evening scripture.
- **Action buttons** - Day-ready reminders offer "Read now" and "Remind me in 3 hours".
- **No reminder for a day you already read** - Finish today's reading before your reminder time and that reminder waits for tomorrow.
- **Quiet hours** - Snoozes never land between 10 PM and 7 AM.
- **Reminder-time suggestion** - Settings > Reminders offers to move your reminder to when you usually read, after enough reads. Nothing moves unless you tap Move it.
- **Notification permission during onboarding** - The reminder-time step asks for permission right there.

## What to test

- [ ] Read a day whose "Today" act names an evening moment. Wait for the reminder (or set Evening wind-down time a few minutes ahead in Settings). Confirm it shows the act text.
- [ ] Tap the act reminder. Confirm the reader opens scrolled to the act with "I did it" / "Not today". Tap "I did it" and confirm no further act reminder arrives.
- [ ] Long-press an act reminder and tap "Remind me in an hour". Confirm one reminder returns about an hour later.
- [ ] Long-press a Day-ready reminder and confirm "Read now" and "Remind me in 3 hours" appear.
- [ ] With Midday check-in on (Premium), confirm the midday notification quotes today's carry line or check-in question, not a generic line.
- [ ] Read today's day before your daily reminder time. Confirm the reminder does not fire today and does fire tomorrow.
- [ ] After five or more reads at a consistent time, open Settings > Reminders and confirm the suggestion appears. Tap Keep it and confirm it stays hidden.
- [ ] Fresh install: at the onboarding reminder-time step, tap Continue and confirm the system notification prompt appears.
