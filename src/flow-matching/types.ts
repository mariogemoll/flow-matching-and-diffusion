// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type * as tfjs from '@tensorflow/tfjs';

// Global tf object (loaded via script tag)
declare global {
  const tf: typeof tfjs;
}

// TensorFlow.js type aliases
export type Tensor = tfjs.Tensor;
export type Tensor1D = tfjs.Tensor1D;
export type Tensor2D = tfjs.Tensor2D;
export type Scalar = tfjs.Scalar;
export type Sequential = tfjs.Sequential;
export type LayerVariable = tfjs.LayerVariable;
export type Variable = tfjs.Variable;

// Training state
export type TrainingState = 'not_started' | 'training' | 'paused' | 'completed';

export interface PipelineState {
  numEpochs: number;
  trainData: Tensor2D | null;
  model: FlowModel | null;
  trainingState: TrainingState;
}

// Model interfaces
export interface FlowModel {
  computeLoss(x: Tensor2D): tfjs.Scalar;
  getTrainableWeights(): LayerVariable[];
  loadWeights(modelPath: string, onProgress?: (fraction: number) => void): Promise<boolean>;
  saveWeights(): Promise<void>;
}

export interface Generative {
  generate(z: Tensor2D): Tensor2D[];
}
