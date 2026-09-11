export async function runReminderTimeCommit(d: {
  isTransitioning(): boolean;
  setTransitioning(v: boolean): void;
  select(): void;
  settleDelayMs: number;
  askPermissionOnce(): Promise<void>;
  advance(): void;
  wait(ms: number): Promise<void>;
}): Promise<'advanced' | 'ignored'> {
  if (d.isTransitioning()) return 'ignored';
  d.setTransitioning(true);
  d.select();
  await d.wait(d.settleDelayMs);
  try {
    await d.askPermissionOnce();
  } catch {
    // A rejected ask still advances.
  }
  d.advance();
  d.setTransitioning(false);
  return 'advanced';
}
