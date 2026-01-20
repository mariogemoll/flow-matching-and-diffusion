// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { fillWithSamplesFromStdGaussian } from '../../../math/gaussian';
import type { AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import type { SigmaScheduleName } from '../../../math/schedules/sigma';
import { createSdeNoises } from '../../../math/sde';
import { writeSdeTrajectories } from '../../../math/std-gaussian-to-dirac-delta';
import type { Point2D, Trajectories } from '../../../types';
import { makePoints2D } from '../../../util/points';
import { interpolateTrajectory, makeTrajectories } from '../../../util/trajectories';
import type { WebGl } from '../../../webgl';
import { createLineRenderer } from '../../../webgl/renderers/line';
import { createPointRenderer } from '../../../webgl/renderers/point';
import type { CondPathState } from '../../conditional';
import {
  COLORS,
  DEFAULT_MAX_SIGMA,
  DEFAULT_NUM_SDE_STEPS,
  DEFAULT_SIGMA_SCHEDULE,
  DOT_SIZE,
  MAX_NUM_SAMPLES,
  MAX_NUM_SDE_STEPS,
  POINT_SIZE
} from '../../constants';
import type { Frame } from '../../engine';
import type { WebGlRenderer } from '../types';

export interface CondSdeRenderer extends WebGlRenderer<CondPathState> {
  setShowSdeTrajectories(show: boolean): void;
  setShowSamples(show: boolean): void;
  setSigmaSchedule(schedule: SigmaScheduleName): void;
  setSdeNumSteps(steps: number): void;
  setMaxSigma(maxSigma: number): void;
  resample(): void;
  resampleNoise(): void;
}

export function createCondSdeRenderer(gl: WebGLRenderingContext): CondSdeRenderer {
  const lineRenderer = createLineRenderer(gl);
  const pointRenderer = createPointRenderer(gl);
  const dotRenderer = createPointRenderer(gl);

  const samplePool = makePoints2D(MAX_NUM_SAMPLES);
  const noises = createSdeNoises(MAX_NUM_SAMPLES, MAX_NUM_SDE_STEPS);
  fillWithSamplesFromStdGaussian(samplePool);

  let trajectories: Trajectories | null = null;
  const samplePoints = makePoints2D(MAX_NUM_SAMPLES);
  const dotPoints = {
    xs: new Float32Array(1),
    ys: new Float32Array(1),
    version: 0
  };

  let showSdeTrajectories = true;
  let showSamples = true;
  let sigmaSchedule: SigmaScheduleName = DEFAULT_SIGMA_SCHEDULE;
  let sdeNumSteps = DEFAULT_NUM_SDE_STEPS;
  let maxSigma = DEFAULT_MAX_SIGMA;

  let recalcRequested = true;
  let lastState: {
    z: Point2D;
    schedule: AlphaBetaScheduleName;
    numSamples: number;
    sigmaSchedule: SigmaScheduleName;
    sdeNumSteps: number;
    maxSigma: number;
  } | null = null;

  let t = 0;

  function setShowSdeTrajectories(show: boolean): void {
    showSdeTrajectories = show;
  }

  function setShowSamples(show: boolean): void {
    showSamples = show;
  }

  function setSigmaSchedule(schedule: SigmaScheduleName): void {
    if (sigmaSchedule !== schedule) {
      sigmaSchedule = schedule;
      recalcRequested = true;
    }
  }

  function setSdeNumSteps(steps: number): void {
    if (sdeNumSteps !== steps) {
      sdeNumSteps = steps;
      recalcRequested = true;
    }
  }

  function setMaxSigma(val: number): void {
    if (maxSigma !== val) {
      maxSigma = val;
      recalcRequested = true;
    }
  }

  function resample(): void {
    fillWithSamplesFromStdGaussian(samplePool);
    fillWithSamplesFromStdGaussian(noises);
    recalcRequested = true;
  }

  function resampleNoise(): void {
    fillWithSamplesFromStdGaussian(noises);
    recalcRequested = true;
  }

  function update(frame: Frame<CondPathState>): boolean {
    const state = frame.state;
    t = frame.clock.t;

    if (
      state.z !== lastState?.z ||
      state.schedule !== lastState.schedule ||
      state.numSamples !== lastState.numSamples ||
      sigmaSchedule !== lastState.sigmaSchedule ||
      sdeNumSteps !== lastState.sdeNumSteps ||
      maxSigma !== lastState.maxSigma
    ) {
      recalcRequested = true;
      lastState = {
        z: state.z,
        schedule: state.schedule,
        numSamples: state.numSamples,
        sigmaSchedule,
        sdeNumSteps,
        maxSigma
      };
    }

    if (recalcRequested) {
      const n = lastState.numSamples;
      const pointsPerTrajectory = lastState.sdeNumSteps + 1;

      if (
        trajectories?.count !== n ||
        trajectories.pointsPerTrajectory !== pointsPerTrajectory
      ) {
        trajectories = makeTrajectories(pointsPerTrajectory, n);
      }

      writeSdeTrajectories(
        lastState.schedule,
        lastState.sigmaSchedule,
        lastState.maxSigma,
        samplePool,
        lastState.z,
        noises,
        lastState.sdeNumSteps,
        trajectories
      );
      recalcRequested = false;
    }

    // Update dot buffer
    dotPoints.xs[0] = state.z[0];
    dotPoints.ys[0] = state.z[1];
    dotPoints.version++;

    // Update samples position
    // Draw current positions on trajectories (interpolated at current t)
    if (showSamples && trajectories !== null && trajectories.count > 0) {
      const n = Math.min(lastState.numSamples, trajectories.count);
      for (let i = 0; i < n; i++) {
        const pos = interpolateTrajectory(trajectories, i, t);
        samplePoints.xs[i] = pos[0];
        samplePoints.ys[i] = pos[1];
      }
      samplePoints.version++;
    }

    return true;
  }

  function render(webGl: WebGl): void {
    if (
      showSdeTrajectories &&
      trajectories &&
      trajectories.count > 0
    ) {
      lineRenderer.renderTrajectories(
        webGl.dataToClipMatrix,
        trajectories,
        COLORS.trajectory
      );
    }

    if (showSamples && trajectories && trajectories.count > 0 && lastState) {
      const n = Math.min(lastState.numSamples, trajectories.count);
      pointRenderer.render(
        webGl.dataToClipMatrix,
        samplePoints,
        COLORS.point,
        POINT_SIZE,
        n
      );
    }

    // Draw dot
    dotRenderer.render(
      webGl.dataToClipMatrix,
      dotPoints,
      COLORS.dot,
      DOT_SIZE
    );
  }

  function destroy(): void {
    // No explicit cleanup
  }

  return {
    setShowSdeTrajectories,
    setShowSamples,
    setSigmaSchedule,
    setSdeNumSteps,
    setMaxSigma,
    resample,
    resampleNoise,
    update,
    render,
    destroy
  };
}
