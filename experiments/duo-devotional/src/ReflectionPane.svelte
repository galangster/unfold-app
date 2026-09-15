<script>
  import { onMount, tick } from 'svelte';
  import { Feather } from 'lucide-svelte';
  import { questions } from './content';
  import { rememberSelection, retrySave, saveState, selectQuestion, session, setPane, updateDraft } from './session';

  export let hidden = false;
  let pane;
  let editor;
  let composing = false;
  let pendingQuestion = '';
  $: question = questions.find(item => item.id === $session.question) ?? questions[0];

  function saveEditor() {
    updateDraft(editor.value);
    rememberSelection(editor.selectionStart, editor.selectionEnd);
  }

  export function captureSelection() {
    if (editor && document.activeElement === editor) rememberSelection(editor.selectionStart, editor.selectionEnd);
  }

  export async function keepEditorVisible() {
    await tick();
    if (!editor || hidden || $session.activePane !== 'reflect') return;
    const bounds = pane.getBoundingClientRect();
    const field = editor.getBoundingClientRect();
    if (field.bottom > bounds.bottom) pane.scrollTop += field.bottom - bounds.bottom + 32;
    if (field.top < bounds.top) pane.scrollTop -= bounds.top - field.top + 16;
  }

  export function focusPane() {
    pane?.focus({ preventScroll: true });
  }

  async function restoreSelection(focus = false) {
    await tick();
    if (!editor || hidden) return;
    const [start, end] = $session.selections[$session.question];
    editor.setSelectionRange(start, end);
    if (focus) {
      editor.focus({ preventScroll: true });
      keepEditorVisible();
    }
  }

  async function chooseQuestion(id) {
    if (composing) {
      pendingQuestion = id;
      return;
    }
    captureSelection();
    selectQuestion(id);
    await restoreSelection(true);
  }

  async function retryDraftSave() {
    retrySave();
    if ($saveState === 'saved') await restoreSelection(true);
  }

  function finishComposition() {
    composing = false;
    saveEditor();
    if (pendingQuestion) {
      const next = pendingQuestion;
      pendingQuestion = '';
      chooseQuestion(next);
    }
  }

  $: if (!hidden) restoreSelection();

  onMount(() => {
    const observer = new ResizeObserver(keepEditorVisible);
    observer.observe(editor);
    observer.observe(pane);
    return () => observer.disconnect();
  });
</script>

<section class="reflection-pane" class:concealed={hidden} bind:this={pane} tabindex="-1" aria-labelledby="reflect-heading">
  <div class="reflected-art" aria-hidden="true"></div>
  <div class="reflection-heading">
    <h2 id="reflect-heading" tabindex="-1">Reflect</h2>
  </div>
  <label class="question-picker">Question
    <select aria-label="Reflection question" value={$session.question} on:change={event => chooseQuestion(event.currentTarget.value)}>
      {#each questions as item}<option value={item.id}>{item.text}</option>{/each}
    </select>
  </label>
  <div class="questions" aria-label="Reflection questions">
    {#each questions as item}
      <button
        class="question"
        class:selected={item.id === $session.question}
        class:started={Boolean($session.drafts[item.id])}
        aria-pressed={item.id === $session.question}
        type="button"
        on:click={() => chooseQuestion(item.id)}
      >
        <span class="question-text" id={'question-' + item.id}>{item.text}</span>
        <span class="question-status" class:empty={!$session.drafts[item.id]}><Feather size={15} aria-hidden="true" /><span class="sr-only">{$session.drafts[item.id] ? 'Response started' : ''}</span></span>
      </button>
    {/each}
  </div>
  <label class="editor-label" id="response-label" for="reflection-draft">Your response</label>
  <p class="active-prompt" aria-hidden="true">{question.text}</p>
  <textarea
    id="reflection-draft"
    name="reflection-draft"
    bind:this={editor}
    aria-labelledby={'response-label question-' + question.id}
    aria-describedby="save-status"
    placeholder="Write a response…"
    value={$session.drafts[$session.question]}
    on:input={saveEditor}
    on:select={captureSelection}
    on:keyup={captureSelection}
    on:click={captureSelection}
    on:focus={() => setPane('reflect')}
    on:compositionstart={() => { composing = true; }}
    on:compositionend={finishComposition}
  ></textarea>
  <div class="save-status" id="save-status" role="status">
    {#if $saveState === 'saved'}Saved on this device
    {:else}Unsaved edits remain in this open tab and may be lost on reload. <button class="text-action" type="button" on:click={retryDraftSave}>Retry save</button>{/if}
  </div>
</section>
