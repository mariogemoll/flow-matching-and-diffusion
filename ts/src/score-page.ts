import { el } from 'web-ui-common/dom';

import { initDoubleConditionalVectorFieldWidget, initOdeSdeWidget } from './score';

function run(): void {
  const doubleOdeWidget = el(document, '#double-ode-widget') as HTMLElement;
  const odeSdeWidget = el(document, '#ode-sde-widget') as HTMLElement;
  initDoubleConditionalVectorFieldWidget(doubleOdeWidget);
  initOdeSdeWidget(odeSdeWidget);
}

run();
