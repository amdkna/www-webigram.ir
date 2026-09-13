import{A as e,B as t,C as n,D as r,E as i,F as a,G as o,J as s,N as c,O as l,P as u,Q as d,R as f,S as p,T as m,V as h,W as g,X as _,Y as v,Z as y,_ as b,_t as x,a as S,at as C,c as w,d as T,dt as E,f as D,gt as O,h as k,i as A,it as j,j as M,k as N,l as P,n as F,o as I,ot as L,pt as R,q as z,r as B,rt as V,s as H,st as U,t as W,u as G,ut as K,vt as q,x as J,yt as Y}from"./RoomEnvironment.C6J9DBsj.js";var X={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new k(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`},Z=class e extends I{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new O(256,256):new O(e.x,e.y),this.clearColor=new k(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new q(i,a,{type:l}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new q(i,a,{type:l});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new q(i,a,{type:l});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),a=Math.round(a/2)}let o=X;this.highPassUniforms=R.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new C({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let s=[6,10,14,18,22];i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new O(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new x(1,1,1),new x(1,1,1),new x(1,1,1),new x(1,1,1),new x(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=R.clone(H.uniforms),this.blendMaterial=new C({uniforms:this.copyUniforms,vertexShader:H.vertexShader,fragmentShader:H.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new k,this._oldClearAlpha=1,this._basic=new h,this._fsQuad=new S(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new O(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);return new C({defines:{KERNEL_RADIUS:e},uniforms:{colorTexture:{value:null},invSize:{value:new O(.5,.5)},direction:{value:new O(.5,.5)},gaussianCoefficients:{value:t}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {

					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;

					for ( int i = 1; i < KERNEL_RADIUS; i ++ ) {

						float x = float( i );
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * w;

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new C({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}};Z.BlurDirectionX=new O(1,0),Z.BlurDirectionY=new O(0,1);var Q=Math.PI*2,$=f.clamp,ee=e=>e*e*(3-2*e);function te(e,t,r,i){let a=new L;a.absarc(0,0,e+t/2,0,i,!1),a.absarc(0,0,e-t/2,i,0,!0),a.closePath();let o=new n(a,{depth:r,steps:1,bevelEnabled:!0,bevelSize:.025,bevelThickness:.025,bevelSegments:3,curveSegments:30});return o.translate(0,0,-r/2),o}var ne=`
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
`,re=`
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
`,ie=class{canvas;renderer;scene=new j;camera=new v(37,1,.1,70);root=new r;assembly=new r;center=new r;rings=[];parts=[];orbit=new r;dust;composer=null;bloom=null;environment;frame=0;previousTime=0;elapsed=0;progress=0;currentProgress=0;paused=!1;destroyed=!1;exploded=!1;expansion=0;mobile=!1;pixelRatio=1;adaptiveFrames=0;slowFrames=0;yaw=0;pitch=0;targetYaw=0;targetPitch=0;cursor=new O;smoothCursor=new O;lamp=new y(14352243,12,12,2);metal=new g({color:11055010,metalness:1,roughness:.23,clearcoat:1,clearcoatRoughness:.15});darkMetal=new g({color:2568484,metalness:.95,roughness:.3,clearcoat:.65});ceramic=new g({color:14936281,metalness:.78,roughness:.18,clearcoat:1});lightMaterial=new o({color:15073198,emissive:13238091,emissiveIntensity:3.2,metalness:.1,roughness:.25});kernelMaterial=new C({uniforms:{uTime:{value:0},uColor:{value:new k(13107031)}},vertexShader:ne,fragmentShader:re});wireOverlay;onFatal;constructor(n,r,i=!1){this.canvas=n,this.onFatal=r,this.paused=i,this.renderer=new P({canvas:n,antialias:!0,powerPreference:`high-performance`,alpha:!1}),this.renderer.setClearColor(1053201),this.renderer.toneMapping=4,this.renderer.toneMappingExposure=1.18,this.renderer.outputColorSpace=V,this.scene.fog=new m(1053201,.039),this.camera.position.set(0,.15,11.8);let o=new W,s=new t(new _(9,3),new h({color:new k(6,6.5,4.8)}));s.position.set(0,5,-2),s.rotation.x=Math.PI/2,o.add(s);let l=new w(this.renderer);this.environment=l.fromScene(o,.03),this.scene.environment=this.environment.texture,this.scene.environmentIntensity=1.7,o.dispose(),l.dispose();let u=new J(15856347,4.5);u.position.set(4,7,6);let d=new J(13959060,3.4);d.position.set(-6,2,-4);let f=new J(12700638,1.7);f.position.set(-5,-1,5),this.scene.add(u,d,f,new N(14739407,1119247,.8)),this.lamp.position.set(0,1,1),this.assembly.add(this.lamp),this.root.add(this.assembly),this.scene.add(this.root),this.buildAssembly(),this.buildCore(),this.buildOrbit(),this.buildPedestal(),this.dust=this.buildParticles(),this.scene.add(this.dust);let p=new e(.97,2);this.wireOverlay=new a(new Y(p),new c({color:14221154,transparent:!0,opacity:.22})),p.dispose(),this.center.add(this.wireOverlay),this.wireOverlay.visible=!1,this.resize(),this.canvas.addEventListener(`webglcontextlost`,this.contextLost),document.addEventListener(`visibilitychange`,this.visibilityChanged),this.requestFrame()}buildAssembly(){let e=[1.32,1.77,2.24],n=[.17,.2,.23],i=Math.PI/2-.09,a=new b(.027,.027,.026,8);a.rotateX(Math.PI/2);let o=new G(.018,.075,.02);e.forEach((e,s)=>{let c=new r;this.rings.push(c),this.assembly.add(c);let l=te(e,.21+s*.025,n[s],i),u=new t(new K(e,.037,10,144),this.darkMetal);u.position.z=-n[s]/2-.065,c.add(u);let d=new t(new K(e-.1,.012,8,180),this.lightMaterial);d.position.z=-.1,c.add(d);for(let u=0;u<4;u++){let d=new r,f=u*Math.PI/2+.045;d.rotation.z=f;let p=new t(l,s===1?this.darkMetal:this.metal);d.add(p);let m=new t(new K(e,.015,8,48,i-.1),this.lightMaterial);m.rotation.z=.05,m.position.z=n[s]/2+.028,d.add(m);let h=m.clone();h.position.z*=-1,d.add(h);let g=new M(a,this.ceramic,8),_=new z;for(let t=0;t<8;t++){let r=.09+t%4*(i-.18)/3;_.position.set(Math.cos(r)*e,Math.sin(r)*e,(t<4?1:-1)*(n[s]/2+.03)),_.updateMatrix(),g.setMatrixAt(t,_.matrix)}d.add(g);let v=new M(o,this.ceramic,16);for(let t=0;t<16;t++){let r=.14+t*(i-.28)/15;_.position.set(Math.cos(r)*(e+.075),Math.sin(r)*(e+.075),n[s]/2+.027),_.rotation.z=r-Math.PI/2,_.scale.set(1,t%4==0?1:.5,1),_.updateMatrix(),v.setMatrixAt(t,_.matrix)}d.add(v),c.add(d);let y=f+i/2;this.parts.push({mesh:d,origin:new x,direction:new x(Math.cos(y)*.45,Math.sin(y)*.45,(s-1)*.4),layer:s})}let f=new t(new b(.105,.105,.32,24),this.ceramic);f.rotation.x=Math.PI/2,f.position.set(e,0,0),c.add(f);let p=f.clone();p.position.x=-e,c.add(p)})}buildCore(){this.assembly.add(this.center);let r=new t(new U(.65,64,48),this.kernelMaterial);this.center.add(r);let i=new t(new E(.69,.075,192,12,2,3),this.ceramic);i.rotation.x=.4,this.center.add(i);let a=new M(new e(.044,1),this.lightMaterial,36),o=new z;for(let e=0;e<36;e++){let t=1-e/35*2,n=Math.sqrt(1-t*t),r=e*Math.PI*(3-Math.sqrt(5));o.position.set(Math.cos(r)*n*.92,t*.92,Math.sin(r)*n*.92),o.updateMatrix(),a.setMatrixAt(e,o.matrix)}this.center.add(a);let s=new L;[[-.49,.3],[-.32,-.3],[-.12,.12],[.07,-.3],[.51,.3],[.34,.3],[.1,-.05],[-.1,.35],[-.29,-.05],[-.35,.3]].forEach(([e,t],n)=>n===0?s.moveTo(e,t):s.lineTo(e,t)),s.closePath();let c=new t(new n(s,{depth:.08,bevelEnabled:!0,bevelSize:.018,bevelThickness:.018,bevelSegments:3,steps:1}),this.ceramic);c.position.z=.69,this.center.add(c)}buildOrbit(){this.assembly.add(this.orbit);let e=new s(.12,0);for(let n=0;n<8;n++){let i=new r,a=n/8*Q;i.position.set(Math.cos(a)*2.9,Math.sin(a)*2.9,Math.sin(a*3)*.25),i.add(new t(e,n%3==0?this.lightMaterial:this.metal));let o=new t(new K(.2,.01,6,30),this.darkMetal);o.rotation.x=Math.PI/3,i.add(o),this.orbit.add(i)}let n=new p(0,0,2.9,2.9,0,Q,!1,0).getPoints(180).map(e=>new x(e.x,e.y,0)),i=new u(new D().setFromPoints(n),new c({color:10862217,transparent:!0,opacity:.16}));this.orbit.add(i),this.orbit.rotation.set(.65,.2,0)}buildPedestal(){let e=new r;e.position.y=-2.9,[[2,.06,0],[1.74,.1,.065],[1.25,.018,.126]].forEach(([n,r,i],a)=>{let o=new t(new b(n,n+.025,r,96),a===2?this.metal:this.darkMetal);o.position.y=i,e.add(o)});let n=new t(new K(1.83,.009,8,160),this.lightMaterial);n.rotation.x=Math.PI/2,n.position.y=.052,e.add(n);let a=new r;for(let e=.6;e<1.8;e+=.25){let n=new t(new K(e,.005,4,100),this.metal);n.rotation.x=Math.PI/2,n.position.y=.145,a.add(n)}e.add(a),this.root.add(e);let o=new t(new _(7,7),new C({transparent:!0,depthWrite:!1,vertexShader:`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec2 vUv; void main(){float d=length((vUv-.5)*2.0); gl_FragColor=vec4(0.0,0.0,0.0,pow(max(0.0,1.0-d),2.6)*.75);}`}));o.rotation.x=-Math.PI/2,o.position.y=-3,this.root.add(o);let s=new i(80,60,3556652,2502689);s.position.y=-3.1,s.material.transparent=!0,s.material.opacity=.14,this.scene.add(s)}buildParticles(){let e=1400,t=new Float32Array(e*3),n=new Float32Array(e),r=608,i=()=>(r=r*1664525+1013904223>>>0,r/4294967296);for(let r=0;r<e;r++)t[r*3]=(i()-.5)*28,t[r*3+1]=(i()-.5)*15,t[r*3+2]=-i()*16-1,n[r]=.3+i()*1.3;let a=new D;return a.setAttribute(`position`,new T(t,3)),a.setAttribute(`aSize`,new T(n,1)),new d(a,new C({transparent:!0,depthWrite:!1,blending:2,vertexShader:`attribute float aSize; varying float vAlpha; void main(){vec4 p=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(aSize*14.0/-p.z,.5,2.8); vAlpha=aSize*.23; gl_Position=projectionMatrix*p;}`,fragmentShader:`varying float vAlpha; void main(){float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(.68,.8,.48,vAlpha*(1.0-d*2.0));}`}))}resize(){if(this.destroyed)return;let e=window.innerWidth,t=window.innerHeight;this.mobile=e<=700,this.camera.aspect=e/t,this.camera.fov=this.mobile?44:37,this.camera.updateProjectionMatrix(),this.pixelRatio=Math.min(window.devicePixelRatio||1,this.mobile?1.25:1.6),this.renderer.setPixelRatio(this.pixelRatio),this.renderer.setSize(e,t,!1),!this.mobile&&!this.composer&&(this.composer=new A(this.renderer),this.composer.addPass(new B(this.scene,this.camera)),this.bloom=new Z(new O(e,t),.3,.4,1.15),this.composer.addPass(this.bloom),this.composer.addPass(new F)),this.composer&&(this.composer.setPixelRatio(this.pixelRatio),this.composer.setSize(e,t)),this.requestFrame()}setProgress(e){this.progress=$(e,0,3),this.requestFrame()}setExploded(e){this.exploded=e,this.requestFrame()}setPointer(e,t){this.cursor.set(e,t),this.paused||this.requestFrame()}rotate(e,t){this.targetYaw+=e,this.targetPitch=$(this.targetPitch+t,-.8,.8),this.requestFrame()}reset(){this.targetYaw=0,this.targetPitch=0,this.exploded=!1,this.requestFrame()}setPaused(e){this.paused=e,this.previousTime=0,this.frame&&=(cancelAnimationFrame(this.frame),0),this.requestFrame()}setFinish(e){let t=e===`wire`,n=e===`pearl`;this.metal.color.set(n?15920862:t?12970656:11055010),this.metal.metalness=n?.12:1,this.metal.roughness=n?.3:.23,this.darkMetal.color.set(n?11184282:t?9614965:2568484),this.darkMetal.metalness=n?.35:.95,this.metal.wireframe=t,this.darkMetal.wireframe=t,this.ceramic.wireframe=t,this.wireOverlay.visible=t,this.scene.environmentIntensity=n?1.2:1.7,this.requestFrame()}requestFrame(){!this.frame&&!this.destroyed&&!document.hidden&&(this.frame=requestAnimationFrame(this.render))}render=e=>{if(this.frame=0,this.destroyed||document.hidden)return;let t=this.previousTime?(e-this.previousTime)/1e3:1/60,n=Math.min(t,.05);this.previousTime=e;let r=this.paused?1:1-Math.exp(-n*5.5);this.paused||(this.elapsed+=n);let i=this.elapsed;this.currentProgress=f.lerp(this.currentProgress,this.progress,r),this.yaw=f.lerp(this.yaw,this.targetYaw,r),this.pitch=f.lerp(this.pitch,this.targetPitch,r),this.smoothCursor.lerp(this.paused?new O:this.cursor,r*.4);let a=this.currentProgress,o=Math.min(2,Math.floor(a)),s=ee(a-o),c=e=>f.lerp(e[o],e[o+1],s),l=2*Math.tan(f.degToRad(this.camera.fov)/2)*this.camera.position.z*this.camera.aspect,u=this.mobile?Math.min(.72,l/7.4):Math.min(1.05,l/11.6),d=this.mobile?0:c([.225,-.235,.24,0])*l,p=this.mobile?c([-1.9,-2.15,-2,2.25]):c([.12,.22,.2,2.35]),m=c([1,.83,.9,.7]);this.root.position.set(d,p,0),this.root.scale.setScalar(u*m),this.assembly.rotation.set(.1+this.pitch+this.smoothCursor.y*.045,-.2+this.yaw+this.smoothCursor.x*.13+c([0,.6,-.6,.15]),-.13),this.assembly.position.y=Math.sin(i*.65)*.065;let h=this.exploded?1.5:c([0,1.3,.08,.4]);this.expansion=f.lerp(this.expansion,h,r),this.rings.forEach((e,t)=>{let n=[[.64,.1,-.4],[1.08,-.65,.85],[-.38,.62,-.28]];e.rotation.set(n[t][0]+Math.sin(i*.15+t)*.12,n[t][1]+i*[.07,-.1,.045][t],n[t][2]+Math.sin(i*.1+t)*.14),e.position.z=(t-1)*this.expansion*.55}),this.parts.forEach(e=>e.mesh.position.copy(e.origin).addScaledVector(e.direction,this.expansion)),this.center.rotation.set(Math.sin(i*.16)*.1,Math.sin(i*.22)*.3,0),this.kernelMaterial.uniforms.uTime.value=i,this.orbit.rotation.set(.65+Math.sin(i*.14)*.15,.2,i*.055),this.orbit.scale.setScalar(1+this.expansion*.07),this.orbit.children.forEach((e,t)=>{t<8&&(e.rotation.x=i*.2+t,e.rotation.y=i*.3)}),this.dust.rotation.y=i*.006,this.lamp.intensity=10+Math.sin(i*.9)*2;try{this.composer&&!this.mobile?this.composer.render(n):this.renderer.render(this.scene,this.camera)}catch{this.onFatal(),this.dispose();return}!this.paused&&this.adaptiveFrames<180&&(this.adaptiveFrames++,t>.034&&this.slowFrames++,this.adaptiveFrames===180&&this.slowFrames>65&&(this.pixelRatio=1,this.renderer.setPixelRatio(1),this.composer?.setPixelRatio(1),this.bloom&&(this.bloom.enabled=!1))),this.paused||this.requestFrame()};contextLost=e=>{e.preventDefault(),this.frame&&cancelAnimationFrame(this.frame),this.frame=0,this.onFatal()};visibilityChanged=()=>{document.hidden?(this.frame&&cancelAnimationFrame(this.frame),this.frame=0):(this.previousTime=0,this.requestFrame())};dispose(){if(this.destroyed)return;this.destroyed=!0,this.frame&&cancelAnimationFrame(this.frame),this.canvas.removeEventListener(`webglcontextlost`,this.contextLost),document.removeEventListener(`visibilitychange`,this.visibilityChanged);let e=new Set,t=new Set;this.scene.traverse(n=>{let r=n;r.geometry&&e.add(r.geometry),r.material&&(Array.isArray(r.material)?r.material:[r.material]).forEach(e=>t.add(e))}),e.forEach(e=>e.dispose()),t.forEach(e=>e.dispose()),this.composer?.passes.forEach(e=>e.dispose()),this.composer?.dispose(),this.environment.dispose(),this.renderer.dispose()}};export{ie as OrbitalScene};