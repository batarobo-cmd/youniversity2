<script lang="ts">
  import CategoryTreeNode, { type Category, type Course } from '$lib/components/CategoryTreeNode.svelte';
  import CategoryEditModal from '$lib/components/CategoryEditModal.svelte';
  import CoursePublicationBadge from '$lib/components/CoursePublicationBadge.svelte';
  import { getCoursePublicationDisplayStatus } from '$lib/course-publish-status';
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';

  const UNCATEGORIZED = '__none__';

  let {
    categories,
    courses,
    expanded = $bindable<Record<string, boolean>>({}),
    openCourseForm = $bindable<string | null>(null),
    courseDraft = $bindable({ title: '', slug: '', desc: '' }),
    onAddCategory,
    onAddSubcategory,
    onUpdateCategory,
    onRemoveCategory,
    onAddCourse,
    onTogglePublish,
    onRemoveCourse,
    slugify,
  }: {
    categories: Category[];
    courses: Course[];
    expanded?: Record<string, boolean>;
    openCourseForm?: string | null;
    courseDraft?: { title: string; slug: string; desc: string };
    onAddCategory: (name: string, slug: string, parentId?: string | null) => Promise<void>;
    onAddSubcategory: (parentId: string, name: string, slug: string) => Promise<void>;
    onUpdateCategory: (id: string, name: string, slug: string) => Promise<void>;
    onRemoveCategory: (id: string) => Promise<void>;
    onAddCourse: (categoryId: string | null) => Promise<void>;
    onTogglePublish: (course: Course) => Promise<void>;
    onRemoveCourse: (courseId: string) => Promise<void>;
    slugify: (value: string) => string;
  } = $props();

  let showCategoryForm = $state(false);
  let newCatName = $state('');
  let newCatId = $state('');
  let newCatIdManual = $state(false);
  let openSubcategoryForm = $state<string | null>(null);
  let subcategoryDraft = $state({ name: '', slug: '' });
  let subIdManual = $state(false);
  let courseIdManual = $state(false);
  let formError = $state('');

  let editCategory = $state<Category | null>(null);
  let editModalOpen = $state(false);
  let editSaving = $state(false);
  let editError = $state('');

  const rootCategories = $derived(
    categories
      .filter((c) => !c.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
  );

  const uncategorizedCourses = $derived(courses.filter((c) => !c.categoryId));

  function isExpanded(key: string) {
    return expanded[key] === true;
  }

  function toggleExpanded(key: string) {
    expanded = { ...expanded, [key]: !isExpanded(key) };
  }

  function resolveId(manual: string, name: string) {
    const trimmed = manual.trim();
    if (trimmed) return trimmed;
    return slugify(name);
  }

  function openUncategorizedCourseForm() {
    expanded = { ...expanded, [UNCATEGORIZED]: true };
    openCourseForm = UNCATEGORIZED;
    openSubcategoryForm = null;
    courseDraft = { title: '', slug: '', desc: '' };
    courseIdManual = false;
    formError = '';
  }

  function closeCourseForm() {
    openCourseForm = null;
    courseDraft = { title: '', slug: '', desc: '' };
  }

  function openCategoryEdit(cat: Category) {
    editCategory = cat;
    editModalOpen = true;
    editError = '';
  }

  function closeCategoryEdit() {
    editModalOpen = false;
    editCategory = null;
    editError = '';
  }

  async function saveCategoryEdit(id: string, name: string, slug: string) {
    editSaving = true;
    editError = '';
    try {
      await onUpdateCategory(id, name, slug);
      closeCategoryEdit();
    } catch (err) {
      editError = (err as Error).message;
    } finally {
      editSaving = false;
    }
  }

  async function submitRootCategory(e: Event) {
    e.preventDefault();
    formError = '';
    const name = newCatName.trim();
    if (!name) return;
    const id = resolveId(newCatId, name);
    if (id.length < 2) {
      formError = t('admin.idTooShort', $locale);
      return;
    }
    try {
      await onAddCategory(name, id, null);
      newCatName = '';
      newCatId = '';
      newCatIdManual = false;
      showCategoryForm = false;
    } catch (err) {
      formError = (err as Error).message;
    }
  }

  async function submitUncategorizedCourse(e: Event) {
    e.preventDefault();
    formError = '';
    const title = courseDraft.title.trim();
    if (!title) return;
    const id = resolveId(courseDraft.slug, title);
    if (id.length < 2) {
      formError = t('admin.idTooShort', $locale);
      return;
    }
    courseDraft = { ...courseDraft, slug: id };
    try {
      await onAddCourse(null);
      closeCourseForm();
    } catch (err) {
      formError = (err as Error).message;
    }
  }

  function courseCountLabel(count: number) {
    if (count === 1) return t('admin.treeOneCourse', $locale);
    if (count >= 2 && count <= 4) return t('admin.treeFewCourses', $locale).replace('{n}', String(count));
    return t('admin.treeManyCourses', $locale).replace('{n}', String(count));
  }
</script>

<div class="cat-tree">
  <div class="cat-tree-toolbar">
    <button type="button" class="btn btn-sm cat-tree-toolbar-btn" onclick={() => { showCategoryForm = !showCategoryForm; if (showCategoryForm) { newCatName = ''; newCatId = ''; newCatIdManual = false; formError = ''; } }}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      {t('admin.addRootCategory', $locale)}
    </button>
    <span class="cat-tree-toolbar-meta">{categories.length} {t('admin.categories', $locale).toLowerCase()} · {courses.length} {t('admin.courses', $locale).toLowerCase()}</span>
  </div>

  {#if showCategoryForm}
    <form class="cat-tree-root-form" onsubmit={submitRootCategory}>
      <div class="cat-tree-root-form-fields">
        <div class="cat-tree-field">
          <label for="cat-name">{t('admin.categoryName', $locale)}</label>
          <input id="cat-name" bind:value={newCatName} required oninput={() => { if (!newCatIdManual) newCatId = slugify(newCatName); }} />
        </div>
        <div class="cat-tree-field">
          <label for="cat-id">{t('admin.categoryId', $locale)}</label>
          <input id="cat-id" bind:value={newCatId} placeholder={slugify(newCatName) || '…'} oninput={() => { newCatIdManual = true; }} />
          <span class="cat-tree-field-hint">{t('admin.idAutoHint', $locale)}</span>
        </div>
      </div>
      {#if formError && showCategoryForm}<p class="cat-tree-form-error">{formError}</p>{/if}
      <div class="cat-tree-root-form-actions">
        <button type="submit" class="btn btn-sm">{t('admin.addCategory', $locale)}</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => { showCategoryForm = false; formError = ''; }}>{t('admin.cancel', $locale)}</button>
      </div>
    </form>
  {/if}

  <div class="cat-tree-body">
    {#each rootCategories as cat (cat.id)}
      <CategoryTreeNode
        category={cat}
        depth={0}
        {categories}
        {courses}
        bind:expanded
        bind:openCourseForm
        bind:openSubcategoryForm
        bind:subcategoryDraft
        bind:courseDraft
        bind:formError
        bind:subIdManual
        bind:courseIdManual
        onEditCategory={openCategoryEdit}
        {onRemoveCategory}
        {onAddSubcategory}
        {onAddCourse}
        {onTogglePublish}
        {onRemoveCourse}
        {slugify}
      />
    {/each}

    <section class="cat-tree-node cat-tree-node--uncategorized" class:cat-tree-node--collapsed={!isExpanded(UNCATEGORIZED)}>
      <div class="cat-tree-node-head">
        <button type="button" class="cat-tree-toggle" aria-expanded={isExpanded(UNCATEGORIZED)} onclick={() => toggleExpanded(UNCATEGORIZED)}>
          <svg class="cat-tree-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
        <div class="cat-tree-node-icon cat-tree-node-icon--muted" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 012-2h5l2 2h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-dasharray="3 3" /></svg>
        </div>
        <div class="cat-tree-node-info">
          <span class="cat-tree-node-name">{t('admin.noCategory', $locale)}</span>
          <span class="cat-tree-node-meta">{courseCountLabel(uncategorizedCourses.length)}</span>
        </div>
        <div class="cat-tree-node-actions">
          <button type="button" class="btn btn-sm cat-tree-add-course" onclick={openUncategorizedCourseForm}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
            {t('admin.addCourseHere', $locale)}
          </button>
        </div>
      </div>

      {#if isExpanded(UNCATEGORIZED)}
        <div class="cat-tree-children">
          {#if openCourseForm === UNCATEGORIZED}
            <form class="cat-tree-course-form" onsubmit={submitUncategorizedCourse}>
              <input bind:value={courseDraft.title} placeholder={t('admin.courseTitle', $locale)} required oninput={() => { if (!courseIdManual) courseDraft = { ...courseDraft, slug: slugify(courseDraft.title) }; }} />
              <input bind:value={courseDraft.slug} placeholder={t('admin.courseId', $locale)} oninput={() => { courseIdManual = true; }} />
              <span class="cat-tree-field-hint">{t('admin.idAutoHint', $locale)}</span>
              <textarea bind:value={courseDraft.desc} placeholder={t('admin.courseDescription', $locale)} rows="2"></textarea>
              {#if formError && openCourseForm === UNCATEGORIZED}<p class="cat-tree-form-error">{formError}</p>{/if}
              <div class="cat-tree-course-form-actions">
                <button type="submit" class="btn btn-sm">{t('admin.addCourse', $locale)}</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick={closeCourseForm}>{t('admin.cancel', $locale)}</button>
              </div>
            </form>
          {/if}

          {#if uncategorizedCourses.length === 0 && openCourseForm !== UNCATEGORIZED}
            <p class="cat-tree-empty">{t('admin.emptyUncategorized', $locale)}</p>
          {:else}
            {#each uncategorizedCourses as course (course.id)}
              {@const publicationStatus = getCoursePublicationDisplayStatus(course)}
              <article class="cat-tree-course cat-tree-course--compact">
                <div class="cat-tree-course-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5V6.5A2.5 2.5 0 016.5 4H20v13H6.5A2.5 2.5 0 004 19.5z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </div>
                <div class="cat-tree-course-main">
                  <div class="cat-tree-course-head">
                    <span class="cat-tree-course-title">{course.title}</span>
                    <CoursePublicationBadge {course} />
                  </div>
                  <span class="cat-tree-course-slug">ID: {course.slug}</span>
                </div>
                <div class="cat-tree-icon-group cat-tree-course-quick">
                  <a href="/dashboard/admin/manage/courses/{course.id}" class="cat-tree-icon-btn" title={t('admin.editCourse', $locale)} aria-label={t('admin.editCourse', $locale)}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </a>
                  <button type="button" class="cat-tree-icon-btn cat-tree-icon-btn--danger" title={t('admin.deleteCourse', $locale)} aria-label={t('admin.deleteCourse', $locale)} onclick={() => onRemoveCourse(course.id)}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </button>
                  <button type="button" class="cat-tree-icon-btn" class:cat-tree-icon-btn--published={publicationStatus === 'published'} class:cat-tree-icon-btn--scheduled={publicationStatus === 'scheduled'} title={course.isPublished ? t('admin.unpublish', $locale) : t('admin.publish', $locale)} aria-label={course.isPublished ? t('admin.unpublish', $locale) : t('admin.publish', $locale)} onclick={() => onTogglePublish(course)}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="currentColor" stroke-width="1.75" /></svg>
                  </button>
                </div>
              </article>
            {/each}
          {/if}
        </div>
      {/if}
    </section>

    {#if rootCategories.length === 0 && uncategorizedCourses.length === 0}
      <div class="cat-tree-placeholder">
        <p>{t('admin.treeEmpty', $locale)}</p>
        <button type="button" class="btn btn-sm" onclick={() => (showCategoryForm = true)}>{t('admin.addRootCategory', $locale)}</button>
      </div>
    {/if}
  </div>
</div>

<CategoryEditModal
  category={editCategory}
  open={editModalOpen}
  saving={editSaving}
  error={editError}
  {slugify}
  onSave={saveCategoryEdit}
  onClose={closeCategoryEdit}
/>
