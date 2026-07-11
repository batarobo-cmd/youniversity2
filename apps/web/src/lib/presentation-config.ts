export type PresentationDeliveryMode = 'upload' | 'embed';
export type PresentationEmbedProvider = 'google_slides' | 'onedrive' | 'external';
export type PresentationCompletionMode = 'manual_confirm' | 'view_all_slides';
export type SlideMinOverrides = Record<number, number>;

export interface PresentationFormState {
  deliveryMode: PresentationDeliveryMode;
  embedProvider: PresentationEmbedProvider;
  embedInput: string;
  completionMode: PresentationCompletionMode;
  slideMinSeconds?: number;
  slideMinOverrides?: SlideMinOverrides;
  slideCount?: number;
  allowDownload: boolean;
  fileKey?: string;
  presentationUrl?: string;
  fileName?: string;
  fileContentType?: string;
}

export interface PresentationProgressState {
  slideIndex?: number;
  maxSlideIndex?: number;
  slideCount?: number;
}

export function emptyPresentationForm(): PresentationFormState {
  return {
    deliveryMode: 'upload',
    embedProvider: 'google_slides',
    embedInput: '',
    completionMode: 'manual_confirm',
    allowDownload: true,
  };
}

function isPdfUrl(url: string) {
  return /\.pdf(\?.*)?$/i.test(url.trim());
}

const PRESENTATION_MEDIA_PREFIX = '/api/media/presentations/';

export function encodePresentationMediaUrl(url: string): string {
  if (!url.startsWith(PRESENTATION_MEDIA_PREFIX)) return url;
  const suffix = url.slice(PRESENTATION_MEDIA_PREFIX.length);
  return PRESENTATION_MEDIA_PREFIX + suffix.split('/').map(encodeURIComponent).join('/');
}

const PPTX_OPEN_XML_EXT = /\.(pptx|ppsx|pptm)$/i;
const LEGACY_PPT_EXT = /\.ppt$/i;
const ODP_PRESENTATION_EXT = /\.odp$/i;

const PPTX_OPEN_XML_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.ms-powerpoint.slideshow.macroenabled.12',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12',
]);

export function isPdfPresentation(fileName?: string, contentType?: string) {
  if (contentType === 'application/pdf') return true;
  return Boolean(fileName && /\.pdf$/i.test(fileName));
}

export function isPptxPresentation(fileName?: string, contentType?: string) {
  if (contentType && PPTX_OPEN_XML_MIME.has(contentType)) return true;
  return Boolean(fileName && PPTX_OPEN_XML_EXT.test(fileName));
}

export function isLegacyPptPresentation(fileName?: string, contentType?: string) {
  if (isPptxPresentation(fileName, contentType)) return false;
  if (contentType === 'application/vnd.ms-powerpoint') return true;
  return Boolean(fileName && LEGACY_PPT_EXT.test(fileName));
}

export function isOfficePresentation(fileName?: string, contentType?: string) {
  return isPptxPresentation(fileName, contentType) || isLegacyPptPresentation(fileName, contentType);
}

export function isOdpPresentation(fileName?: string, contentType?: string) {
  if (contentType === 'application/vnd.oasis.opendocument.presentation') return true;
  return Boolean(fileName && ODP_PRESENTATION_EXT.test(fileName));
}

export function presentationCompletionMode(config: Record<string, unknown>): PresentationCompletionMode {
  return config.presentationCompletionMode === 'view_all_slides' ? 'view_all_slides' : 'manual_confirm';
}

export function presentationAllowDownload(config: Record<string, unknown>): boolean {
  return config.presentationAllowDownload !== false;
}

export function presentationSlideMinSeconds(config: Record<string, unknown>): number {
  const raw = Number(config.presentationSlideMinSeconds ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

export function presentationSlideCount(config: Record<string, unknown>): number {
  const raw = Number(config.presentationSlideCount ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

export function presentationSlideMinOverrides(config: Record<string, unknown>): SlideMinOverrides {
  const raw = config.presentationSlideMinOverrides as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return {};

  const out: SlideMinOverrides = {};
  for (const [key, value] of Object.entries(raw)) {
    const idx = Number(key);
    const secs = Number(value);
    if (Number.isFinite(idx) && idx >= 0 && Number.isFinite(secs) && secs > 0) {
      out[idx] = Math.round(secs);
    }
  }
  return out;
}

export function effectiveSlideMinSeconds(
  globalSeconds: number,
  overrides: SlideMinOverrides | undefined,
  slideIndex: number,
): number {
  const base = Math.max(0, Math.round(globalSeconds));
  const custom = overrides?.[slideIndex];
  if (custom === undefined || !Number.isFinite(custom)) return base;
  return Math.max(base, Math.round(custom));
}

export function normalizeSlideMinOverrides(
  globalSeconds: number,
  overrides: SlideMinOverrides | undefined,
): SlideMinOverrides | undefined {
  if (!overrides) return undefined;

  const base = Math.max(0, Math.round(globalSeconds));
  const normalized: SlideMinOverrides = {};
  for (const [key, value] of Object.entries(overrides)) {
    const idx = Number(key);
    const secs = Math.round(Number(value));
    if (!Number.isFinite(idx) || idx < 0 || !Number.isFinite(secs) || secs <= base) continue;
    normalized[idx] = secs;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function slideMinOverridesFromConfig(
  config: Record<string, unknown>,
): SlideMinOverrides | undefined {
  const overrides = presentationSlideMinOverrides(config);
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export function presentationProgressFromRecord(
  progress?: Record<string, unknown>,
): PresentationProgressState {
  const state = (progress?.progressState as Record<string, unknown> | undefined) ?? {};
  return {
    slideIndex: typeof state.slideIndex === 'number' ? state.slideIndex : undefined,
    maxSlideIndex: typeof state.maxSlideIndex === 'number' ? state.maxSlideIndex : undefined,
    slideCount: typeof state.slideCount === 'number' ? state.slideCount : undefined,
  };
}

export function presentationPercentFromSlides(maxSlideIndex: number, slideCount: number) {
  if (slideCount <= 0) return 0;
  return Math.min(100, Math.round(((maxSlideIndex + 1) / slideCount) * 100));
}

export type PresentationViewMode = 'embed' | 'pdf' | 'pptx' | 'download';

export interface PresentationViewSpec {
  mode: PresentationViewMode | null;
  iframeSrc?: string;
  relativeUrl?: string;
  downloadUrl?: string;
}

export function resolveGoogleSlidesEmbed(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (host !== 'docs.google.com' || !url.pathname.includes('/presentation/')) return null;

    if (url.pathname.includes('/embed')) return url.toString();

    const match = url.pathname.match(/\/presentation\/d\/([^/]+)/);
    return match ? `https://docs.google.com/presentation/d/${match[1]}/embed?start=false&loop=false&delayms=3000` : null;
  } catch {
    return null;
  }
}

export function resolveOneDriveEmbed(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');

    if (host.includes('view.officeapps.live.com')) return url.toString();
    if (host.includes('onedrive.live.com') && url.pathname.includes('/embed')) return url.toString();
    if (host.includes('sharepoint.com') && (url.pathname.includes('/embed') || url.searchParams.has('embed'))) {
      return url.toString();
    }
    if (value.includes('embed')) return url.toString();
  } catch {
    return null;
  }

  return null;
}

export function resolveExternalPresentationEmbed(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  if (isPdfUrl(value)) return value;

  try {
    const url = new URL(value);
    if (url.hostname.includes('canva.com') && url.pathname.includes('/view')) {
      return value.includes('?') ? `${value}&embed` : `${value}?embed`;
    }
    if (url.hostname.includes('slideshare.net')) return url.toString();
    if (value.includes('/embed') || url.searchParams.get('embed')) return url.toString();
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolvePresentationEmbedUrl(
  provider: PresentationEmbedProvider,
  input: string,
): string | null {
  if (provider === 'google_slides') return resolveGoogleSlidesEmbed(input);
  if (provider === 'onedrive') return resolveOneDriveEmbed(input);
  return resolveExternalPresentationEmbed(input);
}

export function presentationFormFromConfig(config?: Record<string, unknown>): PresentationFormState {
  if (!config) return emptyPresentationForm();

  const source = config.presentationSource as string | undefined;
  const url = config.presentationUrl as string | undefined;

  if (source === 'upload' || config.fileKey || url?.includes('/api/media/presentations/')) {
    return {
      deliveryMode: 'upload',
      embedProvider: 'google_slides',
      embedInput: '',
      completionMode:
        config.presentationCompletionMode === 'view_all_slides' ? 'view_all_slides' : 'manual_confirm',
      slideMinSeconds:
        typeof config.presentationSlideMinSeconds === 'number'
          ? (config.presentationSlideMinSeconds as number)
          : undefined,
      slideMinOverrides: slideMinOverridesFromConfig(config),
      slideCount:
        typeof config.presentationSlideCount === 'number'
          ? (config.presentationSlideCount as number)
          : undefined,
      allowDownload: config.presentationAllowDownload !== false,
      fileKey: config.fileKey as string | undefined,
      presentationUrl: url,
      fileName: (config.fileName as string | undefined) ?? undefined,
      fileContentType: config.fileContentType as string | undefined,
    };
  }

  const embedUrl = (config.embedUrl as string | undefined) ?? url;
  const provider: PresentationEmbedProvider =
    source === 'onedrive' ? 'onedrive' : source === 'external' ? 'external' : 'google_slides';

  return {
    deliveryMode: 'embed',
    embedProvider: provider,
    embedInput: embedUrl ?? '',
    completionMode:
      config.presentationCompletionMode === 'view_all_slides' ? 'view_all_slides' : 'manual_confirm',
    slideMinSeconds:
      typeof config.presentationSlideMinSeconds === 'number'
        ? (config.presentationSlideMinSeconds as number)
        : undefined,
    slideMinOverrides: slideMinOverridesFromConfig(config),
    slideCount:
      typeof config.presentationSlideCount === 'number'
        ? (config.presentationSlideCount as number)
        : undefined,
    allowDownload: config.presentationAllowDownload !== false,
  };
}

export function configFromPresentationForm(
  form: PresentationFormState,
): Record<string, unknown> | undefined {
  const normalizedOverrides = normalizeSlideMinOverrides(
    form.slideMinSeconds ?? 0,
    form.slideMinOverrides,
  );
  const completionFields = {
    presentationCompletionMode: form.completionMode,
    presentationSlideMinSeconds:
      form.slideMinSeconds && form.slideMinSeconds > 0 ? Math.round(form.slideMinSeconds) : undefined,
    presentationSlideMinOverrides: normalizedOverrides,
    presentationSlideCount:
      form.slideCount && form.slideCount > 0 ? Math.round(form.slideCount) : undefined,
    presentationAllowDownload: form.allowDownload,
  };

  if (form.deliveryMode === 'upload') {
    if (!form.fileKey && !form.presentationUrl) return undefined;
    return {
      presentationSource: 'upload',
      fileKey: form.fileKey,
      presentationUrl: form.presentationUrl,
      fileName: form.fileName,
      fileContentType: form.fileContentType,
      ...completionFields,
    };
  }

  const embedUrl = resolvePresentationEmbedUrl(form.embedProvider, form.embedInput);
  if (!embedUrl) return undefined;

  return {
    presentationSource: form.embedProvider,
    embedUrl,
    ...completionFields,
  };
}

export function validatePresentationForm(
  form: PresentationFormState,
  messages: {
    uploadRequired: string;
    embedRequired: string;
    embedInvalid: string;
    slideMinRequired?: string;
  },
): string | null {
  if (form.deliveryMode === 'upload') {
    if (!form.fileKey && !form.presentationUrl) return messages.uploadRequired;
  } else {
    if (!form.embedInput.trim()) return messages.embedRequired;
    if (!resolvePresentationEmbedUrl(form.embedProvider, form.embedInput)) return messages.embedInvalid;
  }

  if (form.completionMode === 'view_all_slides') {
    if (form.slideMinSeconds !== undefined && form.slideMinSeconds < 0) {
      return messages.slideMinRequired ?? null;
    }
    if (form.slideMinOverrides) {
      for (const value of Object.values(form.slideMinOverrides)) {
        if (value < 0) return messages.slideMinRequired ?? null;
      }
    }
  }

  return null;
}

export function presentationPreviewLabel(form: PresentationFormState): string | null {
  if (form.deliveryMode === 'upload') {
    return form.fileName ?? form.fileKey ?? form.presentationUrl ?? null;
  }
  return resolvePresentationEmbedUrl(form.embedProvider, form.embedInput);
}

export function buildPresentationView(config: Record<string, unknown>): PresentationViewSpec {
  const allowDownload = presentationAllowDownload(config);
  if (typeof config.embedUrl === 'string' && config.embedUrl) {
    return {
      mode: 'embed',
      iframeSrc: config.embedUrl,
      downloadUrl: allowDownload ? config.embedUrl : undefined,
    };
  }

  const rawUrl = config.presentationUrl as string | undefined;
  if (!rawUrl) return { mode: null };

  const url = encodePresentationMediaUrl(rawUrl);
  const fileName = config.fileName as string | undefined;
  const contentType = config.fileContentType as string | undefined;

  if (isPdfPresentation(fileName, contentType) || isPdfUrl(url)) {
    return {
      mode: 'pdf',
      iframeSrc: url,
      relativeUrl: url,
      downloadUrl: allowDownload ? url : undefined,
    };
  }

  if (isPptxPresentation(fileName, contentType)) {
    return { mode: 'pptx', relativeUrl: url, downloadUrl: allowDownload ? url : undefined };
  }

  if (isLegacyPptPresentation(fileName, contentType)) {
    return { mode: 'download', relativeUrl: url, downloadUrl: allowDownload ? url : undefined };
  }

  if (isOdpPresentation(fileName, contentType)) {
    return { mode: 'download', relativeUrl: url, downloadUrl: allowDownload ? url : undefined };
  }

  return { mode: 'download', relativeUrl: url, downloadUrl: allowDownload ? url : undefined };
}

/** @deprecated Use buildPresentationView */
export function effectivePresentationSrc(
  config: Record<string, unknown>,
): { src: string; isPdf: boolean } | null {
  const view = buildPresentationView(config);
  if (!view.mode) return null;
  if (view.mode === 'embed' || view.mode === 'pdf') {
    return { src: view.iframeSrc ?? view.downloadUrl ?? '', isPdf: view.mode === 'pdf' };
  }
  return null;
}

export function presentationSourceSummary(
  config: Record<string, unknown> | undefined,
  labels: {
    upload: string;
    googleSlides: string;
    onedrive: string;
    external: string;
  },
): string {
  if (!config) return '';
  if (config.presentationSource === 'upload' || config.fileKey) {
    return (config.fileName as string) || labels.upload;
  }
  if (config.presentationSource === 'onedrive') return labels.onedrive;
  if (config.presentationSource === 'external') return labels.external;
  return labels.googleSlides;
}
