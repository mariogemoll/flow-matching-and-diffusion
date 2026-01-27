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
import { useEngineConfigSync } from '../../hooks/use-engine-config';
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

  const {
    config: sdeConfig,
    updateConfig: updateSdeConfig,
    syncFromFrame: syncSdeConfig
  } = useEngineConfigSync(
    engine.frame.state.sdeConfig,
    (config) => { engine.actions.setSdeConfig(config); }
  );

  // Register render loop
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      const { sdeConfig: frameSdeConfig } = frame.state;
      rendererRef.current ??= createMargSdeRenderer(webGl.gl);
      const renderer = rendererRef.current;

      renderer.setShowSdeTrajectories(frameSdeConfig.showTrajectories);
      renderer.setShowSamples(frameSdeConfig.showSamples);
      renderer.setSigmaSchedule(frameSdeConfig.sigmaSchedule);
      renderer.setSdeNumSteps(frameSdeConfig.sdeNumSteps);
      renderer.setMaxSigma(frameSdeConfig.maxSigma);

      syncSdeConfig(frameSdeConfig);

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
        checked={sdeConfig.showTrajectories}
        onChange={(v) => { updateSdeConfig({ showTrajectories: v }); }}
      />
      <ShowSamplesCheckbox
        checked={sdeConfig.showSamples}
        onChange={(v) => { updateSdeConfig({ showSamples: v }); }}
      />
    </>
  );

  const restControls = (
    <>
      <ResampleSdeButton onClick={handleResample} />
      <SigmaScheduleSelection
        value={sdeConfig.sigmaSchedule}
        onChange={(v) => { updateSdeConfig({ sigmaSchedule: v }); }}
      />
      {showAdditionalControls ? (
        <>
          <NumStepsSlider
            value={sdeConfig.sdeNumSteps}
            onChange={(v) => { updateSdeConfig({ sdeNumSteps: v }); }}
          />
          <MaxSigmaSlider
            value={sdeConfig.maxSigma}
            onChange={(v) => { updateSdeConfig({ maxSigma: v }); }}
            schedule={sdeConfig.sigmaSchedule}
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
