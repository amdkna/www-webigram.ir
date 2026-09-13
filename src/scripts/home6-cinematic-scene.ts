import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HomeScene } from './home6-scene';

type HomeSceneInternals = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  frame: number;
  render: (now: number) => void;
  requestFrame: () => void;
  nightMix: number;
  destroyed: boolean;
};

/**
 * A photography-oriented wrapper around HomeScene.
 *
 * HomeScene remains responsible for object construction and interaction. This
 * class only changes how the final physical scene is lit and photographed:
 * - large-area window light for realistic highlights
 * - GTAO for small-scale contact depth
 * - restrained depth of field
 * - longer-lens camera framing
 * - graceful fallback to the original renderer on slower devices
 */
export class CinematicHomeScene extends HomeScene {
  private canvasEl!: HTMLCanvasElement;
  private composer?: EffectComposer;
  private gtao?: GTAOPass;
  private bokeh?: BokehPass;
  private output?: OutputPass;
  private windowLight?: THREE.RectAreaLight;
  private originalRender?: (now: number) => void;
  private originalRendererRender?: THREE.WebGLRenderer['render'];
  private originalResize?: () => void;
  private cinematicDisposed = false;
  private postEnabled = false;
  private renderSamples = 0;
  private slowSamples = 0;
  private lastRenderTime = 0;
  private composerPixelRatio = 0;
  private readonly sceneTarget = new THREE.Vector3(0, -.03, 0);
  private readonly focusTarget = new THREE.Vector3(0, -.08, -.05);
  private readonly photographicFov = 32.5;
  private readonly photographicDistanceScale = Math.tan(THREE.MathUtils.degToRad(38 / 2)) / Math.tan(THREE.MathUtils.degToRad(32.5 / 2));

  constructor(canvas: HTMLCanvasElement, paused: boolean, onFailure: () => void) {
    super(canvas, paused, onFailure);
    this.canvasEl = canvas;

    const internal = this as unknown as HomeSceneInternals;
    this.addPhotographicLighting(internal);
    this.installPipeline(internal);
  }

  private addPhotographicLighting(internal: HomeSceneInternals) {
    // A large nearby emitter behaves much more like daylight entering through
    // a real window than another directional light. RectAreaLight does not cast
    // shadows, so it complements (rather than doubles) the existing sun shadow.
    this.windowLight = new THREE.RectAreaLight(0xfff1df, 7.2, 4.8, 5.8);
    this.windowLight.position.set(-4.8, 3.0, 3.4);
    this.windowLight.lookAt(.15, -1.15, .05);
    internal.scene.add(this.windowLight);

    // A dim, cool bounce from the opposite side keeps metal readable without
    // flattening the scene with hemisphere light.
    const bounce = new THREE.RectAreaLight(0xdce5ff, 1.15, 2.8, 3.6);
    bounce.position.set(4.8, 1.2, 1.4);
    bounce.lookAt(.2, -1.15, 0);
    internal.scene.add(bounce);
  }

  private installPipeline(internal: HomeSceneInternals) {
    const { renderer, scene, camera } = internal;
    this.postEnabled = window.innerWidth > 820 && renderer.capabilities.isWebGL2;

    camera.fov = this.photographicFov;
    camera.updateProjectionMatrix();

    if (this.postEnabled) {
      this.composer = new EffectComposer(renderer);
      const renderPass = new RenderPass(scene, camera);
      this.gtao = new GTAOPass(scene, camera, 512, 512);
      this.gtao.blendIntensity = .46;
      this.gtao.updateGtaoMaterial({
        radius: .18,
        distanceExponent: 2,
        thickness: .85,
        distanceFallOff: .35,
        scale: 1,
        samples: 8,
        screenSpaceRadius: false,
      });
      this.gtao.updatePdMaterial({
        lumaPhi: 8,
        depthPhi: 2,
        normalPhi: 3,
        radius: 5,
        rings: 2,
        samples: 8,
      });

      // The focus plane sits around the monitor/desk rather than on the wall.
      // Values are intentionally conservative: this should look like a real
      // lens, not a miniature/tilt-shift filter.
      this.bokeh = new BokehPass(scene, camera, {
        focus: 14,
        aperture: .000045,
        maxblur: .0032,
      });
      this.output = new OutputPass();

      this.composer.addPass(renderPass);
      this.composer.addPass(this.gtao);
      this.composer.addPass(this.bokeh);
      this.composer.addPass(this.output);
      this.syncComposerSize(internal);
    }

    this.originalRender = internal.render;
    this.originalRendererRender = renderer.render.bind(renderer) as THREE.WebGLRenderer['render'];
    this.originalResize = this.resize.bind(this);

    // HomeScene scheduled its first frame in super(). Replace that pending frame
    // so every final scene render goes through our photographic layer.
    if (internal.frame) cancelAnimationFrame(internal.frame);
    internal.frame = 0;
    internal.render = this.cinematicRender;

    // Resize remains public API-compatible for home6-experience.ts.
    (this as unknown as { resize: () => void }).resize = () => {
      this.originalResize?.();
      const state = this as unknown as HomeSceneInternals;
      state.camera.fov = this.photographicFov;
      state.camera.updateProjectionMatrix();
      this.syncComposerSize(state);
    };

    internal.requestFrame();
  }

  private syncComposerSize(internal: HomeSceneInternals) {
    if (!this.composer) return;
    const box = this.canvasEl.parentElement?.getBoundingClientRect();
    if (!box || box.width < 1 || box.height < 1) return;

    // GTAO + DOF at full Retina resolution is wasteful. A capped post-process
    // pixel ratio keeps the effect crisp while preserving the scene's own DPR.
    const ratio = Math.min(internal.renderer.getPixelRatio(), 1.25);
    if (Math.abs(ratio - this.composerPixelRatio) > .01) {
      this.composerPixelRatio = ratio;
      this.composer.setPixelRatio(ratio);
    }
    this.composer.setSize(box.width, box.height);
  }

  private preparePhotographicCamera(internal: HomeSceneInternals) {
    const camera = internal.camera;
    const ray = camera.position.clone().sub(this.sceneTarget);
    camera.position.copy(this.sceneTarget).add(ray.multiplyScalar(this.photographicDistanceScale));
    camera.fov = this.photographicFov;
    camera.updateProjectionMatrix();

    if (this.bokeh) {
      const uniforms = this.bokeh.uniforms as {
        focus: { value: number };
        aperture: { value: number };
      };
      uniforms.focus.value = camera.position.distanceTo(this.focusTarget);
      // Slightly close the virtual aperture at night where bright practical
      // lights otherwise make the bokeh effect feel synthetic.
      uniforms.aperture.value = THREE.MathUtils.lerp(.000045, .000032, internal.nightMix);
    }
    if (this.windowLight) this.windowLight.intensity = THREE.MathUtils.lerp(7.2, .45, internal.nightMix);
  }

  private cinematicRender = (now: number) => {
    const internal = this as unknown as HomeSceneInternals;
    if (!this.originalRender || !this.originalRendererRender || internal.destroyed) return;

    const rawRender = this.originalRendererRender;
    const renderer = internal.renderer;
    const currentRender = renderer.render;

    // Keep an eye on real frame cost. If post-processing is consistently slow,
    // drop only GTAO/DOF; the area lights and photographic camera remain.
    if (this.lastRenderTime) {
      const delta = now - this.lastRenderTime;
      if (this.postEnabled && this.renderSamples < 150) {
        this.renderSamples++;
        if (delta > 34) this.slowSamples++;
        if (this.renderSamples === 150 && this.slowSamples > 52) this.postEnabled = false;
      }
    }
    this.lastRenderTime = now;

    const intercepted: THREE.WebGLRenderer['render'] = ((scene: THREE.Object3D, camera: THREE.Camera) => {
      if (scene === internal.scene && camera === internal.camera) {
        this.preparePhotographicCamera(internal);
        if (this.postEnabled && this.composer) {
          // Passes call renderer.render internally. Temporarily expose the raw
          // renderer so the composer cannot recursively re-enter this hook.
          renderer.render = rawRender;
          this.syncComposerSize(internal);
          this.composer.render();
          renderer.render = intercepted;
        } else {
          rawRender(scene as THREE.Scene, camera);
        }
        return;
      }
      rawRender(scene as THREE.Scene, camera);
    }) as THREE.WebGLRenderer['render'];

    renderer.render = intercepted;
    try {
      this.originalRender(now);
    } finally {
      renderer.render = currentRender;
    }
  };

  override dispose() {
    if (this.cinematicDisposed) return;
    this.cinematicDisposed = true;
    this.gtao?.dispose();
    this.bokeh?.dispose();
    this.output?.dispose();
    this.composer?.dispose();
    super.dispose();
  }
}
