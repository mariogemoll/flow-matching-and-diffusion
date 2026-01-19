import saveAs from 'file-saver';
import JSZip from 'jszip';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants';
import { DEFAULT_NUM_EXPORT_FRAMES } from '../visualizations/constants';
import type { Frame } from '../visualizations/engine';
import type { WebGlRenderer } from '../visualizations/webgl/types';
import { HeadlessRunner } from './runner';

export interface ViewExportConfig<S, R extends WebGlRenderer<S> = WebGlRenderer<S>> {
  name: string;
  createRenderer: (gl: WebGLRenderingContext) => R;
  configureRenderer(renderer: R, state: S): void;
}

export interface ExportOptions<S> {
  views: ViewExportConfig<S, WebGlRenderer<S>>[];
  state: S;
  createFrame: (t: number, state: S) => Frame<S>;
  fileName: string;
  onProgress: (progress: ExportProgress) => void;
  numFrames?: number;
  pixelRatio?: number;
}

export type ExportPhase = 'rendering' | 'zipping';

export interface ExportProgress {
  phase: ExportPhase;
  percent: number;
}

export async function exportViews<S>(options: ExportOptions<S>): Promise<void> {
  const {
    views,
    state,
    createFrame,
    fileName,
    numFrames = DEFAULT_NUM_EXPORT_FRAMES,
    onProgress,
    pixelRatio = 1
  } = options;

  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;

  const zip = new JSZip();
  const canvas = document.createElement('canvas');

  let totalFramesRendered = 0;
  const totalFrames = numFrames * views.length;

  for (const view of views) {
    const folder = zip.folder(view.name);
    if (!folder) { continue; }

    const runner = new HeadlessRunner(canvas, width, height, pixelRatio);
    const renderer = view.createRenderer(runner.getGl());
    view.configureRenderer(renderer, state);

    await runner.run({
      canvas,
      width,
      height,
      pixelRatio,
      renderer,
      numFrames,
      createFrame: (t) => createFrame(t, state),
      onFrame: (i, blob) => {
        const frameName = `frame_${String(i).padStart(4, '0')}.png`;
        folder.file(frameName, blob);
        totalFramesRendered++;
        onProgress({
          phase: 'rendering',
          percent: Math.round((totalFramesRendered / totalFrames) * 100)
        });
        return Promise.resolve();
      }
    });

    renderer.destroy();
  }

  onProgress({ phase: 'zipping', percent: 0 });
  const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    onProgress({
      phase: 'zipping',
      percent: Math.round(metadata.percent)
    });
  });
  saveAs(content, fileName);
}

export interface SingleViewExportOptions<S, R extends WebGlRenderer<S> = WebGlRenderer<S>> {
  createRenderer: (gl: WebGLRenderingContext) => R;
  state: S;
  createFrame: (t: number, state: S) => Frame<S>;
  fileName: string;
  numFrames?: number;
  onProgress: (progress: ExportProgress) => void;
  pixelRatio?: number;
  xDomain?: [number, number];
  yDomain?: [number, number];
  configureRenderer?(renderer: R, state: S): void;
}

export async function exportSingleView<S, R extends WebGlRenderer<S>>(
  options: SingleViewExportOptions<S, R>
): Promise<void> {
  const {
    createRenderer,
    state,
    createFrame,
    fileName,
    numFrames = DEFAULT_NUM_EXPORT_FRAMES,
    onProgress,
    pixelRatio = 1,
    xDomain,
    yDomain
  } = options;

  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;

  const zip = new JSZip();
  const canvas = document.createElement('canvas');

  const runner = new HeadlessRunner(canvas, width, height, pixelRatio, xDomain, yDomain);
  const renderer = createRenderer(runner.getGl());
  if (options.configureRenderer) {
    options.configureRenderer(renderer, state);
  }

  await runner.run({
    canvas,
    width,
    height,
    pixelRatio,
    renderer,
    numFrames,
    createFrame: (t) => createFrame(t, state),
    onFrame: (i, blob) => {
      const frameName = `frame_${String(i).padStart(4, '0')}.png`;
      zip.file(frameName, blob);
      onProgress({
        phase: 'rendering',
        percent: Math.round(((i + 1) / numFrames) * 100)
      });
      return Promise.resolve();
    }
  });

  renderer.destroy();

  onProgress({ phase: 'zipping', percent: 0 });
  const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    onProgress({
      phase: 'zipping',
      percent: Math.round(metadata.percent)
    });
  });
  saveAs(content, fileName);
}
