import type { ScormVersion } from '@youniversity2/shared';
import { captivateIndicatesComplete } from '@youniversity2/shared';

export type { ScormVersion };

export type ScormDeliveryMode = 'upload';

export type ScormScoSpec = {
  id: string;
  title: string;
  launch: string;
};

export interface ScormFormState {
  deliveryMode: ScormDeliveryMode;
  packageId?: string;
  title?: string;
  version?: ScormVersion;
  scos?: ScormScoSpec[];
  selectedScoId?: string;
}

export function emptyScormForm(): ScormFormState {
  return {
    deliveryMode: 'upload',
  };
}

export function scormFormFromConfig(config?: Record<string, unknown>): ScormFormState {
  if (!config) return emptyScormForm();
  const scorm = (config.scorm ?? config) as Record<string, unknown>;
  return {
    deliveryMode: 'upload',
    packageId: typeof scorm.packageId === 'string' ? scorm.packageId : undefined,
    title: typeof scorm.title === 'string' ? scorm.title : undefined,
    version: scorm.version === 'scorm_12' || scorm.version === 'scorm_2004' ? scorm.version : undefined,
    scos: Array.isArray(scorm.scos) ? (scorm.scos as ScormScoSpec[]) : undefined,
    selectedScoId: typeof scorm.scoId === 'string' ? scorm.scoId : undefined,
  };
}

export function configFromScormForm(form: ScormFormState): Record<string, unknown> | undefined {
  if (!form.packageId) return undefined;
  return {
    scorm: {
      packageId: form.packageId,
      title: form.title,
      version: form.version,
      scos: form.scos,
      scoId: form.selectedScoId,
    },
  };
}

export function validateScormForm(form: ScormFormState, messages: { uploadRequired: string; scoRequired: string }) {
  if (!form.packageId) return messages.uploadRequired;
  if (!form.selectedScoId) return messages.scoRequired;
  return null;
}

export type ScormLaunchConfig = {
  lessonId: string;
  courseId: string;
  packageId: string;
  version: ScormVersion;
  scoId: string;
  launchPath: string;
};

export function scormLaunchConfigFromLesson(
  lesson: Record<string, unknown>,
  courseId: string,
): ScormLaunchConfig | null {
  const config = (lesson.config as Record<string, unknown>) ?? {};
  const sc = (config.scorm as Record<string, unknown>) ?? {};
  const packageId = sc.packageId as string | undefined;
  const version = (sc.version as ScormVersion) ?? 'scorm_12';
  const scoId = sc.scoId as string | undefined;
  const scos = (sc.scos as Array<Record<string, unknown>> | undefined) ?? [];
  const launchPath =
    (scos.find((s) => s.id === scoId)?.launch as string) || (sc.launchPath as string | undefined);
  if (!packageId || !scoId || !launchPath) return null;
  return {
    lessonId: lesson.id as string,
    courseId,
    packageId,
    version,
    scoId,
    launchPath,
  };
}

export function scormLaunchKey(config: ScormLaunchConfig) {
  return [
    config.lessonId,
    config.courseId,
    config.packageId,
    config.version,
    config.scoId,
    config.launchPath,
  ].join('|');
}

/** Prepare stored CMI so SCORM content resumes instead of restarting. */
export function prepareScormCmiForResume(
  version: ScormVersion,
  cmi: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...cmi };
  if (captivateIndicatesComplete(next)) return next;

  const suspendData = next['cmi.suspend_data'];
  const hasSuspendData = typeof suspendData === 'string' && suspendData.length > 0;
  const location12 = next['cmi.core.lesson_location'];
  const location2004 = next['cmi.location'];
  const hasLocation =
    (typeof location12 === 'string' && location12.length > 0) ||
    (typeof location2004 === 'string' && location2004.length > 0);

  if (!hasSuspendData && !hasLocation) {
    if (version === 'scorm_12') {
      const status = String(next['cmi.core.lesson_status'] ?? '').toLowerCase();
      if (status === 'completed') {
        next['cmi.core.lesson_status'] = 'incomplete';
      }
    } else {
      const completion = String(next['cmi.completion_status'] ?? '').toLowerCase();
      if (completion === 'completed') {
        next['cmi.completion_status'] = 'incomplete';
      }
    }
    return next;
  }

  if (version === 'scorm_12') {
    const wasSuspended = next['cmi.core.exit'] === 'suspend';
    next['cmi.core.entry'] = 'resume';
    delete next['cmi.core.exit'];
    next['cmi.core.session_time'] = '0000:00:00.00';
    if (wasSuspended || hasSuspendData) {
      const status = String(next['cmi.core.lesson_status'] ?? '').toLowerCase();
      if (status !== 'passed' && status !== 'failed') {
        next['cmi.core.lesson_status'] = 'incomplete';
      }
    }
  } else {
    const wasSuspended = next['cmi.exit'] === 'suspend';
    next['cmi.entry'] = 'resume';
    delete next['cmi.exit'];
    next['cmi.session_time'] = 'PT0S';
    if (wasSuspended || hasSuspendData) {
      const completion = String(next['cmi.completion_status'] ?? '').toLowerCase();
      if (completion === 'completed') {
        next['cmi.completion_status'] = 'incomplete';
      }
    }
  }

  return next;
}

export function buildScormAssetUrl(courseId: string, packageId: string, rawLaunchPath: string) {
  const trimmed = (rawLaunchPath ?? '').trim();
  const hashIdx = trimmed.indexOf('#');
  const queryIdx = trimmed.indexOf('?');
  const cutIdx =
    hashIdx === -1 ? queryIdx : queryIdx === -1 ? hashIdx : Math.min(hashIdx, queryIdx);

  const pathPart = (cutIdx === -1 ? trimmed : trimmed.slice(0, cutIdx))
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '');
  const suffix = cutIdx === -1 ? '' : trimmed.slice(cutIdx);

  const encodedPath = pathPart
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  return `/api/media/scorm/${encodeURIComponent(courseId)}/${encodeURIComponent(packageId)}/${encodedPath}${suffix}`;
}

