// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { ScoreMatchingModel } from '../score-matching/model';
import {
  initTrainingVisualization,
  type TrainingController,
  type TrainingControllerRef
} from './training';

const HIDDEN_DIM = 512;
const VISUALIZATION_NAME = 'score-matching-training';
const LOSS_CHART_Y_MIN = 0;

export type ScoreMatchingTrainingController = TrainingController<ScoreMatchingModel>;
export type ScoreMatchingTrainingControllerRef = TrainingControllerRef<ScoreMatchingModel>;

export function initScoreMatchingTrainingVisualization(
  container: HTMLElement,
  onModelTrained?: (model: ScoreMatchingModel) => void,
  options?: {
    controllerRef?: ScoreMatchingTrainingControllerRef;
    lossHistoryUrl?: string;
    onModelReset?: () => void;
    weightsUrl?: string;
  }
): () => void {
  return initTrainingVisualization<ScoreMatchingModel>(
    container,
    VISUALIZATION_NAME,
    () => new ScoreMatchingModel(HIDDEN_DIM),
    onModelTrained,
    { ...options, lossChartYMin: LOSS_CHART_Y_MIN }
  );
}
