import { setUpConditionalPathWidget } from './widgets/conditional-path-widget';
import { setUpMarginalPathWidget } from './widgets/marginal-path-widget';
import { setUpMixtureWidget } from './widgets/mixture-widget';

function run(): void {
  setUpConditionalPathWidget();
  setUpMixtureWidget();
  setUpMarginalPathWidget();
}

run();
