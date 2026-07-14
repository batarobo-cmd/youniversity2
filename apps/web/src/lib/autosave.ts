export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

type AutosaveOptions = {
  debounceMs?: number;
  /** Return false to skip save without error (e.g. incomplete draft). */
  onSave: () => Promise<boolean | void>;
  onStatus?: (status: AutosaveStatus, error?: string) => void;
};

export function createAutosave(options: AutosaveOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let savedTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let queued = false;

  function setStatus(status: AutosaveStatus, error?: string) {
    options.onStatus?.(status, error);
  }

  async function execute() {
    if (inFlight) {
      queued = true;
      return;
    }

    inFlight = true;
    setStatus('saving');
    try {
      const saved = await options.onSave();
      if (saved === false) {
        setStatus('idle');
        return;
      }
      setStatus('saved');
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setStatus('error', (e as Error).message);
    } finally {
      inFlight = false;
      if (queued) {
        queued = false;
        void execute();
      }
    }
  }

  return {
    schedule() {
      if (timer) clearTimeout(timer);
      setStatus('pending');
      timer = setTimeout(() => {
        timer = null;
        void execute();
      }, options.debounceMs ?? 800);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (inFlight) {
        queued = true;
        return;
      }
      await execute();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      setStatus('idle');
    },
  };
}
