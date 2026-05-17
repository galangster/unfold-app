import { getContextSlotType, type ContextSlotInput } from '../context-slot-priority';

const base: ContextSlotInput = {
  hasResumeContext: false,
  currentHour: 10,
  currentMinute: 0,
  hasDevotional: true,
  hasReadToday: false,
  hasMiddayCheckIn: false,
  hasEveningCheckIn: false,
  hasBridgeText: false,
  isBridgeLoading: false,
  hasBridgeInput: false,
  isPremium: true,
};

describe('getContextSlotType', () => {
  it('returns resume when hasResumeContext is true (highest priority)', () => {
    expect(getContextSlotType({ ...base, hasResumeContext: true })).toBe('resume');
  });

  it('returns resume even during evening window', () => {
    expect(getContextSlotType({
      ...base, hasResumeContext: true, currentHour: 20, hasReadToday: true,
    })).toBe('resume');
  });

  it('returns none when no devotional exists', () => {
    expect(getContextSlotType({ ...base, hasDevotional: false })).toBe('none');
  });

  it('returns evening during evening window when read today and no check-in', () => {
    expect(getContextSlotType({
      ...base, currentHour: 19, hasReadToday: true, hasEveningCheckIn: false,
    })).toBe('evening');
  });

  it('returns none during evening if already checked in', () => {
    expect(getContextSlotType({
      ...base, currentHour: 19, hasReadToday: true, hasEveningCheckIn: true,
    })).toBe('none');
  });

  it('returns midday during midday window when not read and no check-in', () => {
    expect(getContextSlotType({
      ...base, currentHour: 14, hasReadToday: false, hasMiddayCheckIn: false,
    })).toBe('midday');
  });

  it('returns midday during midday window after reading when no check-in', () => {
    expect(getContextSlotType({
      ...base, currentHour: 14, hasReadToday: true, hasMiddayCheckIn: false,
    })).toBe('midday');
  });

  it('returns none during midday if already checked in', () => {
    expect(getContextSlotType({
      ...base, currentHour: 14, hasReadToday: false, hasMiddayCheckIn: true,
    })).toBe('none');
  });

  it('returns bridge when hasBridgeInput and hasBridgeText', () => {
    expect(getContextSlotType({
      ...base, hasBridgeInput: true, hasBridgeText: true,
    })).toBe('bridge');
  });

  it('returns bridge-loading when hasBridgeInput and isBridgeLoading', () => {
    expect(getContextSlotType({
      ...base, hasBridgeInput: true, isBridgeLoading: true,
    })).toBe('bridge-loading');
  });

  it('does not show bridge after reading is complete today', () => {
    expect(getContextSlotType({
      ...base, hasReadToday: true, hasBridgeInput: true, hasBridgeText: true,
    })).toBe('none');
  });

  it('does not show bridge loading after reading is complete today', () => {
    expect(getContextSlotType({
      ...base, hasReadToday: true, hasBridgeInput: true, isBridgeLoading: true,
    })).toBe('none');
  });

  it('returns none when nothing applies', () => {
    expect(getContextSlotType(base)).toBe('none');
  });

  it('returns none for free users during evening window', () => {
    expect(getContextSlotType({
      ...base, isPremium: false, currentHour: 19, hasReadToday: true,
    })).toBe('none');
  });

  it('returns none for free users during midday window', () => {
    expect(getContextSlotType({
      ...base, isPremium: false, currentHour: 14, hasReadToday: false,
    })).toBe('none');
  });

  it('returns none for free users with bridge text', () => {
    expect(getContextSlotType({
      ...base, isPremium: false, hasBridgeInput: true, hasBridgeText: true,
    })).toBe('none');
  });

  it('returns resume for free users (resume is not gated)', () => {
    expect(getContextSlotType({
      ...base, isPremium: false, hasResumeContext: true,
    })).toBe('resume');
  });
});
