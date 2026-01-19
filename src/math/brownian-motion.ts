import type { Points2D, Trajectories } from '../types';

// Fills a Brownian motion trajectory starting at origin (in-place)
// Uses discretization: W_{t+h} = W_t + √h·ϵ_t where ϵ_t ~ N(0, I_d)
// Uses pre-generated random samples from randomnessPool
export function brownianMotionTrajectory(
  randomnessPool: Points2D,
  numSteps: number,
  out: Trajectories
): void {
  const pointsPerTraj = out.pointsPerTrajectory;
  if (pointsPerTraj <= 1 || out.xs.length < pointsPerTraj || out.ys.length < pointsPerTraj) {
    return;
  }

  if (numSteps > randomnessPool.xs.length) {
    throw new Error('numSteps exceeds randomness pool size');
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
    // Use pre-generated random samples from pool: ϵ ~ N(0, I_d)
    const epsilonX = randomnessPool.xs[step];
    const epsilonY = randomnessPool.ys[step];

    // Update: W_{t+h} = W_t + √h·ϵ
    Wx += sqrtH * epsilonX;
    Wy += sqrtH * epsilonY;

    out.xs[step + 1] = Wx;
    out.ys[step + 1] = Wy;
  }
  out.version += 1;
}
