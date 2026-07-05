<script lang="ts">
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { api } from '$lib/api';

  type Student = { id: string; name: string; email: string };

  let {
    excludeIds = [],
    disabled = false,
    onSelect,
  }: {
    excludeIds?: string[];
    disabled?: boolean;
    onSelect: (user: Student | null) => void;
  } = $props();

  let query = $state('');
  let allStudents = $state<Student[]>([]);
  let open = $state(false);
  let loading = $state(false);
  let loaded = $state(false);
  let selected = $state<Student | null>(null);

  const results = $derived.by(() => {
    const term = query.trim().toLowerCase();
    return allStudents
      .filter((s) => !excludeIds.includes(s.id))
      .filter(
        (s) =>
          !term ||
          s.name.toLowerCase().includes(term) ||
          s.email.toLowerCase().includes(term),
      );
  });

  export function reset() {
    query = '';
    selected = null;
    open = false;
    onSelect(null);
  }

  async function ensureLoaded() {
    if (loaded || loading) return;
    loading = true;
    try {
      allStudents = await api.getStudents();
      loaded = true;
    } catch {
      allStudents = [];
    } finally {
      loading = false;
    }
  }

  async function onFocus() {
    await ensureLoaded();
    open = true;
  }

  function onInput(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    query = value;
    selected = null;
    onSelect(null);
    open = true;
    void ensureLoaded();
  }

  function pick(user: Student) {
    selected = user;
    query = `${user.name} (${user.email})`;
    open = false;
    onSelect(user);
  }

  function onBlur() {
    setTimeout(() => {
      open = false;
    }, 150);
  }
</script>

<div class="student-search">
  <input
    type="search"
    class="student-search-input"
    placeholder={t('admin.searchStudent', $locale)}
    bind:value={query}
    {disabled}
    autocomplete="off"
    oninput={onInput}
    onfocus={onFocus}
    onblur={onBlur}
  />
  {#if loading}
    <span class="student-search-hint">{t('admin.searching', $locale)}</span>
  {:else if open && loaded && results.length === 0 && !selected}
    <span class="student-search-hint">{t('admin.noSearchResults', $locale)}</span>
  {/if}
  {#if open && (loading || results.length > 0)}
    <ul class="student-search-results" role="listbox">
      {#if loading}
        <li class="student-search-loading">{t('admin.searching', $locale)}</li>
      {:else}
        {#each results as user (user.id)}
          <li>
            <button type="button" role="option" onmousedown={(e) => e.preventDefault()} onclick={() => pick(user)}>
              <span class="student-search-name">{user.name}</span>
              <span class="student-search-email">{user.email}</span>
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>
