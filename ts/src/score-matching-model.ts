import type * as tfjs from '@tensorflow/tfjs';
import type { Tensor2D } from 'flow-models-common/tf-types';

import { BaseModel } from './base-model';

/**
 * Score Matching Model using Gaussian probability path
 *
 * Uses the Gaussian probability path: p_t(x|z) = N(α_t*z, β_t²*I)
 * with noise schedulers α_t = t and β_t = 1-t
 *
 * Trains using the noise prediction formulation: e_t^θ(x) ≈ ε
 * where x_t = α_t*z + β_t*ε
 *
 * This is equivalent to score matching (s_t^θ = -e_t^θ/β_t) but numerically stable.
 */
export class ScoreMatchingModel extends BaseModel {
  constructor(hiddenDim = 128) {
    super(hiddenDim, 'Score Matching');
  }

  /**
   * Compute score matching loss using Gaussian path
   *
   * Uses alternative noise prediction formulation (numerically stable):
   * Loss = E[||e_t^θ(x_t) - ε||²]
   * where x_t = α_t*z + β_t*ε, t ~ U(0,1), z ~ p_data, ε ~ N(0,I)
   *
   * This is equivalent to the score matching loss L = E[||s_t^θ(x_t) + ε/β_t||²]
   * but avoids division by β_t which can be numerically unstable when t→0.
   */
  computeLoss(z: Tensor2D): tfjs.Scalar {
    return tf.tidy(() => {
      const batchSize = z.shape[0];

      // Sample t uniformly from [0, 1]
      const t = tf.randomUniform([batchSize, 1], 0, 1) as Tensor2D;

      // Sample ε ~ N(0, I)
      const epsilon = tf.randomNormal([batchSize, 2]) as Tensor2D;

      // Compute noise schedulers: α_t = t, β_t = 1-t
      const alpha_t = t;
      const beta_t = tf.sub(1, t);

      // Form noisy input: x_t = α_t*z + β_t*ε
      const x = tf.add(
        tf.mul(alpha_t, z),
        tf.mul(beta_t, epsilon)
      );

      // Predict noise using the network (interprets output as noise prediction)
      // Note: Network output e_t^θ = -β_t * s_t^θ, so this is equivalent to score matching
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const predictedNoise = this.network.predict(x as Tensor2D, t as Tensor2D);

      // MSE loss: ||e_t^θ(x_t) - ε||²
      const diff = tf.sub(predictedNoise, epsilon);
      const squaredError = tf.square(diff);
      const loss = tf.mean(squaredError);

      return loss as tfjs.Scalar;
    });
  }
}
