import { el } from 'web-ui-common/dom';

import { initBrownianMotionWidget, initSdeWidget } from './sde';

function run(): void {
  const brownianContainer = el(document, '#brownian-canvas') as HTMLElement;
  const sdeContainer = el(document, '#sde-canvas') as HTMLElement;

  initBrownianMotionWidget(brownianContainer);
  initSdeWidget(sdeContainer);
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    run();
  } catch (error) {
    console.error(error);
    alert(`Error during page setup: ${error instanceof Error ? error.message : String(error)}`);
  }
});
