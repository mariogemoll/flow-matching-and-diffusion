import React, { useState } from 'react';

import type { AlphaBetaScheduleName } from '../../math/schedules/alpha-beta';
import { useEngine } from '../engine';
import { EllipsisToggle } from './ellipsis-toggle';
import { VisualizationControls } from './layout';
import { NumSamplesSlider } from './num-samples-slider';
import { AlphaBetaScheduleSelection } from './schedule-selection';
import { SpeedControl } from './speed-control';

/** Common params shared by all prob path visualizations */
export interface ProbPathParams {
  schedule: AlphaBetaScheduleName;
  numSamples: number;
}

/** Common actions shared by all prob path visualizations */
export interface ProbPathActions {
  setSchedule: (s: AlphaBetaScheduleName) => void;
  setNumSamples: (n: number) => void;
}

export interface ProbPathVisualizationControlsProps {
  children?: React.ReactNode;
}

export function ProbPathVisualizationControls({
  children
}: ProbPathVisualizationControlsProps = {}): React.ReactElement {
  const engine = useEngine<ProbPathParams, ProbPathActions>();
  const { state } = engine.frame;

  const [schedule, setSchedule] = useState<AlphaBetaScheduleName>(state.schedule);
  const [numSamples, setNumSamples] = useState(state.numSamples);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);

  React.useEffect(() => {
    if (state.schedule !== schedule) { setSchedule(state.schedule); }
    if (state.numSamples !== numSamples) { setNumSamples(state.numSamples); }
  }, [state.schedule, schedule, state.numSamples, numSamples]);

  return (
    <VisualizationControls>
      <AlphaBetaScheduleSelection
        value={schedule}
        onChange={(s) => {
          setSchedule(s);
          engine.actions.setSchedule(s);
        }}
      />
      {showAdditionalControls ? (
        <>
          <NumSamplesSlider
            value={numSamples}
            onChange={(n) => {
              setNumSamples(n);
              engine.actions.setNumSamples(n);
            }}
          />
          <SpeedControl />
          {children}
        </>
      ) : null}
      <EllipsisToggle
        expanded={showAdditionalControls}
        onToggle={() => { setShowAdditionalControls((current) => !current); }}
      />
    </VisualizationControls>
  );
}
