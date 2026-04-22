// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { FlowMatchingModel } from '../flow-matching/model';
import {
  initTrainingVisualization,
  type TrainingController,
  type TrainingControllerRef
} from './training';

const HIDDEN_DIM = 512;
const VISUALIZATION_NAME = 'flow-matching-training';

export type FlowMatchingTrainingController = TrainingController<FlowMatchingModel>;
export type FlowMatchingTrainingControllerRef = TrainingControllerRef<FlowMatchingModel>;

export function initFlowMatchingTrainingVisualization(
  container: HTMLElement,
  onModelTrained?: (model: FlowMatchingModel) => void,
  options?: {
    controllerRef?: FlowMatchingTrainingControllerRef;
    lossHistoryUrl?: string;
    onModelReset?: () => void;
    weightsUrl?: string;
  }
): () => void {
  return initTrainingVisualization<FlowMatchingModel>(
    container,
    VISUALIZATION_NAME,
    () => new FlowMatchingModel(HIDDEN_DIM),
    onModelTrained,
    options
  );
}
