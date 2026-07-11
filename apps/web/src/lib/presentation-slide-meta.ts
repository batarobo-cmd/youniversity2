import { isPdfPresentation, isPptxPresentation } from './presentation-config';

type PptxPreviewer = {
  destroy: () => void;
  preview: (file: ArrayBuffer) => Promise<unknown>;
  load: (file: ArrayBuffer) => Promise<{ width: number; height: number }>;
  slideCount: number;
};

const DEFAULT_SLIDE_ASPECT = 9 / 16;
const REFERENCE_RENDER_WIDTH = 960;

export type PptxSlideDimensions = {
  nativeWidth: number;
  nativeHeight: number;
  aspectRatio: number;
};

export async function getPptxSlideDimensions(buffer: ArrayBuffer): Promise<PptxSlideDimensions> {
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
  document.body.appendChild(host);

  try {
    const { init } = await import('pptx-preview');
    const previewer = init(host, {
      width: 320,
      height: 180,
      mode: 'slide',
    }) as PptxPreviewer;
    const pptx = await previewer.load(buffer);
    previewer.destroy();
    if (pptx.width > 0 && pptx.height > 0) {
      return {
        nativeWidth: pptx.width,
        nativeHeight: pptx.height,
        aspectRatio: pptx.height / pptx.width,
      };
    }
    return {
      nativeWidth: REFERENCE_RENDER_WIDTH,
      nativeHeight: Math.round(REFERENCE_RENDER_WIDTH * DEFAULT_SLIDE_ASPECT),
      aspectRatio: DEFAULT_SLIDE_ASPECT,
    };
  } catch {
    return {
      nativeWidth: REFERENCE_RENDER_WIDTH,
      nativeHeight: Math.round(REFERENCE_RENDER_WIDTH * DEFAULT_SLIDE_ASPECT),
      aspectRatio: DEFAULT_SLIDE_ASPECT,
    };
  } finally {
    host.remove();
  }
}

export async function getPptxSlideAspectRatio(buffer: ArrayBuffer): Promise<number> {
  const dims = await getPptxSlideDimensions(buffer);
  return dims.aspectRatio;
}

export async function countPptxSlides(buffer: ArrayBuffer): Promise<number> {
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-9999px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;overflow:hidden';
  document.body.appendChild(host);

  try {
    const { init } = await import('pptx-preview');
    const previewer = init(host, {
      width: 320,
      height: 180,
      mode: 'slide',
    }) as PptxPreviewer;
    await previewer.preview(buffer);
    const count = previewer.slideCount;
    previewer.destroy();
    return count > 0 ? count : 0;
  } finally {
    host.remove();
  }
}

export function countPdfPages(buffer: ArrayBuffer): number {
  const text = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const pageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
  if (pageMatches && pageMatches.length > 0) return pageMatches.length;

  const countMatch = text.match(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/);
  if (countMatch) {
    const count = Number.parseInt(countMatch[1], 10);
    if (Number.isFinite(count) && count > 0) return count;
  }

  return 0;
}

export async function inspectPresentationSlides(
  source: File | ArrayBuffer,
  fileName?: string,
  contentType?: string,
): Promise<number> {
  const buffer = source instanceof File ? await source.arrayBuffer() : source;

  if (isPptxPresentation(fileName, contentType)) {
    return countPptxSlides(buffer);
  }

  if (isPdfPresentation(fileName, contentType)) {
    return countPdfPages(buffer);
  }

  return 0;
}
