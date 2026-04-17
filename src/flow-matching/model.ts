// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { FlowModel, Generative, LayerVariable, Scalar, Tensor2D } from './types';
import { VectorNetwork } from './vector-network';

/**
 * Flow Matching Model using Conditional Optimal Transport (CondOT) path
 *
 * Uses the CondOT probability path: p_t(x|z) = N(tz, (1-t)^2 I)
 * with noise schedulers alpha_t = t and beta_t = 1-t
 *
 * The conditional vector field is: u_t(x|z) = z - epsilon
 */
export class FlowMatchingModel implements FlowModel, Generative {
  private network: VectorNetwork;
  private readonly modelName = 'Flow Matching';

  constructor(hiddenDim = 128) {
    this.network = new VectorNetwork(hiddenDim);
  }

  /**
   * Predict velocity field at position x and time t
   */
  predictVelocity(x: Tensor2D, t: Tensor2D): Tensor2D {
    return this.network.predict(x, t);
  }

  /**
   * Generate samples by solving ODE forward from t=0 to t=1
   * Uses Euler method with fixed step size
   */
  generate(z: Tensor2D, numSteps = 100): Tensor2D[] {
    const dt = 1.0 / numSteps;
    const frames: Tensor2D[] = [z];
    let x = z;

    for (let step = 0; step < numSteps; step++) {
      const t = step * dt;

      x = tf.tidy(() => {
        const tTensor = tf.fill([x.shape[0], 1], t) as Tensor2D;
        const velocity = this.network.predict(x, tTensor);
        // Euler step: x_{t+dt} = x_t + dt * u_t(x_t)
        return tf.add(x, tf.mul(velocity, dt));
      });

      frames.push(x);
    }

    return frames;
  }

  /**
   * Compute conditional flow matching loss using CondOT path
   *
   * Loss = E[||u_hat_t(x) - (z - epsilon)||^2]
   * where x = tz + (1-t)epsilon, t ~ U(0,1), z ~ p_data, epsilon ~ N(0,I)
   */
  computeLoss(z: Tensor2D): Scalar {
    return tf.tidy(() => {
      const batchSize = z.shape[0];

      // Sample t uniformly from [0, 1]
      const t = tf.randomUniform([batchSize, 1], 0, 1) as Tensor2D;

      // Sample epsilon ~ N(0, I)
      const epsilon = tf.randomNormal([batchSize, 2]) as Tensor2D;

      // Form noisy input: x = tz + (1-t)epsilon
      const x = tf.add(
        tf.mul(t, z),
        tf.mul(tf.sub(1, t), epsilon)
      );

      // Target velocity: v = z - epsilon (CondOT vector field)
      const targetVelocity = tf.sub(z, epsilon);

      // Predict velocity
      const predictedVelocity = this.network.predict(x as Tensor2D, t);

      // MSE loss
      const diff = tf.sub(predictedVelocity, targetVelocity);
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
