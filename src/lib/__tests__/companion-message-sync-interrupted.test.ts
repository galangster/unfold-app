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

  it('leaves ordinary rows unchanged (no interrupted key at all)', () => {
    expect('interrupted' in companionMessageSyncData(base, 'c1')).toBe(false);
    expect('interrupted' in companionMessageSyncData({ ...base, interrupted: false }, 'c1')).toBe(false);
  });
});
