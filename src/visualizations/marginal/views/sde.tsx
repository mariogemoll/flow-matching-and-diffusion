// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useEffect, useRef, useState } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { clearWebGl, type WebGl } from '../../../webgl';
import { EllipsisToggle } from '../../components/ellipsis-toggle';
import { ViewContainer, ViewControls } from '../../components/layout';
import { MaxSigmaSlider } from '../../components/max-sigma-slider';
import { NumStepsSlider } from '../../components/num-steps-slider';
import { SigmaScheduleSelection } from '../../components/schedule-selection';
import {
  ResampleDiffusionNoiseButton,
  ResampleSdeButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox
} from '../../components/standard-controls';
import { WebGlCanvas } from '../../components/webgl-canvas';
import { COLORS } from '../../constants';
import { useEngine } from '../../engine';
import { createMargSdeRenderer, type MargSdeRenderer } from '../../webgl/marginal/sde';
import type { MargPathActions, MargPathState } from '../index';

export interface MargSdeViewProps {
  compact?: boolean;
}

export function MargSdeView({ compact = true }: MargSdeViewProps): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();

  const webGlRef = useRef<WebGl | null>(null);
  const rendererRef = useRef<MargSdeRenderer | null>(null);

  // Local UI state (controls visibility only)
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);

  // Read config from global state
  const {
    showTrajectories,
    showSamples,
    sigmaSchedule,
    sdeNumSteps,
    maxSigma
  } = engine.frame.state.sdeConfig;

  // Register render loop
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      const { sdeConfig } = frame.state;
      rendererRef.current ??= createMargSdeRenderer(webGl.gl);
      const renderer = rendererRef.current;

      renderer.setShowSdeTrajectories(sdeConfig.showTrajectories);
      renderer.setShowSamples(sdeConfig.showSamples);
      renderer.setSigmaSchedule(sdeConfig.sigmaSchedule);
      renderer.setSdeNumSteps(sdeConfig.sdeNumSteps);
      renderer.setMaxSigma(sdeConfig.maxSigma);

      renderer.update(frame);
      clearWebGl(webGl, COLORS.background);
      renderer.render(webGl);
    });
  }, [engine]);

  const handleResample = (): void => {
    if (rendererRef.current) {
      rendererRef.current.resample();
      engine.renderOnce();
    }
  };

  const handleResampleNoise = (): void => {
    if (rendererRef.current) {
      rendererRef.current.resampleNoise();
      engine.renderOnce();
    }
  };

  const checkboxControls = (
    <>
      <ShowTrajectoriesCheckbox
        checked={showTrajectories}
        onChange={(v) => { engine.actions.setSdeConfig({ showTrajectories: v }); }}
      />
      <ShowSamplesCheckbox
        checked={showSamples}
        onChange={(v) => { engine.actions.setSdeConfig({ showSamples: v }); }}
      />
    </>
  );

  const restControls = (
    <>
      <ResampleSdeButton onClick={handleResample} />
      <SigmaScheduleSelection
        value={sigmaSchedule}
        onChange={(v) => { engine.actions.setSdeConfig({ sigmaSchedule: v }); }}
      />
      {showAdditionalControls ? (
        <>
          <NumStepsSlider
            value={sdeNumSteps}
            onChange={(v) => { engine.actions.setSdeConfig({ sdeNumSteps: v }); }}
          />
          <MaxSigmaSlider
            value={maxSigma}
            onChange={(v) => { engine.actions.setSdeConfig({ maxSigma: v }); }}
            schedule={sigmaSchedule}
          />
          <ResampleDiffusionNoiseButton onClick={handleResampleNoise} />
        </>
      ) : null}
      <EllipsisToggle
        expanded={showAdditionalControls}
        onToggle={() => { setShowAdditionalControls((current) => !current); }}
      />
    </>
  );

  return (
    <ViewContainer>
      <WebGlCanvas webGlRef={webGlRef} xDomain={X_DOMAIN} yDomain={Y_DOMAIN} />

      <ViewControls>
        {compact ? (
          <div className="view-controls-group">
            {checkboxControls}
            {restControls}
          </div>
        ) : (
          <>
            <div className="view-controls-group">{checkboxControls}</div>
            <div className="view-controls-group">{restControls}</div>
          </>
        )}
      </ViewControls>
    </ViewContainer>
  );
}
