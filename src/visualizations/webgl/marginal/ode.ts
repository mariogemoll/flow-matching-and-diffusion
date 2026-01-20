// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import {
  NUM_TRAJECTORY_STEPS,
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { fillWithSamplesFromStdGaussian } from '../../../math/gaussian';
import type { AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import { writeTrajectories, writeVelocities } from '../../../math/std-gaussian-to-gmm';
import type { Points2D } from '../../../types';
import { makePoints2D } from '../../../util/points';
import { interpolateTrajectory, makeTrajectories } from '../../../util/trajectories';
import type { WebGl } from '../../../webgl';
import { createLineRenderer } from '../../../webgl/renderers/line';
import { createPointRenderer } from '../../../webgl/renderers/point';
import {
  COLORS,
  MAX_NUM_SAMPLES,
  POINT_SIZE
} from '../../constants';
import type { Frame } from '../../engine';
import type { MargPathState } from '../../marginal';
import type { WebGlRenderer } from '../types';
import { drawVectorField } from '../vector-field';

function createGaussianSamples(count: number): Points2D {
  const points = makePoints2D(count);
  fillWithSamplesFromStdGaussian(points);
  return points;
}

export interface MargOdeRenderer extends WebGlRenderer<MargPathState> {
  setShowTrajectories(show: boolean): void;
  setShowVectorField(show: boolean): void;
  setShowSamples(show: boolean): void;
  resample(): void;
}

export function createMargOdeRenderer(gl: WebGLRenderingContext): MargOdeRenderer {
  const lineRenderer = createLineRenderer(gl);
  const pointRenderer = createPointRenderer(gl);

  let showTrajectories = true;
  let showVectorField = false;
  let showSamples = true;
  let numSamples = 0;

  let recalcRequested = true;

  const samplePool = createGaussianSamples(MAX_NUM_SAMPLES);
  const trajectories = makeTrajectories(NUM_TRAJECTORY_STEPS, MAX_NUM_SAMPLES);
  const currentPoints = makePoints2D(MAX_NUM_SAMPLES);
  const velocity = makePoints2D(MAX_NUM_SAMPLES);
  let vectorFieldBuffer: Points2D | null = null;
  const interpolatedPoints = makePoints2D(MAX_NUM_SAMPLES);

  let lastSchedule: AlphaBetaScheduleName = 'linear';
  let lastNumSamples = -1;
  let lastComponents: MargPathState['components'] | null = null;
  let t = 0;

  function setShowTrajectories(show: boolean): void {
    showTrajectories = show;
  }

  function setShowVectorField(show: boolean): void {
    showVectorField = show;
  }

  function setShowSamples(show: boolean): void {
    showSamples = show;
  }

  function resample(): void {
    fillWithSamplesFromStdGaussian(samplePool);
    recalcRequested = true;
  }

  function update(frame: Frame<MargPathState>): boolean {
    const state = frame.state;
    t = frame.clock.t;

    // Detect state changes that require recomputing trajectories
    if (
      state.schedule !== lastSchedule ||
      state.numSamples !== lastNumSamples ||
      state.components !== lastComponents
    ) {
      lastSchedule = state.schedule;
      lastNumSamples = state.numSamples;
      lastComponents = state.components;
      numSamples = state.numSamples;
      recalcRequested = true;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (recalcRequested && lastComponents !== null) {
      writeTrajectories(
        samplePool,
        lastSchedule,
        lastComponents,
        numSamples,
        NUM_TRAJECTORY_STEPS,
        trajectories,
        currentPoints,
        velocity
      );
      recalcRequested = false;
    }

    return true;
  }

  function render(webGl: WebGl): void {
    if (showVectorField && lastComponents !== null) {
      drawVectorField(
        lineRenderer,
        webGl.dataToClipMatrix,
        (points, time) => {
          let buffer = vectorFieldBuffer;
          if (buffer?.xs.length !== points.xs.length) {
            buffer = makePoints2D(points.xs.length);
            vectorFieldBuffer = buffer;
          }
          if (lastComponents !== null) {
            writeVelocities(
              lastSchedule,
              lastComponents,
              time,
              points,
              buffer
            );
          }
          return buffer;
        },
        X_DOMAIN,
        Y_DOMAIN,
        t,
        undefined,
        COLORS.vectorField
      );
    }

    if (
      showTrajectories &&
      trajectories.count > 0
    ) {
      lineRenderer.renderTrajectories(
        webGl.dataToClipMatrix,
        trajectories,
        COLORS.trajectory
      );
    }

    if (
      showSamples &&
      trajectories.count > 0
    ) {
      const n = numSamples;
      for (let i = 0; i < n; i++) {
        const [px, py] = interpolateTrajectory(trajectories, i, t);
        interpolatedPoints.xs[i] = px;
        interpolatedPoints.ys[i] = py;
      }
      interpolatedPoints.version++;

      pointRenderer.render(
        webGl.dataToClipMatrix,
        interpolatedPoints,
        COLORS.point,
        POINT_SIZE,
        n
      );
    }
  }

  function destroy(): void {
    // No explicit resource cleanup needed for buffers as they are GC'd
  }

  return {
    setShowTrajectories,
    setShowVectorField,
    setShowSamples,
    resample,
    update,
    render,
    destroy
  };
}
