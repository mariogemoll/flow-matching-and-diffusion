import type { Trajectories } from '../types';
import { sampleTwoFromStandardGaussian } from './gaussian';

// Fills a Brownian motion trajectory starting at origin (in-place)
// Uses discretization: W_{t+h} = W_t + √h·ϵ_t where ϵ_t ~ N(0, I_d)
export function brownianMotionTrajectory(out: Trajectories): void {
  const pointsPerTraj = out.pointsPerTrajectory;
  const numSteps = pointsPerTraj - 1;
  if (pointsPerTraj <= 1 || out.xs.length < pointsPerTraj || out.ys.length < pointsPerTraj) {
    return;
  }

  // Step size h for discretization over [0,1]
  const h = 1 / numSteps;
  const sqrtH = Math.sqrt(h);

  let Wx = 0;
  let Wy = 0;

  out.count = 1;
  out.xs[0] = 0;
  out.ys[0] = 0;

  for (let step = 0; step < numSteps; step++) {
    // Sample independent increments: ϵ ~ N(0, I_d)
    const [epsilonX, epsilonY] = sampleTwoFromStandardGaussian();

    // Update: W_{t+h} = W_t + √h·ϵ
    Wx += sqrtH * epsilonX;
    Wy += sqrtH * epsilonY;

    out.xs[step + 1] = Wx;
    out.ys[step + 1] = Wy;
  }
  out.version += 1;
}
