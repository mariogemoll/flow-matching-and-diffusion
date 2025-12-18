import { el } from 'web-ui-common/dom';

import { initOdeSdeWidget } from './score';

function run(): void {
  const odeSdeWidget = el(document, '#ode-sde-widget') as HTMLElement;
  initOdeSdeWidget(odeSdeWidget);
}

run();
