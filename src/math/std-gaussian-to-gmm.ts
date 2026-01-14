import type { GaussianComponent, GaussianMixture, Points2D, Trajectories } from '../types';
import { makePoints2D } from '../util/points';
import { fillWithSamplesFromStdGaussian } from './gaussian';
import {
  covarianceToAxes,
  invertMatrix2x2,
  matAddScalarDiagonal,
  type Matrix2x2,
  matScale } from './linalg';
import {
  type AlphaBetaScheduleName,
  getAlpha,
  getAlphaDerivative,
  getBeta,
  getBetaDerivative
} from './schedules/alpha-beta';

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
  const beta = getBeta(t, schedule);
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
