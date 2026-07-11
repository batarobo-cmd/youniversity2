type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.min.mjs');

let pdfJsReady: Promise<PdfJsModule> | null = null;
let pdfWorker: Worker | null = null;

export async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsReady) {
    pdfJsReady = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
      const PdfWorker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker')).default;
      pdfWorker = new PdfWorker();
      pdfjs.GlobalWorkerOptions.workerPort = pdfWorker;
      return pdfjs;
    })();
  }
  return pdfJsReady;
}

export function resetPdfJs() {
  pdfWorker?.terminate();
  pdfWorker = null;
  pdfJsReady = null;
}
