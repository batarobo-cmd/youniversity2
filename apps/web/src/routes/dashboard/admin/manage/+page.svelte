<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isAdmin, locale, token } from '$lib/stores/auth';
  import { get } from 'svelte/store';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n';
  import { subscribeDashboardRefresh } from '$lib/live-dashboard';
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
    error = data.loadError ?? '';
  });

  onMount(() => {
    const unsubAuth = isAuthenticated.subscribe((auth) => {
      if (!auth) goto('/');
    });
    const unsubAdmin = isAdmin.subscribe((admin) => {
      if (!admin) goto('/dashboard');
    });
    const unsubWs = subscribeDashboardRefresh(() => {
      if (get(token)) void loadAll();
    });
    return () => {
      unsubAuth();
      unsubAdmin();
      unsubWs();
    };
  });

  async function loadAll() {
    loading = true;
    error = '';
    try {
      const [cats, crs] = await Promise.all([api.getCategories(), api.getCourses()]);
      categories = cats as Category[];
      courses = crs as Course[];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
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
    error = '';
    message = '';
    try {
      await api.createCategory({ name, slug, parentId: parentId ?? null });
      message = t('admin.saved', $locale);
      await loadAll();
    } catch (e) {
      error = (e as Error).message;
      throw e;
    }
  }

  async function handleAddSubcategory(parentId: string, name: string, slug: string) {
    return handleAddCategory(name, slug, parentId);
  }

  async function handleUpdateCategory(id: string, name: string, slug: string) {
    error = '';
    message = '';
    try {
      await api.updateCategory(id, { name, slug });
      message = t('admin.saved', $locale);
      await loadAll();
    } catch (e) {
      error = (e as Error).message;
      throw e;
    }
  }

  async function handleRemoveCategory(id: string) {
    error = '';
    message = '';
    try {
      await api.deleteCategory(id);
      message = t('admin.saved', $locale);
      await loadAll();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function resolveId(manual: string, name: string) {
    const trimmed = manual.trim();
    if (trimmed) return trimmed;
    return slugify(name);
  }

  async function handleAddCourse(categoryId: string | null) {
    error = '';
    message = '';
    try {
      const slug = resolveId(courseDraft.slug, courseDraft.title);
      await api.createCourse({
        slug,
        title: courseDraft.title.trim(),
        description: courseDraft.desc.trim(),
        categoryId,
        defaultLocale: $locale,
      });
      message = t('admin.saved', $locale);
      await loadAll();
    } catch (e) {
      error = (e as Error).message;
      throw e;
    }
  }

  async function handleTogglePublish(course: Course) {
    error = '';
    try {
      await api.publishCourse(course.id, !course.isPublished);
      message = t('admin.saved', $locale);
      await loadAll();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function handleRemoveCourse(courseId: string) {
    if (!confirm(t('admin.deleteCourseConfirm', $locale))) return;
    error = '';
    message = '';
    try {
      await api.deleteCourse(courseId);
      message = t('admin.saved', $locale);
      await loadAll();
    } catch (e) {
      error = (e as Error).message;
    }
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
