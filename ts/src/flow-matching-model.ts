import type * as tfjs from '@tensorflow/tfjs';
import type { FlowModel } from 'flow-models-common/model-interface';
import type { LayerVariable, Tensor1D, Tensor2D } from 'flow-models-common/tf-types';

/**
 * Deeper MLP for velocity field prediction
 */
class VelocityNetwork {
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

/**
 * Flow Matching Model using Conditional Optimal Transport (CondOT) path
 *
 * Uses the CondOT probability path: p_t(x|z) = N(tz, (1-t)²I)
 * with noise schedulers α_t = t and β_t = 1-t
 *
 * The conditional vector field is simply: u_t(x|z) = z - ε
 */
export class FlowMatchingModel implements FlowModel {
  private velocityNet: VelocityNetwork;

  constructor(hiddenDim = 128) {
    this.velocityNet = new VelocityNetwork(hiddenDim);
  }

  /**
   * Generate samples by solving ODE forward from t=0 to t=1
   * Uses Euler method with fixed step size
   */
  generate(z: Tensor2D, numSteps = 100): [Tensor2D[], Tensor1D | null] {
    const dt = 1.0 / numSteps;
    const frames: Tensor2D[] = [z];
    let x = z;

    for (let step = 0; step < numSteps; step++) {
      const t = step * dt;

      // Use tidy for intermediate computations only
      x = tf.tidy(() => {
        const tTensor = tf.fill([x.shape[0], 1], t) as Tensor2D;

        // Get velocity from network
        const velocity = this.velocityNet.predict(x, tTensor);

        // Euler step: x_{t+dt} = x_t + dt * u_t(x_t)
        return tf.add(x, tf.mul(velocity, dt));
      });

      frames.push(x);
    }

    // Flow matching doesn't have log determinants
    return [frames, null];
  }

  /**
   * Compute conditional flow matching loss using CondOT path
   *
   * Loss = E[||û_t(x) - (z - ε)||²]
   * where x = tz + (1-t)ε, t ~ U(0,1), z ~ p_data, ε ~ N(0,I)
   */
  computeLoss(z: Tensor2D): tfjs.Scalar {
    return tf.tidy(() => {
      const batchSize = z.shape[0];

      // Sample t uniformly from [0, 1]
      const t = tf.randomUniform([batchSize, 1], 0, 1) as Tensor2D;

      // Sample ε ~ N(0, I)
      const epsilon = tf.randomNormal([batchSize, 2]) as Tensor2D;

      // Form noisy input: x = tz + (1-t)ε
      const x = tf.add(
        tf.mul(t, z),
        tf.mul(tf.sub(1, t), epsilon)
      );

      // Target velocity: v = z - ε (CondOT vector field)
      const targetVelocity = tf.sub(z, epsilon);

      // Predict velocity
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const predictedVelocity = this.velocityNet.predict(x as Tensor2D, t as Tensor2D);

      // MSE loss
      const diff = tf.sub(predictedVelocity, targetVelocity);
      const squaredError = tf.square(diff);
      const loss = tf.mean(squaredError);

      return loss as tfjs.Scalar;
    });
  }

  getTrainableWeights(): LayerVariable[] {
    return this.velocityNet.getModel().trainableWeights;
  }

  /**
   * Load model weights from TensorFlow.js format
   */
  async loadWeights(modelPath: string): Promise<boolean> {
    console.log('Loading flow matching model weights...');

    try {
      const loadedModel = await tf.loadLayersModel(modelPath) as tfjs.Sequential;

      // Set weights to velocity network
      const weights = loadedModel.getWeights();
      this.velocityNet.getModel().setWeights(weights);

      console.log('Flow matching model weights loaded successfully');
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
    console.log('Saving flow matching model weights...');
    await this.velocityNet.getModel().save('downloads://flow-matching-model');
    console.log('Model weights saved! Check your downloads folder for:');
    console.log('  - flow-matching-model.json');
    console.log('  - flow-matching-model.weights.bin');
  }
}
