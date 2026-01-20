// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { X_DOMAIN, Y_DOMAIN } from '../constants';
import type { Frame } from '../visualizations/engine';
import type { WebGlRenderer } from '../visualizations/webgl/types';
import { createDataToClipMatrix } from '../webgl/matrix';

export interface HeadlessRunnerOptions<S> {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  pixelRatio: number;
  renderer: WebGlRenderer<S>;
  numFrames: number;
  createFrame: (t: number) => Frame<S>;
  onFrame: (frameIndex: number, blob: Blob) => Promise<void>;
}

export class HeadlessRunner {
  private gl: WebGL2RenderingContext;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private dataToClipMatrix: Float32Array;

  constructor(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    pixelRatio: number,
    xDomain: [number, number] = X_DOMAIN,
    yDomain: [number, number] = Y_DOMAIN
  ) {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;

    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    canvas.style.width = `${String(width)}px`;
    canvas.style.height = `${String(height)}px`;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true
    });
    if (!gl) {
      throw new Error('Could not get WebGL2 context');
    }
    this.gl = gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.dataToClipMatrix = createDataToClipMatrix(xDomain, yDomain);
  }

  getGl(): WebGL2RenderingContext {
    return this.gl;
  }

  async run<S>(options: HeadlessRunnerOptions<S>): Promise<void> {
    const { renderer, numFrames, createFrame, onFrame, canvas } = options;
    const dt = 1 / Math.max(1, numFrames - 1);

    for (let i = 0; i < numFrames; i++) {
      const t = Math.min(1, i * dt);
      const frame = createFrame(t);

      this.gl.viewport(0, 0, this.width * this.pixelRatio, this.height * this.pixelRatio);
      this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);

      const webGl = {
        gl: this.gl,
        dataToClipMatrix: this.dataToClipMatrix
      };

      renderer.update(frame);
      renderer.render(webGl);

      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (blob) {
        await onFrame(i, blob);
      }
    }
  }
}
