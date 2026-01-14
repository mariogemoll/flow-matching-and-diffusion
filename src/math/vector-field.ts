import type { Point2D, Points2D, Trajectories } from '../types';
import { makeTrajectories } from '../util/trajectories';

export type VectorFieldFunction = (pos: Point2D, t: number) => Point2D;

/**
 * Compute trajectory using Euler's method
 */
export function eulerMethodTrajectory(
  vectorFieldFn: VectorFieldFunction,
  steps: number,
  startPos: Point2D
): Trajectories {
  const safeSteps = Math.max(2, Math.floor(steps));
  const pointsPerTraj = safeSteps + 1;
  const trajectories = makeTrajectories(pointsPerTraj, 1);

  let x = startPos[0];
  let y = startPos[1];
  trajectories.xs[0] = x;
  trajectories.ys[0] = y;

  const dt = 1.0 / safeSteps;

  for (let step = 0; step < safeSteps; step++) {
    const t = step * dt;
    const velocity = vectorFieldFn([x, y], t);
    x += velocity[0] * dt;
    y += velocity[1] * dt;
    trajectories.xs[step + 1] = x;
    trajectories.ys[step + 1] = y;
  }

  return trajectories;
}

/**
 * Compute stochastic trajectory using Euler-Maruyama method.
 * The noise is scaled by sqrt(dt) at use-time for mathematical correctness.
 */
export function eulerMaruyamaTrajectory(
  vectorFieldFn: VectorFieldFunction,
  steps: number,
  startPos: Point2D,
  diffusion: number,
  noises: Points2D
): Trajectories {
  const safeSteps = Math.max(2, Math.floor(steps));
  const pointsPerTraj = safeSteps + 1;
  const trajectories = makeTrajectories(pointsPerTraj, 1);

  let x = startPos[0];
  let y = startPos[1];
  trajectories.xs[0] = x;
  trajectories.ys[0] = y;

  const dt = 1.0 / safeSteps;
  const sqrtDt = Math.sqrt(dt);

  for (let step = 0; step < safeSteps; step++) {
    const t = step * dt;
    const velocity = vectorFieldFn([x, y], t);
    const zx = noises.xs[step];
    const zy = noises.ys[step];

    x += velocity[0] * dt + diffusion * zx * sqrtDt;
    y += velocity[1] * dt + diffusion * zy * sqrtDt;
    trajectories.xs[step + 1] = x;
    trajectories.ys[step + 1] = y;
  }

  return trajectories;
}
