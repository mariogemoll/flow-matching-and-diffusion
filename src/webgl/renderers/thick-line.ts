/**
 * Thick line renderer - shader, creation, and drawing
 */

import type { RGBA, Trajectories } from '../../types';
import { createProgram } from './setup';
import thickLineFragmentSrc from './shaders/thick-line.frag';
import thickLineVertexSrc from './shaders/thick-line.vert';

interface CachedProgram {
  program: WebGLProgram;
  refCount: number;
}

const programCache = new WeakMap<WebGLRenderingContext, CachedProgram>();

export interface ThickLineRenderer {
  gl: WebGLRenderingContext;
  renderThickTrajectories(
    dataToClipMatrix: Float32Array,
    traj: Trajectories,
    color: RGBA,
    thicknessPx: number,
    t?: number
  ): void;
  destroy(): void;
}

interface ThickLineRendererState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  positionLocation: number;
  colorLocation: WebGLUniformLocation;
}

export function createThickLineRenderer(
  gl: WebGLRenderingContext
): ThickLineRenderer {
  const vertexSrc = thickLineVertexSrc;
  const fragmentSrc = thickLineFragmentSrc;

  let p: WebGLProgram;

  const cached = programCache.get(gl);
  if (cached) {
    p = cached.program;
    cached.refCount++;
  } else {
    p = createProgram(gl, vertexSrc, fragmentSrc);
    gl.bindAttribLocation(p, 0, 'a_position');
    gl.linkProgram(p);

    programCache.set(gl, { program: p, refCount: 1 });
  }

  const colorLocation = gl.getUniformLocation(p, 'u_color');

  if (!colorLocation) {
    throw new Error('Failed to get uniform locations');
  }

  const state: ThickLineRendererState = {
    gl,
    program: p,
    positionBuffer: gl.createBuffer(),
    positionLocation: 0,
    colorLocation
  };

  return {
    gl,
    renderThickTrajectories(
      dataToClipMatrix: Float32Array,
      traj: Trajectories,
      color: RGBA,
      thicknessPx: number,
      t = 1
    ): void {
      const ppt = traj.pointsPerTrajectory;
      if (traj.count === 0 || ppt < 2) { return; }

      const canvasWidth = gl.canvas.width;
      const canvasHeight = gl.canvas.height;
      const canvas = gl.canvas as HTMLCanvasElement;
      const logicalWidth = canvas.clientWidth || canvasWidth; // Fallback for headless

      const scaledT = Math.max(0, Math.min(1, t)) * (ppt - 1);
      const numSegmentsPerTraj = Math.floor(scaledT);
      if (numSegmentsPerTraj <= 0) { return; }

      const positions: number[] = [];
      const pixelRatio = canvasWidth / logicalWidth;
      const halfThickness = (thicknessPx * pixelRatio * 0.5);

      for (let i = 0; i < traj.count; i++) {
        const offset = i * ppt;
        for (let j = 0; j < numSegmentsPerTraj; j++) {
          const index0 = offset + j;
          const index1 = offset + j + 1;
          const x0 = traj.xs[index0];
          const y0 = traj.ys[index0];
          const x1 = traj.xs[index1];
          const y1 = traj.ys[index1];

          const [cx0, cy0] = transformToClip(dataToClipMatrix, x0, y0);
          const [cx1, cy1] = transformToClip(dataToClipMatrix, x1, y1);

          const dxPx = (cx1 - cx0) * canvasWidth * 0.5;
          const dyPx = (cy1 - cy0) * canvasHeight * 0.5;
          const len = Math.hypot(dxPx, dyPx);
          if (len === 0) { continue; }

          const nxPx = -dyPx / len;
          const nyPx = dxPx / len;
          const ox = ((nxPx * halfThickness) * 2) / canvasWidth;
          const oy = ((nyPx * halfThickness) * 2) / canvasHeight;

          const ax = cx0 + ox;
          const ay = cy0 + oy;
          const bx = cx0 - ox;
          const by = cy0 - oy;
          const cx = cx1 + ox;
          const cy = cy1 + oy;
          const dx = cx1 - ox;
          const dy = cy1 - oy;

          positions.push(
            ax,
            ay,
            bx,
            by,
            cx,
            cy,
            cx,
            cy,
            bx,
            by,
            dx,
            dy
          );
        }
      }

      if (positions.length === 0) { return; }

      gl.useProgram(state.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, state.positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(positions),
        gl.DYNAMIC_DRAW
      );
      gl.enableVertexAttribArray(state.positionLocation);
      gl.vertexAttribPointer(
        state.positionLocation,
        2,
        gl.FLOAT,
        false,
        0,
        0
      );
      gl.uniform4fv(state.colorLocation, color);
      gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);

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

function transformToClip(
  matrix: Float32Array,
  x: number,
  y: number
): [number, number] {
  const clipX = matrix[0] * x + matrix[3] * y + matrix[6];
  const clipY = matrix[1] * x + matrix[4] * y + matrix[7];
  return [clipX, clipY];
}
