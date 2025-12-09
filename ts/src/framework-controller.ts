export interface WidgetView<TParams> {
  render: (params: TParams) => void | Promise<void>;
}

export interface FrameworkController<TParams> {
  getState: () => TParams;
  registerView: (view: WidgetView<TParams>) => void;
  update: (partialState: Partial<TParams>) => Promise<void>;
  getEarlyExitCount: () => number;
  resetEarlyExitCount: () => void;
}

export function createFrameworkController<TParams extends Record<string, unknown>>(
  initialState: TParams
): FrameworkController<TParams> {
  let state = initialState;
  let targetState: TParams | null = null;
  let nextTargetState: TParams | null = null;
  let isRendering = false;
  let earlyExitCount = 0;
  const views: WidgetView<TParams>[] = [];

  async function render(params: TParams): Promise<void> {
    // Render all views in parallel
    await Promise.all(
      views.map(view => Promise.resolve(view.render(params)))
    );
  }

  async function renderLoop(): Promise<void> {
    while (targetState !== null) {
      isRendering = true;
      const stateToRender = targetState;

      // Render all views with the target state
      await render(stateToRender);

      // Check if there's a next target state
      if (nextTargetState !== null) {
        // Move next target to target and clear next
        targetState = nextTargetState;
        nextTargetState = null;
        // Continue the loop to render again
      } else {
        // No next target, update state and exit
        state = stateToRender;
        targetState = null;
        isRendering = false;
      }
    }
  }

  return {
    getState: () => ({ ...state }),

    registerView: (view: WidgetView<TParams>): void => {
      views.push(view);
    },

    update: async(partialState: Partial<TParams>): Promise<void> => {
      // Merge with the most recent state (in-flight or completed)
      const baseState = nextTargetState ?? targetState ?? state;
      const newState: TParams = {
        ...baseState,
        ...partialState
      };

      if (isRendering) {
        // If currently rendering, just set the next target state and return
        earlyExitCount++;
        nextTargetState = newState;
        return;
      }

      // Not rendering, so set target state and start rendering
      targetState = newState;
      await renderLoop();
    },

    getEarlyExitCount: () => earlyExitCount,

    resetEarlyExitCount: (): void => {
      earlyExitCount = 0;
    }
  };
}
