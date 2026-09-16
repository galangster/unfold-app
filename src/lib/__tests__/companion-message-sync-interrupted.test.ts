import { companionMessageSyncData } from '../personal-data-sync-records';
import type { CompanionMessage } from '../companion-chat-store';

const base: CompanionMessage = {
  id: 'm1',
  role: 'companion',
  content: 'The next faithful step is',
  timestamp: Date.parse('2026-09-01T12:00:00.000Z'),
  status: 'error',
};

describe('companionMessageSyncData interrupted flag', () => {
  it('carries an interrupted partial reply so another device renders it as reply text, not as an error string', () => {
    const data = companionMessageSyncData({ ...base, interrupted: true }, 'c1');
    expect(data.status).toBe('error');
    expect(data.content).toBe('The next faithful step is');
    expect(data.interrupted).toBe(true);
  });

  it('sends explicit false so a successful retry can clear a prior true flag', () => {
    expect(companionMessageSyncData({ ...base, interrupted: false }, 'c1').interrupted).toBe(false);
  });

  it('leaves omitted interrupted rows without the key', () => {
    expect('interrupted' in companionMessageSyncData(base, 'c1')).toBe(false);
  });

  it('carries a stored interrupt cause so another device can keep capacity vs connection', () => {
    const data = companionMessageSyncData({
      ...base,
      interrupted: true,
      errorCopy: 'Companion is over capacity. Try again in a moment.',
    }, 'c1');
    expect(data.errorCopy).toBe('Companion is over capacity. Try again in a moment.');
  });

  it('omits errorCopy when the user stopped or no cause was stored', () => {
    expect('errorCopy' in companionMessageSyncData({ ...base, interrupted: true }, 'c1')).toBe(false);
  });
});
