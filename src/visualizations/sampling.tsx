// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { X_DOMAIN, Y_DOMAIN } from '../constants';
import {
  generateData,
  generateDataFromPoints,
  type GenerativeModel,
  interpolateFrames,
  predictVelocityBatch
} from '../flow-matching/inference';
import type { Points2D, Trajectories } from '../types';
import { clearWebGl, type WebGl } from '../webgl';
import { createLineRenderer, type LineRenderer } from '../webgl/renderers/line';
import { createPointRenderer, type PointRenderer } from '../webgl/renderers/point';
import { Button } from './components/button';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import {
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox,
  ShowVectorFieldCheckbox
} from './components/standard-controls';
import { TimelineControls } from './components/timeline-controls';
import { WebGlCanvas } from './components/webgl-canvas';
import { COLORS, POINT_SIZE } from './constants';
import { type Model, useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';
import { drawVectorField } from './webgl/vector-field';

const NUM_SAMPLES = 500;
const NUM_GEN_STEPS = 100;

export type ModelLoader<M extends GenerativeModel> = (
  onProgress?: (fraction: number) => void
) => Promise<M | null>;

export interface SamplingController<M extends GenerativeModel> {
  setModel: (model: M | null) => void;
}

export interface SamplingControllerRef<M extends GenerativeModel> {
  current: SamplingController<M> | null;
}

interface SamplingViewConfig {
  showSamples: boolean;
  showTrajectories: boolean;
  showVectorField: boolean;
}

interface SamplingState<M extends GenerativeModel> {
  trainedModel: M | null;
  frames: Points2D[];
  trajectories: Trajectories;
  currentPoints: Points2D;
  config: SamplingViewConfig;
  loading: boolean;
  downloadProgress: number | null;
  statusText: string;
  dataVersion: number;
}

interface SamplingActions<M extends GenerativeModel> {
  resample: () => Promise<void>;
  setConfig: (config: Partial<SamplingViewConfig>) => void;
  ensureModelLoadedAndPlay: () => Promise<void>;
  setExternalModel: (model: M | null) => Promise<void>;
}

function createSamplingModel<M extends GenerativeModel>(
  trainedModel: M | null,
  loadModel?: ModelLoader<M>
): Model<SamplingState<M>, SamplingActions<M>> {
  let resampleRequest = 0;

  function makePointsFromNoise(): Points2D {
    const noise = tf.randomNormal([NUM_SAMPLES, 2]);
    const data = noise.dataSync();
    const points: Points2D = {
      xs: new Float32Array(NUM_SAMPLES),
      ys: new Float32Array(NUM_SAMPLES),
      version: 0
    };

    for (let i = 0; i < NUM_SAMPLES; i++) {
      points.xs[i] = data[i * 2];
      points.ys[i] = data[i * 2 + 1];
    }

    noise.dispose();
    return points;
  }

  function clonePoints(points: Points2D): Points2D {
    return {
      xs: new Float32Array(points.xs),
      ys: new Float32Array(points.ys),
      version: points.version
    };
  }

  function makeEmptyTrajectories(): Trajectories {
    return {
      xs: new Float32Array(0),
      ys: new Float32Array(0),
      pointsPerTrajectory: 0,
      count: 0,
      version: 0
    };
  }

  async function regenerateFromCurrentPoints(
    state: SamplingState<M>,
    model: M,
    currentRequestId: number
  ): Promise<{ applied: boolean }> {
    const sourcePoints = clonePoints(state.currentPoints);
    const data = await generateDataFromPoints(
      model,
      sourcePoints,
      NUM_GEN_STEPS
    );
    if (currentRequestId !== resampleRequest) {
      return { applied: false };
    }
    state.frames = data.frames;
    state.trajectories = data.trajectories;
    interpolateFrames(state.frames, 0, state.currentPoints);
    return { applied: true };
  }

  return {
    initState(): SamplingState<M> {
      const previewPoints = makePointsFromNoise();
      const hasModel = trainedModel !== null;
      return {
        trainedModel,
        frames: [previewPoints],
        trajectories: makeEmptyTrajectories(),
        currentPoints: clonePoints(previewPoints),
        config: {
          showSamples: true,
          showTrajectories: true,
          showVectorField: false
        },
        loading: hasModel,
        downloadProgress: null,
        statusText: hasModel ? 'Calculating trajectories...' : 'Press play to load the model.',
        dataVersion: 0
      };
    },
    tick({ frame }): void {
      if (frame.state.frames.length === 0) { return; }
      interpolateFrames(
        frame.state.frames, frame.clock.t, frame.state.currentPoints
      );
    },
    actions: (engine): SamplingActions<M> => ({
      async resample(): Promise<void> {
        const { state } = engine.frame;
        if (state.trainedModel === null) {
          const previewPoints = makePointsFromNoise();
          state.frames = [previewPoints];
          state.trajectories = makeEmptyTrajectories();
          state.currentPoints = clonePoints(previewPoints);
          state.statusText = 'Press play to load the model.';
          state.dataVersion += 1;
          engine.renderOnce();
          return;
        }

        state.loading = true;
        state.statusText = 'Generating samples and trajectories...';
        engine.renderOnce();
        const requestId = resampleRequest + 1;
        resampleRequest = requestId;
        const data = await generateData(
          state.trainedModel,
          NUM_SAMPLES,
          NUM_GEN_STEPS
        );
        if (requestId !== resampleRequest) { return; }
        state.frames = data.frames;
        state.trajectories = data.trajectories;
        state.loading = false;
        state.statusText = '';
        state.dataVersion += 1;
        interpolateFrames(
          state.frames, engine.frame.clock.t, state.currentPoints
        );
        engine.renderOnce();
      },
      async ensureModelLoadedAndPlay(): Promise<void> {
        const { state } = engine.frame;
        if (state.trainedModel !== null) {
          engine.play();
          return;
        }

        if (state.loading || loadModel === undefined) {
          return;
        }

        state.loading = true;
        state.downloadProgress = 0;
        state.statusText = 'Downloading pre-trained model...';
        engine.renderOnce();

        const loadedModel = await loadModel((fraction) => {
          state.downloadProgress = fraction;
          state.statusText =
            `Downloading pre-trained model... ${String(Math.round(fraction * 100))}%`;
          engine.renderOnce();
        });

        if (loadedModel === null) {
          state.loading = false;
          state.downloadProgress = null;
          state.statusText = 'Could not load the pre-trained model.';
          engine.renderOnce();
          return;
        }

        state.trainedModel = loadedModel;
        state.statusText = 'Calculating trajectories...';
        const requestId = resampleRequest + 1;
        resampleRequest = requestId;
        const result = await regenerateFromCurrentPoints(
          state,
          loadedModel,
          requestId
        );
        if (!result.applied) { return; }
        state.loading = false;
        state.downloadProgress = null;
        state.statusText = '';
        state.dataVersion += 1;
        engine.renderOnce();
        engine.play();
      },
      async setExternalModel(model: M | null): Promise<void> {
        const { state } = engine.frame;
        const requestId = resampleRequest + 1;
        resampleRequest = requestId;
        engine.pause();
        engine.setTime(0);

        if (model === null) {
          const previewPoints = makePointsFromNoise();
          state.trainedModel = null;
          state.frames = [previewPoints];
          state.trajectories = makeEmptyTrajectories();
          state.currentPoints = clonePoints(previewPoints);
          state.loading = false;
          state.downloadProgress = null;
          state.statusText = 'Press play to load the model.';
          state.dataVersion += 1;
          engine.renderOnce();
          return;
        }

        state.trainedModel = model;
        state.loading = true;
        state.downloadProgress = null;
        state.statusText = 'Calculating trajectories...';
        engine.renderOnce();
        const result = await regenerateFromCurrentPoints(
          state,
          model,
          requestId
        );
        if (!result.applied) { return; }
        state.loading = false;
        state.statusText = '';
        state.dataVersion += 1;
        engine.renderOnce();
      },
      setConfig(config): void {
        Object.assign(engine.frame.state.config, config);
        engine.renderOnce();
      }
    })
  };
}

function SamplingView(
  { showVectorFieldControl }: { showVectorFieldControl: boolean }
): React.ReactElement {
  const engine = useEngine<SamplingState<GenerativeModel>, SamplingActions<GenerativeModel>>();
  const webGlRef = useRef<WebGl | null>(null);
  const pointRendererRef = useRef<PointRenderer | null>(null);
  const lineRendererRef = useRef<LineRenderer | null>(null);
  const generationRequestRef = useRef(0);
  const vectorFieldRequestRef = useRef(0);
  const vectorFieldKeyRef = useRef('');
  const vectorFieldPendingRef = useRef(false);
  const vectorFieldCacheRef = useRef<Points2D | null>(null);

  const vectorFieldReset = (): void => {
    vectorFieldRequestRef.current++;
    vectorFieldKeyRef.current = '';
    vectorFieldPendingRef.current = false;
    vectorFieldCacheRef.current = null;
  };

  const [config, setConfig] = useState(engine.frame.state.config);
  const [loading, setLoading] = useState(engine.frame.state.loading);
  const [downloadProgress, setDownloadProgress] = useState(
    engine.frame.state.downloadProgress
  );
  const [statusText, setStatusText] = useState(engine.frame.state.statusText);
  const [dataVersion, setDataVersion] = useState(engine.frame.state.dataVersion);

  useEffect((): (() => void) => {
    let cancelled = false;

    async function loadInitialData(): Promise<void> {
      const { state } = engine.frame;
      if (state.trainedModel === null) {
        engine.pause();
        engine.renderOnce();
        return;
      }
      state.loading = true;
      engine.renderOnce();
      const requestId = generationRequestRef.current + 1;
      generationRequestRef.current = requestId;
      const data = await generateData(
        state.trainedModel,
        NUM_SAMPLES,
        NUM_GEN_STEPS
      );
      if (cancelled || requestId !== generationRequestRef.current) { return; }
      state.frames = data.frames;
      state.trajectories = data.trajectories;
      state.loading = false;
      interpolateFrames(state.frames, engine.frame.clock.t, state.currentPoints);
      engine.renderOnce();
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [engine]);

  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      const gl = webGl.gl;
      pointRendererRef.current ??= createPointRenderer(gl);
      lineRendererRef.current ??= createLineRenderer(gl);

      const { config: cfg, currentPoints, trajectories } = frame.state;
      const t = frame.clock.t;
      setLoading(frame.state.loading);
      setDownloadProgress(frame.state.downloadProgress);
      setStatusText(frame.state.statusText);
      setDataVersion(frame.state.dataVersion);

      clearWebGl(webGl, COLORS.background);

      if (cfg.showVectorField && frame.state.trainedModel !== null) {
        const trainedModel = frame.state.trainedModel;
        drawVectorField(
          lineRendererRef.current,
          webGl.dataToClipMatrix,
          (pts, time) => {
            const key = `${time.toFixed(3)}:${String(pts.xs.length)}`;
            if (
              vectorFieldKeyRef.current !== key &&
              !vectorFieldPendingRef.current
            ) {
              vectorFieldKeyRef.current = key;
              vectorFieldPendingRef.current = true;
              const requestId = vectorFieldRequestRef.current + 1;
              vectorFieldRequestRef.current = requestId;
              void predictVelocityBatch(trainedModel, pts, time).then((result) => {
                if (requestId !== vectorFieldRequestRef.current) { return; }
                vectorFieldCacheRef.current = result;
                vectorFieldPendingRef.current = false;
                engine.renderOnce();
              }).catch(() => {
                if (requestId !== vectorFieldRequestRef.current) { return; }
                vectorFieldPendingRef.current = false;
              });
            }

            if (
              vectorFieldCacheRef.current?.xs.length !== pts.xs.length
            ) {
              vectorFieldCacheRef.current = {
                xs: new Float32Array(pts.xs.length),
                ys: new Float32Array(pts.ys.length),
                version: 0
              };
            }

            return vectorFieldCacheRef.current;
          },
          X_DOMAIN,
          Y_DOMAIN,
          t
        );
      }

      if (cfg.showTrajectories && trajectories.count > 0) {
        lineRendererRef.current.renderTrajectories(
          webGl.dataToClipMatrix,
          trajectories,
          COLORS.trajectory
        );
      }

      if (cfg.showSamples && frame.state.frames.length > 0) {
        pointRendererRef.current.render(
          webGl.dataToClipMatrix,
          currentPoints,
          COLORS.point,
          POINT_SIZE
        );
      }
    });
  }, [engine]);

  useEffect(() => {
    vectorFieldReset();
  }, [dataVersion]);

  const updateConfig = (partial: Partial<SamplingViewConfig>): void => {
    setConfig((prev) => ({ ...prev, ...partial }));
    engine.actions.setConfig(partial);
  };

  const resample = (): void => {
    vectorFieldReset();
    void engine.actions.resample();
  };

  const togglePlay = (): void => {
    if (engine.frame.state.trainedModel === null) {
      void engine.actions.ensureModelLoadedAndPlay();
      return;
    }
    engine.togglePlay();
  };

  return (
    <>
      <ViewContainer>
        <div style={{ position: 'relative' }}>
          <WebGlCanvas
            webGlRef={webGlRef}
            xDomain={X_DOMAIN}
            yDomain={Y_DOMAIN}
          />
          {loading ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                color: '#ddd',
                background: 'rgb(0 0 0 / 45%)',
                borderRadius: '8px'
              }}
            >
              <div style={{ fontSize: '12px' }}>
                {statusText}
              </div>
              {downloadProgress !== null ? (
                <progress
                  max={1}
                  value={downloadProgress}
                  style={{ width: '180px', height: '14px' }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <ViewControls>
          <ViewControlsGroup>
            <ShowSamplesCheckbox
              checked={config.showSamples}
              onChange={(v) => { updateConfig({ showSamples: v }); }}
            />
            <ShowTrajectoriesCheckbox
              checked={config.showTrajectories}
              onChange={(v) => { updateConfig({ showTrajectories: v }); }}
            />
            {showVectorFieldControl ? (
              <ShowVectorFieldCheckbox
                checked={config.showVectorField}
                onChange={(v) => { updateConfig({ showVectorField: v }); }}
              />
            ) : null}
            <Button onClick={resample}>
              Resample
            </Button>
            {statusText !== '' && !loading ? (
              <span style={{ color: '#888', fontSize: '12px' }}>
                {statusText}
              </span>
            ) : null}
          </ViewControlsGroup>
        </ViewControls>
      </ViewContainer>
      <TimelineControls onTogglePlay={togglePlay} />
    </>
  );
}

function SamplingVisualization<M extends GenerativeModel>(
  {
    name,
    controllerRef,
    model,
    loadModel,
    showVectorFieldControl
  }: {
    name: string;
    controllerRef?: SamplingControllerRef<M>;
    model?: M;
    loadModel?: ModelLoader<M>;
    showVectorFieldControl: boolean;
  }
): React.ReactElement {
  const genModel = useMemo(
    () => createSamplingModel<M>(model ?? null, loadModel), [loadModel, model]
  );

  return (
    <VisualizationProvider
      model={genModel}
      name={name}
    >
      <SamplingViewController<M> controllerRef={controllerRef} />
      <SamplingView showVectorFieldControl={showVectorFieldControl} />
    </VisualizationProvider>
  );
}

function SamplingViewController<M extends GenerativeModel>(
  { controllerRef }: { controllerRef?: SamplingControllerRef<M> }
): null {
  const engine = useEngine<SamplingState<M>, SamplingActions<M>>();

  useEffect(() => {
    if (controllerRef === undefined) { return; }
    controllerRef.current = {
      setModel(model): void {
        void engine.actions.setExternalModel(model);
      }
    };
    return (): void => {
      controllerRef.current = null;
    };
  }, [controllerRef, engine]);

  return null;
}

export function initSamplingVisualization<M extends GenerativeModel>(
  container: HTMLElement,
  name: string,
  options: {
    controllerRef?: SamplingControllerRef<M>;
    model?: M;
    loadModel?: ModelLoader<M>;
    showVectorFieldControl?: boolean;
  }
): () => void {
  return mountVisualization(
    container,
    <SamplingVisualization<M>
      controllerRef={options.controllerRef}
      loadModel={options.loadModel}
      model={options.model}
      name={name}
      showVectorFieldControl={options.showVectorFieldControl ?? true}
    />,
    { name }
  );
}
