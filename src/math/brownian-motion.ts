import type { Trajectories } from '../types';

const SIGMA = 1.0;

// Fills a Brownian motion trajectory starting at origin (in-place)
export function brownianMotionTrajectory(out: Trajectories): void {
  const pointsPerTraj = out.pointsPerTrajectory;
  const numSteps = pointsPerTraj - 1;
  if (pointsPerTraj <= 1 || out.xs.length < pointsPerTraj || out.ys.length < pointsPerTraj) {
    return;
  }

  const stdDev = 1 / Math.sqrt(numSteps);
  let cumulativeX = 0;
  let cumulativeY = 0;

  out.count = 1;
  out.xs[0] = 0;
  out.ys[0] = 0;

  for (let step = 0; step < numSteps; step++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const r = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;
    const dWx = r * Math.cos(theta) * stdDev;
    const dWy = r * Math.sin(theta) * stdDev;
    cumulativeX += dWx * SIGMA;
    cumulativeY += dWy * SIGMA;
    out.xs[step + 1] = cumulativeX;
    out.ys[step + 1] = cumulativeY;
  }
  out.version += 1;
}
