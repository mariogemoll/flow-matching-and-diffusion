import type * as tfjs from '@tensorflow/tfjs';
import type { Tensor2D } from 'flow-models-common/tf-types';

import { BaseModel } from './base-model';

/**
 * Score Matching Model using Gaussian probability path
 *
 * Uses the Gaussian probability path: p_t(x|z) = N(α_t*z, β_t²*I)
 * with noise schedulers α_t = t and β_t = 1-t
 *
 * The score field is: s_t(x|z) = -ε/β_t
 * We train a score network s_t^θ(x) to predict the score
 */
export class ScoreMatchingModel extends BaseModel {
  constructor(hiddenDim = 128) {
    super(hiddenDim, 'Score Matching');
  }

  /**
   * Compute score matching loss using Gaussian path
   *
   * Loss = E[||s_t^θ(x_t) + ε/β_t||²]
   * where x_t = α_t*z + β_t*ε, t ~ U(0,1), z ~ p_data, ε ~ N(0,I)
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

      // Target score: s_t(x|z) = -ε/β_t
      const targetScore = tf.div(tf.neg(epsilon), beta_t);

      // Predict score using the network
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const predictedScore = this.network.predict(x as Tensor2D, t as Tensor2D);

      // MSE loss: ||s_t^θ(x_t) - (-ε/β_t)||² = ||s_t^θ(x_t) + ε/β_t||²
      const diff = tf.sub(predictedScore, targetScore);
      const squaredError = tf.square(diff);
      const loss = tf.mean(squaredError);

      return loss as tfjs.Scalar;
    });
  }
}
