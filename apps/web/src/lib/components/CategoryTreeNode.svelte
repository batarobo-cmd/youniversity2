<script lang="ts">
  import CategoryTreeNode from './CategoryTreeNode.svelte';
  import { locale } from '$lib/stores/auth';
  import { t } from '$lib/i18n';

  export type Category = {
    id: string;
    slug: string;
    name: string;
    sortOrder: number;
    parentId?: string | null;
  };
  export type Course = {
    id: string;
    slug: string;
    title: string;
    description?: string;
    isPublished: boolean;
    categoryId?: string | null;
  };

  let {
    category,
    depth = 0,
    categories,
    courses,
    expanded = $bindable<Record<string, boolean>>({}),
    openCourseForm = $bindable<string | null>(null),
    openSubcategoryForm = $bindable<string | null>(null),
    subcategoryDraft = $bindable({ name: '', slug: '' }),
    courseDraft = $bindable({ title: '', slug: '', desc: '' }),
    formError = $bindable(''),
    subIdManual = $bindable(false),
    courseIdManual = $bindable(false),
    onEditCategory,
    onRemoveCategory,
    onAddSubcategory,
    onAddCourse,
    onTogglePublish,
    onRemoveCourse,
    slugify,
  }: {
    category: Category;
    depth?: number;
    categories: Category[];
    courses: Course[];
    expanded?: Record<string, boolean>;
    openCourseForm?: string | null;
    openSubcategoryForm?: string | null;
    subcategoryDraft?: { name: string; slug: string };
    courseDraft?: { title: string; slug: string; desc: string };
    formError?: string;
    subIdManual?: boolean;
    courseIdManual?: boolean;
    onEditCategory: (category: Category) => void;
    onRemoveCategory: (id: string) => Promise<void>;
    onAddSubcategory: (parentId: string, name: string, slug: string) => Promise<void>;
    onAddCourse: (categoryId: string | null) => Promise<void>;
    onTogglePublish: (course: Course) => Promise<void>;
    onRemoveCourse: (courseId: string) => Promise<void>;
    slugify: (value: string) => string;
  } = $props();

  const key = $derived(category.id);

  const childCategories = $derived(
    categories
      .filter((c) => c.parentId === category.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
  );

  const catCourses = $derived(courses.filter((c) => c.categoryId === category.id));

  function isExpanded(nodeKey: string) {
    return expanded[nodeKey] === true;
  }

  function toggleExpanded(nodeKey: string) {
    expanded = { ...expanded, [nodeKey]: !isExpanded(nodeKey) };
  }

  function resolveId(manual: string, name: string) {
    const trimmed = manual.trim();
    if (trimmed) return trimmed;
    return slugify(name);
  }

  function openCourseFormFor(nodeKey: string) {
    expanded = { ...expanded, [nodeKey]: true };
    openCourseForm = nodeKey;
    openSubcategoryForm = null;
    courseDraft = { title: '', slug: '', desc: '' };
    courseIdManual = false;
    formError = '';
  }

  function openSubcategoryFormFor(parentId: string) {
    expanded = { ...expanded, [parentId]: true };
    openSubcategoryForm = parentId;
    openCourseForm = null;
    subcategoryDraft = { name: '', slug: '' };
    subIdManual = false;
    formError = '';
  }

  function closeCourseForm() {
    openCourseForm = null;
    courseDraft = { title: '', slug: '', desc: '' };
  }

  function closeSubcategoryForm() {
    openSubcategoryForm = null;
    subcategoryDraft = { name: '', slug: '' };
    subIdManual = false;
  }

  function metaLabel(subCount: number, courseCount: number) {
    const parts: string[] = [`ID: ${category.slug}`];
    if (subCount > 0) {
      parts.push(
        subCount === 1
          ? t('admin.treeOneSubcategory', $locale)
          : t('admin.treeManySubcategories', $locale).replace('{n}', String(subCount)),
      );
    }
    parts.push(
      courseCount === 1
        ? t('admin.treeOneCourse', $locale)
        : courseCount >= 2 && courseCount <= 4
          ? t('admin.treeFewCourses', $locale).replace('{n}', String(courseCount))
          : t('admin.treeManyCourses', $locale).replace('{n}', String(courseCount)),
    );
    return parts.join(' · ');
  }

  async function submitSubcategory(e: Event) {
    e.preventDefault();
    formError = '';
    const name = subcategoryDraft.name.trim();
    if (!name) return;
    const id = resolveId(subcategoryDraft.slug, name);
    if (id.length < 2) {
      formError = t('admin.idTooShort', $locale);
      return;
    }
    try {
      await onAddSubcategory(category.id, name, id);
      closeSubcategoryForm();
    } catch (err) {
      formError = (err as Error).message;
    }
  }

  async function submitCourse(e: Event) {
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
      await onAddCourse(category.id);
      closeCourseForm();
    } catch (err) {
      formError = (err as Error).message;
    }
  }
</script>

<section
  class="cat-tree-node"
  class:cat-tree-node--nested={depth > 0}
  class:cat-tree-node--collapsed={!isExpanded(key)}
  style="--tree-depth: {depth}"
>
  <div class="cat-tree-node-head">
    <button
      type="button"
      class="cat-tree-toggle"
      aria-expanded={isExpanded(key)}
      onclick={() => toggleExpanded(key)}
    >
      <svg class="cat-tree-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>
    <div class="cat-tree-node-icon" class:cat-tree-node-icon--sub={depth > 0} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M3 7a2 2 0 012-2h5l2 2h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    <div class="cat-tree-node-info">
      <span class="cat-tree-node-name">{category.name}</span>
      <span class="cat-tree-node-meta">{metaLabel(childCategories.length, catCourses.length)}</span>
    </div>
    <div class="cat-tree-node-actions">
      <button type="button" class="btn btn-sm cat-tree-add-sub" onclick={() => openSubcategoryFormFor(category.id)}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 7a2 2 0 012-2h5l2 2h9a2 2 0 012 2v2M12 11v6M9 14h6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        </svg>
        {t('admin.addSubcategoryHere', $locale)}
      </button>
      <button type="button" class="btn btn-sm cat-tree-add-course" onclick={() => openCourseFormFor(key)}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        {t('admin.addCourseHere', $locale)}
      </button>
      <div class="cat-tree-icon-group">
        <button
          type="button"
          class="cat-tree-icon-btn"
          title={t('admin.editCategory', $locale)}
          aria-label={t('admin.editCategory', $locale)}
          onclick={() => onEditCategory(category)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          class="cat-tree-icon-btn cat-tree-icon-btn--danger"
          title={t('admin.deleteCategory', $locale)}
          aria-label={t('admin.deleteCategory', $locale)}
          onclick={() => onRemoveCategory(category.id)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  {#if isExpanded(key)}
    <div class="cat-tree-children">
      {#if openSubcategoryForm === category.id}
        <form class="cat-tree-subcat-form" onsubmit={submitSubcategory}>
          <span class="cat-tree-subcat-form-label">{t('admin.newSubcategoryIn', $locale)} {category.name}</span>
          <div class="cat-tree-subcat-form-fields">
            <input bind:value={subcategoryDraft.name} placeholder={t('admin.categoryName', $locale)} required oninput={() => { if (!subIdManual) subcategoryDraft = { ...subcategoryDraft, slug: slugify(subcategoryDraft.name) }; }} />
            <input bind:value={subcategoryDraft.slug} placeholder={t('admin.categoryId', $locale)} oninput={() => { subIdManual = true; }} />
          </div>
          <span class="cat-tree-field-hint">{t('admin.idAutoHint', $locale)}</span>
          {#if formError && openSubcategoryForm === category.id}
            <p class="cat-tree-form-error">{formError}</p>
          {/if}
          <div class="cat-tree-course-form-actions">
            <button type="submit" class="btn btn-sm">{t('admin.addSubcategory', $locale)}</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick={closeSubcategoryForm}>{t('admin.cancel', $locale)}</button>
          </div>
        </form>
      {/if}

      {#each childCategories as child (child.id)}
        <CategoryTreeNode
          category={child}
          depth={depth + 1}
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
          {onEditCategory}
          {onRemoveCategory}
          {onAddSubcategory}
          {onAddCourse}
          {onTogglePublish}
          {onRemoveCourse}
          {slugify}
        />
      {/each}

      {#if openCourseForm === key}
        <form class="cat-tree-course-form" onsubmit={submitCourse}>
          <input bind:value={courseDraft.title} placeholder={t('admin.courseTitle', $locale)} required oninput={() => { if (!courseIdManual) courseDraft = { ...courseDraft, slug: slugify(courseDraft.title) }; }} />
          <input bind:value={courseDraft.slug} placeholder={t('admin.courseId', $locale)} oninput={() => { courseIdManual = true; }} />
          <span class="cat-tree-field-hint">{t('admin.idAutoHint', $locale)}</span>
          <textarea bind:value={courseDraft.desc} placeholder={t('admin.courseDescription', $locale)} rows="2"></textarea>
          {#if formError && openCourseForm === key}
            <p class="cat-tree-form-error">{formError}</p>
          {/if}
          <div class="cat-tree-course-form-actions">
            <button type="submit" class="btn btn-sm">{t('admin.addCourse', $locale)}</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick={closeCourseForm}>{t('admin.cancel', $locale)}</button>
          </div>
        </form>
      {/if}

      {#if catCourses.length === 0 && childCategories.length === 0 && openCourseForm !== key && openSubcategoryForm !== category.id}
        <p class="cat-tree-empty">{t('admin.emptyCategory', $locale)}</p>
      {:else}
        {#each catCourses as course (course.id)}
          <article class="cat-tree-course cat-tree-course--compact">
            <div class="cat-tree-course-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5V6.5A2.5 2.5 0 016.5 4H20v13H6.5A2.5 2.5 0 004 19.5z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <div class="cat-tree-course-main">
              <div class="cat-tree-course-head">
                <span class="cat-tree-course-title">{course.title}</span>
                <span class="cat-tree-badge" class:cat-tree-badge--live={course.isPublished}>
                  {course.isPublished ? t('admin.published', $locale) : t('admin.draft', $locale)}
                </span>
              </div>
              <span class="cat-tree-course-slug">ID: {course.slug}</span>
            </div>
            <div class="cat-tree-icon-group cat-tree-course-quick">
              <a
                href="/dashboard/admin/manage/courses/{course.id}"
                class="cat-tree-icon-btn"
                title={t('admin.editCourse', $locale)}
                aria-label={t('admin.editCourse', $locale)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </a>
              <button
                type="button"
                class="cat-tree-icon-btn cat-tree-icon-btn--danger"
                title={t('admin.deleteCourse', $locale)}
                aria-label={t('admin.deleteCourse', $locale)}
                onclick={() => onRemoveCourse(course.id)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                class="cat-tree-icon-btn"
                class:cat-tree-icon-btn--published={course.isPublished}
                title={course.isPublished ? t('admin.unpublish', $locale) : t('admin.publish', $locale)}
                aria-label={course.isPublished ? t('admin.unpublish', $locale) : t('admin.publish', $locale)}
                onclick={() => onTogglePublish(course)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="currentColor" stroke-width="1.75" />
                </svg>
              </button>
            </div>
          </article>
        {/each}
      {/if}
    </div>
  {/if}
</section>
