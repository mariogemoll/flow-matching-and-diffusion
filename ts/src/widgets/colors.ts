// Central color constants for all widgets
// All widgets should import from this file to maintain consistency

export const COLORS = {
  // Background colors
  BACKGROUND: 'rgba(240, 240, 240, 1)',
  BACKGROUND_CSS: '#f0f0f0',
  // WebGL format [r, g, b, a] - light grey
  BACKGROUND_WEBGL: [0.94, 0.94, 0.94, 1] as [number, number, number, number],

  // Trajectory colors - darker and more opaque for visibility on white
  TRAJECTORY_LINE_ODE: 'rgba(80, 80, 80, 0.4)',
  TRAJECTORY_LINE_SDE: 'rgba(100, 100, 100, 0.4)',
  TRAJECTORY_POINT_ODE: 'rgba(60, 60, 60, 0.8)',
  TRAJECTORY_POINT_SDE: 'rgba(80, 80, 80, 0.8)',

  // Sample colors - darker for visibility
  CONDITIONAL_SAMPLE: 'rgba(50, 50, 50, 0.7)',
  MARGINAL_SAMPLE: 'rgba(50, 50, 50, 0.7)',

  // UI element colors
  MOUSE_CURSOR: 'rgba(40, 40, 40, 0.9)',
  OVERLAY_STROKE_SELECTED: 'rgba(40, 40, 40, 0.9)',
  OVERLAY_STROKE_UNSELECTED: 'rgba(100, 100, 100, 0.6)',
  OVERLAY_FILL_SELECTED: 'rgba(40, 40, 40, 0.9)',
  OVERLAY_FILL_UNSELECTED: 'rgba(100, 100, 100, 0.7)',
  SLIDER_LINE: 'rgba(100, 100, 100, 0.5)',

  // Vector field colors
  VECTOR_FIELD_ARROW: 'rgba(100, 100, 100, 0.7)',
  VECTOR_FIELD_TRAJECTORY: 'rgba(70, 70, 70, 0.7)',
  VECTOR_FIELD_DOT: 'rgba(50, 50, 50, 1)',

  // Grid and axis colors
  GRID_LINE: 'rgba(200, 200, 200, 0.5)',
  AXIS_LINE: 'rgba(100, 100, 100, 0.7)',

  // Brownian motion path colors (grey variations)
  BROWNIAN_PATH: 'rgba(80, 80, 80, 0.7)',
  BROWNIAN_DOT: 'rgba(50, 50, 50, 1)'
} as const;

export const SIZES = {
  POINT_RADIUS: 5,
  LINE_WIDTH: 1,
  HANDLE_RADIUS_SELECTED: 5,
  HANDLE_RADIUS_UNSELECTED: 4,
  SLIDER_HANDLE_RADIUS: 5
} as const;
