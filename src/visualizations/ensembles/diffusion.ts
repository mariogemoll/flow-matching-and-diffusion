// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { DiffusionModel } from '../../diffusion/model';
import type { FlowMatchingModel } from '../../flow-matching/model';
import type { ScoreMatchingModel } from '../../score-matching/model';
import {
  type DiffusionGenerationControllerRef,
  type DiffusionModelLoader,
  initDiffusionGenerationVisualization
} from '../diffusion-generation';
import {
  type FlowMatchingTrainingController,
  type FlowMatchingTrainingControllerRef,
  initFlowMatchingTrainingVisualization
} from '../flow-matching-training';
import { initMoonsDatasetVisualization } from '../moons-dataset';
import {
  initScoreMatchingTrainingVisualization,
  type ScoreMatchingTrainingController,
  type ScoreMatchingTrainingControllerRef
} from '../score-matching-training';

export interface DiffusionVisualizationEnsembleOptions {
  flowMatchingLossHistoryUrl?: string;
  flowMatchingWeightsUrl?: string;
  scoreMatchingLossHistoryUrl?: string;
  scoreMatchingWeightsUrl?: string;
}

export function initDiffusionVisualizationEnsemble(
  moonsDatasetContainer: HTMLElement,
  flowMatchingTrainingContainer: HTMLElement,
  scoreMatchingTrainingContainer: HTMLElement,
  generationContainer: HTMLElement,
  options?: DiffusionVisualizationEnsembleOptions
): () => void {
  const destroyMoonsDataset = initMoonsDatasetVisualization(moonsDatasetContainer);

  const flowMatchingTrainingControllerRef: FlowMatchingTrainingControllerRef = { current: null };
  const scoreMatchingTrainingControllerRef: ScoreMatchingTrainingControllerRef = { current: null };
  const generationControllerRef: DiffusionGenerationControllerRef = { current: null };

  let flowModel: FlowMatchingModel | null = null;
  let scoreModel: ScoreMatchingModel | null = null;

  function tryUpdateGeneration(): void {
    if (flowModel !== null && scoreModel !== null) {
      const diffusionModel = new DiffusionModel(flowModel, scoreModel);
      generationControllerRef.current?.setModel(diffusionModel);
    }
  }

  function resetGeneration(): void {
    generationControllerRef.current?.setModel(null);
  }

  function handleFlowMatchingTrained(model: FlowMatchingModel): void {
    flowModel = model;
    tryUpdateGeneration();
  }

  function handleScoreMatchingTrained(model: ScoreMatchingModel): void {
    scoreModel = model;
    tryUpdateGeneration();
  }

  function handleFlowMatchingReset(): void {
    flowModel = null;
    resetGeneration();
  }

  function handleScoreMatchingReset(): void {
    scoreModel = null;
    resetGeneration();
  }

  const loadModel: DiffusionModelLoader = async(onProgress) => {
    const flowController: FlowMatchingTrainingController | null =
      flowMatchingTrainingControllerRef.current;
    const scoreController: ScoreMatchingTrainingController | null =
      scoreMatchingTrainingControllerRef.current;
    if (flowController === null || scoreController === null) {
      return null;
    }

    const progressState = { flow: 0, score: 0 };
    const report = (): void => {
      onProgress?.((progressState.flow + progressState.score) / 2);
    };

    const [loadedFlow, loadedScore] = await Promise.all([
      flowController.loadPretrainedModel(
        (f) => { progressState.flow = f; report(); },
        { announceModelReady: false }
      ),
      scoreController.loadPretrainedModel(
        (f) => { progressState.score = f; report(); },
        { announceModelReady: false }
      )
    ]);

    if (loadedFlow === null || loadedScore === null) {
      return null;
    }

    flowModel = loadedFlow;
    scoreModel = loadedScore;
    return new DiffusionModel(loadedFlow, loadedScore);
  };

  const destroyGeneration = initDiffusionGenerationVisualization(
    generationContainer,
    {
      controllerRef: generationControllerRef,
      loadModel
    }
  );

  const destroyFlowMatchingTraining = initFlowMatchingTrainingVisualization(
    flowMatchingTrainingContainer,
    handleFlowMatchingTrained,
    {
      controllerRef: flowMatchingTrainingControllerRef,
      lossHistoryUrl: options?.flowMatchingLossHistoryUrl,
      onModelReset: handleFlowMatchingReset,
      weightsUrl: options?.flowMatchingWeightsUrl
    }
  );

  const destroyScoreMatchingTraining = initScoreMatchingTrainingVisualization(
    scoreMatchingTrainingContainer,
    handleScoreMatchingTrained,
    {
      controllerRef: scoreMatchingTrainingControllerRef,
      lossHistoryUrl: options?.scoreMatchingLossHistoryUrl,
      onModelReset: handleScoreMatchingReset,
      weightsUrl: options?.scoreMatchingWeightsUrl
    }
  );

  return (): void => {
    destroyFlowMatchingTraining();
    destroyScoreMatchingTraining();
    destroyGeneration();
    destroyMoonsDataset();
  };
}
