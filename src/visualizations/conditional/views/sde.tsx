// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useEffect, useRef, useState } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { type Point2D } from '../../../types';
import { clearWebGl } from '../../../webgl';
import { EllipsisToggle } from '../../components/ellipsis-toggle';
import { ViewContainer, ViewControls } from '../../components/layout';
import { MaxSigmaSlider } from '../../components/max-sigma-slider';
import { NumStepsSlider } from '../../components/num-steps-slider';
import { PointerCanvas, type PointerCanvasHandle } from '../../components/pointer-canvas';
import { SigmaScheduleSelection } from '../../components/schedule-selection';
import {
  ResampleDiffusionNoiseButton,
  ResampleSdeButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox
} from '../../components/standard-controls';
import { COLORS } from '../../constants';
import { useEngine } from '../../engine';
import { useEngineConfigSync } from '../../hooks/use-engine-config';
import { type CondSdeRenderer, createCondSdeRenderer } from '../../webgl/conditional/sde';
import { type CondPathActions, type CondPathState } from '../index';

export function CondSdeView(): React.ReactElement {
  const engine = useEngine<CondPathState, CondPathActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);

  const rendererRef = useRef<CondSdeRenderer | null>(null);

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

  // Use refs for mutable state accessed in render loop
  const paramsRef = useRef({
    resampleRequested: false,
    resampleNoiseRequested: false
  });

  // Register draw function
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      rendererRef.current ??= createCondSdeRenderer(webGl.gl);
      const renderer = rendererRef.current;
      const params = paramsRef.current;
      const { sdeConfig: frameSdeConfig } = frame.state;

      renderer.setShowSdeTrajectories(frameSdeConfig.showTrajectories);
      renderer.setShowSamples(frameSdeConfig.showSamples);
      renderer.setSigmaSchedule(frameSdeConfig.sigmaSchedule);
      renderer.setSdeNumSteps(frameSdeConfig.sdeNumSteps);
      renderer.setMaxSigma(frameSdeConfig.maxSigma);

      syncSdeConfig(frameSdeConfig);

      if (params.resampleRequested) {
        renderer.resample();
        params.resampleRequested = false;
      }
      if (params.resampleNoiseRequested) {
        renderer.resampleNoise();
        params.resampleNoiseRequested = false;
      }

      renderer.update(frame);
      clearWebGl(webGl, COLORS.background);
      renderer.render(webGl);
    });
  }, [engine]);

  const handleResample = (): void => {
    paramsRef.current.resampleRequested = true;
    engine.renderOnce();
  };

  const handleResampleNoise = (): void => {
    paramsRef.current.resampleNoiseRequested = true;
    engine.renderOnce();
  };

  return (
    <ViewContainer>
      <PointerCanvas
        ref={pointerCanvasRef}
        onPositionChange={(pos: Point2D) => { engine.actions.setZ(pos); }}
        xDomain={X_DOMAIN}
        yDomain={Y_DOMAIN}
      />

      <ViewControls>
        <ShowTrajectoriesCheckbox
          checked={sdeConfig.showTrajectories}
          onChange={(v) => { updateSdeConfig({ showTrajectories: v }); }}
        />
        <ShowSamplesCheckbox
          checked={sdeConfig.showSamples}
          onChange={(v) => { updateSdeConfig({ showSamples: v }); }}
        />
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
      </ViewControls>
    </ViewContainer>
  );
}
