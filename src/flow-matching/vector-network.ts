// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { Sequential, Tensor2D } from './types';

/**
 * MLP for velocity field prediction
 * Input: [x, t] concatenated (dimension 2 + 1 = 3 for 2D data)
 * Output: velocity vector (dimension 2 for 2D data)
 */
export class VectorNetwork {
  private model: Sequential;

  constructor(hiddenDim = 128) {
    this.model = tf.sequential({
      layers: [
        // Input layer
        tf.layers.dense({
          inputShape: [3],
          units: hiddenDim,
          activation: 'relu',
          kernelInitializer: 'heNormal'
        }),
        // Hidden layers
        tf.layers.dense({
          units: hiddenDim,
          activation: 'relu',
          kernelInitializer: 'heNormal'
        }),
        tf.layers.dense({
          units: hiddenDim,
          activation: 'relu',
          kernelInitializer: 'heNormal'
        }),
        // Output layer - small weights for stability
        tf.layers.dense({
          units: 2,
          kernelInitializer: tf.initializers.randomNormal({ mean: 0, stddev: 0.001 }),
          biasInitializer: 'zeros'
        })
      ]
    });
  }

  /**
   * Predict velocity given position x and time t
   * @param x - Position tensor [batch, 2]
   * @param t - Time tensor [batch, 1]
   * @returns Velocity tensor [batch, 2]
   */
  predict(x: Tensor2D, t: Tensor2D): Tensor2D {
    const input = tf.concat([x, t], 1);
    return this.model.predict(input) as Tensor2D;
  }

  getModel(): Sequential {
    return this.model;
  }
}
