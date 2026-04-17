// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { FlowMatchingModel } from '../../flow-matching/model';
import {
  type FlowMatchingGenerationControllerRef,
  type FlowMatchingModelLoader,
  initFlowMatchingGenerationVisualization
} from '../flow-matching-generation';
import {
  type FlowMatchingTrainingController,
  type FlowMatchingTrainingControllerRef,
  initFlowMatchingTrainingVisualization } from '../flow-matching-training';
import { initMoonsDatasetVisualization } from '../moons-dataset';

export interface FlowMatchingVisualizationEnsembleOptions {
  lossHistoryUrl?: string;
  weightsUrl?: string;
}

export function initFlowMatchingVisualizationEnsemble(
  moonsDatasetContainer: HTMLElement,
  trainingContainer: HTMLElement,
  generationContainer: HTMLElement,
  options?: FlowMatchingVisualizationEnsembleOptions
): () => void {
  const destroyMoonsDataset = initMoonsDatasetVisualization(moonsDatasetContainer);
  const trainingControllerRef: FlowMatchingTrainingControllerRef = { current: null };
  const generationControllerRef: FlowMatchingGenerationControllerRef = { current: null };

  const loadModel: FlowMatchingModelLoader = async(onProgress) => {
    const trainingController: FlowMatchingTrainingController | null = trainingControllerRef.current;
    if (trainingController === null) {
      return null;
    }
    return trainingController.loadPretrainedModel(
      onProgress,
      { announceModelReady: false }
    );
  };

  function showGeneration(model: FlowMatchingModel): void {
    generationControllerRef.current?.setModel(model);
  }

  function resetGeneration(): void {
    generationControllerRef.current?.setModel(null);
  }

  const destroyGeneration = initFlowMatchingGenerationVisualization(
    generationContainer,
    {
      controllerRef: generationControllerRef,
      loadModel
    }
  );

  const destroyTraining = initFlowMatchingTrainingVisualization(
    trainingContainer,
    showGeneration,
    {
      controllerRef: trainingControllerRef,
      lossHistoryUrl: options?.lossHistoryUrl,
      onModelReset: resetGeneration,
      weightsUrl: options?.weightsUrl
    }
  );

  return (): void => {
    destroyTraining();
    destroyGeneration();
    destroyMoonsDataset();
  };
}
