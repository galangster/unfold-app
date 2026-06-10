import { createSingleListenerGuard } from '../listener-registration';

type Remover = jest.Mock<boolean, []>;
const okResult = (remover: Remover) => ({ ok: true as const, data: remover });

describe('createSingleListenerGuard', () => {
  it('registers exactly once across concurrent ensure() calls (REVM-6b)', async () => {
    const remover: Remover = jest.fn(() => true);
    let resolveReg!: (v: ReturnType<typeof okResult>) => void;
    const register = jest.fn(
      () => new Promise<ReturnType<typeof okResult>>((res) => { resolveReg = res; }),
    );
    const guard = createSingleListenerGuard(register);

    const p1 = guard.ensure();
    const p2 = guard.ensure(); // second caller while first is in flight
    resolveReg(okResult(remover));
    await Promise.all([p1, p2]);

    expect(register).toHaveBeenCalledTimes(1);
    expect(guard.hasListener()).toBe(true);
    expect(remover).not.toHaveBeenCalled();
  });

  it('dispose() during an in-flight registration removes the just-registered listener (REVM-6a)', async () => {
    const remover: Remover = jest.fn(() => true);
    let resolveReg!: (v: ReturnType<typeof okResult>) => void;
    const guard = createSingleListenerGuard(
      () => new Promise<ReturnType<typeof okResult>>((res) => { resolveReg = res; }),
    );

    const p = guard.ensure();
    guard.dispose(); // unmount races the await
    resolveReg(okResult(remover));
    await p;

    expect(remover).toHaveBeenCalledTimes(1); // never strand a registration
    expect(guard.hasListener()).toBe(false);
  });

  it('a failed registration allows a later retry', async () => {
    const remover: Remover = jest.fn(() => true);
    const register = jest
      .fn()
      .mockResolvedValueOnce({ ok: false as const, reason: 'identity not ready' })
      .mockResolvedValueOnce(okResult(remover));
    const guard = createSingleListenerGuard(register);

    await guard.ensure();
    expect(guard.hasListener()).toBe(false);
    await guard.ensure();
    expect(register).toHaveBeenCalledTimes(2);
    expect(guard.hasListener()).toBe(true);
  });

  it('ensure() after success is a no-op', async () => {
    const remover: Remover = jest.fn(() => true);
    const register = jest.fn().mockResolvedValue(okResult(remover));
    const guard = createSingleListenerGuard(register);
    await guard.ensure();
    await guard.ensure();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('dispose() removes an established listener and blocks re-registration', async () => {
    const remover: Remover = jest.fn(() => true);
    const register = jest.fn().mockResolvedValue(okResult(remover));
    const guard = createSingleListenerGuard(register);
    await guard.ensure();
    guard.dispose();
    expect(remover).toHaveBeenCalledTimes(1);
    await guard.ensure(); // post-dispose ensure must not re-register
    expect(register).toHaveBeenCalledTimes(1);
  });
});
