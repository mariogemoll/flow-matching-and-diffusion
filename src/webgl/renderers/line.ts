/**
 * Line renderer - shader, creation, and drawing
 */

import type { Pair, RGBA, Trajectories } from '../../types';
import { createProgram } from './setup';
import lineFragmentSrc from './shaders/line.frag';
import lineVertexSrc from './shaders/line.vert';

interface CachedProgram {
  program: WebGLProgram;
  refCount: number;
}

const programCache = new WeakMap<WebGLRenderingContext, CachedProgram>();

export interface LineRenderer {
  gl: WebGLRenderingContext;
  renderPolylines(
    dataToClipMatrix: Float32Array,
    polylines: Pair<number>[][],
    color: RGBA
  ): void;
  renderTrajectories(
    dataToClipMatrix: Float32Array,
    traj: Trajectories,
    color: RGBA,
    t?: number
  ): void;
  destroy(): void;
}

interface LineRendererState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  xBuffer: WebGLBuffer;
  yBuffer: WebGLBuffer;
  trajXBuffer: WebGLBuffer;
  trajYBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  xLocation: number;
  yLocation: number;
  colorLocation: WebGLUniformLocation;
  matrixLocation: WebGLUniformLocation;
  // Per-instance caching state
  lastTrajConfig: { count: number; ppt: number };
  lastTrajData: { xs: Float32Array | null; ys: Float32Array | null };
  lastTrajVersion: number;
}

export function createLineRenderer(gl: WebGLRenderingContext): LineRenderer {
  const vertexSrc = lineVertexSrc;
  const fragmentSrc = lineFragmentSrc;

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
  const matrixLocation = gl.getUniformLocation(p, 'u_matrix');

  if (!colorLocation || !matrixLocation) {
    throw new Error('Failed to get uniform locations');
  }

  const state: LineRendererState = {
    gl,
    program: p,
    xBuffer: gl.createBuffer(),
    yBuffer: gl.createBuffer(),
    trajXBuffer: gl.createBuffer(),
    trajYBuffer: gl.createBuffer(),
    indexBuffer: gl.createBuffer(),
    xLocation: 0,
    yLocation: gl.getAttribLocation(p, 'a_y'),
    colorLocation,
    matrixLocation,
    lastTrajConfig: { count: 0, ppt: 0 },
    lastTrajData: { xs: null, ys: null },
    lastTrajVersion: -1
  };

  return {
    gl,
    renderPolylines(
      dataToClipMatrix: Float32Array,
      polylines: Pair<number>[][],
      color: RGBA
    ): void {
      // Convert polylines to interleaved line segments
      const positions: number[] = [];
      for (const points of polylines) {
        if (points.length < 2) { continue; }
        for (let i = 0; i < points.length - 1; i++) {
          const [x0, y0] = points[i];
          const [x1, y1] = points[i + 1];
          positions.push(x0, y0, x1, y1);
        }
      }
      if (positions.length === 0) { return; }

      gl.useProgram(state.program);

      // Use xBuffer to store interleaved data and bind both attributes to it with stride
      gl.bindBuffer(gl.ARRAY_BUFFER, state.xBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(positions),
        gl.DYNAMIC_DRAW
      );

      // a_x: size=1, stride=8, offset=0
      gl.enableVertexAttribArray(state.xLocation);
      gl.vertexAttribPointer(state.xLocation, 1, gl.FLOAT, false, 8, 0);

      // a_y: size=1, stride=8, offset=4
      if (state.yLocation !== -1) {
        gl.enableVertexAttribArray(state.yLocation);
        gl.vertexAttribPointer(state.yLocation, 1, gl.FLOAT, false, 8, 4);
      }

      gl.uniformMatrix3fv(state.matrixLocation, false, dataToClipMatrix);
      gl.uniform4fv(state.colorLocation, color);
      gl.lineWidth(1);

      gl.drawArrays(gl.LINES, 0, positions.length / 2);

      // Cleanup to avoid affecting other renderers
      gl.disableVertexAttribArray(state.xLocation);
      if (state.yLocation !== -1) { gl.disableVertexAttribArray(state.yLocation); }
      gl.lineWidth(1);
    },

    renderTrajectories(
      dataToClipMatrix: Float32Array,
      traj: Trajectories,
      color: RGBA,
      t = 1
    ): void {
      const ppt = traj.pointsPerTrajectory;
      if (traj.count === 0 || ppt < 2) { return; }

      // 1. Upload X and Y coordinates (Only if changed!)
      if (
        state.lastTrajData.xs !== traj.xs ||
        state.lastTrajData.ys !== traj.ys ||
        state.lastTrajVersion !== traj.version
      ) {
        gl.bindBuffer(gl.ARRAY_BUFFER, state.trajXBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, traj.xs, gl.DYNAMIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, state.trajYBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, traj.ys, gl.DYNAMIC_DRAW);
        state.lastTrajData = { xs: traj.xs, ys: traj.ys };
        state.lastTrajVersion = traj.version;
      }

      // 2. Setup attributes
      gl.useProgram(state.program);

      gl.bindBuffer(gl.ARRAY_BUFFER, state.trajXBuffer);
      gl.enableVertexAttribArray(state.xLocation);
      gl.vertexAttribPointer(state.xLocation, 1, gl.FLOAT, false, 0, 0);

      if (state.yLocation !== -1) {
        gl.bindBuffer(gl.ARRAY_BUFFER, state.trajYBuffer);
        gl.enableVertexAttribArray(state.yLocation);
        gl.vertexAttribPointer(state.yLocation, 1, gl.FLOAT, false, 0, 0);
      }

      gl.uniformMatrix3fv(state.matrixLocation, false, dataToClipMatrix);
      gl.uniform4fv(state.colorLocation, color);
      gl.lineWidth(1);

      // 3. Prepare Index Buffer (cached)
      const scaledT = Math.max(0, Math.min(1, t)) * (ppt - 1);
      const numSegmentsPerTraj = Math.floor(scaledT);

      if (numSegmentsPerTraj > 0) {
        if (
          state.lastTrajConfig.count !== traj.count ||
          state.lastTrajConfig.ppt !== ppt
        ) {
          const totalSegments = traj.count * (ppt - 1);
          const indices = new Uint32Array(totalSegments * 2);
          let idx = 0;

          for (let j = 0; j < ppt - 1; j++) {
            for (let i = 0; i < traj.count; i++) {
              const offset = i * ppt;
              indices[idx++] = offset + j;
              indices[idx++] = offset + j + 1;
            }
          }

          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.indexBuffer);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
          state.lastTrajConfig = { count: traj.count, ppt };
        } else {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.indexBuffer);
        }

        const totalIndicesToDraw = numSegmentsPerTraj * traj.count * 2;
        gl.drawElements(gl.LINES, totalIndicesToDraw, gl.UNSIGNED_INT, 0);
      }

      // Cleanup
      gl.disableVertexAttribArray(state.xLocation);
      if (state.yLocation !== -1) { gl.disableVertexAttribArray(state.yLocation); }
      gl.lineWidth(1);
    },

    destroy(): void {
      gl.deleteBuffer(state.xBuffer);
      gl.deleteBuffer(state.yBuffer);
      gl.deleteBuffer(state.trajXBuffer);
      gl.deleteBuffer(state.trajYBuffer);
      gl.deleteBuffer(state.indexBuffer);

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
