import type * as tfjs from '@tensorflow/tfjs';
import type { LayerVariable, Tensor2D } from 'flow-models-common/tf-types';

import { VectorNetwork } from './vector-network';

/**
 * Base class for generative models (Flow Matching, Score Matching, etc.)
 * Contains common functionality: network, training, and weight management
 */
export abstract class BaseModel {
  protected network: VectorNetwork;
  protected readonly modelName: string;

  constructor(hiddenDim = 128, modelName: string) {
    this.network = new VectorNetwork(hiddenDim);
    this.modelName = modelName;
  }

  /**
   * Compute loss - implemented by derived classes
   */
  abstract computeLoss(z: Tensor2D): tfjs.Scalar;

  getTrainableWeights(): LayerVariable[] {
    return this.network.getModel().trainableWeights;
  }

  /**
   * Load model weights from TensorFlow.js format
   */
  async loadWeights(modelPath: string): Promise<boolean> {
    console.log(`Loading ${this.modelName} model weights...`);

    try {
      const loadedModel = await tf.loadLayersModel(modelPath) as tfjs.Sequential;

      // Set weights to network
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
