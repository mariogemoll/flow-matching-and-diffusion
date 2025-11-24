import { el } from 'web-ui-common/dom';

import { initFlowMatchingPipeline } from './flow-matching-pipeline';

void (async(): Promise<void> => {
  await tf.ready();
  await initFlowMatchingPipeline(
    el(document, '#moons-dataset-widget') as HTMLDivElement,
    el(document, '#training-widget') as HTMLDivElement,
    el(document, '#flow-visualization-widget') as HTMLDivElement,
    'flow-matching-model.json',
    'flow-matching-loss-history.bin',
    1000 // epochs
  );
})();
