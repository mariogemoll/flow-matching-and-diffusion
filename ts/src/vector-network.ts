import type * as tfjs from '@tensorflow/tfjs';
import type { Tensor2D } from 'flow-models-common/tf-types';

/**
 * Deeper MLP for velocity field prediction
 */
export class VectorNetwork {
  private model: tfjs.Sequential;

  constructor(hiddenDim = 128) {
    this.model = tf.sequential({
      layers: [
        // Input: [x, t] concatenated (dimension 2 + 1 = 3 for 2D data)
        tf.layers.dense({
          inputShape: [3],
          units: hiddenDim,
          activation: 'relu',
          kernelInitializer: 'heNormal'  // Better for ReLU
        }),
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
        // Output: velocity vector (dimension 2 for 2D data)
        // Initialize final layer with small weights for stability
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
    // Concatenate x and t: [batch, 3]
    const input = tf.concat([x, t], 1);
    return this.model.predict(input) as Tensor2D;
  }

  getModel(): tfjs.Sequential {
    return this.model;
  }
}
