export type ScormVersion = 'scorm_12' | 'scorm_2004';

/** Adobe Captivate encodes course progress in cmi.suspend_data; P100 marks 100%. */
export function captivateIndicatesComplete(cmi: Record<string, unknown>): boolean {
  const suspend = String(cmi['cmi.suspend_data'] ?? '');
  if (!suspend) return false;
  // Suffix after P100 varies by package version (P100D, P100B, P100%, …).
  return /P100/i.test(suspend);
}

/** Best-effort detection that a SCORM package reached the end (no manual exit button). */
export function scormCmiIndicatesComplete(
  version: ScormVersion,
  cmi: Record<string, unknown>,
): boolean {
  if (captivateIndicatesComplete(cmi)) return true;

  if (version === 'scorm_12') {
    const status = String(cmi['cmi.core.lesson_status'] ?? '').toLowerCase();
    return status === 'passed';
  }

  const success = String(cmi['cmi.success_status'] ?? '').toLowerCase();
  if (success === 'passed') return true;

  const completion = String(cmi['cmi.completion_status'] ?? '').toLowerCase();
  const progress = Number(cmi['cmi.progress_measure'] ?? NaN);
  return completion === 'completed' && !Number.isNaN(progress) && progress >= 1;
}

export function applyScormCompletionMarkers(
  version: ScormVersion,
  cmi: Record<string, unknown>,
): boolean {
  if (!scormCmiIndicatesComplete(version, cmi)) return false;

  if (version === 'scorm_12') {
    const status = String(cmi['cmi.core.lesson_status'] ?? '').toLowerCase();
    if (status !== 'passed' && status !== 'failed') {
      cmi['cmi.core.lesson_status'] = 'completed';
    }
    delete cmi['cmi.core.exit'];
  } else {
    if (String(cmi['cmi.completion_status'] ?? '').toLowerCase() !== 'completed') {
      cmi['cmi.completion_status'] = 'completed';
    }
    if (!cmi['cmi.success_status']) {
      cmi['cmi.success_status'] = 'passed';
    }
    delete cmi['cmi.exit'];
  }

  return true;
}
