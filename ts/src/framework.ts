import { createFrameworkController, type WidgetView } from './framework-controller';
import {
  makeCircularCircularScheduler,
  makeConstantVarianceScheduler,
  makeInverseSqrtNoiseScheduler,
  makeLinearNoiseScheduler,
  makeSqrtNoiseScheduler,
  makeSqrtSqrtScheduler,
  type NoiseScheduler } from './math/noise-scheduler';
import { initSchedulerSelectionWidget } from './scheduler-selection';
import { initSchedulerVisualizationWidget } from './scheduler-visualization';
import { initTimeSliderWidget } from './time-slider';

function getScheduler(schedulerType: string): NoiseScheduler {
  if (schedulerType === 'linear') {
    return makeLinearNoiseScheduler();
  } else if (schedulerType === 'sqrt') {
    return makeSqrtNoiseScheduler();
  } else if (schedulerType === 'inverse-sqrt') {
    return makeInverseSqrtNoiseScheduler();
  } else if (schedulerType === 'constant') {
    return makeConstantVarianceScheduler();
  } else if (schedulerType === 'sqrt-sqrt') {
    return makeSqrtSqrtScheduler();
  } else if (schedulerType === 'circular-circular') {
    return makeCircularCircularScheduler();
  }
  return makeConstantVarianceScheduler();
}

interface ParamState {
  time: number;
  schedulerType: string;
  scheduler: NoiseScheduler;
}

// Dummy widget views that just display the param state
function createDummyWidget(container: HTMLElement): WidgetView<ParamState> {
  return {
    render: async(params: ParamState): Promise<void> => {
      // Simulate some async rendering work
      await new Promise(resolve => setTimeout(resolve, 10));

      const alpha = params.scheduler.getAlpha(params.time);
      const beta = params.scheduler.getBeta(params.time);

      container.textContent = JSON.stringify({
        time: params.time.toFixed(3),
        schedulerType: params.schedulerType,
        alpha: alpha.toFixed(3),
        beta: beta.toFixed(3)
      }, null, 2);
    }
  };
}

// Initialize the framework
async function init(): Promise<void> {
  const initialSchedulerType = 'constant';
  const initialScheduler = getScheduler(initialSchedulerType);

  const controller = createFrameworkController({
    time: 0,
    schedulerType: initialSchedulerType,
    scheduler: initialScheduler
  });

  // Register dummy widgets
  const widget1Container = document.getElementById('widget1-display');
  const widget2Container = document.getElementById('widget2-display');
  const widget3Container = document.getElementById('widget3-display');
  if (!widget1Container || !widget2Container || !widget3Container) {
    throw new Error('Missing required widget containers');
  }

  controller.registerView(createDummyWidget(widget1Container));
  controller.registerView(createDummyWidget(widget2Container));
  controller.registerView(createDummyWidget(widget3Container));

  // Initialize time slider
  const timeSliderContainer = document.getElementById('time-slider-container');
  if (!timeSliderContainer) {
    throw new Error('Missing time-slider-container');
  }
  initTimeSliderWidget(
    timeSliderContainer,
    0,
    (time: number) => {
      void controller.update({ time });
    },
    {
      loop: true,
      autostart: false
    }
  );

  // Initialize scheduler selection
  const schedulerSelectionContainer = document.getElementById('scheduler-selection-container');
  if (!schedulerSelectionContainer) {
    throw new Error('Missing scheduler-selection-container');
  }
  initSchedulerSelectionWidget(
    schedulerSelectionContainer,
    (schedulerType: string) => {
      const scheduler = getScheduler(schedulerType);
      void controller.update({ schedulerType, scheduler });
    }
  );

  // Initialize scheduler visualization
  const schedulerVizContainer = document.getElementById('scheduler-viz-container');
  if (!schedulerVizContainer) {
    throw new Error('Missing scheduler-viz-container');
  }
  const updateSchedulerViz = initSchedulerVisualizationWidget(schedulerVizContainer);

  // Register scheduler viz as a view
  controller.registerView({
    render: (params: ParamState): void => {
      updateSchedulerViz(params.scheduler, params.time);
    }
  });

  // Do initial render
  const initialState = controller.getState();
  await controller.update(initialState);
}

void init();
