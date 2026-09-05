import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

type Surface = { material: THREE.MeshPhysicalMaterial; color: THREE.Color; metalness: number; roughness: number };
type Floating = { group: THREE.Object3D; origin: THREE.Vector3; phase: number };
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const smooth = (n: number) => { n = clamp(n, 0, 1); return n * n * (3 - 2 * n); };

export class HomeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, .1, 80);
  private world = new THREE.Group();
  private surfaces: Surface[] = [];
  private outline = new THREE.LineBasicMaterial({ color: 0x313341, transparent: true, opacity: .62 });
  private floating: Floating[] = [];
  private curves: THREE.CatmullRomCurve3[] = [];
  private packets: THREE.Mesh[] = [];
  private bars: THREE.Mesh[] = [];
  private leaves: THREE.Group[] = [];
  private screenSurfaces: THREE.MeshBasicMaterial[] = [];
  private terrain = new THREE.Scene();
  private terrainCamera = new THREE.PerspectiveCamera(43, 16 / 9, .1, 70);
  private landscape: THREE.WebGLRenderTarget;
  private clouds = new THREE.Group();
  private daylight = new THREE.DirectionalLight(0xfff3e2, 4.2);
  private fill = new THREE.HemisphereLight(0xe9eeff, 0xc4c4d0, 2.5);
  private deskLamp = new THREE.PointLight(0xffd5a1, 0, 12, 2);
  private screenGlow = new THREE.PointLight(0x8164ff, 1.4, 6, 2);
  private bulb: THREE.Mesh;
  private steam: THREE.Points;
  private screenTexture: THREE.CanvasTexture;
  private supportCanvas: HTMLCanvasElement;
  private environment: THREE.WebGLRenderTarget;
  private ticks = 0;
  private previous = 0;
  private elapsed = 0;
  private progress = 0;
  private currentProgress = 0;
  private expansion = 0;
  private exploded = false;
  private night = false;
  private nightMix = 0;
  private paused: boolean;
  private destroyed = false;
  private frame = 0;
  private yaw = 0;
  private pitch = 0;
  private userYaw = 0;
  private userPitch = 0;
  private cursor = new THREE.Vector2();
  private slowFrames = 0;
  private checkedFrames = 0;

  constructor(private canvas: HTMLCanvasElement, paused: boolean, private onFailure: () => void) {
    this.paused = paused;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0xfafaff);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0xfafaff);
    this.scene.fog = new THREE.Fog(0xfafaff, 19, 35);
    this.scene.add(this.world, this.daylight, this.fill);
    this.daylight.position.set(-5, 9, 6);
    this.daylight.castShadow = true;
    this.daylight.shadow.mapSize.set(1024, 1024);
    Object.assign(this.daylight.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: .1, far: 30 });
    this.daylight.shadow.normalBias = .035;
    this.daylight.shadow.bias = -.0002;
    const rim = new THREE.DirectionalLight(0x9c8cff, 1.8);
    rim.position.set(5, 2, -5);
    this.scene.add(rim);
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, .06);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .6;
    room.dispose(); pmrem.dispose();

    this.landscape = new THREE.WebGLRenderTarget(768, 432, { depthBuffer: true });
    this.buildLandscape();
    this.buildDesk();
    this.buildDevices();
    const support = this.buildPanels();
    this.supportCanvas = support.canvas;
    this.screenTexture = support.texture;
    this.bulb = this.buildLamp();
    this.steam = this.buildCoffeeAndPlant();
    this.scene.add(this.steam);
    this.world.add(this.deskLamp, this.screenGlow);
    this.deskLamp.position.set(2.85, 1.45, .25);
    this.screenGlow.position.set(.1, .4, 1.2);
    this.resize();
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    document.addEventListener('visibilitychange', this.visibilityChange);
    this.requestFrame();
  }

  private material(color: number, metalness = .1, roughness = .4) {
    const material = new THREE.MeshPhysicalMaterial({ color, metalness, roughness, clearcoat: .5, clearcoatRoughness: .22 });
    this.surfaces.push({ material, color: new THREE.Color(color), metalness, roughness });
    return material;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, position: [number,number,number] = [0,0,0], edged = true) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (edged) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), this.outline));
    parent.add(mesh);
    return mesh;
  }

  private box(w: number, h: number, d: number, radius = .08) { return new RoundedBoxGeometry(w,h,d,3,Math.min(radius,w/3,h/3,d/3)); }

  private floatingObject(group: THREE.Object3D, phase: number) { this.floating.push({ group, origin: group.position.clone(), phase }); }

  private buildDesk() {
    const white = this.material(0xf0eeea, .15, .36);
    const aluminum = this.material(0xb8bfce, .85, .23);
    const desktop = this.mesh(this.box(7.7,.2,3.55,.1), white, this.world, [0,-2.0,.1]);
    this.mesh(this.box(7.3,.075,3.15), aluminum, desktop, [0,-.13,0]);
    for (const x of [-3.1,3.1]) this.mesh(this.box(.14,1.8,2.3), white, this.world, [x,-3,.05]);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200), this.material(0xf7f7fa,0,.85));
    ground.rotation.x = -Math.PI/2; ground.position.y = -3.95; ground.receiveShadow = true;
    this.world.add(ground);

    const keyboard = new THREE.Group(); keyboard.position.set(0,-1.83,1.04); this.world.add(keyboard);
    this.mesh(this.box(2.65,.09,.87), aluminum, keyboard);
    const keyMaterial = this.material(0xfdfdfd,.1,.45);
    const keys = new THREE.InstancedMesh(this.box(.145,.052,.14,.012),keyMaterial,65);
    const dummy = new THREE.Object3D();
    for(let i=0;i<65;i++) { dummy.position.set((i%13-6)*.185,.07,(Math.floor(i/13)-2)*.155);dummy.updateMatrix();keys.setMatrixAt(i,dummy.matrix); }
    keys.castShadow = true; keyboard.add(keys);
    const mouse = this.mesh(this.box(.38,.16,.63), white, this.world, [1.73,-1.78,1.0]);
    this.mesh(this.box(.02,.025,.13,.005), aluminum, mouse, [0,.08,-.08]);

    const graphite = this.material(0x393646,.3,.42);
    const wood = this.material(0xe4be88,0,.7);
    [0x8161ed,0xf5b342].forEach((color,i)=>{
      const pencil = new THREE.Group(); pencil.position.set(-1.85 + i*.34,-1.8,1.25); pencil.rotation.set(0,.35+i*.3,Math.PI/2); this.world.add(pencil);
      this.mesh(new THREE.CylinderGeometry(.037,.037,1.32,6),this.material(color),pencil);
      this.mesh(new THREE.ConeGeometry(.038,.16,6),wood,pencil,[0,.74,0]);
      this.mesh(new THREE.ConeGeometry(.014,.07,6),graphite,pencil,[0,.845,0]);
    });
    const ruler = this.mesh(this.box(1.5,.035,.19,.01),this.material(0xc9d6ec,.25,.2),this.world,[-.95,-1.86,1.55]);
    for(let i=0;i<15;i++) this.mesh(new THREE.BoxGeometry(.008,.006,i%5===0?.10:.055),graphite,ruler,[-.67+i*.095,.02,.035],false);
  }

  private buildDevices() {
    const metal = this.material(0x929bac,.9,.24);
    const bezel = this.material(0x1c263b,.7,.25);
    const monitor = new THREE.Group(); monitor.position.set(0,.4,-.2); this.world.add(monitor);
    this.mesh(this.box(3.85,2.5,.18),metal,monitor);
    this.mesh(this.box(3.74,2.38,.09),bezel,monitor,[0,.015,.10]);
    this.mesh(this.box(.19,1.05,.19),metal,monitor,[0,-1.7,-.04]);
    this.mesh(this.box(1.2,.07,.65),metal,monitor,[0,-2.22,.20]);
    const landscapeMaterial = new THREE.MeshBasicMaterial({ map:this.landscape.texture, transparent:true });
    this.screenSurfaces.push(landscapeMaterial);
    this.mesh(new THREE.PlaneGeometry(3.52,1.98),landscapeMaterial,monitor,[0,.11,.156],false);
    const dots = [0xfd6c66,0xffcd65,0x55ce96];
    dots.forEach((color,i)=>this.mesh(new THREE.SphereGeometry(.023,10,8),this.material(color),monitor,[-1.64+i*.095,1.17,.157],false));
    const screenTitle = this.uiTexture('Webigram', 'IDEAS, IN REAL LIFE', 'title');
    this.mesh(new THREE.PlaneGeometry(1.36,.26),new THREE.MeshBasicMaterial({map:screenTitle.texture,transparent:true}),monitor,[0,-1.045,.159],false);
    this.floatingObject(monitor,0);

    const phone = new THREE.Group(); phone.position.set(2.12,-.48,1.14); phone.rotation.set(-.08,-.23,-.06); this.world.add(phone);
    this.mesh(this.box(.92,1.98,.15),metal,phone);
    this.mesh(this.box(.84,1.89,.075),bezel,phone,[0,0,.085]);
    const phoneMaterial = new THREE.MeshBasicMaterial({map:this.landscape.texture,transparent:true});
    this.screenSurfaces.push(phoneMaterial);
    this.mesh(new THREE.PlaneGeometry(.75,1.60),phoneMaterial,phone,[0,0,.13],false);
    this.mesh(this.box(.28,.055,.01,.015),bezel,phone,[0,.81,.145]);
    this.mesh(this.box(.24,.018,.01,.007),metal,phone,[0,-.84,.145]);
    this.mesh(this.box(.025,.27,.06,.009),metal,phone,[.465,.37,0]);
    this.floatingObject(phone,1.4);
  }

  private uiTexture(title: string, subtitle: string, kind: string) {
    const canvas = document.createElement('canvas');canvas.width=640;canvas.height=400;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle=kind==='title'?'#192237':'#ffffff';ctx.fillRect(0,0,640,400);
    ctx.fillStyle=kind==='title'?'#e9eefa':'#273354';ctx.font='600 39px Arial';ctx.fillText(title,38,66);
    ctx.fillStyle='#8b91ae';ctx.font='24px Arial';ctx.fillText(subtitle,38,106);
    if(kind==='form') {
      for(let i=0;i<2;i++){ctx.fillStyle='#f1f3fa';ctx.beginPath();ctx.roundRect(38,145+i*66,564,48,10);ctx.fill();ctx.fillStyle='#949bb4';ctx.fillText(i?'Your email':'Your name',56,177+i*66);}
      ctx.fillStyle='#755bea';ctx.beginPath();ctx.roundRect(330,290,270,64,13);ctx.fill();ctx.fillStyle='white';ctx.font='600 27px Arial';ctx.fillText('Let’s create',380,332);
    } else if(kind==='design') {
      ['#7960ef','#52b8f5','#efb453','#59c8ac'].forEach((color,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(38+i*145,150,120,120,18);ctx.fill();});
      ctx.fillStyle='#eef0f7';ctx.fillRect(38,307,430,13);ctx.fillRect(38,337,320,13);
    } else if(kind==='chat') {
      ctx.fillStyle='#f1edff';ctx.beginPath();ctx.roundRect(38,150,515,83,18);ctx.fill();ctx.fillStyle='#7960ef';ctx.font='26px Arial';ctx.fillText('What shall we build?',62,200);
      ctx.fillStyle='#7960ef';ctx.beginPath();ctx.roundRect(166,256,434,83,18);ctx.fill();ctx.fillStyle='white';ctx.fillText('Something extraordinary.',190,307);
    } else if(kind==='admin') {
      ctx.fillStyle='#f1f3fa';ctx.fillRect(38,140,105,220);
      for(let i=0;i<4;i++){ctx.fillStyle='#b9bdd1';ctx.fillRect(54,159+i*43,70,10);}
      ctx.lineWidth=12;ctx.strokeStyle='#8667ef';ctx.beginPath();ctx.arc(263,238,65,0,Math.PI*1.5);ctx.stroke();
      for(let i=0;i<5;i++){ctx.fillStyle=['#aa97ed','#7c60e8','#60c5d6'][i%3];ctx.fillRect(382+i*39,300-i*21,24,45+i*21);}
    }
    const texture = new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
    return {canvas,texture};
  }

  private buildPanels() {
    const panelMaterial = this.material(0xf6f7ff,.2,.22);
    const accent = this.material(0x8160ef,.25,.28);
    let support!: {canvas:HTMLCanvasElement;texture:THREE.CanvasTexture};
    const specifications: [string,string,string,number,number,number,number][] = [
      ['UI / UX','A language of your own','design',-2.26,2.34,-.6,1.78],
      ['Let’s connect','One idea starts it all','form',1.23,2.72,-.65,1.68],
      ['Live support','Every conversation matters','chat',-2.55,-.73,.8,1.65],
      ['Dashboard','Everything in one place','admin',.36,-1.1,2.05,1.62],
    ];
    specifications.forEach(([title,subtitle,kind,x,y,z,width],i)=>{
      const group = new THREE.Group();group.position.set(x,y,z);group.rotation.y=(i%2?-.08:.1);this.world.add(group);
      this.mesh(this.box(width,width*.625,.075,.06),panelMaterial,group);
      const ui = this.uiTexture(title,subtitle,kind);
      const material = new THREE.MeshBasicMaterial({map:ui.texture,transparent:true});this.screenSurfaces.push(material);
      this.mesh(new THREE.PlaneGeometry(width*.94,width*.625*.92),material,group,[0,0,.05],false);
      this.floatingObject(group,i+.5);
      if(kind==='chat')support=ui;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x,y,z-.1),new THREE.Vector3(x*.72,y*.60,-.65),new THREE.Vector3(0,.35,-.50)]);
      this.curves.push(curve);
      const materialLine = this.material(0x9478e9,.1,.5);
      this.mesh(new THREE.TubeGeometry(curve,40,.011,6,false),materialLine,this.world,[0,0,0],false);
      const packet = new THREE.Mesh(new THREE.SphereGeometry(.035,10,8),new THREE.MeshBasicMaterial({color:0x9c7bff}));this.world.add(packet);this.packets.push(packet);
    });
    const chart = new THREE.Group();chart.position.set(-3.0,.64,.1);chart.rotation.y=.16;this.world.add(chart);
    this.mesh(this.box(1.35,1.65,.08),panelMaterial,chart);
    for(let i=0;i<4;i++) {
      const bar=this.mesh(this.box(.17,.38+i*.2,.11,.025),i%2?accent:this.material(0x56bfd8),chart,[-.42+i*.28,-.45+(i*.2)/2,.15]);
      this.bars.push(bar);
    }
    this.floatingObject(chart,2.2);
    return support;
  }

  private buildLamp() {
    const steel = this.material(0x8c94a6,.85,.25);
    const shell = this.material(0xefeaf9,.1,.3);
    const lamp = new THREE.Group();lamp.position.set(3.0,-1.85,-.6);this.world.add(lamp);
    this.mesh(new THREE.CylinderGeometry(.35,.40,.08,40),steel,lamp);
    const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.1,1.2,0),new THREE.Vector3(.0,2.45,0),new THREE.Vector3(-.30,2.9,.12)]);
    this.mesh(new THREE.TubeGeometry(arm,40,.035,10,false),steel,lamp);
    const shade = this.mesh(new THREE.ConeGeometry(.36,.37,40,1,true),shell,lamp,[-.30,2.90,.12]);
    shade.rotation.z=.12;
    const bulb=this.mesh(new THREE.SphereGeometry(.16,20,14),new THREE.MeshStandardMaterial({color:0xffedcc,emissive:0xffc671,emissiveIntensity:.2}),lamp,[-.3,2.77,.12],false);
    return bulb;
  }

  private buildCoffeeAndPlant() {
    const ceramic=this.material(0xece7ff,.18,.22);
    const coffee=this.material(0x3b241c,0,.15);
    const cup = new THREE.Group();cup.position.set(-2.58,-1.5,1.15);this.world.add(cup);
    this.mesh(new THREE.CylinderGeometry(.23,.18,.47,40,1,true),ceramic,cup);
    this.mesh(new THREE.TorusGeometry(.225,.022,10,40),ceramic,cup,[0,.237,0]).rotation.x=Math.PI/2;
    this.mesh(new THREE.CylinderGeometry(.203,.203,.012,32),coffee,cup,[0,.19,0],false);
    this.mesh(new THREE.TorusGeometry(.17,.035,10,28,Math.PI*1.55),ceramic,cup,[.24,.015,0]).rotation.z=-Math.PI*.77;
    this.mesh(new THREE.CylinderGeometry(.31,.31,.03,40),ceramic,this.world,[-2.58,-1.87,1.15]);
    const positions=new Float32Array(30*3);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const steam=new THREE.Points(geometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,
      vertexShader:'void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_PointSize=55.0/-p.z;gl_Position=projectionMatrix*p;}',
      fragmentShader:'void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.7,.73,.83,(1.0-d*2.0)*.13);}',
    }));
    const pot=new THREE.Group();pot.position.set(-3.28,-1.58,-.95);this.world.add(pot);
    this.mesh(new THREE.CylinderGeometry(.30,.22,.56,32),this.material(0xd7d2cd,.1,.8),pot);
    this.mesh(new THREE.CylinderGeometry(.275,.275,.018,32),this.material(0x49372a,0,1),pot,[0,.28,0]);
    const leafMaterial=this.material(0x507c49,.03,.65);
    for(let i=0;i<9;i++) {
      const leaf=new THREE.Group();leaf.position.y=.26;leaf.rotation.y=i*2.4;leaf.rotation.z=.12+Math.sin(i)*.24;pot.add(leaf);this.leaves.push(leaf);
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(),new THREE.Vector3(.05,.50,0),new THREE.Vector3(.22,.84+(i%3)*.14,0)]);
      this.mesh(new THREE.TubeGeometry(curve,15,.011,5,false),leafMaterial,leaf,[0,0,0],false);
      const geometry=new THREE.SphereGeometry(1,16,12);
      const blade=this.mesh(geometry,leafMaterial,leaf,[.21,.81+(i%3)*.14,0],false);blade.scale.set(.13,.34,.032);blade.rotation.z=-.45;
    }
    return steam;
  }

  private buildLandscape() {
    this.terrain.background=new THREE.Color(0xd7e9f4);
    this.terrain.fog=new THREE.Fog(0xd7e9f4,14,35);
    this.terrain.add(new THREE.HemisphereLight(0xf6f5f1,0x6d7183,3));
    const sunLight=new THREE.DirectionalLight(0xffddac,4);sunLight.position.set(-7,7,5);this.terrain.add(sunLight);
    const sun=new THREE.Mesh(new THREE.SphereGeometry(.55,24,16),new THREE.MeshBasicMaterial({color:0xffebc0}));sun.position.set(-3,4,-7);this.terrain.add(sun);
    const mesh=new THREE.PlaneGeometry(19,14,96,72);mesh.rotateX(-Math.PI/2);
    const position=mesh.attributes.position;
    const colors=new Float32Array(position.count*3);
    const snow=new THREE.Color(0xf6f5f1),rock=new THREE.Color(0x778da0),grass=new THREE.Color(0x819789);
    for(let i=0;i<position.count;i++) {
      const x=position.getX(i),z=position.getZ(i);
      let h=0;
      for(const [px,pz,height] of [[-2,-1,3.6],[2,-2,4.1],[4,1,2.7],[-5,2,2.3]])h=Math.max(h,height*Math.exp(-((x-px)**2*.13+(z-pz)**2*.18)));
      h+=Math.sin(x*2.9+z*.7)*Math.cos(z*3.2)*.20+Math.sin(x*7+z*5)*.075;
      position.setY(i,h-.6);
      const color=h>2.75?snow:rock.clone().lerp(grass,Math.max(0,1-h/2.4));color.toArray(colors,i*3);
    }
    mesh.setAttribute('color',new THREE.BufferAttribute(colors,3));mesh.computeVertexNormals();
    this.terrain.add(new THREE.Mesh(mesh,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true})));
    const cloudMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});
    const cloudGeometry=new THREE.SphereGeometry(1,12,8);
    for(let i=0;i<18;i++) {const cloud=new THREE.Mesh(cloudGeometry,cloudMaterial);cloud.position.set((i%6-3)*2.1,3.7+Math.sin(i)*.2,-3-Math.floor(i/6)*1.1);cloud.scale.set(.9,.15,.35);this.clouds.add(cloud);}
    this.terrain.add(this.clouds);
    this.terrainCamera.position.set(7,4.8,10);this.terrainCamera.lookAt(0,1.1,0);
  }

  resize() {
    if(this.destroyed)return;
    const box=this.canvas.parentElement!.getBoundingClientRect();
    if(box.width<1||box.height<1)return;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,window.innerWidth<=820?1.25:1.65));
    this.renderer.setSize(box.width,box.height,false);this.camera.aspect=box.width/box.height;this.camera.updateProjectionMatrix();this.requestFrame();
  }
  setProgress(progress:number){this.progress=clamp(progress,0,2);this.requestFrame();}
  setNight(night:boolean){this.night=night;this.requestFrame();}
  setExpanded(expanded:boolean){this.exploded=expanded;this.requestFrame();}
  setPaused(paused:boolean){this.paused=paused;this.previous=0;if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.requestFrame();}
  pointer(x:number,y:number){this.cursor.set(x,y);}
  rotate(x:number,y:number){this.userYaw=clamp(this.userYaw+x,-.7,.7);this.userPitch=clamp(this.userPitch+y,-.25,.3);this.requestFrame();}
  reset(){this.userYaw=0;this.userPitch=0;this.exploded=false;this.night=false;this.requestFrame();}

  private requestFrame(){if(!this.frame&&!this.destroyed&&!document.hidden)this.frame=requestAnimationFrame(this.render);}
  private render=(now:number)=>{
    this.frame=0;if(this.destroyed||document.hidden)return;
    const raw=this.previous?(now-this.previous)/1000:1/60;const dt=Math.min(raw,.05);this.previous=now;
    if(!this.paused)this.elapsed+=dt;
    const t=this.elapsed,damping=this.paused?1:1-Math.exp(-dt*6);
    this.currentProgress=mix(this.currentProgress,this.progress,damping);
    const p=this.currentProgress,color=smooth(p/.75),real=smooth((p-1)/.85);
    this.nightMix=mix(this.nightMix,this.night?real:0,damping);
    this.expansion=mix(this.expansion,this.exploded?1:0,damping);
    this.yaw=mix(this.yaw,this.userYaw+(this.paused?0:this.cursor.x*.08),damping);
    this.pitch=mix(this.pitch,this.userPitch+(this.paused?0:this.cursor.y*.035),damping);
    const distance=Math.max(12.5,9.0/(2*Math.tan(THREE.MathUtils.degToRad(38)/2)*this.camera.aspect));
    const yaw=real*.28+this.yaw+Math.sin(t*.17)*.024*real;
    const pitch=.035+real*.15+this.pitch;
    this.camera.position.set(Math.sin(yaw)*distance,Math.sin(pitch)*distance+.08,Math.cos(yaw)*Math.cos(pitch)*distance);
    this.camera.lookAt(0,-.03,0);
    const paper=new THREE.Color(0xfbfaf7),night=new THREE.Color(0x13162b);
    (this.scene.background as THREE.Color).copy(paper).lerp(new THREE.Color(0xf4f5fc),color).lerp(night,this.nightMix);
    (this.scene.fog as THREE.Fog).color.copy(this.scene.background as THREE.Color);
    this.daylight.intensity=mix(4.2,.4,this.nightMix);this.fill.intensity=mix(2.5,.42,this.nightMix);
    this.deskLamp.intensity=real*mix(.7,15,this.nightMix);this.screenGlow.intensity=real*mix(.8,6,this.nightMix);
    (this.bulb.material as THREE.MeshStandardMaterial).emissiveIntensity=mix(.3,3.5,this.nightMix);
    this.scene.environmentIntensity=mix(.25,.9,real)*(1-this.nightMix*.72);
    this.outline.opacity=(1-color)*.6;
    this.surfaces.forEach(surface=>{
      surface.material.color.set(0xffffff).lerp(surface.color,color);
      surface.material.metalness=surface.metalness*real;
      surface.material.roughness=mix(.86,surface.roughness,real);
    });
    this.screenSurfaces.forEach(material=>{material.opacity=color;material.visible=color>.005;});
    this.floating.forEach(({group,origin,phase},i)=>{
      group.position.copy(origin);
      group.position.y+=Math.sin(t*.75+phase)*(.02+.065*real)*(i===0?.35:1);
      group.position.z+=Math.sin(t*.5+phase)*.07*real;
      group.position.x+=origin.x*.14*this.expansion;
      group.position.y+=origin.y*.09*this.expansion;
      group.position.z+=(i%2?1:-.6)*this.expansion;
      if(i>1)group.rotation.z=Math.sin(t*.4+phase)*.025*real;
    });
    this.bars.forEach((bar,i)=>{bar.scale.y=1+Math.sin(t*1.1+i)*.11*real;});
    this.leaves.forEach((leaf,i)=>{leaf.rotation.z=.12+Math.sin(i)*.24+Math.sin(t*.85+i*.4)*.06*real;});
    this.packets.forEach((packet,i)=>{packet.position.copy(this.curves[i].getPointAt((t*.14+i*.25)%1));packet.visible=color>.2;});
    const positions=this.steam.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){const rise=(t*.22+i/positions.count)%1;positions.setXYZ(i,-2.58+Math.sin(rise*7+t+i*.2)*.06,-1.22+rise*.70,1.15+Math.cos(rise*9+i)*.045);}
    positions.needsUpdate=true;this.steam.visible=real>.4;
    this.clouds.position.x=Math.sin(t*.13)*.65;
    this.terrainCamera.position.x=7+Math.sin(t*.14)*1.0*real;this.terrainCamera.lookAt(0,1.1,0);
    try {
      if(this.ticks++%3===0||this.paused){this.renderer.setRenderTarget(this.landscape);this.renderer.render(this.terrain,this.terrainCamera);this.renderer.setRenderTarget(null);}
      if(this.ticks%18===0&&real>.3){
        const ctx=this.supportCanvas.getContext('2d')!;ctx.fillStyle='#f1edff';ctx.fillRect(60,174,466,39);ctx.fillStyle='#7960ef';ctx.font='26px Arial';
        const text='What shall we build?';ctx.fillText(text.slice(0,Math.min(text.length,Math.floor(t*4)%32)),62,201);this.screenTexture.needsUpdate=true;
      }
      this.renderer.render(this.scene,this.camera);
    }catch{this.onFailure();this.dispose();return;}
    if(!this.paused&&this.checkedFrames<180){this.checkedFrames++;if(raw>.035)this.slowFrames++;if(this.checkedFrames===180&&this.slowFrames>65){this.renderer.setPixelRatio(1);this.daylight.castShadow=false;}}
    if(!this.paused)this.requestFrame();
  };
  private contextLost=(event:Event)=>{event.preventDefault();this.onFailure();this.dispose();};
  private visibilityChange=()=>{if(document.hidden){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;}else{this.previous=0;this.requestFrame();}};
  dispose(){
    if(this.destroyed)return;this.destroyed=true;if(this.frame)cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener('webglcontextlost',this.contextLost);document.removeEventListener('visibilitychange',this.visibilityChange);
    const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    [this.scene,this.terrain].forEach(scene=>scene.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.geometry)geometry.add(mesh.geometry);if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(material=>{materials.add(material);const map=(material as THREE.MeshBasicMaterial).map;if(map)textures.add(map);});}));
    geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.landscape.dispose();this.environment.dispose();this.renderer.dispose();
  }
}
