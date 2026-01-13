// Conditional probability path from standard Gaussian to Dirac delta (single point z)

import type { Point2D, Points2D, Trajectories } from '../types';
import {
  type AlphaBetaScheduleName,
  getAlpha,
  getAlphaDerivative,
  getBeta,
  getBetaDerivative
} from './schedules/alpha-beta';

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
