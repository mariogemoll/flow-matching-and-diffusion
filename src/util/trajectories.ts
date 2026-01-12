import type { Point2D, Trajectories } from '../types';

export function makeTrajectories(pointsPerTrajectory: number, count: number): Trajectories {
  const totalPoints = count * pointsPerTrajectory;
  return {
    xs: new Float32Array(totalPoints),
    ys: new Float32Array(totalPoints),
    count,
    pointsPerTrajectory,
    version: 0
  };
}

export function interpolateTrajectory(
  trajectory: Trajectories,
  trajIndex: number,
  t: number
): Point2D {
  if (trajectory.count === 0 || trajectory.pointsPerTrajectory === 0) {
    return [0, 0];
  }

  const ppt = trajectory.pointsPerTrajectory;
  const scaledT = Math.max(0, Math.min(1, t)) * (ppt - 1);
  const index = Math.floor(scaledT);
  const fract = scaledT - index;

  const nextIndex = Math.min(index + 1, ppt - 1);

  const offset = trajIndex * ppt;
  const i = offset + index;
  const nextI = offset + nextIndex;

  const x = trajectory.xs[i] * (1 - fract) + trajectory.xs[nextI] * fract;
  const y = trajectory.ys[i] * (1 - fract) + trajectory.ys[nextI] * fract;

  return [x, y];
}
