import type { Pair, RGBA } from '../types';
import { createDataToClipMatrix } from './matrix';

export interface WebGl {
  gl: WebGLRenderingContext;
  dataToClipMatrix: Float32Array;
}

export function createWebGl(
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
  xDomain: Pair<number>,
  yDomain: Pair<number>
): WebGl {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  canvas.style.width = `${String(logicalWidth)}px`;
  canvas.style.height = `${String(logicalHeight)}px`;

  const gl = canvas.getContext('webgl2') as WebGLRenderingContext | null;
  if (gl === null) { throw new Error('Failed to get WebGL2 context'); }

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const dataToClipMatrix = createDataToClipMatrix(
    xDomain,
    yDomain,
    logicalWidth,
    logicalHeight,
    canvas.width,
    canvas.height
  );

  return {
    gl,
    dataToClipMatrix
  };
}

export function clearWebGl(webGl: WebGl, color: RGBA = [0, 0, 0, 0]): void {
  const gl = webGl.gl;
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(color[0], color[1], color[2], color[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
}
