import { el } from 'web-ui-common/dom';

import { initOrbitWidget } from './orbit-widget';

function run(): void {
  const container = el(document, '#container') as HTMLElement;
  console.log(container);

  initOrbitWidget(container, './orbit-widget-worker.js');
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    run();
  } catch(error: unknown) {
    console.error(error);
    alert(`Error during page setup: ${error instanceof Error ? error.message : String(error)}`);
  };
});
