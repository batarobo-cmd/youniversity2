import type { VideoSource } from '@youniversity2/shared';

export type VideoDeliveryMode = 'upload' | 'embed';
export type EmbedProvider = 'youtube' | 'vimeo' | 'external';
export type VideoCompletionMode = 'manual_confirm' | 'watch_to_end' | 'min_watch_time';

export interface VideoFormState {
  deliveryMode: VideoDeliveryMode;
  embedProvider: EmbedProvider;
  completionMode: VideoCompletionMode;
  requiredWatchSeconds?: number;
  embedInput: string;
  fileKey?: string;
  videoUrl?: string;
  fileName?: string;
}

export function emptyVideoForm(): VideoFormState {
  return {
    deliveryMode: 'upload',
    embedProvider: 'youtube',
    completionMode: 'manual_confirm',
    embedInput: '',
  };
}

export function videoFormFromConfig(config?: Record<string, unknown>): VideoFormState {
  if (!config) return emptyVideoForm();

  const videoSource = config.videoSource as VideoSource | undefined;
  if (videoSource === 'upload' || config.fileKey || (config.videoUrl && !config.embedUrl)) {
    return {
      deliveryMode: 'upload',
      embedProvider: 'youtube',
      completionMode:
        config.videoCompletionMode === 'watch_to_end'
          ? 'watch_to_end'
          : config.videoCompletionMode === 'min_watch_time'
            ? 'min_watch_time'
            : 'manual_confirm',
      requiredWatchSeconds:
        typeof config.videoRequiredWatchSeconds === 'number'
          ? (config.videoRequiredWatchSeconds as number)
          : undefined,
      embedInput: '',
      fileKey: config.fileKey as string | undefined,
      videoUrl: config.videoUrl as string | undefined,
      fileName: (config.fileName as string | undefined) ?? undefined,
    };
  }

  const provider: EmbedProvider =
    videoSource === 'vimeo' ? 'vimeo' : videoSource === 'external' ? 'external' : 'youtube';

  return {
    deliveryMode: 'embed',
    embedProvider: provider,
    completionMode:
      config.videoCompletionMode === 'watch_to_end'
        ? 'watch_to_end'
        : config.videoCompletionMode === 'min_watch_time'
          ? 'min_watch_time'
          : 'manual_confirm',
    requiredWatchSeconds:
      typeof config.videoRequiredWatchSeconds === 'number'
        ? (config.videoRequiredWatchSeconds as number)
        : undefined,
    embedInput: (config.embedUrl as string) || (config.videoUrl as string) || '',
  };
}

function isDirectVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(url.trim());
}

export function resolveYouTubeEmbed(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname.startsWith('/embed/')) {
        const id = url.pathname.split('/')[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      const id = url.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveVimeoEmbed(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === 'player.vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean)[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveEmbedUrl(provider: EmbedProvider, input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  if (provider === 'youtube') return resolveYouTubeEmbed(value);
  if (provider === 'vimeo') return resolveVimeoEmbed(value);

  try {
    const url = new URL(value);
    if (url.pathname.includes('/embed/') || url.hostname.includes('player.')) {
      return url.toString();
    }
  } catch {
    return isDirectVideoUrl(value) ? null : value;
  }

  return value;
}

export function configFromVideoForm(form: VideoFormState): Record<string, unknown> | undefined {
  if (form.deliveryMode === 'upload') {
    if (!form.fileKey && !form.videoUrl) return undefined;
    return {
      videoSource: 'upload',
      videoCompletionMode: form.completionMode,
      videoRequiredWatchSeconds:
        form.requiredWatchSeconds && form.requiredWatchSeconds > 0
          ? Math.round(form.requiredWatchSeconds)
          : undefined,
      fileKey: form.fileKey,
      videoUrl: form.videoUrl,
      fileName: form.fileName,
    };
  }

  const embedUrl = resolveEmbedUrl(form.embedProvider, form.embedInput);
  if (!embedUrl) return undefined;

  const config: Record<string, unknown> = {
    videoSource: form.embedProvider,
    videoCompletionMode: form.completionMode,
    videoRequiredWatchSeconds:
      form.requiredWatchSeconds && form.requiredWatchSeconds > 0
        ? Math.round(form.requiredWatchSeconds)
        : undefined,
    embedUrl,
  };

  if (form.embedProvider === 'external' && isDirectVideoUrl(form.embedInput)) {
    config.videoUrl = form.embedInput.trim();
  }

  return config;
}

export function validateVideoForm(
  form: VideoFormState,
  messages: {
    uploadRequired: string;
    embedRequired: string;
    embedInvalid: string;
    watchToEndNeedsNative: string;
    watchDurationNeedsTrackable: string;
    minWatchTimeRequired: string;
  },
): string | null {
  if (form.deliveryMode === 'upload') {
    if (!form.fileKey && !form.videoUrl) return messages.uploadRequired;
    return null;
  }

  if (!form.embedInput.trim()) return messages.embedRequired;
  if (!resolveEmbedUrl(form.embedProvider, form.embedInput)) return messages.embedInvalid;
  if (form.completionMode === 'watch_to_end' && form.embedProvider !== 'external') {
    return messages.watchToEndNeedsNative;
  }
  if (form.completionMode === 'min_watch_time' && (!form.requiredWatchSeconds || form.requiredWatchSeconds <= 0)) {
    return messages.minWatchTimeRequired;
  }
  if (form.requiredWatchSeconds && form.requiredWatchSeconds > 0 && form.embedProvider === 'external') {
    const directVideo = isDirectVideoUrl(form.embedInput);
    if (!directVideo) return messages.watchDurationNeedsTrackable;
  }
  return null;
}

export function videoPreviewLabel(form: VideoFormState): string | null {
  if (form.deliveryMode === 'upload') {
    return form.fileName ?? form.fileKey ?? form.videoUrl ?? null;
  }
  return resolveEmbedUrl(form.embedProvider, form.embedInput);
}
