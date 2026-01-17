/**
 * Point renderer - shader, creation, and drawing
 */

import type { Points2D, RGBA } from '../../types';
import { createProgram } from './setup';
import pointFragmentSrc from './shaders/point.frag';
import pointVertexSrc from './shaders/point.vert';

interface CachedProgram {
  program: WebGLProgram;
  refCount: number;
}

const programCache = new WeakMap<WebGLRenderingContext, CachedProgram>();

export interface PointRenderer {
  gl: WebGLRenderingContext;
  render(
    dataToClipMatrix: Float32Array,
    points: Points2D,
    color: RGBA,
    size: number,
    count?: number
  ): void;
  destroy(): void;
}

interface PointRendererState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  xBuffer: WebGLBuffer;
  yBuffer: WebGLBuffer;
  pointsXBuffer: WebGLBuffer;
  pointsYBuffer: WebGLBuffer;
  xLocation: number;
  yLocation: number;
  colorLocation: WebGLUniformLocation;
  sizeLocation: WebGLUniformLocation;
  matrixLocation: WebGLUniformLocation;
  lastPoints: Points2D | null;
  lastVersion: number;
  lastMatrix: Float32Array | null;
}

export function createPointRenderer(gl: WebGLRenderingContext): PointRenderer {
  const vertexSrc = pointVertexSrc;
  const fragmentSrc = pointFragmentSrc;

  let p: WebGLProgram;

  const cached = programCache.get(gl);
  if (cached) {
    p = cached.program;
    cached.refCount++;
  } else {
    p = createProgram(gl, vertexSrc, fragmentSrc);

    // Explicitly bind a_x to 0 so that there is always something bound to attribute 0
    gl.bindAttribLocation(p, 0, 'a_x');
    gl.linkProgram(p);

    programCache.set(gl, { program: p, refCount: 1 });
  }

  const colorLocation = gl.getUniformLocation(p, 'u_color');
  const sizeLocation = gl.getUniformLocation(p, 'u_pointSize');
  const matrixLocation = gl.getUniformLocation(p, 'u_matrix');

  if (colorLocation === null || sizeLocation === null || matrixLocation === null) {
    throw new Error('Failed to get uniform locations');
  }

  const state: PointRendererState = {
    gl,
    program: p,
    xBuffer: gl.createBuffer(),
    yBuffer: gl.createBuffer(),
    pointsXBuffer: gl.createBuffer(),
    pointsYBuffer: gl.createBuffer(),
    xLocation: 0,
    yLocation: gl.getAttribLocation(p, 'a_y'),
    colorLocation,
    sizeLocation,
    matrixLocation,
    lastPoints: null,
    lastVersion: -1,
    lastMatrix: null
  };

  return {
    gl,
    render(
      dataToClipMatrix: Float32Array,
      points: Points2D,
      color: RGBA,
      size: number,
      count?: number
    ): void {
      if (points.xs.length === 0) { return; }

      const canvas = gl.canvas as HTMLCanvasElement;
      const dpr = (canvas.width && canvas.clientWidth)
        ? canvas.width / canvas.clientWidth
        : 1;

      // 1. Upload X and Y coordinates (Only if changed!)
      if (
        state.lastPoints !== points ||
        state.lastVersion !== points.version
      ) {
        gl.bindBuffer(gl.ARRAY_BUFFER, state.pointsXBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, points.xs, gl.DYNAMIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, state.pointsYBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, points.ys, gl.DYNAMIC_DRAW);
        state.lastPoints = points;
        state.lastVersion = points.version;
      }

      // 2. Setup attributes
      gl.useProgram(state.program);

      gl.bindBuffer(gl.ARRAY_BUFFER, state.pointsXBuffer);
      gl.enableVertexAttribArray(state.xLocation);
      gl.vertexAttribPointer(state.xLocation, 1, gl.FLOAT, false, 0, 0);

      if (state.yLocation !== -1) {
        gl.bindBuffer(gl.ARRAY_BUFFER, state.pointsYBuffer);
        gl.enableVertexAttribArray(state.yLocation);
        gl.vertexAttribPointer(state.yLocation, 1, gl.FLOAT, false, 0, 0);
      }

      if (state.lastMatrix !== dataToClipMatrix) {
        gl.uniformMatrix3fv(state.matrixLocation, false, dataToClipMatrix);
        state.lastMatrix = dataToClipMatrix;
      }
      gl.uniform1f(state.sizeLocation, size * dpr);
      gl.uniform4fv(state.colorLocation, color);

      const numPoints = count ?? points.xs.length;
      gl.drawArrays(gl.POINTS, 0, numPoints);

      // Cleanup
      gl.disableVertexAttribArray(state.xLocation);
      if (state.yLocation !== -1) {
        gl.disableVertexAttribArray(state.yLocation);
      }
    },
    destroy(): void {
      gl.deleteBuffer(state.xBuffer);
      gl.deleteBuffer(state.yBuffer);
      gl.deleteBuffer(state.pointsXBuffer);
      gl.deleteBuffer(state.pointsYBuffer);

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
