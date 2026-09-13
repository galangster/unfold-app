import {
  deriveConversationTitleFromText,
  sentenceCaseTitle,
  type Conversation,
} from './companion-chat-store';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

export type DrawerListItem =
  | { type: 'header'; label: string }
  | { type: 'conversation'; conversation: Conversation };

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Local midnight offset by whole calendar days. Do not subtract fixed milliseconds. */
export function startOfLocalDayOffset(timestamp: number, dayOffset: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset).getTime();
}

export function getFullConversationTitle(conversation: Conversation): string {
  if (conversation.title) {
    const display = sentenceCaseTitle(conversation.title);
    if (display) return display;
  }
  const firstUser = (conversation.messages ?? []).find((message) => message.role === 'user');
  if (firstUser) {
    const derived = deriveConversationTitleFromText(firstUser.content);
    if (derived) return derived;
  }
  return 'New chat';
}

export function getConversationTitle(conversation: Conversation): string {
  const display = getFullConversationTitle(conversation);
  return display.length > 60 ? display.slice(0, 57) + '…' : display;
}

export function formatRelativeDate(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;

  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) {
    return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  }
  if (diff < ONE_DAY_MS) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }
  if (diff < ONE_WEEK_MS) {
    return `${Math.floor(diff / ONE_DAY_MS)}d ago`;
  }
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function conversationMatchesTitleQuery(
  conversation: Conversation,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return getFullConversationTitle(conversation).toLowerCase().includes(needle);
}

export function buildListItems(
  conversations: Conversation[],
  now = Date.now(),
): DrawerListItem[] {
  const sorted = [...conversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  const todayStart = startOfLocalDay(now);
  const weekStart = startOfLocalDayOffset(now, -6);

  const starred: Conversation[] = [];
  const today: Conversation[] = [];
  const thisWeek: Conversation[] = [];
  const earlier: Conversation[] = [];

  for (const conversation of sorted) {
    if (conversation.pinned) {
      starred.push(conversation);
      continue;
    }
    const activityDay = startOfLocalDay(conversation.lastMessageAt);
    if (activityDay >= todayStart) today.push(conversation);
    else if (activityDay >= weekStart) thisWeek.push(conversation);
    else earlier.push(conversation);
  }

  const items: DrawerListItem[] = [];
  const append = (label: string, group: Conversation[]) => {
    if (group.length === 0) return;
    items.push({ type: 'header', label });
    for (const conversation of group) {
      items.push({ type: 'conversation', conversation });
    }
  };

  append('Starred', starred);
  append('Today', today);
  append('This Week', thisWeek);
  append('Earlier', earlier);
  return items;
}
