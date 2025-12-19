import type * as tfjs from '@tensorflow/tfjs';
import type { FlowModel, Generative } from 'flow-models-common/model-interface';
import type { Tensor1D, Tensor2D } from 'flow-models-common/tf-types';

import { BaseModel } from './base-model';

/**
 * Flow Matching Model using Conditional Optimal Transport (CondOT) path
 *
 * Uses the CondOT probability path: p_t(x|z) = N(tz, (1-t)²I)
 * with noise schedulers α_t = t and β_t = 1-t
 *
 * The conditional vector field is simply: u_t(x|z) = z - ε
 */
export class FlowMatchingModel extends BaseModel implements FlowModel, Generative {
  constructor(hiddenDim = 128) {
    super(hiddenDim, 'Flow Matching');
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
        const velocity = this.network.predict(x, tTensor);

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
      const predictedVelocity = this.network.predict(x as Tensor2D, t as Tensor2D);

      // MSE loss
      const diff = tf.sub(predictedVelocity, targetVelocity);
      const squaredError = tf.square(diff);
      const loss = tf.mean(squaredError);

      return loss as tfjs.Scalar;
    });
  }
}
