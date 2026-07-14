/** Tracks which SCORM attempt owns the global LMS API on window (only one at a time). */
let globalScormApiOwner: string | null = null;

export function claimScormApiOwner(attemptId: string): boolean {
  if (globalScormApiOwner != null && globalScormApiOwner !== attemptId) {
    return false;
  }
  globalScormApiOwner = attemptId;
  return true;
}

export function releaseScormApiOwner(attemptId: string) {
  if (globalScormApiOwner === attemptId) {
    globalScormApiOwner = null;
  }
}

export function isScormApiOwner(attemptId: string): boolean {
  return globalScormApiOwner === attemptId;
}

export function clearGlobalScormApi() {
  const w = window as unknown as Record<string, unknown>;
  delete w.API;
  delete w.API_1484_11;
  for (const key of ['doLMSFinish', 'doClose', 'ExitActivity', 'ExitCourse']) {
    delete w[key];
  }
  globalScormApiOwner = null;
}
