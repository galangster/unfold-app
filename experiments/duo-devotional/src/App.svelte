<script>
  import { tick } from 'svelte';
  import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, Feather, Moon, Sun } from 'lucide-svelte';
  import ReadingPane from './ReadingPane.svelte';
  import ReflectionPane from './ReflectionPane.svelte';
  import { passage, prayer, questions } from './content';
  import {
    failSaving,
    navigate,
    persistPresentation,
    recoverPresentation,
    retrySave,
    savedRevision,
    saveState,
    session,
    selectQuestion,
    setAnchor,
    setPane,
    toggleBookmark
  } from './session';

  const presentation = recoverPresentation();
  let pose = presentation.pose;
  let typeScale = presentation.typeScale;
  let shortSpace = presentation.shortSpace;
  let dark = presentation.dark;
  let frameWidth = 0;
  let reader;
  let reflection;
  let stayScreen;
  let todayHeading;
  let diagnosticsSummary;

  $: onePane = ['closed', 'standing'].includes(pose) || frameWidth < 700 || typeScale >= 1.4 || shortSpace;
  $: readingHidden = $session.route !== 'reading' || (onePane && $session.activePane !== 'read');
  $: reflectionHidden = $session.route !== 'reading' || (onePane && $session.activePane !== 'reflect');
  $: unfinished = questions.find(item => $session.drafts[item.id]);
  $: draftCount = Object.values($session.drafts).filter(Boolean).length;

  function writePresentation() {
    persistPresentation(pose, typeScale, shortSpace, dark);
  }

  async function changePresentation(nextPose, nextType = typeScale, nextShort = shortSpace) {
    reader?.capture();
    reflection?.captureSelection();
    pose = nextPose;
    typeScale = nextType;
    shortSpace = nextShort;
    writePresentation();
    await tick();
    await reader?.restore();
    await reflection?.keepEditorVisible();
  }

  function toggleAppearance() {
    dark = !dark;
    writePresentation();
  }

  async function goToday() {
    reader?.capture();
    reflection?.captureSelection();
    navigate('today');
    await tick();
    todayHeading?.focus({ preventScroll: true });
  }

  async function goReading(pane = $session.activePane) {
    setPane(pane);
    navigate('reading');
    await tick();
    await reader?.restore();
    if (pane === 'reflect') reflection?.focusPane();
    else reader?.focusPane();
  }

  async function switchPane(pane) {
    reader?.capture();
    reflection?.captureSelection();
    await goReading(pane);
  }

  async function enteredStay() {
    await tick();
    stayScreen?.focus({ preventScroll: true });
  }

  function leaveStay() {
    return goReading('read');
  }

  async function tryResume() {
    setAnchor({ id: 'p5', offset: 128, inset: 24 });
    await goReading('read');
  }

  async function retrySessionSave() {
    retrySave();
    await tick();
    diagnosticsSummary?.focus({ preventScroll: true });
  }
</script>

<div class="prototype" class:dark>
  <div class="workbench">
    <a class="skip-link" href={$session.route === 'reading' ? ($session.activePane === 'read' ? '#reading-pane' : '#reflect-heading') : $session.route === 'stay' ? '#stay-screen' : '#today-heading'}>Skip to content</a>
    <header class="prototype-heading">
      <div>
        <h1>Unfold</h1>
        <p class="study-label">Devotional study</p>
      </div>
      <p class="prototype-label">Browser prototype</p>
    </header>

    <div class="preview-controls" aria-label="Prototype controls">
      <label>Position
        <select aria-label="Preview position" value={pose} on:change={event => changePresentation(event.currentTarget.value)}>
          <option value="closed">Closed</option>
          <option value="flat-portrait">Flat open · portrait</option>
          <option value="flat-landscape">Flat open · landscape</option>
          <option value="book">Book</option>
          <option value="upright">Upright book</option>
          <option value="seated">Seated</option>
          <option value="standing">Standing tent</option>
        </select>
      </label>
      <label>Text size
        <select aria-label="Preview text size" value={typeScale} on:change={event => changePresentation(pose, Number(event.currentTarget.value))}>
          <option value={1}>Standard</option>
          <option value={1.2}>Large</option>
          <option value={1.5}>Accessibility size</option>
          <option value={2}>200% text</option>
        </select>
      </label>
      <label>Available height
        <select aria-label="Available height" value={shortSpace ? 'short' : 'full'} on:change={event => changePresentation(pose, typeScale, event.currentTarget.value === 'short')}>
          <option value="full">Full</option>
          <option value="short">Reduced</option>
        </select>
      </label>
      <button class="theme-toggle" type="button" aria-label={dark ? 'Use light appearance' : 'Use dark appearance'} on:click={toggleAppearance}>
        {#if dark}<Sun size={18} />{:else}<Moon size={18} />{/if}
      </button>
    </div>

    <main id="main" tabindex="-1">
      <div class="device-stage">
        <div class="device" class:compact={onePane} class:closed={pose === 'closed'} class:standing={pose === 'standing'} class:portrait={pose === 'flat-portrait'} class:seated={pose === 'seated'} class:book={pose === 'book' || pose === 'upright'} class:short={shortSpace} bind:clientWidth={frameWidth} style:--reading-scale={typeScale}>
          <header class="app-header">
            {#if $session.route === 'today'}
              <span class="wordmark">Unfold</span>
            {:else if $session.route === 'stay'}
              <button class="back-button" type="button" on:click={leaveStay}><ArrowLeft size={19} /> Back to reading</button>
              <span class="header-note">Stay with this</span>
            {:else}
              <button class="icon-button" type="button" aria-label="Back to Today" on:click={goToday}><ArrowLeft size={21} /></button>
              <span class="day-title">Day 4 <span>of 7</span></span>
              <div class="reader-actions">
                <button class="icon-button" type="button" aria-label={$session.bookmark ? 'Remove bookmark' : 'Bookmark this reading'} aria-pressed={$session.bookmark} on:click={toggleBookmark}><Bookmark size={19} fill={$session.bookmark ? 'currentColor' : 'none'} /></button>
                <button class="type-button" type="button" aria-label="Change reading text size" on:click={() => changePresentation(pose, typeScale >= 1.4 ? 1 : 1.5)}>Aa</button>
              </div>
            {/if}
          </header>

          <section class="today-screen" class:concealed={$session.route !== 'today'} aria-labelledby="today-heading">
            <div class="today-primary">
              <p class="today-meta">Learning to remain · Day 4 of 7</p>
              <h2 id="today-heading" bind:this={todayHeading} tabindex="-1">A place to remain</h2>
              <button class="primary" type="button" on:click={() => goReading('read')}>
                Continue reading <ArrowRight size={17} />
              </button>
            </div>
            <div class="today-support">
              <figure class="today-verse">
                <blockquote>“Abide in me, and I in you.”</blockquote>
                <figcaption>John 15:4 · KJV</figcaption>
              </figure>
              {#if unfinished}
                <button class="resume-reflection" type="button" on:click={() => { if (!$session.drafts[$session.question]) selectQuestion(unfinished.id); goReading('reflect'); }}>
                  <Feather size={20} />
                  <span>Continue your reflection<small>{draftCount === 1 ? unfinished.text : `${draftCount} responses started`}</small></span>
                  <ArrowRight size={16} />
                </button>
              {/if}
            </div>
          </section>

          <div class="reader-shell" class:concealed={$session.route !== 'reading'}>
            {#if onePane}
              <div class="pane-switch" aria-label="Reading and reflection">
                <button type="button" class:active={$session.activePane === 'read'} aria-pressed={$session.activePane === 'read'} on:click={() => switchPane('read')}><BookOpen size={16} /> Read</button>
                <button type="button" class:active={$session.activePane === 'reflect'} aria-pressed={$session.activePane === 'reflect'} on:click={() => switchPane('reflect')}><Feather size={16} /> Reflect</button>
              </div>
            {/if}
            <div class="panes" class:single={onePane} data-layout={onePane ? 'single' : pose === 'seated' ? 'stacked' : 'paired'}>
              <ReadingPane bind:this={reader} hidden={readingHidden} onReflect={() => switchPane('reflect')} onStay={enteredStay} />
              <ReflectionPane bind:this={reflection} hidden={reflectionHidden} />
            </div>
          </div>

          <section id="stay-screen" class="stay-screen" class:concealed={$session.route !== 'stay'} bind:this={stayScreen} tabindex="-1" aria-labelledby="stay-heading">
            <h2 id="stay-heading">{$session.stay === 'passage' ? 'John 15:4 · KJV' : 'A prayer for today'}</h2>
            <p class="stay-words">{$session.stay === 'passage' ? passage : prayer}</p>
            <button class="text-action" type="button" on:click={leaveStay}>Return when you’re ready <ArrowRight size={17} /></button>
          </section>
        </div>
      </div>
    </main>

    <details class="session-details">
      <summary bind:this={diagnosticsSummary}>Session diagnostics <span>{$saveState === 'saved' ? 'Saved locally' : 'Save needs retry'}</span></summary>
      <div class="proof-grid">
        <div><span>Reading place</span><strong>{$session.anchor.id} · character {$session.anchor.offset}</strong></div>
        <div><span>Active response</span><strong>Question {$session.question.slice(1)} · {$session.drafts[$session.question].length} characters</strong></div>
        <div><span>Draft revision</span><strong>{$session.revision} · saved {$savedRevision}</strong></div>
        <div><span>Caret selection</span><strong>{$session.selections[$session.question].join('–')}</strong></div>
      </div>
      <label class="failure-toggle"><input type="checkbox" bind:checked={$failSaving} /> Simulate a save failure on the next edit</label>
      <button class="text-action" type="button" on:click={tryResume}>Try a mid-paragraph resume <ArrowRight size={15} /></button>
      {#if $saveState === 'failed'}<button class="text-action" type="button" on:click={retrySessionSave}>Restore saving and retry <Check size={15} /></button>{/if}
      <p>Drafts stay in this browser. Position choices simulate layouts. Native hinge, keyboard, VoiceOver, and app recovery remain unverified.</p>
    </details>
  </div>
</div>
