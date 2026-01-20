// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../constants';
import { demoVectorFieldBatch } from '../../math/demo-vector-field';
import type { Pair, Point2D, Points2D, RGBA } from '../../types';
import { interpolateTrajectory } from '../../util/trajectories';
import type { WebGl } from '../../webgl';
import { createLineRenderer, type LineRenderer } from '../../webgl/renderers/line';
import { createPointRenderer } from '../../webgl/renderers/point';
import { createThickLineRenderer } from '../../webgl/renderers/thick-line';
import { COLORS, DOT_SIZE, THICK_LINE_THICKNESS } from '../constants';
import type { Frame } from '../engine';
import type { VectorFieldState } from '../vector-field';
import type { WebGlRenderer } from './types';


type LineSegment = [Point2D, Point2D];

const DEFAULT_GRID_SIZE = { x: 25, y: 19 };
const DEFAULT_HEAD_ANGLE = Math.PI / 6;

function getDefaultArrowParams(xDomain: Pair<number>, yDomain: Pair<number>): {
  headLength: number;
  maxLength: number;
  minLength: number;
  scale: number;
} {
  const xRange = xDomain[1] - xDomain[0];
  const yRange = Math.abs(yDomain[1] - yDomain[0]);
  const avgRange = (xRange + yRange) / 2;

  if (avgRange >= 100) {
    return {
      headLength: xRange * 0.01,
      maxLength: xRange * 0.02,
      minLength: xRange * 0.006,
      scale: 0.25
    };
  } else {
    return {
      headLength: 0.06,
      maxLength: 0.15,
      minLength: 0.02,
      scale: 0.05
    };
  }
}

function createArrowShaft(
  start: Point2D,
  vx: number,
  vy: number,
  minLength: number,
  maxLength: number,
  scale: number
): LineSegment {
  const arrowLength = Math.sqrt(vx * vx + vy * vy);
  const scaledLength = Math.max(minLength, Math.min(arrowLength * scale, maxLength));
  const dx = (vx / arrowLength) * scaledLength;
  const dy = (vy / arrowLength) * scaledLength;
  const end: Point2D = [start[0] + dx, start[1] + dy];
  return [start, end];
}

function createArrowHead(
  tip: Point2D,
  angle: number,
  headLength: number,
  headAngle: number
): [LineSegment, LineSegment] {
  const leftX = tip[0] - headLength * Math.cos(angle - headAngle);
  const leftY = tip[1] - headLength * Math.sin(angle - headAngle);
  const rightX = tip[0] - headLength * Math.cos(angle + headAngle);
  const rightY = tip[1] - headLength * Math.sin(angle + headAngle);

  return [
    [tip, [leftX, leftY]],
    [tip, [rightX, rightY]]
  ];
}

function createArrowSegments(
  x: number,
  y: number,
  vx: number,
  vy: number,
  headLength: number,
  headAngle: number,
  minLength: number,
  maxLength: number,
  scale: number
): LineSegment[] {
  const start: Point2D = [x, y];
  const shaft = createArrowShaft(start, vx, vy, minLength, maxLength, scale);
  const tip = shaft[1];
  const angle = Math.atan2(tip[1] - start[1], tip[0] - start[0]);
  const [headLeft, headRight] = createArrowHead(tip, angle, headLength, headAngle);
  return [shaft, headLeft, headRight];
}

export function drawVectorField(
  lineRenderer: LineRenderer,
  dataToClipMatrix: Float32Array,
  vectorFieldFn: (points: Points2D, t: number) => Points2D,
  xDomain: Pair<number>,
  yDomain: Pair<number>,
  t: number,
  gridSize?: { x: number; y: number },
  color?: RGBA
): void {
  const grid = gridSize ?? DEFAULT_GRID_SIZE;
  const defaultParams = getDefaultArrowParams(xDomain, yDomain);
  const arrowColor = color ?? COLORS.vectorFieldArrow;

  const { headLength, maxLength, minLength, scale } = defaultParams;

  const [xMin, xMax] = xDomain;
  const [yMin, yMax] = yDomain;

  // Create grid points as Points2D
  const n = grid.x * grid.y;
  const gridPoints: Points2D = {
    xs: new Float32Array(n),
    ys: new Float32Array(n),
    version: 0
  };

  let idx = 0;
  for (let i = 0; i < grid.x; i++) {
    for (let j = 0; j < grid.y; j++) {
      gridPoints.xs[idx] = xMin + (i + 0.5) * ((xMax - xMin) / grid.x);
      gridPoints.ys[idx] = yMin + (j + 0.5) * ((yMax - yMin) / grid.y);
      idx++;
    }
  }

  const velocities = vectorFieldFn(gridPoints, t);

  const segments: LineSegment[] = [];

  for (let i = 0; i < n; i++) {
    const vx = velocities.xs[i];
    const vy = velocities.ys[i];
    const arrowLength = Math.sqrt(vx * vx + vy * vy);

    if (arrowLength > 0.0001) {
      const arrowSegments = createArrowSegments(
        gridPoints.xs[i],
        gridPoints.ys[i],
        vx,
        vy,
        headLength,
        DEFAULT_HEAD_ANGLE,
        minLength,
        maxLength,
        scale
      );
      segments.push(...arrowSegments);
    }
  }

  if (segments.length === 0) { return; }

  lineRenderer.renderPolylines(dataToClipMatrix, segments, arrowColor);
}

export interface VectorFieldRenderer extends WebGlRenderer<VectorFieldState> {
  // Currently empty, but kept for consistency and future extensibility
  _placeholder?: never;
}

export function createVectorFieldRenderer(gl: WebGLRenderingContext): VectorFieldRenderer {
  const lineRenderer = createLineRenderer(gl);
  const thickLineRenderer = createThickLineRenderer(gl);
  const pointRenderer = createPointRenderer(gl);

  let state: VectorFieldState | null = null;
  let t = 0;

  // Scratch buffer for point
  const pointBuffer = {
    xs: new Float32Array(1),
    ys: new Float32Array(1),
    version: 0
  };

  function update(frame: Frame<VectorFieldState>): boolean {
    state = frame.state;
    t = frame.clock.t;
    return true;
  }

  function render(webGl: WebGl): void {
    if (!state) { return; }

    drawVectorField(
      lineRenderer,
      webGl.dataToClipMatrix,
      demoVectorFieldBatch,
      X_DOMAIN,
      Y_DOMAIN,
      t,
      undefined,
      COLORS.vectorField
    );

    const { trajectory, showTrajectory } = state;
    if (trajectory.count === 0) { return; }

    if (showTrajectory) {
      thickLineRenderer.renderThickTrajectories(
        webGl.dataToClipMatrix,
        trajectory,
        COLORS.singleTrajectory,
        THICK_LINE_THICKNESS,
        1.0
      );
    }

    const currentPos = interpolateTrajectory(trajectory, 0, t);
    pointBuffer.xs[0] = currentPos[0];
    pointBuffer.ys[0] = currentPos[1];
    pointBuffer.version++;

    pointRenderer.render(
      webGl.dataToClipMatrix,
      pointBuffer,
      COLORS.highlightPoint,
      DOT_SIZE
    );
  }

  function destroy(): void {
    // no explicit cleanup
  }

  return {
    update,
    render,
    destroy
  };
}
