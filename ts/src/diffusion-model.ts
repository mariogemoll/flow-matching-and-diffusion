import type * as tfjs from '@tensorflow/tfjs';
import type { FlowModel, Generative } from 'flow-models-common/model-interface';
import type { LayerVariable, Tensor1D, Tensor2D } from 'flow-models-common/tf-types';

import type { FlowMatchingModel } from './flow-matching-model';
import type { ScoreMatchingModel } from './score-matching-model';

/**
 * Diffusion Model combining flow matching and score matching
 *
 * Implements the SDE: dX_t = [u_t^target(X_t) + (σ_t²/2)∇log p_t(X_t)]dt + σ_t dW_t
 *
 * Uses Euler-Maruyama method for generation:
 * X_{t+h} = X_t + h*[u_t + (σ_t²/2)*score_t] + √h*σ_t*ε_t
 *
 * where:
 * - u_t^target comes from the flow model
 * - score_t = -ε_t/β_t comes from the score model (which predicts noise ε_t)
 * - α_t = t, β_t = 1-t (noise schedule matching both models)
 * - σ_t = 1-t (diffusion coefficient)
 */
export class DiffusionModel implements FlowModel, Generative {
  private flowModel: FlowMatchingModel;
  private scoreModel: ScoreMatchingModel;
  private readonly modelName = 'Diffusion';

  constructor(flowModel: FlowMatchingModel, scoreModel: ScoreMatchingModel) {
    this.flowModel = flowModel;
    this.scoreModel = scoreModel;
  }

  /**
   * Generate samples using Euler-Maruyama method for the SDE
   */
  generate(z: Tensor2D, numSteps = 100): [Tensor2D[], Tensor1D | null] {
    const dt = 1.0 / numSteps;
    const frames: Tensor2D[] = [z];
    let x = z;

    for (let step = 0; step < numSteps; step++) {
      const t = step * dt;

      x = tf.tidy(() => {
        const batchSize = x.shape[0];
        const tTensor = tf.fill([batchSize, 1], t) as Tensor2D;

        // Get velocity from flow model: u_t^target
        const velocity = this.flowModel.predictVelocity(x, tTensor);

        // Get noise prediction from score model: ε_t
        const epsilon = this.scoreModel.predictNoise(x, tTensor);

        // Noise schedules: β_t = 1-t, σ_t = 1-t (matching both models)
        const beta_t = Math.max(1 - t, 1e-5); // Avoid division by zero at t=1
        const sigma_t = 1 - t;

        // Score: s_t = -ε_t / β_t
        // Drift correction: (σ_t²/2) * s_t = -(σ_t²/(2*β_t)) * ε_t
        const driftCorrection = tf.mul(epsilon, -(sigma_t * sigma_t) / (2 * beta_t));
        const drift = tf.add(velocity, driftCorrection);

        // Deterministic part: h * drift
        const deterministicTerm = tf.mul(drift, dt);

        // Stochastic part: √h * σ_t * ε (where ε ~ N(0, I))
        const noise = tf.randomNormal([batchSize, 2]) as Tensor2D;
        const stochasticTerm = tf.mul(noise, Math.sqrt(dt) * sigma_t);

        // Euler-Maruyama update: x_{t+h} = x_t + drift*h + diffusion*√h
        return tf.add(tf.add(x, deterministicTerm), stochasticTerm);
      });

      frames.push(x);
    }

    return [frames, null];
  }

  /**
   * Compute combined loss (for now, just use flow matching loss)
   */
  computeLoss(z: Tensor2D): tfjs.Scalar {
    return this.flowModel.computeLoss(z);
  }

  /**
   * Get trainable weights from both models
   */
  getTrainableWeights(): LayerVariable[] {
    return [
      ...this.flowModel.getTrainableWeights(),
      ...this.scoreModel.getTrainableWeights()
    ];
  }

  /**
   * Load weights for both models
   */
  async loadWeights(modelPath: string): Promise<boolean> {
    console.log(`Loading ${this.modelName} model weights...`);

    try {
      // Load flow model weights
      const flowPath = modelPath.replace('.json', '-flow.json');
      const flowSuccess = await this.flowModel.loadWeights(flowPath);

      // Load score model weights
      const scorePath = modelPath.replace('.json', '-score.json');
      const scoreSuccess = await this.scoreModel.loadWeights(scorePath);

      const success = flowSuccess && scoreSuccess;
      if (success) {
        console.log(`${this.modelName} model weights loaded successfully`);
      }
      return success;
    } catch (error) {
      console.error('Failed to load weights:', error);
      return false;
    }
  }

  /**
   * Save weights for both models
   */
  async saveWeights(): Promise<void> {
    console.log(`Saving ${this.modelName} model weights...`);
    await this.flowModel.saveWeights();
    await this.scoreModel.saveWeights();
    console.log(`${this.modelName} model weights saved!`);
  }
}
