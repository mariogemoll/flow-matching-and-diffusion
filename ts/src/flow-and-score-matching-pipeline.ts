import { loadLossHistory } from 'flow-models-common/loss-history';
import { initWidget as initMoonsDataset } from 'flow-models-common/moons-widget';
import type { Tensor2D } from 'flow-models-common/tf-types';
import { trainModel } from 'flow-models-common/train';
import { initWidget as initTrainingWidget } from 'flow-models-common/training-widget';
import { quantizeFloats } from 'web-ui-common/data';
import { el } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';

import { DiffusionModel } from './diffusion-model';
import { FlowMatchingModel } from './flow-matching-model';
import { initWidget as initFlowMatchingVisualization } from './flow-matching-visualization';
import { ScoreMatchingModel } from './score-matching-model';

/**
 * Save loss history to a compressed binary file for download with custom filename
 */
function saveLossHistoryWithFilename(lossHistory: Pair<number>[], filename: string): void {
  // Extract just the loss values (epoch numbers are implicit: 0, 1, 2, ...)
  const lossValues = lossHistory.map(([, loss]) => loss);
  const float32Array = new Float32Array(lossValues);

  // Quantize to uint8
  const compressed = quantizeFloats(float32Array);

  const blob = new Blob([compressed], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
  console.log(`Loss history saved! Check your downloads folder for ${filename}`);
}

type TrainingState = 'not_started' | 'training' | 'paused' | 'completed';

interface PageState {
  numEpochs: number;
  trainData: Tensor2D | null;
  flowMatching: {
    model: FlowMatchingModel;
    trainingState: TrainingState;
  };
  scoreMatching: {
    model: ScoreMatchingModel;
    trainingState: TrainingState;
  };
}

void (async(): Promise<void> => {
  await tf.ready();

  // Get container elements
  const moonsDatasetContainer = el(
    document, '#moons-dataset-widget') as HTMLDivElement;
  const flowMatchingTrainingContainer = el(
    document, '#flow-matching-training-widget') as HTMLDivElement;
  const scoreMatchingTrainingContainer = el(
    document, '#score-matching-training-widget') as HTMLDivElement;
  const diffusionVisualizationContainer = el(
    document, '#diffusion-visualization-widget') as HTMLDivElement;

  // Create page state
  const pageState: PageState = {
    numEpochs: 1000,
    trainData: null,
    flowMatching: {
      model: new FlowMatchingModel(512),
      trainingState: 'not_started'
    },
    scoreMatching: {
      model: new ScoreMatchingModel(512),
      trainingState: 'not_started'
    }
  };

  // Initialize moons dataset widget
  initMoonsDataset(moonsDatasetContainer, pageState);

  // Create separate states for each model for trainModel compatibility
  const flowMatchingState = {
    numEpochs: pageState.numEpochs,
    get trainData(): Tensor2D | null { return pageState.trainData; },
    set trainData(value: Tensor2D | null) { pageState.trainData = value; },
    get model(): FlowMatchingModel { return pageState.flowMatching.model; },
    set model(value: FlowMatchingModel) { pageState.flowMatching.model = value; },
    get trainingState(): TrainingState { return pageState.flowMatching.trainingState; },
    set trainingState(value: TrainingState) { pageState.flowMatching.trainingState = value; }
  };

  const scoreMatchingState = {
    numEpochs: pageState.numEpochs,
    get trainData(): Tensor2D | null { return pageState.trainData; },
    set trainData(value: Tensor2D | null) { pageState.trainData = value; },
    get model(): ScoreMatchingModel { return pageState.scoreMatching.model; },
    set model(value: ScoreMatchingModel) { pageState.scoreMatching.model = value; },
    get trainingState(): TrainingState { return pageState.scoreMatching.trainingState; },
    set trainingState(value: TrainingState) { pageState.scoreMatching.trainingState = value; }
  };

  // Initialize Flow Matching training widget
  const flowMatchingWidget = initTrainingWidget(flowMatchingTrainingContainer);
  flowMatchingWidget.setMaxEpochs(1000);
  flowMatchingWidget.statusText.textContent = 'Loading...';

  // Initialize Score Matching training widget
  const scoreMatchingWidget = initTrainingWidget(scoreMatchingTrainingContainer);
  scoreMatchingWidget.setMaxEpochs(1000);
  scoreMatchingWidget.statusText.textContent = 'Loading...';

  // Function to update diffusion visualization
  function updateDiffusionVisualization(): void {
    // Check if both models are trained
    if (pageState.flowMatching.trainingState === 'completed' &&
        pageState.scoreMatching.trainingState === 'completed') {
      // Create diffusion model combining both trained models
      const diffusionModel = new DiffusionModel(
        pageState.flowMatching.model,
        pageState.scoreMatching.model
      );

      // Generate frames using Euler-Maruyama
      const initialNumSamples = 500;
      const normalSamples = tf.randomNormal([initialNumSamples, 2]) as Tensor2D;
      const [frames] = diffusionModel.generate(normalSamples);

      // Initialize visualization
      initFlowMatchingVisualization(diffusionVisualizationContainer, frames, {
        onResample: (numSamples: number) => {
          const samples = tf.randomNormal([numSamples, 2]) as Tensor2D;
          const [newFrames] = diffusionModel.generate(samples);
          return newFrames;
        },
        initialSamples: initialNumSamples,
        autoplay: false
      });

      console.log('Diffusion visualization updated!');
    }
  }

  // Try to load Flow Matching model
  try {
    const success = await pageState.flowMatching.model.loadWeights(
      'flow-matching-model.json');
    if (success) {
      console.log('Loaded Flow Matching weights from flow-matching-model.json');
      flowMatchingWidget.statusText.textContent = 'Loaded pre-trained weights';
      pageState.flowMatching.trainingState = 'completed';
      flowMatchingWidget.trainButton.textContent = 'Training completed';
      flowMatchingWidget.trainButton.disabled = true;
      flowMatchingWidget.resetButton.disabled = false;

      // Try to load loss history
      const lossHistory = await loadLossHistory('flow-matching-loss-history.bin');
      if (lossHistory) {
        flowMatchingWidget.setLossHistory(lossHistory);
      }
    } else {
      flowMatchingWidget.statusText.textContent = 'Failed to load weights';
    }
  } catch (error) {
    console.log('Could not load flow-matching-model.json:', error);
    flowMatchingWidget.statusText.textContent =
      'No pre-trained weights found. Click "Train model" to train.';
  }

  // Try to load Score Matching model
  try {
    const success = await pageState.scoreMatching.model.loadWeights(
      'score-matching-model.json');
    if (success) {
      console.log('Loaded Score Matching weights from score-matching-model.json');
      scoreMatchingWidget.statusText.textContent = 'Loaded pre-trained weights';
      pageState.scoreMatching.trainingState = 'completed';
      scoreMatchingWidget.trainButton.textContent = 'Training completed';
      scoreMatchingWidget.trainButton.disabled = true;
      scoreMatchingWidget.resetButton.disabled = false;

      // Try to load loss history
      const lossHistory = await loadLossHistory('score-matching-loss-history.bin');
      if (lossHistory) {
        scoreMatchingWidget.setLossHistory(lossHistory);
      }
    } else {
      scoreMatchingWidget.statusText.textContent = 'Failed to load weights';
    }
  } catch (error) {
    console.log('Could not load score-matching-model.json:', error);
    scoreMatchingWidget.statusText.textContent =
      'No pre-trained weights found. Click "Train model" to train.';
  }

  // Flow Matching training button handler
  flowMatchingWidget.trainButton.addEventListener('click', () => {
    void (async(): Promise<void> => {
      if (flowMatchingState.trainingState === 'training') {
        flowMatchingState.trainingState = 'paused';
        flowMatchingWidget.statusText.textContent = 'Pausing training...';
      } else if (flowMatchingState.trainingState !== 'completed') {
        flowMatchingState.trainingState = 'training';
        flowMatchingWidget.trainButton.textContent = 'Pause training';
        flowMatchingWidget.resetButton.disabled = true;
        flowMatchingWidget.statusText.textContent = 'Training...';

        flowMatchingState.model = await trainModel(
          flowMatchingState,
          () => new FlowMatchingModel(512),
          flowMatchingWidget
        );

        const finalState = flowMatchingState.trainingState as TrainingState;
        if (finalState === 'completed') {
          flowMatchingWidget.trainButton.textContent = 'Training completed';
          flowMatchingWidget.trainButton.disabled = true;
          flowMatchingWidget.resetButton.disabled = false;
          flowMatchingWidget.statusText.textContent = 'Training complete!';
          // Update diffusion visualization if both models are trained
          updateDiffusionVisualization();
        } else {
          flowMatchingWidget.trainButton.textContent = 'Resume training';
          flowMatchingWidget.resetButton.disabled = false;
          flowMatchingWidget.statusText.textContent = 'Training paused';
        }
      }
    })();
  });

  // Flow Matching reset button handler
  flowMatchingWidget.resetButton.addEventListener('click', () => {
    pageState.flowMatching.model = new FlowMatchingModel(512);
    pageState.flowMatching.trainingState = 'not_started';
    flowMatchingWidget.setLossHistory([]);
    flowMatchingWidget.trainButton.textContent = 'Train model';
    flowMatchingWidget.trainButton.disabled = false;
    flowMatchingWidget.statusText.textContent = 'Model reset. Ready to train.';
  });

  // Score Matching training button handler
  scoreMatchingWidget.trainButton.addEventListener('click', () => {
    void (async(): Promise<void> => {
      if (scoreMatchingState.trainingState === 'training') {
        scoreMatchingState.trainingState = 'paused';
        scoreMatchingWidget.statusText.textContent = 'Pausing training...';
      } else if (scoreMatchingState.trainingState !== 'completed') {
        scoreMatchingState.trainingState = 'training';
        scoreMatchingWidget.trainButton.textContent = 'Pause training';
        scoreMatchingWidget.resetButton.disabled = true;
        scoreMatchingWidget.statusText.textContent = 'Training...';

        scoreMatchingState.model = await trainModel(
          scoreMatchingState,
          () => new ScoreMatchingModel(512),
          scoreMatchingWidget
        );

        const finalState = scoreMatchingState.trainingState as TrainingState;
        if (finalState === 'completed') {
          scoreMatchingWidget.trainButton.textContent = 'Training completed';
          scoreMatchingWidget.trainButton.disabled = true;
          scoreMatchingWidget.resetButton.disabled = false;
          scoreMatchingWidget.statusText.textContent = 'Training complete!';
          // Update diffusion visualization if both models are trained
          updateDiffusionVisualization();
        } else {
          scoreMatchingWidget.trainButton.textContent = 'Resume training';
          scoreMatchingWidget.resetButton.disabled = false;
          scoreMatchingWidget.statusText.textContent = 'Training paused';
        }
      }
    })();
  });

  // Score Matching reset button handler
  scoreMatchingWidget.resetButton.addEventListener('click', () => {
    pageState.scoreMatching.model = new ScoreMatchingModel(512);
    pageState.scoreMatching.trainingState = 'not_started';
    scoreMatchingWidget.setLossHistory([]);
    scoreMatchingWidget.trainButton.textContent = 'Train model';
    scoreMatchingWidget.trainButton.disabled = false;
    scoreMatchingWidget.statusText.textContent = 'Model reset. Ready to train.';
  });

  // Expose state globally for console access
  interface WindowWithState {
    state: typeof pageState;
    saveFlowMatchingLossHistory: () => void;
    saveScoreMatchingLossHistory: () => void;
    updateDiffusionVisualization: () => void;
  }
  const windowWithState = window as unknown as WindowWithState;
  windowWithState.state = pageState;
  windowWithState.saveFlowMatchingLossHistory = (): void => {
    saveLossHistoryWithFilename(
      flowMatchingWidget.getLossHistory(), 'flow-matching-loss-history.bin');
  };
  windowWithState.saveScoreMatchingLossHistory = (): void => {
    saveLossHistoryWithFilename(
      scoreMatchingWidget.getLossHistory(), 'score-matching-loss-history.bin');
  };
  windowWithState.updateDiffusionVisualization = updateDiffusionVisualization;

  // Try to update visualization immediately if both models are already trained
  updateDiffusionVisualization();

  console.log('Page state available as window.state');
  console.log(
    'To save Flow Matching model weights: ' +
    'await state.flowMatching.model.saveWeights()');
  console.log('To save Flow Matching loss history: saveFlowMatchingLossHistory()');
  console.log(
    'To save Score Matching model weights: ' +
    'await state.scoreMatching.model.saveWeights()');
  console.log('To save Score Matching loss history: saveScoreMatchingLossHistory()');
  console.log('To manually update diffusion visualization: updateDiffusionVisualization()');
})();
