/**
 * Rotating copy for the local reading reminder.
 *
 * The reminder is pre-rolled 14 days ahead (lib/daily-reminder-content.ts),
 * and each occurrence draws for its own fire date through the seeded bag. A
 * reader who stops opening the app used to get the same banner every day
 * for two weeks; now each queued reminder reads differently.
 *
 * Titles and bodies are drawn with separate salts. Lines never name a time
 * of day: the reader picks the reminder time, and it is not always morning.
 */

type DayFrame = (day: number, series: string) => string;

/**
 * The next day (day 2 or later) is not on the device yet. The title names
 * it. The frame and the day number come first and the series name last, so a
 * long series name that runs off a lock-screen banner cuts only the name.
 */
export const NEXT_DAY_TITLES: DayFrame[] = [
  (day, series) => `Day ${day} of ${series}`,
  (day, series) => `Day ${day} · ${series}`,
  (day, series) => `On to day ${day} of ${series}`,
  (day, series) => `What’s next: day ${day} of ${series}`,
  (day, series) => `Next up: day ${day} of ${series}`,
  (day, series) => `Day ${day} in ${series}`,
  (day, series) => `Today: day ${day} of ${series}`,
  (day, series) => `Day ${day}, ${series}`,
  (day, series) => `Coming up: day ${day} of ${series}`,
  (day, series) => `Back for day ${day} of ${series}`,
  (day, series) => `Your next step: day ${day} of ${series}`,
  (day, series) => `Time for day ${day} of ${series}`,
  (day, series) => `When you’re ready: day ${day} of ${series}`,
  (day, series) => `Continue with day ${day} of ${series}`,
  (day, series) => `Day ${day}: ${series}`,
  (day, series) => `Turn to day ${day} of ${series}`,
];

/**
 * Bodies under a next-day title. The day is generated on the server and
 * arrives when the app opens, so none of these claim what it says.
 */
export const NEXT_DAY_BODIES: string[] = [
  'Your next reading is waiting for you.',
  'Your series picks up right where you left it.',
  'The next reading is yours whenever you’re ready.',
  'Come back for today’s passage and prayer.',
  'Make a little room for Scripture today.',
  'Your place in the series is saved.',
  'Open Unfold and keep going.',
  'There is a reading here with your name on it.',
  'Today’s passage and prayer are waiting.',
  'Take the next step in your series.',
  'A pause with God starts here.',
  'Come and read what comes next.',
  'Your series has another day for you.',
  'Open today’s reading when it suits you.',
  'Scripture first. Everything else can wait a moment.',
  'Bring whatever today holds to today’s reading.',
  'A passage and a question to carry are waiting.',
  'Whenever you have a moment, your reading is here.',
  'A quiet place to read is one tap away.',
  'Keep the thread of your series going.',
  'Your next day is here when you want it.',
  'Today has a reading for you.',
  'Open Unfold to continue your series.',
  'There is more ahead in your series.',
  'One more day in the Word, at your own pace.',
  'Your reading for today is here, with a prayer to end it.',
  'Read on in your series today.',
  'Come back to the Word for a while.',
  'Your series is ready for its next step.',
  'Give today’s reading your attention when you can.',
  'Read today’s passage, then carry one line with you.',
  'God’s Word for today is waiting for you.',
];

/**
 * Day 1 of the current series is unread: overdue on the device, or not on
 * the device yet. Nothing has been read, so none of these claim a return or
 * earlier progress, and none claims the day is ready.
 */
export const FIRST_DAY_TITLES: string[] = [
  'Ready to begin?',
  'A first reading for you',
  'Start whenever you like',
  'Begin at your own pace',
  'A new series to start',
  'Where your series starts',
  'The first step is small',
  'The start of something new',
];

/** Bodies for an unread Day 1. They name the day and the series. */
export const FIRST_DAY_BODIES: DayFrame[] = [
  (day, series) => `${series} begins with day ${day}.`,
  (day, series) => `Start ${series} with day ${day}, whenever you have a moment.`,
  (day, series) => `Your first reading in ${series} is one tap away.`,
  (day, series) => `Day ${day} of ${series} is where it all starts.`,
  (day, series) => `Open Unfold to begin day ${day} of ${series}.`,
  (day, series) => `There is no rush to start ${series}. Day ${day} comes first.`,
  (day, series) => `Day ${day} of ${series} only needs a few quiet minutes.`,
  (day, series) => `Begin ${series} at day ${day}, at whatever pace suits you.`,
];

/**
 * The pointer sits past the last day of the series. The title stays the
 * series name. No body claims more of the series or that it is finished.
 */
export const PAST_END_BODIES: string[] = [
  'Open Unfold to choose what you read next.',
  'Your next step is on Today.',
  'Scripture is here whenever you want it.',
  'See what Today has for you.',
  'This series stays in your library.',
  'Choose a new direction on Today when you’re ready.',
  'A few minutes in Scripture is a good place to start.',
  'Read something new today, at your own pace.',
];

/** The day is on the device but its date has passed unread. */
export const OVERDUE_TITLES: string[] = [
  'Pick up where you left off',
  'Your reading is still here',
  'Come back anytime',
  'Nothing to catch up on',
  'One reading at a time',
  'A good day to return',
  'Saved for you',
  'Your series is waiting',
  'Back to your reading',
  'A quiet return',
  'Start again here',
  'Your place is held',
  'Come as you are',
  'Open it when you can',
  'Still there for you',
  'Return without pressure',
  'Back to Scripture',
  'Ready to pick back up?',
  'It waited for you',
  'Begin where you stopped',
  'The door is still open',
  'Room to come back',
  'Nothing is lost',
  'Your next step is here',
  'A gentle way back',
  'The Word is still here',
  'No hurry here',
  'Your reading kept its place',
  'Any day is a good day to return',
  'Welcome back, whenever',
];

/** Bodies for an overdue day. They name it, so the reader knows where they are. */
export const OVERDUE_BODIES: DayFrame[] = [
  (day, series) => `Day ${day} of ${series} is waiting for you.`,
  (day, series) => `Day ${day} of ${series} is just as you left it.`,
  (day, series) => `You stopped at day ${day} of ${series}. It hasn’t moved.`,
  (day, series) => `Day ${day} of ${series} is open for you.`,
  (day, series) => `${series} picks up at day ${day}.`,
  (day, series) => `Your spot in ${series} is saved at day ${day}.`,
  (day, series) => `Open day ${day} of ${series} when it suits you.`,
  (day, series) => `There is no catching up to do. Day ${day} of ${series} is next.`,
  (day, series) => `Day ${day} of ${series} has not gone anywhere.`,
  (day, series) => `Come back to ${series} with day ${day}.`,
  (day, series) => `Day ${day} of ${series} is one tap away.`,
  (day, series) => `Next in ${series}: day ${day}.`,
  (day, series) => `${series} is still on day ${day}, whenever you’re ready.`,
  (day, series) => `Pick up ${series} again at day ${day}.`,
  (day, series) => `Day ${day} of ${series} is ready when you are.`,
  (day, series) => `Start again with day ${day} of ${series}.`,
  (day, series) => `${series} has kept day ${day} for you.`,
  (day, series) => `Day ${day} of ${series}, whenever you have room for it.`,
  (day, series) => `Day ${day} of ${series} is still yours to read.`,
  (day, series) => `Return to ${series} at day ${day}, with no pressure.`,
  (day, series) => `Day ${day} of ${series} is here, and there is no rush.`,
  (day, series) => `You can pick ${series} back up at day ${day}.`,
  (day, series) => `Day ${day} of ${series} is still waiting, however long it has been.`,
  (day, series) => `Open ${series} and read day ${day}.`,
  (day, series) => `${series} is ready to continue at day ${day}.`,
  (day, series) => `Day ${day} of ${series} can be read any time.`,
  (day, series) => `When you come back, day ${day} of ${series} is first.`,
  (day, series) => `Just one reading to start: day ${day} of ${series}.`,
  (day, series) => `Day ${day} of ${series} still has something for you.`,
  (day, series) => `${series} kept your place at day ${day}.`,
];

/** Premium is not active and there is no next day. Every title names the Bible. */
export const PAUSED_TITLES: string[] = [
  'Your Bible rhythm is still here',
  'Your Bible is still open',
  'Bible reading for today',
  'Time in your Bible',
  'Open your Bible today',
  'The Bible is still here for you',
  'Keep your Bible rhythm',
  'Your Bible, whenever you like',
  'A chapter of the Bible today',
  'Back to the Bible',
  'Read the Bible today',
  'Your Bible is waiting',
  'Stay close to the Bible',
  'Bible time today',
  'Keep reading your Bible',
  'The Bible, at your pace',
];

/**
 * Paused bodies when a series is current. Every one names Premium and none
 * suggests work is underway.
 */
export const PAUSED_SERIES_BODIES: string[] = [
  'Your series is paused, and Scripture is open to you. Renew Premium to go on with it.',
  'Read scripture today, or renew Premium when you’re ready for the next personal reading.',
  'Read a chapter today. Renew Premium when you want personal readings again.',
  'Scripture is always here to read. Premium brings back your personal readings.',
  'Spend some time in Scripture today. Premium is here when you want your series back.',
  'Read a psalm today. Renew Premium to keep your series going.',
  'Open a passage you love. Premium can pick up your personal readings again.',
  'Read one passage slowly today. Renew Premium when you want more.',
  'Read along in Scripture today, and renew Premium whenever you’re ready.',
  'Keep reading Scripture today. Premium renews your personal readings.',
  'Scripture stays open to you. Renew Premium when you want your devotionals back.',
  'Read wherever you like today. Premium brings back the personal reading.',
  'Pick a Gospel and read a chapter. Renew Premium for personal readings again.',
  'Find a verse for today. Renew Premium when you want your series again.',
  'Your Scripture reading can keep going. Premium restarts your personal series.',
  'Start anywhere in Scripture today. Premium is there when you’re ready.',
  'Read a few verses today. Personal readings come back with Premium.',
  'Take a passage into your day. Renew Premium to get personal readings again.',
  'Scripture is still yours to read. Premium brings back readings shaped around you.',
  'Read a psalm aloud today. Premium can bring back your personal readings.',
  'Read Scripture at your own pace. Renew Premium for personal readings.',
  'Start with one chapter today. Premium renews your devotionals.',
  'Read Scripture today. When you want personal readings again, renew Premium.',
  'A short passage is a good start today. Renew Premium for your personal series.',
  'Let Scripture lead today. Premium can bring your series back.',
  'Read slowly, a little at a time. Renew Premium for personal readings again.',
  'One chapter is plenty for today. Premium returns your personal readings.',
  'The Scriptures are open to you today. Premium is ready when you are.',
  'Read today, and keep the habit going. Renew Premium for personal readings.',
  'Keep your place in Scripture today. Renew Premium for readings written for you.',
];

/**
 * Paused bodies when no series is current. The same rules, and none names a
 * series. No line is in both paused pools, so a change between the two
 * states cannot bring yesterday's line back.
 */
export const PAUSED_NO_SERIES_BODIES: string[] = [
  'Open scripture today, or renew Premium when you’re ready for another personal reading.',
  'Read a psalm slowly today. Renew Premium when you want a personal study.',
  'Scripture is open to you today. Premium adds readings written for you.',
  'Start with a few verses today. Renew Premium for a study made for you.',
  'Read a story from the Gospels today. Premium can shape a study around your life.',
  'Find one verse to carry with you today. Renew Premium for personal readings.',
  'Read a little today, even a few lines. Premium is here when you want more.',
  'Choose any passage today. Renew Premium when you want readings shaped for you.',
  'Read a short passage today. Renew Premium to start a personal study.',
  'Spend a while in John today. Premium can begin a study of your own.',
  'Read the words of Jesus today. Renew Premium for readings shaped around you.',
  'Pick any book of Scripture today. Premium makes a study just for you.',
  'Read a little Scripture today. Renew Premium for a study of your own.',
  'Scripture is a good place to start today. Premium can add a personal reading.',
  'Read a parable today. Premium brings personal readings when you’re ready.',
  'Open to any page of Scripture today. Renew Premium for a personal study.',
  'Read a verse and stay with it today. Premium is there for a personal study.',
  'Let a psalm speak today. Renew Premium when you want readings written for you.',
  'Read the Sermon on the Mount today. Premium can give you a study of your own.',
  'Spend a few minutes in Scripture today. Premium adds a personal study when you want it.',
  'Read Scripture in your own way today. Renew Premium for personal readings.',
  'Read a few lines of Scripture today. Renew Premium for a personal reading.',
  'Read Romans 8 today, or any passage you love. Renew Premium for a personal study.',
  'A few minutes with Scripture is enough today. Premium adds a study made for you.',
  'Read a few Proverbs today. Premium can shape a study for you.',
  'Read slowly and see what stays with you. Renew Premium for personal readings.',
  'Read a passage you know well today. Renew Premium for readings made for you.',
  'Open a psalm and read it twice today. Premium is ready when you want a personal study.',
  'Read whatever Scripture you like today. Premium brings personal studies when you want them.',
  'Start in the Psalms today. Renew Premium for a study shaped around you.',
];

/** No active series. */
export const IDLE_TITLES: string[] = [
  'Ready for something new?',
  'What would you like to study next?',
  'Where to next?',
  'Choose a study',
  'Start fresh',
  'What’s next for you?',
  'Pick a direction',
  'Time for something different?',
  'Something to grow into',
  'What are you hoping to learn?',
  'What would you like to explore?',
  'Pick up something different',
  'A study for right now',
  'Ready to start again?',
  'What will you read next?',
  'Room to begin',
  'Choose your next step',
  'What’s on your heart to study?',
  'Start from here',
  'Open to something new?',
  'The next thing to study',
  'Ready when you are',
  'Something worth studying',
  'A good time to begin',
  'Plenty to choose from',
  'Where would you like to go next?',
  'What would help right now?',
  'A place to start',
  'Your call, your pace',
  'What are you curious about?',
];

/** Bodies with no active series. */
export const IDLE_BODIES: string[] = [
  'Start your next study when you\'re ready.',
  'Choose a recommended study or a new direction on Today.',
  'Share what’s happening, and a new series can begin from there.',
  'A new series can start whenever you like.',
  'Your finished series stays in your library.',
  'Open Today to pick what you study next.',
  'Begin when there is room in your day.',
  'The next series is up to you.',
  'Tell Unfold what’s going on, and your next study can grow from it.',
  'A new series is a few taps away.',
  'Find a study that fits where you are.',
  'There is no rush to begin again.',
  'Recommended studies are waiting on Today.',
  'Your next study can be about anything you need.',
  'Try a different direction for your reading.',
  'Begin a series that fits this part of your life.',
  'Read the Bible today, or start a new series.',
  'New studies start from what you share.',
  'When you’re ready, Today has options for your next study.',
  'Your rhythm can pick back up with a new study.',
  'Open Unfold to start your next series.',
  'Ask for a study on what you’re facing right now.',
  'Something new can start any time you like.',
  'A fresh series can be made for you.',
  'Start a series about what matters to you now.',
  'Today is a fine day to begin.',
  'Whatever you are carrying, a new series can start there.',
  'Look on Today for a study that fits.',
  'Take your next study at your own pace.',
  'You can read the Bible while you choose what comes after.',
];
