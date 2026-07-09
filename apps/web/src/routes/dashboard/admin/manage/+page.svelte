<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { isAuthenticated, isAdmin, locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';
  import { subscribeDashboardRefresh } from '$lib/live-dashboard';
  import { submitAction } from '$lib/client/form-action';
  import CategoryCourseTree from '$lib/components/CategoryCourseTree.svelte';
  import type { PageData } from './$types';
  import '$lib/styles/dashboard.css';
  import '$lib/styles/admin-manage.css';

  type Category = { id: string; slug: string; name: string; sortOrder: number; parentId?: string | null };
  type Course = {
    id: string;
    slug: string;
    title: string;
    description?: string;
    isPublished: boolean;
    categoryId?: string | null;
  };

  let { data }: { data: PageData } = $props();

  let categories = $state<Category[]>(data.categories as Category[]);
  let courses = $state<Course[]>(data.courses as Course[]);
  let loading = $state(false);
  let message = $state('');
  let error = $state(data.loadError ?? '');

  let expanded = $state<Record<string, boolean>>({});
  let openCourseForm = $state<string | null>(null);
  let courseDraft = $state({ title: '', slug: '', desc: '' });

  $effect(() => {
    categories = data.categories as Category[];
    courses = data.courses as Course[];
    if (data.loadError) error = data.loadError;
  });

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isAdmin.subscribe((admin) => {
      if (!admin) goto('/dashboard');
    });
    const unsubWs = subscribeDashboardRefresh(() => {
      void refreshData();
    });
    return () => {
      unsubAuth();
      unsubAdmin();
      unsubWs();
    };
  });

  async function refreshData() {
    loading = true;
    try {
      await invalidateAll();
    } finally {
      loading = false;
    }
  }

  async function runMutation(
    action: string,
    fields: Record<string, string | null | undefined>,
    options: { throwOnError?: boolean } = {},
  ) {
    error = '';
    message = '';
    const result = await submitAction(action, fields);
    if (result.type === 'failure') {
      error = String(result.data?.error ?? 'Chyba');
      if (options.throwOnError) throw new Error(error);
      return false;
    }
    message = t('admin.saved', $locale);
    await refreshData();
    return true;
  }

  function slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async function handleAddCategory(name: string, slug: string, parentId?: string | null) {
    await runMutation('createCategory', { name, slug, parentId: parentId ?? null }, { throwOnError: true });
  }

  async function handleAddSubcategory(parentId: string, name: string, slug: string) {
    return handleAddCategory(name, slug, parentId);
  }

  async function handleUpdateCategory(id: string, name: string, slug: string) {
    await runMutation('updateCategory', { id, name, slug }, { throwOnError: true });
  }

  async function handleRemoveCategory(id: string) {
    await runMutation('deleteCategory', { id });
  }

  function resolveId(manual: string, name: string) {
    const trimmed = manual.trim();
    if (trimmed) return trimmed;
    return slugify(name);
  }

  async function handleAddCourse(categoryId: string | null) {
    const slug = resolveId(courseDraft.slug, courseDraft.title);
    await runMutation(
      'createCourse',
      {
        slug,
        title: courseDraft.title.trim(),
        description: courseDraft.desc.trim(),
        categoryId,
        defaultLocale: $locale,
      },
      { throwOnError: true },
    );
  }

  async function handleTogglePublish(course: Course) {
    await runMutation('publishCourse', {
      id: course.id,
      isPublished: String(!course.isPublished),
    });
  }

  async function handleRemoveCourse(courseId: string) {
    if (!confirm(t('admin.deleteCourseConfirm', $locale))) return;
    await runMutation('deleteCourse', { id: courseId });
  }
</script>

<div class="admin-manage-header">
  <h1>{t('admin.manageTitle', $locale)}</h1>
  <p>{t('admin.manageSub', $locale)}</p>
</div>

{#if message}
  <div class="admin-flash admin-flash--ok">{message}</div>
{/if}
{#if error}
  <div class="admin-flash admin-flash--err">{error}</div>
{/if}

{#if loading}
  <p class="loading-text">...</p>
{:else}
  <CategoryCourseTree
    {categories}
    {courses}
    bind:expanded
    bind:openCourseForm
    bind:courseDraft
    {slugify}
    onAddCategory={handleAddCategory}
    onAddSubcategory={handleAddSubcategory}
    onUpdateCategory={handleUpdateCategory}
    onRemoveCategory={handleRemoveCategory}
    onAddCourse={handleAddCourse}
    onTogglePublish={handleTogglePublish}
    onRemoveCourse={handleRemoveCourse}
  />
{/if}
