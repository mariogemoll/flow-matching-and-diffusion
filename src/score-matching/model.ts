// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { LayerVariable, Scalar, Tensor2D } from '../flow-matching/types';
import { VectorNetwork } from '../flow-matching/vector-network';

/**
 * Score Matching Model using Gaussian probability path
 *
 * Uses the Gaussian probability path p_t(x|z) = N(alpha_t z, beta_t^2 I)
 * with noise schedulers alpha_t = t and beta_t = 1-t.
 *
 * Trained via the noise-prediction formulation e_t^theta(x) ~ epsilon,
 * where x_t = alpha_t z + beta_t epsilon. This is equivalent to score
 * matching (s_t = -e_t / beta_t) but numerically stable.
 */
export class ScoreMatchingModel {
  private network: VectorNetwork;
  private readonly modelName = 'Score Matching';

  constructor(hiddenDim = 128) {
    this.network = new VectorNetwork(hiddenDim);
  }

  /**
   * Predict noise epsilon at position x and time t
   */
  predictNoise(x: Tensor2D, t: Tensor2D): Tensor2D {
    return this.network.predict(x, t);
  }

  /**
   * Compute score matching loss using Gaussian path (noise prediction form)
   *
   * Loss = E[|| e_t^theta(x_t) - epsilon ||^2]
   * where x_t = alpha_t z + beta_t epsilon,
   *       alpha_t = t, beta_t = 1 - t,
   *       t ~ U(0,1), z ~ p_data, epsilon ~ N(0, I)
   */
  computeLoss(z: Tensor2D): Scalar {
    return tf.tidy(() => {
      const batchSize = z.shape[0];

      const t: Tensor2D = tf.randomUniform([batchSize, 1], 0, 1);
      const epsilon: Tensor2D = tf.randomNormal([batchSize, 2]);

      const alpha_t = t;
      const beta_t = tf.sub(1, t);

      const x: Tensor2D = tf.add(
        tf.mul(alpha_t, z),
        tf.mul(beta_t, epsilon)
      );

      const predictedNoise = this.network.predict(x, t);

      const diff = tf.sub(predictedNoise, epsilon);
      const squaredError = tf.square(diff);
      const loss = tf.mean(squaredError);

      return loss as Scalar;
    });
  }

  getTrainableWeights(): LayerVariable[] {
    return this.network.getModel().trainableWeights;
  }

  /**
   * Load model weights from TensorFlow.js format
   */
  async loadWeights(
    modelPath: string,
    onProgress?: (fraction: number) => void
  ): Promise<boolean> {
    console.log(`Loading ${this.modelName} model weights...`);

    try {
      const loadedModel = await tf.loadLayersModel(modelPath, { onProgress });
      const weights = loadedModel.getWeights();
      this.network.getModel().setWeights(weights);

      console.log(`${this.modelName} model weights loaded successfully`);
      return true;
    } catch (error) {
      console.error('Failed to load weights:', error);
      return false;
    }
  }

  /**
   * Save model weights to downloads
   */
  async saveWeights(): Promise<void> {
    const filename = this.modelName.toLowerCase().replace(/\s+/g, '-') + '-model';
    console.log(`Saving ${this.modelName} model weights...`);
    await this.network.getModel().save(`downloads://${filename}`);
    console.log('Model weights saved! Check your downloads folder for:');
    console.log(`  - ${filename}.json`);
    console.log(`  - ${filename}.weights.bin`);
  }
}
