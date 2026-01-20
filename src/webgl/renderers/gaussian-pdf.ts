// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

/**
 * Gaussian PDF renderer - shader, creation, and drawing
 */

import type { Pair, RGBA } from '../../types';
import { createProgram } from './setup';
import fragmentSrc from './shaders/gaussian-pdf.frag';
import vertexSrc from './shaders/gaussian-pdf.vert';

interface CachedProgram {
  program: WebGLProgram;
  refCount: number;
}

const programCache = new WeakMap<WebGLRenderingContext, CachedProgram>();

export interface GaussianPdfRenderer {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  render(
    dataToClipMatrix: Float32Array,
    mean: Pair<number>,
    variance: number,
    color: RGBA
  ): void;
  destroy(): void;
}

interface GaussianPdfRendererState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  positionLocation: number;
  meanLocation: WebGLUniformLocation;
  varianceLocation: WebGLUniformLocation;
  canvasSizeLocation: WebGLUniformLocation;
  dataToClipMatrixLocation: WebGLUniformLocation;
  colorLocation: WebGLUniformLocation;
}

export function createGaussianPdfRenderer(
  gl: WebGLRenderingContext
): GaussianPdfRenderer {
  let p: WebGLProgram;

  const cached = programCache.get(gl);
  if (cached) {
    p = cached.program;
    cached.refCount++;
  } else {
    p = createProgram(gl, vertexSrc, fragmentSrc);

    // Explicitly bind a_position to 0
    gl.bindAttribLocation(p, 0, 'a_position');
    gl.linkProgram(p);

    programCache.set(gl, { program: p, refCount: 1 });
  }

  const meanLocation = gl.getUniformLocation(p, 'u_mean');
  const varianceLocation = gl.getUniformLocation(p, 'u_variance');
  const canvasSizeLocation = gl.getUniformLocation(p, 'u_canvasSize');
  const dataToClipMatrixLocation = gl.getUniformLocation(p, 'u_dataToClip');
  const colorLocation = gl.getUniformLocation(p, 'u_color');

  if (
    meanLocation === null ||
    varianceLocation === null ||
    canvasSizeLocation === null ||
    dataToClipMatrixLocation === null ||
    colorLocation === null
  ) {
    throw new Error('Failed to get uniform locations for Gaussian PDF renderer');
  }

  const positionBuffer = gl.createBuffer() as WebGLBuffer | null;
  if (positionBuffer === null) {
    throw new Error('Failed to create buffer');
  }

  // Upload fullscreen quad vertices once
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );

  const state: GaussianPdfRendererState = {
    gl,
    program: p,
    positionBuffer,
    positionLocation: 0, // Bound to 0 above
    meanLocation,
    varianceLocation,
    canvasSizeLocation,
    dataToClipMatrixLocation,
    colorLocation
  };

  return {
    gl,
    program: p,
    render(
      dataToClipMatrix: Float32Array,
      mean: Pair<number>,
      variance: number,
      color: RGBA
    ): void {
      gl.useProgram(state.program);

      // Bind position buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, state.positionBuffer);
      gl.enableVertexAttribArray(state.positionLocation);
      gl.vertexAttribPointer(state.positionLocation, 2, gl.FLOAT, false, 0, 0);

      // Set uniforms
      gl.uniform2f(state.meanLocation, mean[0], mean[1]);
      gl.uniform1f(state.varianceLocation, variance);
      gl.uniform2f(state.canvasSizeLocation, gl.canvas.width, gl.canvas.height);
      gl.uniformMatrix3fv(state.dataToClipMatrixLocation, false, dataToClipMatrix);
      gl.uniform4fv(state.colorLocation, color);

      // Draw quad
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Cleanup
      gl.disableVertexAttribArray(state.positionLocation);
    },
    destroy(): void {
      gl.deleteBuffer(state.positionBuffer);

      const cached = programCache.get(gl);
      if (cached) {
        cached.refCount--;
        if (cached.refCount <= 0) {
          gl.deleteProgram(state.program);
          programCache.delete(gl);
        }
      }
    }
  };
}
