import { el } from 'web-ui-common/dom';

import { initFlowAndScoreMatchingPipeline } from './flow-and-score-matching-pipeline';

function run(): void {
  const moonsDatasetContainer = el(
    document, '#moons-dataset-widget') as HTMLDivElement;
  const flowMatchingTrainingContainer = el(
    document, '#flow-matching-training-widget') as HTMLDivElement;
  const scoreMatchingTrainingContainer = el(
    document, '#score-matching-training-widget') as HTMLDivElement;
  const diffusionVisualizationContainer = el(
    document, '#diffusion-visualization-widget') as HTMLDivElement;

  void initFlowAndScoreMatchingPipeline(
    moonsDatasetContainer,
    flowMatchingTrainingContainer,
    scoreMatchingTrainingContainer,
    diffusionVisualizationContainer,
    'flow-matching-model.json',
    'flow-matching-loss-history.bin',
    'score-matching-model.json',
    'score-matching-loss-history.bin'
  );
}

document.addEventListener('DOMContentLoaded', () => {
  run();
});
