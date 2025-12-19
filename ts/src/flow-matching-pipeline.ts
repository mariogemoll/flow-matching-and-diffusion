import type { Generative } from 'flow-models-common/model-interface';
import { initPipeline, type VisualizationCallbacks } from 'flow-models-common/pipeline';
import type { Tensor2D } from 'flow-models-common/tf-types';

import { FlowMatchingModel } from './flow-matching-model';
import { initWidget as initFlowMatchingVisualization } from './flow-matching-visualization';

export function initFlowMatchingPipeline(
  moonsDatasetContainer: HTMLDivElement,
  trainingContainer: HTMLDivElement,
  visualizationContainer: HTMLDivElement,
  modelUrl: string,
  lossHistoryUrl: string,
  numEpochs = 1000
): Promise<void> {
  // Create visualization callbacks for flow matching
  const visualizationCallbacks: VisualizationCallbacks = {
    updateVisualization: (model: Generative, container: HTMLDivElement) => {
      const initialNumSamples = 500;

      // Function to generate frames using Euler method at different time steps
      function generateFrames(numSamples: number): Tensor2D[] {
        // Sample from standard normal distribution (initial distribution)
        const normalSamples = tf.randomNormal([numSamples, 2]) as Tensor2D;

        // Run generation with default number of steps (100)
        // For flow matching, we want to visualize the continuous-time evolution
        const [frames] = model.generate(normalSamples);

        // Note: normalSamples is the first frame in the frames array,
        // so we don't dispose it here. It will be disposed when the frames are disposed.

        return frames;
      }

      // Generate initial frames
      const frames = generateFrames(initialNumSamples);

      // Initialize flow matching visualization widget
      // Clear previous widget
      container.innerHTML = '';

      // Get training state from the window object (exposed by pipeline)
      const windowWithState = window as unknown as { state?: { trainingState: string } };
      const autoplay = windowWithState.state?.trainingState === 'completed' ||
                      windowWithState.state?.trainingState === 'paused';

      initFlowMatchingVisualization(container, frames, {
        onResample: generateFrames,
        initialSamples: initialNumSamples,
        autoplay
      });
    }
  };

  return initPipeline(
    moonsDatasetContainer,
    trainingContainer,
    visualizationContainer,
    () => new FlowMatchingModel(512),
    modelUrl,
    lossHistoryUrl,
    visualizationCallbacks,
    numEpochs
  );
}
