import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../../hooks/useCreationGate.ts'),
  'utf-8',
);

describe('useCreationGate blocked-action feedback wiring', () => {
  it('never returns false for a blocked action without emitting pending feedback', () => {
    const blockedIdx = src.indexOf("if (action === 'blocked')");
    expect(blockedIdx).toBeGreaterThan(-1);
    const feedbackIdx = src.indexOf('notifyPendingSubscriptionCheck', blockedIdx);
    const returnIdx = src.indexOf('return false', blockedIdx);
    expect(feedbackIdx).toBeGreaterThan(blockedIdx);
    expect(feedbackIdx).toBeLessThan(returnIdx);
  });

  it('announces the pending state to screen readers', () => {
    expect(src).toContain('announceForAccessibility');
  });
});
