// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { FlowMatchingModel } from '../flow-matching/model';
import type { Tensor2D } from '../flow-matching/types';
import type { ScoreMatchingModel } from '../score-matching/model';

/**
 * Diffusion Model combining flow matching and score matching
 *
 * Implements the SDE: dX_t = [u_t(X_t) + (sigma_t^2 / 2) nabla log p_t(X_t)] dt + sigma_t dW_t
 *
 * Uses the Euler-Maruyama method for generation:
 *   X_{t+h} = X_t + h [u_t + (sigma_t^2 / 2) score_t] + sqrt(h) sigma_t eps_t
 *
 * where:
 *   - u_t comes from the flow model,
 *   - score_t = -eps_t / beta_t comes from the score model (predicting noise),
 *   - alpha_t = t, beta_t = 1 - t (noise schedule, matching both models),
 *   - sigma_t = 1 - t (diffusion coefficient).
 */
export class DiffusionModel {
  private flowModel: FlowMatchingModel;
  private scoreModel: ScoreMatchingModel;

  constructor(flowModel: FlowMatchingModel, scoreModel: ScoreMatchingModel) {
    this.flowModel = flowModel;
    this.scoreModel = scoreModel;
  }

  /**
   * Generate samples via Euler-Maruyama integration of the SDE.
   */
  generate(z: Tensor2D, numSteps = 100): Tensor2D[] {
    const dt = 1.0 / numSteps;
    const frames: Tensor2D[] = [z];
    let x = z;

    for (let step = 0; step < numSteps; step++) {
      const t = step * dt;

      x = tf.tidy<Tensor2D>(() => {
        const batchSize = x.shape[0];
        const tTensor: Tensor2D = tf.fill([batchSize, 1], t);

        const velocity = this.flowModel.predictVelocity(x, tTensor);
        const epsilon = this.scoreModel.predictNoise(x, tTensor);

        const beta_t = Math.max(1 - t, 1e-5);
        const sigma_t = 1 - t;

        const driftCorrection = tf.mul(epsilon, -(sigma_t * sigma_t) / (2 * beta_t));
        const drift = tf.add(velocity, driftCorrection);
        const deterministicTerm = tf.mul(drift, dt);

        const noise: Tensor2D = tf.randomNormal([batchSize, 2]);
        const stochasticTerm = tf.mul(noise, Math.sqrt(dt) * sigma_t);

        return tf.add(tf.add(x, deterministicTerm), stochasticTerm);
      });

      frames.push(x);
    }

    return frames;
  }
}
