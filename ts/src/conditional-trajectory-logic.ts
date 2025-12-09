import type { Pair } from 'web-ui-common/types';

import type { NoiseScheduler } from './math/noise-scheduler';

/**
 * Maps a linear index [0, numFrames] to a time value [0, 1] using a power scale.
 * Higher powers concentrate more frames near t=1.
 */
export function frameIndexToTime(frameIndex: number, numFrames: number, power: number): number {
  const s = frameIndex / numFrames;
  return Math.pow(s, 1 / power);
}

/**
 * Calculate the mean trajectory for the conditional distribution p_t(x|x_1)
 * This is the deterministic/ODE path from noise to data
 */
export function calculateConditionalODETrajectory(
  initialSample: Pair<number>,
  dataPoint: Pair<number>,
  scheduler: NoiseScheduler,
  frameTimes: number[]
): Pair<number>[] {
  const trajectory: Pair<number>[] = [];

  for (const t of frameTimes) {
    const alpha = scheduler.getAlpha(t);
    const beta = scheduler.getBeta(t);
    const current: Pair<number> = [
      alpha * dataPoint[0] + beta * initialSample[0],
      alpha * dataPoint[1] + beta * initialSample[1]
    ];
    trajectory.push(current);
  }

  return trajectory;
}

/**
 * Calculate stochastic trajectory for the conditional SDE
 * Uses Euler-Maruyama method with time-dependent diffusion
 * At t=1, all trajectories should converge to the data point
 */
export function calculateConditionalSDETrajectory(
  initialSample: Pair<number>,
  dataPoint: Pair<number>,
  scheduler: NoiseScheduler,
  frameTimes: number[],
  diffusionCoeff: number,
  noise: Pair<number>[]
): Pair<number>[] {
  const trajectory: Pair<number>[] = [];
  const clampBeta = (beta: number): number => Math.max(beta, 1e-4);

  // Initial state at t=0
  const alpha0 = scheduler.getAlpha(frameTimes[0]);
  const mean0 = [alpha0 * dataPoint[0], alpha0 * dataPoint[1]];
  let residualX = initialSample[0] - mean0[0];
  let residualY = initialSample[1] - mean0[1];
  let currentX = initialSample[0];
  let currentY = initialSample[1];
  trajectory.push([currentX, currentY]);

  for (let i = 1; i < frameTimes.length; i++) {
    const tPrev = frameTimes[i - 1];
    const t = frameTimes[i];
    const dt = t - tPrev;
    if (dt <= 0) {
      trajectory.push([currentX, currentY]);
      continue;
    }

    const alphaT = scheduler.getAlpha(t);
    const betaT = clampBeta(scheduler.getBeta(t));
    const betaDot = scheduler.getBetaDerivative(t);

    // OU-like dynamics for the residual r_t = x_t - alpha(t)·x1
    const a = (betaDot / betaT) - (diffusionCoeff * diffusionCoeff) / (2 * betaT * betaT);
    const phi = Math.exp(a * dt);

    // Moment-matched variance for the residual increment
    let varianceIncrement: number;
    if (Math.abs(a) < 1e-8) {
      varianceIncrement = diffusionCoeff * diffusionCoeff * dt;
    } else {
      varianceIncrement = (diffusionCoeff * diffusionCoeff / (2 * a)) * (phi * phi - 1);
    }
    const noiseScale = Math.sqrt(Math.max(varianceIncrement, 0));

    // Convert stored dW (scaled by sqrt(dt)) into standard normals
    const [dWx, dWy] = noise[i - 1];
    const zX = dWx / Math.sqrt(dt);
    const zY = dWy / Math.sqrt(dt);

    residualX = phi * residualX + noiseScale * zX;
    residualY = phi * residualY + noiseScale * zY;

    const meanX = alphaT * dataPoint[0];
    const meanY = alphaT * dataPoint[1];
    currentX = meanX + residualX;
    currentY = meanY + residualY;

    trajectory.push([currentX, currentY]);
  }

  return trajectory;
}

/**
 * Generate Brownian noise for a trajectory with uniform time steps
 * Returns dW values, not cumulative Brownian motion
 */
export function generateBrownianNoise(numSteps: number, dt: number): Pair<number>[] {
  const noise: Pair<number>[] = [];

  for (let i = 0; i < numSteps; i++) {
    // Generate N(0, dt) random variables
    // Using Box-Muller transform for proper Gaussian
    const u1 = Math.random();
    const u2 = Math.random();
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

    const sqrtDt = Math.sqrt(dt);
    noise.push([z1 * sqrtDt, z2 * sqrtDt]);
  }

  return noise;
}

/**
 * Generate Brownian noise for non-uniform time steps
 * Takes an array of frame times and computes dt for each interval
 * Returns dW values scaled by sqrt(dt) for each specific interval
 */
export function generateBrownianNoiseForTimes(frameTimes: number[]): Pair<number>[] {
  const noise: Pair<number>[] = [];

  // Generate noise for each time interval (skip first frame as there's no previous time)
  for (let i = 1; i < frameTimes.length; i++) {
    const dt = frameTimes[i] - frameTimes[i - 1];

    // Generate N(0, dt) random variables using Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

    const sqrtDt = Math.sqrt(dt);
    noise.push([z1 * sqrtDt, z2 * sqrtDt]);
  }

  return noise;
}
