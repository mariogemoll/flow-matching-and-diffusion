import type { Trajectories } from '../types';

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
