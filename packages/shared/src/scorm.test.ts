import { describe, expect, test } from 'bun:test';
import {
  applyScormCompletionMarkers,
  captivateIndicatesComplete,
  scormCmiIndicatesComplete,
  scormCmiReadyToFinalize,
  scormPackageSignalsCompletionScreen,
} from './scorm';

describe('captivateIndicatesComplete', () => {
  test('detects Captivate P100 suspend_data', () => {
    expect(captivateIndicatesComplete({ 'cmi.suspend_data': 'fooP100Dbar' })).toBe(true);
  });

  test('ignores empty suspend_data', () => {
    expect(captivateIndicatesComplete({})).toBe(false);
  });
});

describe('scormCmiIndicatesComplete', () => {
  test('SCORM 1.2 passed status', () => {
    expect(
      scormCmiIndicatesComplete('scorm_12', { 'cmi.core.lesson_status': 'passed' }),
    ).toBe(true);
  });

  test('SCORM 2004 success + completion with full progress', () => {
    expect(
      scormCmiIndicatesComplete('scorm_2004', {
        'cmi.success_status': 'unknown',
        'cmi.completion_status': 'completed',
        'cmi.progress_measure': 1,
      }),
    ).toBe(true);
  });
});

describe('scormCmiReadyToFinalize', () => {
  test('SCORM 1.2 completed without resume progress is not ready', () => {
    expect(
      scormCmiReadyToFinalize('scorm_12', { 'cmi.core.lesson_status': 'completed' }),
    ).toBe(false);
  });

  test('SCORM 1.2 completed with lesson_location is ready', () => {
    expect(
      scormCmiReadyToFinalize('scorm_12', {
        'cmi.core.lesson_status': 'completed',
        'cmi.core.lesson_location': 'slide_12',
      }),
    ).toBe(true);
  });
});

describe('scormPackageSignalsCompletionScreen', () => {
  test('matches common completion phrases', () => {
    expect(scormPackageSignalsCompletionScreen('You have successfully completed this course.')).toBe(
      true,
    );
    expect(scormPackageSignalsCompletionScreen('Welcome back')).toBe(false);
  });
});

describe('applyScormCompletionMarkers', () => {
  test('finalizes SCORM 1.2 when lesson_status is passed', () => {
    const cmi = { 'cmi.core.lesson_status': 'passed', 'cmi.core.exit': 'suspend' };
    expect(applyScormCompletionMarkers('scorm_12', cmi)).toBe(true);
    expect(cmi['cmi.core.lesson_status']).toBe('passed');
    expect(cmi['cmi.core.exit']).toBeUndefined();
  });
});
