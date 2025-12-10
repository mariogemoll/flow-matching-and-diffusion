import { el } from 'web-ui-common/dom';

import { initOrbitWidget } from './orbit-widget';
import { initVectorFieldWidget } from './vector-field-widget';

function run(): void {
  const orbitContainer = el(document, '#container') as HTMLElement;
  initOrbitWidget(orbitContainer, '/dist/orbit-widget-worker.js');

  const vectorFieldContainer = el(document, '#vector-field-container') as HTMLElement;
  initVectorFieldWidget(vectorFieldContainer, '/dist/vector-field-widget-worker.js');
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    run();
  } catch(error: unknown) {
    console.error(error);
    alert(`Error during page setup: ${error instanceof Error ? error.message : String(error)}`);
  };
});
