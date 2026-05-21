export const TODAY_STACK_CARD_KINDS = [
  'resume',
  'midday',
  'evening',
  'bridge',
  'bridge-loading',
  'remember-this',
  'day1-review',
  'premium-nudge',
] as const;

export type TodayStackCardKind = (typeof TODAY_STACK_CARD_KINDS)[number];

export interface TodayStackCardItem {
  id: string;
  kind: TodayStackCardKind;
  /** Larger numbers render first. Production adapters should encode product priority here. */
  priority: number;
}

export interface TodayCardStackModel<T extends TodayStackCardItem> {
  cards: T[];
  topCard: T | null;
  backCards: T[];
  totalCount: number;
  visibleBackCount: number;
}

export const TODAY_CARD_STACK_MAX_BACK_CARDS = 2;

export function orderTodayStackCards<T extends TodayStackCardItem>(cards: readonly T[]): T[] {
  return cards
    .filter((card) => card.id.trim().length > 0)
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      if (left.card.priority !== right.card.priority) {
        return right.card.priority - left.card.priority;
      }
      return left.index - right.index;
    })
    .map(({ card }) => card);
}

export function buildTodayCardStackModel<T extends TodayStackCardItem>(
  cards: readonly T[],
  maxBackCards = TODAY_CARD_STACK_MAX_BACK_CARDS,
): TodayCardStackModel<T> {
  const orderedCards = orderTodayStackCards(cards);
  const topCard = orderedCards[0] ?? null;
  const safeBackCardCount = Math.max(0, Math.floor(maxBackCards));
  const backCards = orderedCards.slice(1, 1 + safeBackCardCount);

  return {
    cards: orderedCards,
    topCard,
    backCards,
    totalCount: orderedCards.length,
    visibleBackCount: backCards.length,
  };
}
