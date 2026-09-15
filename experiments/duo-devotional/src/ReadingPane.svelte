<script>
  import { onMount, tick } from 'svelte';
  import { ArrowUpRight } from 'lucide-svelte';
  import { get } from 'svelte/store';
  import { passage, paragraphs, prayer } from './content';
  import { enterStay, session, setAnchor, setPane } from './session';

  export let hidden = false;
  export let onReflect = () => {};
  export let onStay = () => {};
  let scroller;
  let article;
  let restoring = false;
  let pendingScroll = false;
  let scrollFrame;
  let restoreFrame;

  export function capture(force = false) {
    if (!scroller || hidden || restoring || !scroller.clientHeight || (!force && !pendingScroll)) return;
    pendingScroll = false;
    if (scroller.scrollTop <= 1) {
      setAnchor({ id: 'start', offset: 0, inset: 0 });
      return;
    }
    const box = scroller.getBoundingClientRect();
    const probeY = box.top + 28;
    const visible = Array.from(article.querySelectorAll('[data-reading-id]')).find(element => element.getBoundingClientRect().bottom > probeY);
    if (!visible) return;
    const text = visible.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE || !text.textContent.length) return;
    const range = document.createRange();
    let low = 0;
    let high = text.textContent.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      range.setStart(text, middle);
      range.setEnd(text, middle + 1);
      if (range.getBoundingClientRect().bottom <= probeY) low = middle + 1;
      else high = middle;
    }
    range.setStart(text, low);
    range.setEnd(text, low + 1);
    setAnchor({ id: visible.dataset.readingId, offset: low, inset: range.getBoundingClientRect().top - box.top });
  }

  export async function restore() {
    await tick();
    if (!scroller || hidden || !scroller.clientHeight) return;
    restoring = true;
    const anchor = get(session).anchor;
    if (anchor.id === 'start') scroller.scrollTop = 0;
    const target = article.querySelector('[data-reading-id="' + anchor.id + '"]');
    if (target) {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      let offset = anchor.offset;
      while (text && offset > text.textContent.length) {
        offset -= text.textContent.length;
        text = walker.nextNode();
      }
      let top = target.getBoundingClientRect().top;
      if (text) {
        const range = document.createRange();
        range.setStart(text, Math.min(offset, text.textContent.length));
        range.setEnd(text, Math.min(offset + 1, text.textContent.length));
        top = range.getBoundingClientRect().top;
      }
      scroller.scrollTop += top - scroller.getBoundingClientRect().top - anchor.inset;
    }
    cancelAnimationFrame(restoreFrame);
    restoreFrame = requestAnimationFrame(() => { restoring = false; });
  }

  export function focusPane() {
    scroller?.focus({ preventScroll: true });
  }

  function onScroll() {
    if (restoring) return;
    setPane('read');
    if (document.activeElement?.closest('.reflection-pane')) focusPane();
    pendingScroll = true;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => capture());
  }

  $: if (!hidden) restore();

  onMount(() => {
    const observer = new ResizeObserver(restore);
    observer.observe(scroller);
    observer.observe(article);
    document.fonts.ready.then(restore);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(restoreFrame);
    };
  });
</script>

<section id="reading-pane" class="reading-pane" class:concealed={hidden} aria-labelledby="reading-heading" tabindex="-1" bind:this={scroller} on:scroll={onScroll} on:focusin={() => setPane('read')} on:pointerdown={focusPane}>
  <article bind:this={article}>
    <div class="reading-art" aria-hidden="true"></div>
    <p class="eyebrow">Learning to remain · Day 4</p>
    <h2 id="reading-heading">A place to remain</h2>
    <div class="scripture">
      <p class="reference">John 15:4 · KJV</p>
      <p data-reading-id="scripture">{passage}</p>
      <button class="text-action" type="button" on:click={() => { capture(true); enterStay('passage'); onStay(); }}>Stay with this passage <ArrowUpRight size={15} /></button>
    </div>
    {#each paragraphs as paragraph}
      <p data-reading-id={paragraph.id}>{paragraph.text}</p>
    {/each}
    <div class="prayer">
      <h3>A prayer for today</h3>
      <p data-reading-id="prayer">{prayer}</p>
      <button class="text-action" type="button" on:click={() => { capture(true); enterStay('prayer'); onStay(); }}>Stay with this prayer <ArrowUpRight size={15} /></button>
    </div>
    <button class="primary reflect-cta" type="button" on:click={() => { capture(); onReflect(); }}>Make room to reflect <ArrowUpRight size={17} /></button>
  </article>
</section>
