// JSDOM provides editing and focus, but has no layout or frame scheduler.
// Tests supply these browser boundaries. Native geometry still needs browser QA.
const frames = new Map();
let nextFrame = 0;

globalThis.requestAnimationFrame = callback => {
  frames.set(++nextFrame, callback);
  return nextFrame;
};
globalThis.cancelAnimationFrame = id => frames.delete(id);
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() } });
window.matchMedia = media => ({ matches: false, media });

export function finishFrame() {
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(performance.now());
}

export function clearFrames() {
  frames.clear();
}

export function readingGeometry(scroller) {
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 650 });
  scroller.getBoundingClientRect = () => new DOMRect(0, 0, 600, 650);
  const paragraphs = [...scroller.querySelectorAll('[data-reading-id]')];
  paragraphs.forEach((paragraph, index) => {
    paragraph.getBoundingClientRect = () => new DOMRect(0, index * 360 - scroller.scrollTop, 560, 360);
  });
  const previousBounds = Range.prototype.getBoundingClientRect;
  Range.prototype.getBoundingClientRect = function () {
    const paragraph = this.startContainer.parentElement.closest('[data-reading-id]');
    const line = Math.floor(this.startOffset / 40);
    return new DOMRect(0, paragraphs.indexOf(paragraph) * 360 + line * 24 - scroller.scrollTop, 14, 24);
  };
  return () => {
    if (previousBounds) Range.prototype.getBoundingClientRect = previousBounds;
    else delete Range.prototype.getBoundingClientRect;
  };
}
