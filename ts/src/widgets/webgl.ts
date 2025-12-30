import {
  createLineRenderer, createPointRenderer, getWebGlContext,
  type WebGlLineRenderer, type WebGlPointRenderer
} from 'web-ui-common/webgl';

export interface WebGl {
  context: WebGLRenderingContext;
  lineRenderer: WebGlLineRenderer;
  pointRenderer: WebGlPointRenderer;
}

export function initWebGl(canvas: HTMLCanvasElement): WebGl {
  const context = getWebGlContext(canvas);
  const lineRenderer = createLineRenderer(context);
  const pointRenderer = createPointRenderer(context);

  return {
    context,
    lineRenderer,
    pointRenderer
  };
}
