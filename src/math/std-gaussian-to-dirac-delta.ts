// Conditional probability path from standard Gaussian to Dirac delta (single point z)

import type { Point2D, Points2D, Trajectories } from '../types';
import { makePoints2D } from '../util/points';
import { fillWithSamplesFromStdGaussian } from './gaussian';
import {
  type AlphaBetaScheduleName,
  getAlpha,
  getAlphaDerivative,
  getBeta,
  getBetaDerivative
} from './schedules/alpha-beta';
import { getSigma, type SigmaScheduleName } from './schedules/sigma';

// Flow map: Where are the points x0 at time t?
export function writePositions(
  schedule: AlphaBetaScheduleName,
  z: Point2D,
  x0: Points2D,
  t: number,
  positions: Points2D
): void {
  const alpha = getAlpha(t, schedule);
  const beta = getBeta(t, schedule);
  const alphaZx = alpha * z[0];
  const alphaZy = alpha * z[1];

  for (let i = 0; i < positions.xs.length; i++) {
    positions.xs[i] = alphaZx + beta * x0.xs[i];
    positions.ys[i] = alphaZy + beta * x0.ys[i];
  }
  positions.version++;
}

// Full paths from x0 to z
export function writeTrajectories(
  schedule: AlphaBetaScheduleName,
  z: Point2D,
  x0: Points2D,
  numSteps: number,
  trajectories: Trajectories
): void {

  const zx = z[0];
  const zy = z[1];

  for (let step = 0; step <= numSteps; step++) {
    const t = step / numSteps;
    const alpha = getAlpha(t, schedule);
    const beta = getBeta(t, schedule);
    const alphaZx = alpha * zx;
    const alphaZy = alpha * zy;

    for (let i = 0; i < trajectories.count; i++) {
      const idx = i * trajectories.pointsPerTrajectory + step;
      trajectories.xs[idx] = alphaZx + beta * x0.xs[i];
      trajectories.ys[idx] = alphaZy + beta * x0.ys[i];
    }
  }

  trajectories.version += 1;
}

// Velocities of the ODE at points x and time t
export function writeVelocities(
  schedule: AlphaBetaScheduleName,
  z: Point2D,
  t: number,
  x: Points2D,
  v: Points2D
): void {
  const alpha = getAlpha(t, schedule);
  const beta = getBeta(t, schedule);
  const alphaDot = getAlphaDerivative(t, schedule);
  const betaDot = getBetaDerivative(t, schedule);

  const n = x.xs.length;
  const { xs, ys } = x;
  const { xs: vxs, ys: vys } = v;

  for (let i = 0; i < n; i++) {
    const x0x = (xs[i] - alpha * z[0]) / beta;
    const x0y = (ys[i] - alpha * z[1]) / beta;

    vxs[i] = alphaDot * z[0] + betaDot * x0x;
    vys[i] = alphaDot * z[1] + betaDot * x0y;
  }
}

export interface SdeNoises extends Points2D {
  count: number;
  stepsPerSample: number;
}

export function createSdeNoises(count: number, stepsPerSample: number): SdeNoises {
  const totalNoise = count * stepsPerSample;
  const noises = makePoints2D(totalNoise);
  fillWithSamplesFromStdGaussian(noises);
  return { xs: noises.xs, ys: noises.ys, count, stepsPerSample, version: 0 };
}

// Helper: Performs a stabilized update step using local OU integration
function getStabilizedUpdate(
  xPrev: number,
  meanPrev: number,
  meanCurr: number,
  beta: number,
  betaDot: number,
  sigma: number,
  dt: number,
  noiseIncrement: number
): number {
  const variance = Math.max(beta * beta, 1e-6);
  // K is the 'stiffness' or restoring force
  const K = (betaDot / beta) - (sigma * sigma) / (2 * variance);

  const decay = Math.exp(K * dt);
  const twoKdt = 2 * K * dt;

  let noiseScale: number;
  if (Math.abs(twoKdt) < 1e-4) {
    noiseScale = sigma * Math.sqrt(dt);
  } else {
    const varInc = (sigma * sigma * (Math.exp(twoKdt) - 1)) / (2 * K);
    noiseScale = Math.sqrt(Math.max(0, varInc));
  }

  const deviation = xPrev - meanPrev;
  return meanCurr + (deviation * decay) + (noiseScale * noiseIncrement);
}

export function writeSdeTrajectories(
  alphaBetaSchedule: AlphaBetaScheduleName,
  sigmaSchedule: SigmaScheduleName,
  maxSigma: number,
  noisePool: Points2D,
  z: Point2D,
  noises: SdeNoises,
  numSteps: number,
  trajectories: Trajectories
): void {
  const n = noisePool.xs.length;
  const dt = 1 / numSteps;
  const zx = z[0];
  const zy = z[1];

  for (let i = 0; i < n; i++) {
    const startIdx = i * trajectories.pointsPerTrajectory;
    trajectories.xs[startIdx] = noisePool.xs[i];
    trajectories.ys[startIdx] = noisePool.ys[i];
  }

  for (let step = 1; step <= numSteps; step++) {
    const t = step * dt;
    const tPrev = (step - 1) * dt;

    const alpha = getAlpha(t, alphaBetaSchedule);
    const alphaPrev = getAlpha(tPrev, alphaBetaSchedule);

    // Use getBeta and ensure it doesn't go too close to zero to avoid division by zero in K calc
    const beta = Math.max(getBeta(t, alphaBetaSchedule), 1e-4);
    const betaDot = getBetaDerivative(t, alphaBetaSchedule);
    const sigma = getSigma(t, sigmaSchedule, maxSigma);

    const meanPrevX = alphaPrev * zx;
    const meanPrevY = alphaPrev * zy;
    const meanCurrX = alpha * zx;
    const meanCurrY = alpha * zy;

    for (let i = 0; i < n; i++) {
      const prevIdx = i * trajectories.pointsPerTrajectory + (step - 1);
      const currIdx = i * trajectories.pointsPerTrajectory + step;
      const noiseIdx = i * noises.stepsPerSample + (step - 1);

      trajectories.xs[currIdx] = getStabilizedUpdate(
        trajectories.xs[prevIdx],
        meanPrevX,
        meanCurrX,
        beta,
        betaDot,
        sigma,
        dt,
        noises.xs[noiseIdx]
      );

      trajectories.ys[currIdx] = getStabilizedUpdate(
        trajectories.ys[prevIdx],
        meanPrevY,
        meanCurrY,
        beta,
        betaDot,
        sigma,
        dt,
        noises.ys[noiseIdx]
      );
    }
  }

  trajectories.version += 1;
}
