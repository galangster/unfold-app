import {
  beginAmbientVoiceInterruption,
  canAnnounceMusic,
  canStartAmbientPlayback,
  endAmbientVoiceInterruption,
  endAmbientReflection,
  isTodayHomeRoute,
  notifyNarrationPlayback,
  registerAmbientLifecycle,
  setAmbientReadingContext,
  subscribeAmbientVoiceActivity,
} from '../ambient-audio-coordination';

describe('ambient audio ownership', () => {
  afterEach(endAmbientVoiceInterruption);

  it('blocks ambient start throughout voice input without resuming when input ends', () => {
    const interrupt = jest.fn();
    const stop = jest.fn();
    const cleanup = registerAmbientLifecycle({ interrupt, stop });
    beginAmbientVoiceInterruption();
    expect(canStartAmbientPlayback()).toBe(false);
    expect(interrupt).toHaveBeenCalledWith('Paused for voice input');
    endAmbientVoiceInterruption();
    expect(canStartAmbientPlayback()).toBe(true);
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    cleanup();
  });

  it('publishes voice ownership changes for open announcement previews', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAmbientVoiceActivity(listener);
    beginAmbientVoiceInterruption();
    endAmbientVoiceInterruption();
    expect(listener).toHaveBeenNthCalledWith(1, true);
    expect(listener).toHaveBeenNthCalledWith(2, false);
    unsubscribe();
  });

  it('uses the finish lifecycle boundary when the reflection ends', () => {
    const stop = jest.fn();
    const finish = jest.fn();
    const cleanup = registerAmbientLifecycle({ interrupt: jest.fn(), stop, finish });
    endAmbientReflection();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    cleanup();
  });

  it('hands audio ownership to narration and ends ambience with the reflection', () => {
    const interrupt = jest.fn();
    const stop = jest.fn();
    const cleanup = registerAmbientLifecycle({ interrupt, stop });
    notifyNarrationPlayback();
    endAmbientReflection();
    expect(interrupt).toHaveBeenCalledWith('Paused for narration');
    expect(stop).toHaveBeenCalledTimes(1);
    cleanup();
    endAmbientReflection();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('retains the current reading context across remounts and stops on a new day', () => {
    const stop = jest.fn();
    const cleanup = registerAmbientLifecycle({ interrupt: jest.fn(), stop });
    setAmbientReadingContext('sound-qa-series', 1);
    stop.mockClear();
    setAmbientReadingContext('sound-qa-series', 1);
    expect(stop).not.toHaveBeenCalled();
    setAmbientReadingContext('sound-qa-series', 2);
    expect(stop).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('does not let old cleanup detach a newer lifecycle owner', () => {
    const old = registerAmbientLifecycle({
      interrupt: jest.fn(),
      stop: jest.fn(),
    });
    const stop = jest.fn();
    const next = registerAmbientLifecycle({ interrupt: jest.fn(), stop });
    old();
    endAmbientReflection();
    expect(stop).toHaveBeenCalledTimes(1);
    next();
  });

  it('announces only from an eligible Today visit', () => {
    const eligible = {
      isTodayHome: true,
      hasUsed: false,
      soundOff: true,
      timerIdle: true,
      alreadySeen: false,
      narrationActive: false,
      voiceActive: false,
      keyboardVisible: false,
      appActive: true,
    };
    expect(canAnnounceMusic(eligible)).toBe(true);
    expect(canAnnounceMusic({ ...eligible, narrationActive: true })).toBe(false);
    expect(canAnnounceMusic({ ...eligible, voiceActive: true })).toBe(false);
    expect(canAnnounceMusic({ ...eligible, keyboardVisible: true })).toBe(false);
    expect(canAnnounceMusic({ ...eligible, hasUsed: true })).toBe(false);
    expect(canAnnounceMusic({ ...eligible, alreadySeen: true })).toBe(false);
    expect(canAnnounceMusic({ ...eligible, isTodayHome: false })).toBe(false);
  });

  it('treats Today home separately from reading and writing routes', () => {
    expect(isTodayHomeRoute('/', ['(tabs)', '(today)'])).toBe(true);
    expect(isTodayHomeRoute('/', [])).toBe(false);
    expect(isTodayHomeRoute('/reading', ['(tabs)', '(today)'])).toBe(false);
    expect(isTodayHomeRoute('/evening-wind-down', ['(tabs)', '(today)'])).toBe(false);
    expect(isTodayHomeRoute('/journal', ['(tabs)', '(today)'])).toBe(false);
    expect(isTodayHomeRoute('/past-devotionals', ['(tabs)', '(today)'])).toBe(false);
    expect(isTodayHomeRoute('/series-detail', ['(tabs)', '(today)'])).toBe(false);
    expect(isTodayHomeRoute('/my-content', ['(tabs)', '(today)'])).toBe(false);
  });
});
