import React, { useEffect, useRef, useState } from 'react';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../../constants';
import { makeGmm } from '../../../math/gmm';
import { type AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import { sampleFromGmmMargProbPath, writeGmm } from '../../../math/std-gaussian-to-gmm';
import { type GaussianComponent, type GaussianMixture, type Points2D } from '../../../types';
import { makePoints2D } from '../../../util/points';
import { clearWebGl, type WebGl } from '../../../webgl';
import {
  createGaussianMixturePdfRenderer,
  type GaussianMixturePdfRenderer
} from '../../../webgl/renderers/gaussian-mixture-pdf';
import { createPointRenderer, type PointRenderer } from '../../../webgl/renderers/point';
import { Button } from '../../components/button';
import { EllipsisToggle } from '../../components/ellipsis-toggle';
import { GaussianMixtureEditor } from '../../components/gaussian-mixture-editor';
import { ViewContainer, ViewControls } from '../../components/layout';
import {
  ResampleButton,
  SampleFrequencySlider,
  ShowPdfCheckbox,
  ShowSamplesCheckbox
} from '../../components/standard-controls';
import { WebGlCanvas } from '../../components/webgl-canvas';
import { COLORS, MAX_NUM_SAMPLES, POINT_SIZE, X_DOMAIN, Y_DOMAIN } from '../../constants';
import { useEngine } from '../../engine';
import { type MargPathActions, type MargPathState } from '../index';

export function MargPathView({ compact = true }: { compact?: boolean }): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();
  const webGlRef = useRef<WebGl | null>(null);
  const pdfRendererRef = useRef<GaussianMixturePdfRenderer | null>(null);
  const sampleRendererRef = useRef<PointRenderer | null>(null);
  const mixtureRef = useRef<GaussianMixture>(makeGmm(0));
  const baseMixtureRef = useRef<GaussianMixture>({
    components: engine.frame.state.components,
    version: 0
  });

  const [editMode, setEditMode] = useState(engine.frame.state.editMode);
  const [showPdf, setShowPdf] = useState(true);
  const [showSamples, setShowSamples] = useState(true);
  const [sampleFrequency, setSampleFrequency] = useState(15);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);
  // Local state for components to sync with engine updates for the editor
  const [components, setComponents] = useState<GaussianComponent[]>(engine.frame.state.components);

  const lastUpdateRef = useRef<{
    t: number;
    schedule: AlphaBetaScheduleName;
    components: MargPathState['components'] | null;
    editMode: boolean;
    timestamp: number;
  }>({
    t: NaN,
    schedule: 'linear',
    components: null,
    editMode: false,
    timestamp: 0
  });

  const paramsRef = useRef({
    showPdf,
    showSamples,
    sampleFrequency,
    resampleRequested: true
  });

  const samplePointsRef = useRef<Points2D>(makePoints2D(MAX_NUM_SAMPLES));
  const lastSampleRef = useRef<{
    t: number;
    schedule: AlphaBetaScheduleName;
    numSamples: number;
    components: MargPathState['components'];
    timestamp: number;
  }>({
    t: engine.frame.clock.t,
    schedule: engine.frame.state.schedule,
    numSamples: engine.frame.state.numSamples,
    components: engine.frame.state.components,
    timestamp: 0
  });

  useEffect(() => {
    paramsRef.current.showPdf = showPdf;
    paramsRef.current.showSamples = showSamples;
    paramsRef.current.sampleFrequency = sampleFrequency;
    if (showSamples) {
      paramsRef.current.resampleRequested = true;
    }
    engine.renderOnce();
  }, [showPdf, showSamples, sampleFrequency, engine]);

  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      if (pdfRendererRef.current?.gl !== webGl.gl) {
        pdfRendererRef.current = createGaussianMixturePdfRenderer(webGl.gl);
      }
      if (sampleRendererRef.current?.gl !== webGl.gl) {
        sampleRendererRef.current = createPointRenderer(webGl.gl);
      }

      const t = frame.clock.t;
      const schedule: AlphaBetaScheduleName = frame.state.schedule;
      const currentComponents = frame.state.components;
      const lastUpdate = lastUpdateRef.current;
      const now = performance.now();
      const params = paramsRef.current;

      // Sync Edit Mode
      if (frame.state.editMode !== lastUpdate.editMode) {
        lastUpdate.editMode = frame.state.editMode;
        setEditMode(frame.state.editMode);
      }

      // Auto-exit edit mode if user starts playing or scrubbing
      if (frame.state.editMode) {
        if (frame.clock.playing || frame.clock.scrubbing || t !== 1) {
          frame.state.editMode = false;
          frame.state.wasPlayingBeforeEdit = false;
          // Force update next frame to reflect exit
          lastUpdate.editMode = false;
          setEditMode(false);
        }
      }

      // Sync Components to React state for Editor
      // Throttle to avoid excessive re-renders during high-freq updates
      if (currentComponents !== lastUpdate.components) {
        const syncThreshold = 50; // ms
        if (!frame.clock.playing || (now - lastUpdate.timestamp > syncThreshold)) {
          setComponents(currentComponents);
          lastUpdate.timestamp = now;
        }
      }

      // Render Logic for PDF
      if (
        lastUpdate.t !== t ||
        lastUpdate.schedule !== schedule ||
        lastUpdate.components !== currentComponents
      ) {
        baseMixtureRef.current.components = currentComponents;
        if (mixtureRef.current.components.length !== currentComponents.length) {
          mixtureRef.current = makeGmm(currentComponents.length);
        }
        writeGmm(
          baseMixtureRef.current,
          schedule,
          t,
          mixtureRef.current
        );
        lastUpdate.t = t;
        lastUpdate.schedule = schedule;
        lastUpdate.components = currentComponents;
      }

      clearWebGl(webGl, COLORS.background);
      if (params.showPdf) {
        pdfRendererRef.current.render(
          webGl.dataToClipMatrix,
          mixtureRef.current,
          COLORS.pdf
        );
      }

      if (params.showSamples) {
        const lastSample = lastSampleRef.current;
        const numSamples = frame.state.numSamples;
        const tChanged = t !== lastSample.t;
        const scheduleChanged = schedule !== lastSample.schedule;
        const numSamplesChanged = numSamples !== lastSample.numSamples;
        const componentsChanged = currentComponents !== lastSample.components;
        const numSamplesChangedWhilePaused = numSamplesChanged && !tChanged;

        let shouldResample = params.resampleRequested ||
          scheduleChanged ||
          componentsChanged;

        if (!shouldResample && tChanged) {
          const dt = now - lastSample.timestamp;
          const threshold = params.sampleFrequency >= 120
            ? 0
            : (1000 / Math.max(1, params.sampleFrequency));
          if (dt >= threshold) {
            shouldResample = true;
          }
        }

        if (!shouldResample && numSamplesChangedWhilePaused && numSamples > lastSample.numSamples) {
          shouldResample = true;
        }

        if (shouldResample) {
          if (
            numSamplesChangedWhilePaused &&
            numSamples > lastSample.numSamples &&
            !params.resampleRequested &&
            !scheduleChanged &&
            !componentsChanged
          ) {
            const additionalCount = numSamples - lastSample.numSamples;
            sampleFromGmmMargProbPath(
              currentComponents,
              additionalCount,
              t,
              schedule,
              samplePointsRef.current,
              lastSample.numSamples,
              additionalCount
            );
          } else {
            sampleFromGmmMargProbPath(
              currentComponents,
              numSamples,
              t,
              schedule,
              samplePointsRef.current
            );
          }
          params.resampleRequested = false;
          lastSampleRef.current = {
            t,
            schedule,
            numSamples,
            components: currentComponents,
            timestamp: now
          };
        } else if (numSamplesChangedWhilePaused && numSamples < lastSample.numSamples) {
          lastSampleRef.current = {
            ...lastSample,
            numSamples
          };
        }

        sampleRendererRef.current.render(
          webGl.dataToClipMatrix,
          samplePointsRef.current,
          COLORS.point,
          POINT_SIZE,
          numSamples
        );
      }
    });
  }, [engine]);

  const handleEditToggle = (): void => {
    if (editMode) {
      engine.actions.exitEditMode();
    } else {
      engine.actions.enterEditMode();
    }
  };

  const handleResample = (): void => {
    paramsRef.current.resampleRequested = true;
    engine.renderOnce();
  };

  const checkboxControls = (
    <>
      <ShowPdfCheckbox checked={showPdf} onChange={setShowPdf} />
      <ShowSamplesCheckbox checked={showSamples} onChange={setShowSamples} />
    </>
  );

  const restControls = (
    <>
      <ResampleButton onClick={handleResample} />
      <Button onClick={handleEditToggle}>
        {editMode ? 'OK' : 'Edit'}
      </Button>
      {showAdditionalControls ? (
        <SampleFrequencySlider
          value={sampleFrequency}
          onChange={setSampleFrequency}
        />
      ) : null}
      <EllipsisToggle
        expanded={showAdditionalControls}
        onToggle={() => { setShowAdditionalControls((current) => !current); }}
      />
    </>
  );

  return (
    <ViewContainer>
      <WebGlCanvas
        webGlRef={webGlRef}
        xDomain={X_DOMAIN}
        yDomain={Y_DOMAIN}
      />
      <GaussianMixtureEditor
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        components={components}
        onChange={engine.actions.setComponents}
        hidden={!editMode}
      />
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
