import { fillWithSamplesFromStdGaussian } from '../../../math/gaussian';
import type { AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import type { SigmaScheduleName } from '../../../math/schedules/sigma';
import { createSdeNoises } from '../../../math/sde';
import { writeSdeTrajectoriesHeun } from '../../../math/std-gaussian-to-gmm';
import type { Points2D, Trajectories } from '../../../types';
import { makePoints2D } from '../../../util/points';
import { interpolateTrajectory, makeTrajectories } from '../../../util/trajectories';
import type { WebGl } from '../../../webgl';
import { createLineRenderer } from '../../../webgl/renderers/line';
import { createPointRenderer } from '../../../webgl/renderers/point';
import {
  COLORS,
  DEFAULT_MAX_SIGMA,
  DEFAULT_NUM_SDE_STEPS,
  DEFAULT_SIGMA_SCHEDULE,
  MAX_NUM_SAMPLES,
  MAX_NUM_SDE_STEPS,
  POINT_SIZE
} from '../../constants';
import type { Frame } from '../../engine';
import type { MargPathState } from '../../marginal';
import type { WebGlRenderer } from '../types';

function createGaussianSamples(count: number): Points2D {
  const points = makePoints2D(count);
  fillWithSamplesFromStdGaussian(points);
  return points;
}

export interface MargSdeRenderer extends WebGlRenderer<MargPathState> {
  setShowSdeTrajectories(show: boolean): void;
  setShowSamples(show: boolean): void;
  setSigmaSchedule(schedule: SigmaScheduleName): void;
  setSdeNumSteps(steps: number): void;
  setMaxSigma(sigma: number): void;
  resample(): void;
  resampleNoise(): void;
}

export function createMargSdeRenderer(
  gl: WebGLRenderingContext
): MargSdeRenderer {
  const lineRenderer = createLineRenderer(gl);
  const pointRenderer = createPointRenderer(gl);

  let showSdeTrajectories = true;
  let showSamples = true;

  let sigmaSchedule: SigmaScheduleName = DEFAULT_SIGMA_SCHEDULE;
  let sdeNumSteps = DEFAULT_NUM_SDE_STEPS;
  let maxSigma = DEFAULT_MAX_SIGMA;
  let numSamples = 0;

  let recalcRequested = true;

  const samplePool = createGaussianSamples(MAX_NUM_SAMPLES);
  const noises = createSdeNoises(MAX_NUM_SAMPLES, MAX_NUM_SDE_STEPS);
  let trajectories: Trajectories | null = null;
  const currentPoints = makePoints2D(MAX_NUM_SAMPLES);
  const velocity = makePoints2D(MAX_NUM_SAMPLES);
  const score = makePoints2D(MAX_NUM_SAMPLES);
  const interpolatedPoints = makePoints2D(MAX_NUM_SAMPLES);

  let lastSchedule: AlphaBetaScheduleName = 'linear';
  let lastNumSamples = -1;
  let lastComponents: MargPathState['components'] | null = null;
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

  function setMaxSigma(sigma: number): void {
    if (maxSigma !== sigma) {
      maxSigma = sigma;
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

  function update(frame: Frame<MargPathState>): boolean {
    const state = frame.state;
    t = frame.clock.t;

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
      const n = numSamples;
      const pointsPerTrajectory = sdeNumSteps + 1;

      if (
        trajectories?.count !== n ||
        trajectories.pointsPerTrajectory !== pointsPerTrajectory
      ) {
        trajectories = makeTrajectories(pointsPerTrajectory, n);
      }

      writeSdeTrajectoriesHeun(
        samplePool,
        noises,
        state.schedule,
        sigmaSchedule,
        lastComponents,
        numSamples,
        sdeNumSteps,
        maxSigma,
        trajectories,
        currentPoints,
        velocity,
        score
      );
      recalcRequested = false;
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

    if (
      showSamples &&
      trajectories &&
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
    // No explicit cleanup needed
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
