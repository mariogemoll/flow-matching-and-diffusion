// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { GaussianComponent, GaussianMixture, Points2D, Trajectories } from '../types';
import { makePoints2D } from '../util/points';
import { fillWithSamplesFromStdGaussian } from './gaussian';
import {
  covarianceToAxes,
  invertMatrix2x2,
  matAddScalarDiagonal,
  type Matrix2x2,
  matScale
} from './linalg';
import {
  type AlphaBetaScheduleName,
  getAlpha,
  getAlphaDerivative,
  getBeta,
  getBetaDerivative
} from './schedules/alpha-beta';
import { getSigma, type SigmaScheduleName } from './schedules/sigma';
import { type SdeNoises } from './sde';

export function writeGmm(
  targetGmm: GaussianMixture,
  schedule: AlphaBetaScheduleName,
  t: number,
  out: GaussianMixture
): void {
  const components = targetGmm.components;
  if (components.length === 0) {
    out.components.length = 0;
    return;
  }
  if (out.components.length !== components.length) {
    throw new Error('writeGmm expects number of components in out to match targetGmm');
  }

  const alpha = getAlpha(t, schedule);
  const beta = getBeta(t, schedule);
  const alpha2 = alpha * alpha;
  const beta2 = beta * beta;

  for (let i = 0; i < components.length; i++) {
    const source = components[i];
    const dest = out.components[i];

    dest.mean[0] = alpha * source.mean[0];
    dest.mean[1] = alpha * source.mean[1];
    dest.weight = source.weight;

    const cov = source.covariance;
    dest.covariance[0][0] = alpha2 * cov[0][0] + beta2;
    dest.covariance[0][1] = alpha2 * cov[0][1];
    dest.covariance[1][0] = alpha2 * cov[1][0];
    dest.covariance[1][1] = alpha2 * cov[1][1] + beta2;
  }

  out.version++;
}

export function sampleFromGmmMargProbPath(
  components: GaussianComponent[],
  sampleCount: number,
  t: number,
  schedule: AlphaBetaScheduleName,
  out: Points2D,
  startIndex = 0,
  count = sampleCount
): void {
  if (count <= 0) { return; }
  if (components.length === 0) { return; }

  const alpha = getAlpha(t, schedule);
  const beta = getBeta(t, schedule);

  const xs = out.xs;
  const ys = out.ys;
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);

  const componentNoise = makePoints2D(count);
  const sourceNoise = makePoints2D(count);
  fillWithSamplesFromStdGaussian(componentNoise);
  fillWithSamplesFromStdGaussian(sourceNoise);

  const axes = components.map((component) => covarianceToAxes(component.covariance));

  for (let i = 0; i < count; i++) {
    let r = Math.random() * totalWeight;
    let componentIndex = components.length - 1;

    for (let cIdx = 0; cIdx < components.length; cIdx++) {
      r -= components[cIdx].weight;
      if (r <= 0) {
        componentIndex = cIdx;
        break;
      }
    }

    const component = components[componentIndex];
    const componentAxes = axes[componentIndex];
    const z1 = componentNoise.xs[i];
    const z2 = componentNoise.ys[i];

    const x1x = component.mean[0] +
      componentAxes.majorAxis[0] * z1 +
      componentAxes.minorAxis[0] * z2;
    const x1y = component.mean[1] +
      componentAxes.majorAxis[1] * z1 +
      componentAxes.minorAxis[1] * z2;

    const z0x = sourceNoise.xs[i];
    const z0y = sourceNoise.ys[i];

    const outputIndex = startIndex + i;
    xs[outputIndex] = alpha * x1x + beta * z0x;
    ys[outputIndex] = alpha * x1y + beta * z0y;
  }

  out.version++;
}

// Computes velocities for multiple points, using pre-computed inverses where possible
export function writeVelocities(
  schedule: AlphaBetaScheduleName,
  components: GaussianComponent[],
  t: number,
  x: Points2D,
  v: Points2D
): void {
  const n = x.xs.length;
  const xs = x.xs;
  const ys = x.ys;
  const vxs = v.xs;
  const vys = v.ys;

  const alpha = getAlpha(t, schedule);
  const beta = Math.max(getBeta(t, schedule), 1e-8); // Prevent division by zero at t=1
  const alphaDot = getAlphaDerivative(t, schedule);
  const betaDot = getBetaDerivative(t, schedule);

  const invBeta = 1.0 / beta;
  const Bt = betaDot * invBeta;
  const At = alphaDot - Bt * alpha;

  const K = components.length;
  const epsilon = 1e-6;
  const logLikelihoods = new Float32Array(n * K);

  // Pre-calculate per-component constants
  const compConstants = components.map((comp) => {
    const mu_k = comp.mean;
    const Sigma_k_arr = comp.covariance;
    const Sigma_k: Matrix2x2 = { data: Sigma_k_arr };

    // m_k(t)
    const m_k_t_x = mu_k[0] * alpha;
    const m_k_t_y = mu_k[1] * alpha;

    // S_k(t)
    const S_k_t: Matrix2x2 = matAddScalarDiagonal(
      matScale(Sigma_k, alpha * alpha),
      beta * beta + epsilon
    );

    // Invert S_k(t)
    const S_k_inv = invertMatrix2x2(S_k_t);
    const [[invxx, invxy], [invyx, invyy]] = S_k_inv.data;

    // Determinant for PDF normalization
    const [[sxx, sxy], [syx, syy]] = S_k_t.data;
    const det = sxx * syy - sxy * syx;
    const normConst = comp.weight / (2 * Math.PI * Math.sqrt(det));
    const logNormConst = Math.log(normConst);

    // Pre-compute Sigma_k * alpha * S_k_inv for Z_hat calc
    const [[covxx, covxy], [covyx, covyy]] = Sigma_k.data;
    const tMxx = covxx * invxx + covxy * invyx;
    const tMxy = covxx * invxy + covxy * invyy;
    const tMyx = covyx * invxx + covyy * invyx;
    const tMyy = covyx * invxy + covyy * invyy;

    // M = alpha * tempM
    const Mxx = alpha * tMxx;
    const Mxy = alpha * tMxy;
    const Myx = alpha * tMyx;
    const Myy = alpha * tMyy;

    return {
      m_k_t_x,
      m_k_t_y,
      invxx,
      invxy,
      invyy,
      logNormConst,
      mu_x: mu_k[0],
      mu_y: mu_k[1],
      Mxx,
      Mxy,
      Myx,
      Myy
    };
  });

  // Pass 1: Compute log-likelihoods
  for (let k = 0; k < K; k++) {
    const c = compConstants[k];
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - c.m_k_t_x;
      const dy = ys[i] - c.m_k_t_y;

      // Mahalanobis
      const distSq =
        dx * (c.invxx * dx + c.invxy * dy) + dy * (c.invxy * dx + c.invyy * dy);
      logLikelihoods[i * K + k] = c.logNormConst - 0.5 * distSq;
    }
  }

  // Pass 2: Accumulate velocity field
  for (let i = 0; i < n; i++) {
    const xi = xs[i];
    const yi = ys[i];

    let z_sum_x = 0;
    let z_sum_y = 0;

    let maxLog = -Infinity;
    for (let k = 0; k < K; k++) {
      const val = logLikelihoods[i * K + k];
      if (val > maxLog) { maxLog = val; }
    }

    let sumExp = 0;
    for (let k = 0; k < K; k++) {
      const p = Math.exp(logLikelihoods[i * K + k] - maxLog);
      logLikelihoods[i * K + k] = p;
      sumExp += p;
    }

    const invSumExp = 1.0 / sumExp;

    for (let k = 0; k < K; k++) {
      const c = compConstants[k];
      const gamma = logLikelihoods[i * K + k] * invSumExp;

      const dx = xi - c.m_k_t_x;
      const dy = yi - c.m_k_t_y;

      // correction = M * diff
      const corrX = c.Mxx * dx + c.Mxy * dy;
      const corrY = c.Myx * dx + c.Myy * dy;

      const z_hat_x = c.mu_x + corrX;
      const z_hat_y = c.mu_y + corrY;

      z_sum_x += gamma * z_hat_x;
      z_sum_y += gamma * z_hat_y;
    }

    vxs[i] = At * z_sum_x + Bt * xi;
    vys[i] = At * z_sum_y + Bt * yi;
  }
}

// Euler integration of the marginal vector field for a batch of starting points
export function writeTrajectories(
  samplePool: Points2D,
  schedule: AlphaBetaScheduleName,
  components: GaussianComponent[],
  numSamples: number,
  numSteps: number,
  trajectories: Trajectories,
  x: Points2D,
  v: Points2D
): void {
  const n = numSamples;
  trajectories.count = n;
  trajectories.pointsPerTrajectory = numSteps;

  const trajectoryXs = trajectories.xs;
  const trajectoryYs = trajectories.ys;

  const xxs = x.xs;
  const xys = x.ys;
  const vxs = v.xs;
  const vys = v.ys;

  for (let i = 0; i < n; i++) {
    xxs[i] = samplePool.xs[i];
    xys[i] = samplePool.ys[i];
    trajectoryXs[i * numSteps] = xxs[i];
    trajectoryYs[i * numSteps] = xys[i];
  }

  const dt = 1.0 / (numSteps - 1);

  for (let step = 1; step < numSteps; step++) {
    const t = (step - 1) * dt;

    writeVelocities(schedule, components, t, x, v);

    for (let i = 0; i < n; i++) {
      xxs[i] += vxs[i] * dt;
      xys[i] += vys[i] * dt;
      const idx = i * numSteps + step;
      trajectoryXs[idx] = xxs[i];
      trajectoryYs[idx] = xys[i];
    }
  }
  trajectories.version += 1;
}

// Computes the score (gradient of log density) for a GMM at time t
export function writeScores(
  schedule: AlphaBetaScheduleName,
  components: GaussianComponent[],
  t: number,
  x: Points2D,
  score: Points2D
): void {
  const n = x.xs.length;
  const xs = x.xs;
  const ys = x.ys;
  const scoreXs = score.xs;
  const scoreYs = score.ys;

  const alpha = getAlpha(t, schedule);
  const beta = Math.max(getBeta(t, schedule), 1e-8); // Prevent division by zero at t=1

  const K = components.length;
  const epsilon = 1e-6;
  const logLikelihoods = new Float32Array(n * K);

  // Pre-calculate per-component constants
  const compConstants = components.map((comp) => {
    const mu_k = comp.mean;
    const Sigma_k_arr = comp.covariance;
    const Sigma_k: Matrix2x2 = { data: Sigma_k_arr };

    // m_k(t)
    const m_k_t_x = mu_k[0] * alpha;
    const m_k_t_y = mu_k[1] * alpha;

    // S_k(t)
    const S_k_t: Matrix2x2 = matAddScalarDiagonal(
      matScale(Sigma_k, alpha * alpha),
      beta * beta + epsilon
    );

    // Invert S_k(t)
    const S_k_inv = invertMatrix2x2(S_k_t);
    const [[invxx, invxy], [, invyy]] = S_k_inv.data;

    // Determinant for PDF normalization
    const [[sxx, sxy], [syx, syy]] = S_k_t.data;
    const det = sxx * syy - sxy * syx;
    const normConst = comp.weight / (2 * Math.PI * Math.sqrt(Math.abs(det)));
    const logNormConst = Math.log(normConst);

    return {
      m_k_t_x,
      m_k_t_y,
      invxx,
      invxy,
      invyy,
      logNormConst
    };
  });

  // Pass 1: Compute log-likelihoods
  for (let k = 0; k < K; k++) {
    const c = compConstants[k];
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - c.m_k_t_x;
      const dy = ys[i] - c.m_k_t_y;

      // Mahalanobis
      const distSq =
        dx * (c.invxx * dx + c.invxy * dy) + dy * (c.invxy * dx + c.invyy * dy);
      logLikelihoods[i * K + k] = c.logNormConst - 0.5 * distSq;
    }
  }

  // Pass 2: Accumulate score
  for (let i = 0; i < n; i++) {
    const xi = xs[i];
    const yi = ys[i];

    let maxLog = -Infinity;
    for (let k = 0; k < K; k++) {
      const val = logLikelihoods[i * K + k];
      if (val > maxLog) { maxLog = val; }
    }

    let sumExp = 0;
    for (let k = 0; k < K; k++) {
      const p = Math.exp(logLikelihoods[i * K + k] - maxLog);
      logLikelihoods[i * K + k] = p;
      sumExp += p;
    }

    const invSumExp = 1.0 / sumExp;

    let s_x = 0;
    let s_y = 0;

    for (let k = 0; k < K; k++) {
      const c = compConstants[k];
      const gamma = logLikelihoods[i * K + k] * invSumExp;

      const dx = xi - c.m_k_t_x;
      const dy = yi - c.m_k_t_y;

      // score_k = -S_k^-1 * (x - m_k)
      const sk_x = -(c.invxx * dx + c.invxy * dy);
      const sk_y = -(c.invxy * dx + c.invyy * dy);

      s_x += gamma * sk_x;
      s_y += gamma * sk_y;
    }

    scoreXs[i] = s_x;
    scoreYs[i] = s_y;
  }
}

// Calculate marginal SDE trajectories using Euler-Maruyama integration
export function writeSdeTrajectories(
  samplePool: Points2D,
  noises: SdeNoises,
  schedule: AlphaBetaScheduleName,
  sigmaSchedule: SigmaScheduleName,
  components: GaussianComponent[],
  numSamples: number,
  numSteps: number,
  maxSigma: number,
  trajectories: Trajectories,
  x: Points2D,
  v: Points2D,
  score: Points2D
): void {
  const n = numSamples;
  const steps = numSteps;
  const pointsPerTrajectory = steps + 1;

  trajectories.count = n;
  trajectories.pointsPerTrajectory = pointsPerTrajectory;

  const trajectoryXs = trajectories.xs;
  const trajectoryYs = trajectories.ys;

  const xxs = x.xs;
  const xys = x.ys;

  const vxs = v.xs;
  const vys = v.ys;

  const scoreXs = score.xs;
  const scoreYs = score.ys;

  const dt = 1.0 / steps;
  const sqrtDt = Math.sqrt(dt);

  // Initialize trajectories at t=0
  for (let i = 0; i < n; i++) {
    xxs[i] = samplePool.xs[i];
    xys[i] = samplePool.ys[i];
    trajectoryXs[i * pointsPerTrajectory] = xxs[i];
    trajectoryYs[i * pointsPerTrajectory] = xys[i];
  }

  for (let step = 0; step < steps; step++) {
    const t = step * dt;

    const sigma = getSigma(t, sigmaSchedule, maxSigma);
    const sigma2 = sigma * sigma;

    // Compute velocity and score at current position
    writeVelocities(schedule, components, t, x, v);
    writeScores(schedule, components, t, x, score);

    for (let i = 0; i < n; i++) {
      // Standard Euler-Maruyama: dX_t = [u_t + (σ²/2)∇log p_t] dt + σ dW_t
      const driftX = vxs[i] + (sigma2 * scoreXs[i]) / 2;
      const driftY = vys[i] + (sigma2 * scoreYs[i]) / 2;

      const noiseIndex = i * noises.stepsPerSample + step;
      const zx = noises.xs[noiseIndex];
      const zy = noises.ys[noiseIndex];

      xxs[i] += driftX * dt + sigma * zx * sqrtDt;
      xys[i] += driftY * dt + sigma * zy * sqrtDt;

      const idx = i * pointsPerTrajectory + step + 1;
      trajectoryXs[idx] = xxs[i];
      trajectoryYs[idx] = xys[i];
    }
  }

  trajectories.version += 1;
}

// Calculate marginal SDE trajectories using Heun's method
export function writeSdeTrajectoriesHeun(
  samplePool: Points2D,
  noises: SdeNoises,
  schedule: AlphaBetaScheduleName,
  sigmaSchedule: SigmaScheduleName,
  components: GaussianComponent[],
  numSamples: number,
  numSteps: number,
  maxSigma: number,
  trajectories: Trajectories,
  x: Points2D,
  v: Points2D,
  score: Points2D
): void {
  const n = numSamples;
  const steps = numSteps;
  const pointsPerTrajectory = steps + 1;

  trajectories.count = n;
  trajectories.pointsPerTrajectory = pointsPerTrajectory;

  const trajectoryXs = trajectories.xs;
  const trajectoryYs = trajectories.ys;

  const xxs = x.xs;
  const xys = x.ys;

  const vxs = v.xs;
  const vys = v.ys;

  const scoreXs = score.xs;
  const scoreYs = score.ys;

  // Temporary buffers for predicted state
  const xPredicted = makePoints2D(n);
  const vPredicted = makePoints2D(n);
  const scorePredicted = makePoints2D(n);

  const dt = 1.0 / steps;
  const sqrtDt = Math.sqrt(dt);

  // Initialize trajectories at t=0
  for (let i = 0; i < n; i++) {
    xxs[i] = samplePool.xs[i];
    xys[i] = samplePool.ys[i];
    trajectoryXs[i * pointsPerTrajectory] = xxs[i];
    trajectoryYs[i * pointsPerTrajectory] = xys[i];
  }

  for (let step = 0; step < steps; step++) {
    const t = step * dt;
    const tNext = (step + 1) * dt;

    const sigma = getSigma(t, sigmaSchedule, maxSigma);
    const sigma2 = sigma * sigma;

    // Step 1: Compute drift at current position
    writeVelocities(schedule, components, t, x, v);
    writeScores(schedule, components, t, x, score);

    // Generate noise (same for predictor and corrector)
    const noiseXs = new Float32Array(n);
    const noiseYs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const noiseIndex = i * noises.stepsPerSample + step;
      noiseXs[i] = noises.xs[noiseIndex];
      noiseYs[i] = noises.ys[noiseIndex];
    }

    // Step 2: Predictor step (full Euler step)
    for (let i = 0; i < n; i++) {
      const drift1X = vxs[i] + (sigma2 * scoreXs[i]) / 2;
      const drift1Y = vys[i] + (sigma2 * scoreYs[i]) / 2;

      xPredicted.xs[i] = xxs[i] + drift1X * dt + sigma * noiseXs[i] * sqrtDt;
      xPredicted.ys[i] = xys[i] + drift1Y * dt + sigma * noiseYs[i] * sqrtDt;
    }

    // Step 3: Compute drift at predicted position
    // Clamp tNext to avoid t=1.0 exactly where beta=0 causes singularities
    const tNextClamped = Math.min(tNext, 1.0 - 1e-6);
    const sigmaNext = getSigma(tNextClamped, sigmaSchedule, maxSigma);
    const sigma2Next = sigmaNext * sigmaNext;

    writeVelocities(schedule, components, tNextClamped, xPredicted, vPredicted);
    writeScores(schedule, components, tNextClamped, xPredicted, scorePredicted);

    // Step 4: Corrector step (average of drifts at current and predicted)
    for (let i = 0; i < n; i++) {
      const drift1X = vxs[i] + (sigma2 * scoreXs[i]) / 2;
      const drift1Y = vys[i] + (sigma2 * scoreYs[i]) / 2;

      const drift2X = vPredicted.xs[i] + (sigma2Next * scorePredicted.xs[i]) / 2;
      const drift2Y = vPredicted.ys[i] + (sigma2Next * scorePredicted.ys[i]) / 2;

      // Average the drifts
      const avgDriftX = (drift1X + drift2X) / 2;
      const avgDriftY = (drift1Y + drift2Y) / 2;

      xxs[i] += avgDriftX * dt + sigma * noiseXs[i] * sqrtDt;
      xys[i] += avgDriftY * dt + sigma * noiseYs[i] * sqrtDt;

      const idx = i * pointsPerTrajectory + step + 1;
      trajectoryXs[idx] = xxs[i];
      trajectoryYs[idx] = xys[i];
    }
  }
  trajectories.version += 1;
}
