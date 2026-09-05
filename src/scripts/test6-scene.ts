import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export type Finish = 'alloy' | 'pearl' | 'wire';
type AssemblyPart = { mesh: THREE.Object3D; origin: THREE.Vector3; direction: THREE.Vector3; layer: number };
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const ease = (n: number) => n * n * (3 - 2 * n);

// Each quadrant is an individually beveled, machined annulus, rather than a
// flat textured billboard. A continuous rear rail holds its moving inserts.
function annulus(radius: number, width: number, depth: number, sweep: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius + width / 2, 0, sweep, false);
  shape.absarc(0, 0, radius - width / 2, sweep, 0, true);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: true, bevelSize: .025,
    bevelThickness: .025, bevelSegments: 3, curveSegments: 30,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

const kernelVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vView;
  varying float vNoise;
  void main() {
    float wave = sin(position.x * 7.0 + uTime * .7) *
                 sin(position.y * 8.0 - uTime * .5) *
                 sin(position.z * 6.0 + uTime * .6);
    vec3 p = position + normal * wave * .045;
    vNormal = normalize(normalMatrix * normal);
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vView = normalize(-viewPosition.xyz);
    vPosition = position;
    vNoise = wave;
    gl_Position = projectionMatrix * viewPosition;
  }
`;
const kernelFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vView;
  varying float vNoise;
  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), vView), 0.0), 2.8);
    float sweep = sin(vPosition.y * 34.0 + sin(vPosition.x * 9.0 + uTime) * 1.8 - uTime * 1.8);
    float lines = smoothstep(.90, 1.0, sweep);
    vec3 base = vec3(.025, .04, .012);
    vec3 color = base + uColor * (fresnel * 2.4 + lines * .7 + .10 + vNoise * .04);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class OrbitalScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(37, 1, .1, 70);
  private root = new THREE.Group();
  private assembly = new THREE.Group();
  private center = new THREE.Group();
  private rings: THREE.Group[] = [];
  private parts: AssemblyPart[] = [];
  private orbit = new THREE.Group();
  private dust: THREE.Points;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private environment: THREE.WebGLRenderTarget;
  private frame = 0;
  private previousTime = 0;
  private elapsed = 0;
  private progress = 0;
  private currentProgress = 0;
  private paused = false;
  private destroyed = false;
  private exploded = false;
  private expansion = 0;
  private mobile = false;
  private pixelRatio = 1;
  private adaptiveFrames = 0;
  private slowFrames = 0;
  private yaw = 0;
  private pitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private cursor = new THREE.Vector2();
  private smoothCursor = new THREE.Vector2();
  private lamp = new THREE.PointLight(0xdaff73, 12, 12, 2);
  private metal = new THREE.MeshPhysicalMaterial({ color: 0xa8afa2, metalness: 1, roughness: .23, clearcoat: 1, clearcoatRoughness: .15 });
  private darkMetal = new THREE.MeshPhysicalMaterial({ color: 0x273124, metalness: .95, roughness: .3, clearcoat: .65 });
  private ceramic = new THREE.MeshPhysicalMaterial({ color: 0xe3e8d9, metalness: .78, roughness: .18, clearcoat: 1 });
  private lightMaterial = new THREE.MeshStandardMaterial({ color: 0xe5ffae, emissive: 0xc9ff4b, emissiveIntensity: 3.2, metalness: .1, roughness: .25 });
  private kernelMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xc7ff57) } },
    vertexShader: kernelVertex, fragmentShader: kernelFragment,
  });
  private wireOverlay: THREE.LineSegments;
  private onFatal: () => void;

  constructor(private canvas: HTMLCanvasElement, onFatal: () => void, initiallyPaused = false) {
    this.onFatal = onFatal;
    this.paused = initiallyPaused;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.setClearColor(0x101211);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.fog = new THREE.FogExp2(0x101211, .039);
    this.camera.position.set(0, .15, 11.8);

    const room = new RoomEnvironment();
    const softbox = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6.5, 4.8) }));
    softbox.position.set(0, 5, -2);
    softbox.rotation.x = Math.PI / 2;
    room.add(softbox);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, .03);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 1.7;
    room.dispose();
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xf1f2db, 4.5);
    key.position.set(4, 7, 6);
    const rim = new THREE.DirectionalLight(0xd4ff94, 3.4);
    rim.position.set(-6, 2, -4);
    const fill = new THREE.DirectionalLight(0xc1cbde, 1.7);
    fill.position.set(-5, -1, 5);
    this.scene.add(key, rim, fill, new THREE.HemisphereLight(0xe0e7cf, 0x11140f, .8));
    this.lamp.position.set(0, 1, 1);
    this.assembly.add(this.lamp);
    this.root.add(this.assembly);
    this.scene.add(this.root);

    this.buildAssembly();
    this.buildCore();
    this.buildOrbit();
    this.buildPedestal();
    this.dust = this.buildParticles();
    this.scene.add(this.dust);
    const wireSphere = new THREE.IcosahedronGeometry(.97, 2);
    this.wireOverlay = new THREE.LineSegments(new THREE.WireframeGeometry(wireSphere), new THREE.LineBasicMaterial({ color: 0xd8ff62, transparent: true, opacity: .22 }));
    wireSphere.dispose();
    this.center.add(this.wireOverlay);
    this.wireOverlay.visible = false;

    this.resize();
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.requestFrame();
  }

  private buildAssembly() {
    const radii = [1.32, 1.77, 2.24];
    const depth = [.17, .2, .23];
    const sweep = Math.PI / 2 - .09;
    const boltGeometry = new THREE.CylinderGeometry(.027, .027, .026, 8);
    boltGeometry.rotateX(Math.PI / 2);
    const tickGeometry = new THREE.BoxGeometry(.018, .075, .02);

    radii.forEach((radius, layer) => {
      const ring = new THREE.Group();
      this.rings.push(ring);
      this.assembly.add(ring);
      const plateGeometry = annulus(radius, .21 + layer * .025, depth[layer], sweep);
      const rail = new THREE.Mesh(new THREE.TorusGeometry(radius, .037, 10, 144), this.darkMetal);
      rail.position.z = -depth[layer] / 2 - .065;
      ring.add(rail);
      const continuousLight = new THREE.Mesh(new THREE.TorusGeometry(radius - .10, .012, 8, 180), this.lightMaterial);
      continuousLight.position.z = -.10;
      ring.add(continuousLight);

      for (let quadrant = 0; quadrant < 4; quadrant++) {
        const segment = new THREE.Group();
        const theta = quadrant * Math.PI / 2 + .045;
        segment.rotation.z = theta;
        const plate = new THREE.Mesh(plateGeometry, layer === 1 ? this.darkMetal : this.metal);
        segment.add(plate);
        const inlay = new THREE.Mesh(new THREE.TorusGeometry(radius, .015, 8, 48, sweep - .1), this.lightMaterial);
        inlay.rotation.z = .05;
        inlay.position.z = depth[layer] / 2 + .028;
        segment.add(inlay);
        const backInlay = inlay.clone();
        backInlay.position.z *= -1;
        segment.add(backInlay);

        const bolts = new THREE.InstancedMesh(boltGeometry, this.ceramic, 8);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < 8; i++) {
          const a = .09 + (i % 4) * (sweep - .18) / 3;
          dummy.position.set(Math.cos(a) * radius, Math.sin(a) * radius, (i < 4 ? 1 : -1) * (depth[layer] / 2 + .03));
          dummy.updateMatrix();
          bolts.setMatrixAt(i, dummy.matrix);
        }
        segment.add(bolts);
        const ticks = new THREE.InstancedMesh(tickGeometry, this.ceramic, 16);
        for (let i = 0; i < 16; i++) {
          const a = .14 + i * (sweep - .28) / 15;
          dummy.position.set(Math.cos(a) * (radius + .075), Math.sin(a) * (radius + .075), depth[layer] / 2 + .027);
          dummy.rotation.z = a - Math.PI / 2;
          dummy.scale.set(1, i % 4 === 0 ? 1 : .5, 1);
          dummy.updateMatrix();
          ticks.setMatrixAt(i, dummy.matrix);
        }
        segment.add(ticks);
        ring.add(segment);
        const middle = theta + sweep / 2;
        this.parts.push({ mesh: segment, origin: new THREE.Vector3(), direction: new THREE.Vector3(Math.cos(middle) * .45, Math.sin(middle) * .45, (layer - 1) * .4), layer });
      }

      // Opposing polished bearings give the intersecting frames physical joints.
      const joint = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .32, 24), this.ceramic);
      joint.rotation.x = Math.PI / 2;
      joint.position.set(radius, 0, 0);
      ring.add(joint);
      const opposite = joint.clone();
      opposite.position.x = -radius;
      ring.add(opposite);
    });
  }

  private buildCore() {
    this.assembly.add(this.center);
    const kernel = new THREE.Mesh(new THREE.SphereGeometry(.65, 64, 48), this.kernelMaterial);
    this.center.add(kernel);
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(.69, .075, 192, 12, 2, 3), this.ceramic);
    knot.rotation.x = .4;
    this.center.add(knot);
    const nodes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.044, 1), this.lightMaterial, 36);
    const matrix = new THREE.Object3D();
    for (let i = 0; i < 36; i++) {
      const y = 1 - i / 35 * 2;
      const r = Math.sqrt(1 - y * y);
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      matrix.position.set(Math.cos(angle) * r * .92, y * .92, Math.sin(angle) * r * .92);
      matrix.updateMatrix();
      nodes.setMatrixAt(i, matrix.matrix);
    }
    this.center.add(nodes);

    // The site's existing W mark, modeled as a beveled solid inside the core.
    const w = new THREE.Shape();
    const points = [[-.49,.30],[-.32,-.30],[-.12,.12],[.07,-.30],[.51,.30],[.34,.30],[.10,-.05],[-.10,.35],[-.29,-.05],[-.35,.30]];
    points.forEach(([x,y], i) => i === 0 ? w.moveTo(x,y) : w.lineTo(x,y));
    w.closePath();
    const logo = new THREE.Mesh(new THREE.ExtrudeGeometry(w, { depth: .08, bevelEnabled: true, bevelSize: .018, bevelThickness: .018, bevelSegments: 3, steps: 1 }), this.ceramic);
    logo.position.z = .69;
    this.center.add(logo);
  }

  private buildOrbit() {
    this.assembly.add(this.orbit);
    const geometry = new THREE.OctahedronGeometry(.12, 0);
    for (let i = 0; i < 8; i++) {
      const satellite = new THREE.Group();
      const a = i / 8 * TAU;
      satellite.position.set(Math.cos(a) * 2.9, Math.sin(a) * 2.9, Math.sin(a * 3) * .25);
      satellite.add(new THREE.Mesh(geometry, i % 3 === 0 ? this.lightMaterial : this.metal));
      const cage = new THREE.Mesh(new THREE.TorusGeometry(.2, .01, 6, 30), this.darkMetal);
      cage.rotation.x = Math.PI / 3;
      satellite.add(cage);
      this.orbit.add(satellite);
    }
    const path = new THREE.EllipseCurve(0, 0, 2.9, 2.9, 0, TAU, false, 0);
    const points = path.getPoints(180).map(point => new THREE.Vector3(point.x, point.y, 0));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xa5be89, transparent: true, opacity: .16 }));
    this.orbit.add(line);
    this.orbit.rotation.set(.65, .2, 0);
  }

  private buildPedestal() {
    const pedestal = new THREE.Group();
    pedestal.position.y = -2.9;
    const tiers = [[2.0, .06, 0], [1.74, .10, .065], [1.25, .018, .126]];
    tiers.forEach(([radius,height,y], i) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + .025, height, 96), i === 2 ? this.metal : this.darkMetal);
      mesh.position.y = y;
      pedestal.add(mesh);
    });
    const track = new THREE.Mesh(new THREE.TorusGeometry(1.83, .009, 8, 160), this.lightMaterial);
    track.rotation.x = Math.PI / 2;
    track.position.y = .052;
    pedestal.add(track);
    const discLines = new THREE.Group();
    for (let r = .6; r < 1.8; r += .25) {
      const circle = new THREE.Mesh(new THREE.TorusGeometry(r, .005, 4, 100), this.metal);
      circle.rotation.x = Math.PI / 2;
      circle.position.y = .145;
      discLines.add(circle);
    }
    pedestal.add(discLines);
    this.root.add(pedestal);

    // Procedural contact shadow; no external textures or model downloads.
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv; void main(){float d=length((vUv-.5)*2.0); gl_FragColor=vec4(0.0,0.0,0.0,pow(max(0.0,1.0-d),2.6)*.75);}',
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -3;
    this.root.add(shadow);
    const ground = new THREE.GridHelper(80, 60, 0x36452c, 0x263021);
    ground.position.y = -3.1;
    (ground.material as THREE.Material).transparent = true;
    (ground.material as THREE.Material).opacity = .14;
    this.scene.add(ground);
  }

  private buildParticles() {
    const count = 1400;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    // Seeded distribution keeps the composition stable between visits.
    let seed = 608;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - .5) * 28;
      positions[i * 3 + 1] = (random() - .5) * 15;
      positions[i * 3 + 2] = -random() * 16 - 1;
      sizes[i] = .3 + random() * 1.3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    return new THREE.Points(geometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSize; varying float vAlpha; void main(){vec4 p=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(aSize*14.0/-p.z,.5,2.8); vAlpha=aSize*.23; gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying float vAlpha; void main(){float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(.68,.8,.48,vAlpha*(1.0-d*2.0));}`,
    }));
  }

  resize() {
    if (this.destroyed) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.mobile = width <= 700;
    this.camera.aspect = width / height;
    this.camera.fov = this.mobile ? 44 : 37;
    this.camera.updateProjectionMatrix();
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.25 : 1.6);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    // Bloom is intentionally omitted on small devices. Physical lighting and
    // emissive materials remain, without five extra full-screen blur passes.
    if (!this.mobile && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), .3, .4, 1.15);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(width, height);
    }
    this.requestFrame();
  }

  setProgress(value: number) { this.progress = clamp(value, 0, 3); this.requestFrame(); }
  setExploded(value: boolean) { this.exploded = value; this.requestFrame(); }
  setPointer(x: number, y: number) { this.cursor.set(x, y); if (!this.paused) this.requestFrame(); }
  rotate(yaw: number, pitch: number) { this.targetYaw += yaw; this.targetPitch = clamp(this.targetPitch + pitch, -.8, .8); this.requestFrame(); }
  reset() { this.targetYaw = 0; this.targetPitch = 0; this.exploded = false; this.requestFrame(); }

  setPaused(value: boolean) {
    this.paused = value;
    this.previousTime = 0;
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.requestFrame();
  }

  setFinish(finish: Finish) {
    const wire = finish === 'wire';
    const pearl = finish === 'pearl';
    this.metal.color.set(pearl ? 0xf2eede : wire ? 0xc5eaa0 : 0xa8afa2);
    this.metal.metalness = pearl ? .12 : 1;
    this.metal.roughness = pearl ? .3 : .23;
    this.darkMetal.color.set(pearl ? 0xaaa89a : wire ? 0x92b675 : 0x273124);
    this.darkMetal.metalness = pearl ? .35 : .95;
    this.metal.wireframe = wire;
    this.darkMetal.wireframe = wire;
    this.ceramic.wireframe = wire;
    this.wireOverlay.visible = wire;
    this.scene.environmentIntensity = pearl ? 1.2 : 1.7;
    this.requestFrame();
  }

  private requestFrame() {
    if (!this.frame && !this.destroyed && !document.hidden) this.frame = requestAnimationFrame(this.render);
  }

  private render = (now: number) => {
    this.frame = 0;
    if (this.destroyed || document.hidden) return;
    const rawDelta = this.previousTime ? (now - this.previousTime) / 1000 : 1 / 60;
    const delta = Math.min(rawDelta, .05);
    this.previousTime = now;
    const damping = this.paused ? 1 : 1 - Math.exp(-delta * 5.5);
    if (!this.paused) this.elapsed += delta;
    const t = this.elapsed;
    this.currentProgress = THREE.MathUtils.lerp(this.currentProgress, this.progress, damping);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, damping);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, damping);
    this.smoothCursor.lerp(this.paused ? new THREE.Vector2() : this.cursor, damping * .4);
    const p = this.currentProgress;
    const index = Math.min(2, Math.floor(p));
    const mix = ease(p - index);
    const blend = (values: number[]) => THREE.MathUtils.lerp(values[index], values[index + 1], mix);
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.position.z;
    const visibleWidth = visibleHeight * this.camera.aspect;
    const scale = this.mobile ? Math.min(.72, visibleWidth / 7.4) : Math.min(1.05, visibleWidth / 11.6);
    const x = this.mobile ? 0 : blend([.225, -.235, .24, 0]) * visibleWidth;
    const y = this.mobile ? blend([-1.9, -2.15, -2.0, 2.25]) : blend([.12, .22, .20, 2.35]);
    const stageScale = blend([1, .83, .90, .70]);
    this.root.position.set(x, y, 0);
    this.root.scale.setScalar(scale * stageScale);
    this.assembly.rotation.set(.1 + this.pitch + this.smoothCursor.y * .045, -.20 + this.yaw + this.smoothCursor.x * .13 + blend([0, .6, -.6, .15]), -.13);
    this.assembly.position.y = Math.sin(t * .65) * .065;
    const desiredExpansion = this.exploded ? 1.5 : blend([0, 1.3, .08, .4]);
    this.expansion = THREE.MathUtils.lerp(this.expansion, desiredExpansion, damping);

    this.rings.forEach((ring, i) => {
      const rotations = [[.64, .10, -.4], [1.08, -.65, .85], [-.38, .62, -.28]];
      ring.rotation.set(rotations[i][0] + Math.sin(t * .15 + i) * .12, rotations[i][1] + t * [.07, -.10, .045][i], rotations[i][2] + Math.sin(t * .10 + i) * .14);
      ring.position.z = (i - 1) * this.expansion * .55;
    });
    this.parts.forEach(part => part.mesh.position.copy(part.origin).addScaledVector(part.direction, this.expansion));
    this.center.rotation.set(Math.sin(t * .16) * .1, Math.sin(t * .22) * .30, 0);
    this.kernelMaterial.uniforms.uTime.value = t;
    this.orbit.rotation.set(.65 + Math.sin(t * .14) * .15, .2, t * .055);
    this.orbit.scale.setScalar(1 + this.expansion * .07);
    this.orbit.children.forEach((node, i) => { if (i < 8) { node.rotation.x = t * .2 + i; node.rotation.y = t * .3; } });
    this.dust.rotation.y = t * .006;
    this.lamp.intensity = 10 + Math.sin(t * .9) * 2;

    try {
      if (this.composer && !this.mobile) this.composer.render(delta);
      else this.renderer.render(this.scene, this.camera);
    } catch {
      this.onFatal();
      this.dispose();
      return;
    }
    // Reduce fill rate if a sustained run is slow; never infer quality from UA.
    if (!this.paused && this.adaptiveFrames < 180) {
      this.adaptiveFrames++;
      if (rawDelta > .034) this.slowFrames++;
      if (this.adaptiveFrames === 180 && this.slowFrames > 65) {
        this.pixelRatio = 1;
        this.renderer.setPixelRatio(1);
        this.composer?.setPixelRatio(1);
        if (this.bloom) this.bloom.enabled = false;
      }
    }
    if (!this.paused) this.requestFrame();
  };

  private contextLost = (event: Event) => { event.preventDefault(); if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.onFatal(); };
  private visibilityChanged = () => {
    if (document.hidden) { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; }
    else { this.previousTime = 0; this.requestFrame(); }
  };

  dispose() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      const drawable = object as THREE.Mesh;
      if (drawable.geometry) geometries.add(drawable.geometry);
      if (drawable.material) (Array.isArray(drawable.material) ? drawable.material : [drawable.material]).forEach(material => materials.add(material));
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.composer?.passes.forEach(pass => pass.dispose());
    this.composer?.dispose();
    this.environment.dispose();
    this.renderer.dispose();
  }
}
