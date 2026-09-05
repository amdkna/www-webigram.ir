import{B as e,C as t,D as n,F as r,G as i,H as a,I as o,L as s,M as c,N as l,O as u,P as d,Q as f,R as p,S as m,T as h,U as g,V as _,X as v,Y as y,Z as b,_ as x,a as S,at as C,b as w,ct as T,f as E,g as D,h as ee,i as te,k as O,l as k,lt as A,m as j,n as ne,nt as M,o as N,ot as P,q as F,r as I,rt as L,st as R,t as re,tt as ie,u as ae,w as z,x as B,y as V,z as H}from"./RoomEnvironment.BREUNrGd.js";var U={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`},W=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},G=new H(-1,1,1,-1,0,1),K=new class extends N{constructor(){super(),this.setAttribute(`position`,new x([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new x([0,2,0,0,2,0],2))}},q=class{constructor(e){this._mesh=new l(K,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,G)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},oe=class extends W{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof v?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=C.clone(e.uniforms),this.material=new v({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new q(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},J=class extends W{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},se=class extends W{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},ce=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new P);this._width=n.width,this._height=n.height,t=new T(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:m}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new oe(U),this.copyPass.material.blending=0,this.timer=new ie}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}J!==void 0&&(r instanceof J?n=!0:r instanceof se&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new P);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},le=class extends W{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new k}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},ue={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new k(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`},Y=class e extends W{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new P(256,256):new P(e.x,e.y),this.clearColor=new k(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new T(i,a,{type:m}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new T(i,a,{type:m});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new T(i,a,{type:m});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),a=Math.round(a/2)}let o=ue;this.highPassUniforms=C.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new v({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let s=[6,10,14,18,22];i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new P(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new R(1,1,1),new R(1,1,1),new R(1,1,1),new R(1,1,1),new R(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=C.clone(U.uniforms),this.blendMaterial=new v({uniforms:this.copyUniforms,vertexShader:U.vertexShader,fragmentShader:U.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new k,this._oldClearAlpha=1,this._basic=new d,this._fsQuad=new q(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new P(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);return new v({defines:{KERNEL_RADIUS:e},uniforms:{colorTexture:{value:null},invSize:{value:new P(.5,.5)},direction:{value:new P(.5,.5)},gaussianCoefficients:{value:t}},vertexShader:`

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

				}`})}_getCompositeMaterial(e){return new v({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

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

				}`})}};Y.BlurDirectionX=new P(1,0),Y.BlurDirectionY=new P(0,1);var X={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`},de=class extends W{constructor(){super(),this.isOutputPass=!0,this.uniforms=C.clone(X.uniforms),this.material=new i({name:X.name,uniforms:this.uniforms,vertexShader:X.vertexShader,fragmentShader:X.fragmentShader}),this._fsQuad=new q(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},ae.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Z=Math.PI*2,Q=c.clamp,$=e=>e*e*(3-2*e);function fe(e,t,n,r){let i=new b;i.absarc(0,0,e+t/2,0,r,!1),i.absarc(0,0,e-t/2,r,0,!0),i.closePath();let a=new D(i,{depth:n,steps:1,bevelEnabled:!0,bevelSize:.025,bevelThickness:.025,bevelSegments:3,curveSegments:30});return a.translate(0,0,-n/2),a}var pe=`
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
`,me=`
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
`,he=class{canvas;renderer;scene=new y;camera=new e(37,1,.1,70);root=new B;assembly=new B;center=new B;rings=[];parts=[];orbit=new B;dust;composer=null;bloom=null;environment;frame=0;previousTime=0;elapsed=0;progress=0;currentProgress=0;paused=!1;destroyed=!1;exploded=!1;expansion=0;mobile=!1;pixelRatio=1;adaptiveFrames=0;slowFrames=0;yaw=0;pitch=0;targetYaw=0;targetPitch=0;cursor=new P;smoothCursor=new P;lamp=new a(14352243,12,12,2);metal=new r({color:11055010,metalness:1,roughness:.23,clearcoat:1,clearcoatRoughness:.15});darkMetal=new r({color:2568484,metalness:.95,roughness:.3,clearcoat:.65});ceramic=new r({color:14936281,metalness:.78,roughness:.18,clearcoat:1});lightMaterial=new o({color:15073198,emissive:13238091,emissiveIntensity:3.2,metalness:.1,roughness:.25});kernelMaterial=new v({uniforms:{uTime:{value:0},uColor:{value:new k(13107031)}},vertexShader:pe,fragmentShader:me});wireOverlay;onFatal;constructor(e,r,i=!1){this.canvas=e,this.onFatal=r,this.paused=i,this.renderer=new I({canvas:e,antialias:!0,powerPreference:`high-performance`,alpha:!1}),this.renderer.setClearColor(1053201),this.renderer.toneMapping=4,this.renderer.toneMappingExposure=1.18,this.renderer.outputColorSpace=F,this.scene.fog=new V(1053201,.039),this.camera.position.set(0,.15,11.8);let a=new re,o=new l(new _(9,3),new d({color:new k(6,6.5,4.8)}));o.position.set(0,5,-2),o.rotation.x=Math.PI/2,a.add(o);let s=new ne(this.renderer);this.environment=s.fromScene(a,.03),this.scene.environment=this.environment.texture,this.scene.environmentIntensity=1.7,a.dispose(),s.dispose();let c=new j(15856347,4.5);c.position.set(4,7,6);let u=new j(13959060,3.4);u.position.set(-6,2,-4);let f=new j(12700638,1.7);f.position.set(-5,-1,5),this.scene.add(c,u,f,new t(14739407,1119247,.8)),this.lamp.position.set(0,1,1),this.assembly.add(this.lamp),this.root.add(this.assembly),this.scene.add(this.root),this.buildAssembly(),this.buildCore(),this.buildOrbit(),this.buildPedestal(),this.dust=this.buildParticles(),this.scene.add(this.dust);let p=new z(.97,2);this.wireOverlay=new O(new A(p),new n({color:14221154,transparent:!0,opacity:.22})),p.dispose(),this.center.add(this.wireOverlay),this.wireOverlay.visible=!1,this.resize(),this.canvas.addEventListener(`webglcontextlost`,this.contextLost),document.addEventListener(`visibilitychange`,this.visibilityChanged),this.requestFrame()}buildAssembly(){let e=[1.32,1.77,2.24],t=[.17,.2,.23],n=Math.PI/2-.09,r=new E(.027,.027,.026,8);r.rotateX(Math.PI/2);let i=new te(.018,.075,.02);e.forEach((e,a)=>{let o=new B;this.rings.push(o),this.assembly.add(o);let c=fe(e,.21+a*.025,t[a],n),u=new l(new M(e,.037,10,144),this.darkMetal);u.position.z=-t[a]/2-.065,o.add(u);let d=new l(new M(e-.1,.012,8,180),this.lightMaterial);d.position.z=-.1,o.add(d);for(let u=0;u<4;u++){let d=new B,f=u*Math.PI/2+.045;d.rotation.z=f;let p=new l(c,a===1?this.darkMetal:this.metal);d.add(p);let m=new l(new M(e,.015,8,48,n-.1),this.lightMaterial);m.rotation.z=.05,m.position.z=t[a]/2+.028,d.add(m);let g=m.clone();g.position.z*=-1,d.add(g);let _=new h(r,this.ceramic,8),v=new s;for(let r=0;r<8;r++){let i=.09+r%4*(n-.18)/3;v.position.set(Math.cos(i)*e,Math.sin(i)*e,(r<4?1:-1)*(t[a]/2+.03)),v.updateMatrix(),_.setMatrixAt(r,v.matrix)}d.add(_);let y=new h(i,this.ceramic,16);for(let r=0;r<16;r++){let i=.14+r*(n-.28)/15;v.position.set(Math.cos(i)*(e+.075),Math.sin(i)*(e+.075),t[a]/2+.027),v.rotation.z=i-Math.PI/2,v.scale.set(1,r%4==0?1:.5,1),v.updateMatrix(),y.setMatrixAt(r,v.matrix)}d.add(y),o.add(d);let b=f+n/2;this.parts.push({mesh:d,origin:new R,direction:new R(Math.cos(b)*.45,Math.sin(b)*.45,(a-1)*.4),layer:a})}let f=new l(new E(.105,.105,.32,24),this.ceramic);f.rotation.x=Math.PI/2,f.position.set(e,0,0),o.add(f);let p=f.clone();p.position.x=-e,o.add(p)})}buildCore(){this.assembly.add(this.center);let e=new l(new f(.65,64,48),this.kernelMaterial);this.center.add(e);let t=new l(new L(.69,.075,192,12,2,3),this.ceramic);t.rotation.x=.4,this.center.add(t);let n=new h(new z(.044,1),this.lightMaterial,36),r=new s;for(let e=0;e<36;e++){let t=1-e/35*2,i=Math.sqrt(1-t*t),a=e*Math.PI*(3-Math.sqrt(5));r.position.set(Math.cos(a)*i*.92,t*.92,Math.sin(a)*i*.92),r.updateMatrix(),n.setMatrixAt(e,r.matrix)}this.center.add(n);let i=new b;[[-.49,.3],[-.32,-.3],[-.12,.12],[.07,-.3],[.51,.3],[.34,.3],[.1,-.05],[-.1,.35],[-.29,-.05],[-.35,.3]].forEach(([e,t],n)=>n===0?i.moveTo(e,t):i.lineTo(e,t)),i.closePath();let a=new l(new D(i,{depth:.08,bevelEnabled:!0,bevelSize:.018,bevelThickness:.018,bevelSegments:3,steps:1}),this.ceramic);a.position.z=.69,this.center.add(a)}buildOrbit(){this.assembly.add(this.orbit);let e=new p(.12,0);for(let t=0;t<8;t++){let n=new B,r=t/8*Z;n.position.set(Math.cos(r)*2.9,Math.sin(r)*2.9,Math.sin(r*3)*.25),n.add(new l(e,t%3==0?this.lightMaterial:this.metal));let i=new l(new M(.2,.01,6,30),this.darkMetal);i.rotation.x=Math.PI/3,n.add(i),this.orbit.add(n)}let t=new ee(0,0,2.9,2.9,0,Z,!1,0).getPoints(180).map(e=>new R(e.x,e.y,0)),r=new u(new N().setFromPoints(t),new n({color:10862217,transparent:!0,opacity:.16}));this.orbit.add(r),this.orbit.rotation.set(.65,.2,0)}buildPedestal(){let e=new B;e.position.y=-2.9,[[2,.06,0],[1.74,.1,.065],[1.25,.018,.126]].forEach(([t,n,r],i)=>{let a=new l(new E(t,t+.025,n,96),i===2?this.metal:this.darkMetal);a.position.y=r,e.add(a)});let t=new l(new M(1.83,.009,8,160),this.lightMaterial);t.rotation.x=Math.PI/2,t.position.y=.052,e.add(t);let n=new B;for(let e=.6;e<1.8;e+=.25){let t=new l(new M(e,.005,4,100),this.metal);t.rotation.x=Math.PI/2,t.position.y=.145,n.add(t)}e.add(n),this.root.add(e);let r=new l(new _(7,7),new v({transparent:!0,depthWrite:!1,vertexShader:`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`varying vec2 vUv; void main(){float d=length((vUv-.5)*2.0); gl_FragColor=vec4(0.0,0.0,0.0,pow(max(0.0,1.0-d),2.6)*.75);}`}));r.rotation.x=-Math.PI/2,r.position.y=-3,this.root.add(r);let i=new w(80,60,3556652,2502689);i.position.y=-3.1,i.material.transparent=!0,i.material.opacity=.14,this.scene.add(i)}buildParticles(){let e=1400,t=new Float32Array(e*3),n=new Float32Array(e),r=608,i=()=>(r=r*1664525+1013904223>>>0,r/4294967296);for(let r=0;r<e;r++)t[r*3]=(i()-.5)*28,t[r*3+1]=(i()-.5)*15,t[r*3+2]=-i()*16-1,n[r]=.3+i()*1.3;let a=new N;return a.setAttribute(`position`,new S(t,3)),a.setAttribute(`aSize`,new S(n,1)),new g(a,new v({transparent:!0,depthWrite:!1,blending:2,vertexShader:`attribute float aSize; varying float vAlpha; void main(){vec4 p=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(aSize*14.0/-p.z,.5,2.8); vAlpha=aSize*.23; gl_Position=projectionMatrix*p;}`,fragmentShader:`varying float vAlpha; void main(){float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(.68,.8,.48,vAlpha*(1.0-d*2.0));}`}))}resize(){if(this.destroyed)return;let e=window.innerWidth,t=window.innerHeight;this.mobile=e<=700,this.camera.aspect=e/t,this.camera.fov=this.mobile?44:37,this.camera.updateProjectionMatrix(),this.pixelRatio=Math.min(window.devicePixelRatio||1,this.mobile?1.25:1.6),this.renderer.setPixelRatio(this.pixelRatio),this.renderer.setSize(e,t,!1),!this.mobile&&!this.composer&&(this.composer=new ce(this.renderer),this.composer.addPass(new le(this.scene,this.camera)),this.bloom=new Y(new P(e,t),.3,.4,1.15),this.composer.addPass(this.bloom),this.composer.addPass(new de)),this.composer&&(this.composer.setPixelRatio(this.pixelRatio),this.composer.setSize(e,t)),this.requestFrame()}setProgress(e){this.progress=Q(e,0,3),this.requestFrame()}setExploded(e){this.exploded=e,this.requestFrame()}setPointer(e,t){this.cursor.set(e,t),this.paused||this.requestFrame()}rotate(e,t){this.targetYaw+=e,this.targetPitch=Q(this.targetPitch+t,-.8,.8),this.requestFrame()}reset(){this.targetYaw=0,this.targetPitch=0,this.exploded=!1,this.requestFrame()}setPaused(e){this.paused=e,this.previousTime=0,this.frame&&=(cancelAnimationFrame(this.frame),0),this.requestFrame()}setFinish(e){let t=e===`wire`,n=e===`pearl`;this.metal.color.set(n?15920862:t?12970656:11055010),this.metal.metalness=n?.12:1,this.metal.roughness=n?.3:.23,this.darkMetal.color.set(n?11184282:t?9614965:2568484),this.darkMetal.metalness=n?.35:.95,this.metal.wireframe=t,this.darkMetal.wireframe=t,this.ceramic.wireframe=t,this.wireOverlay.visible=t,this.scene.environmentIntensity=n?1.2:1.7,this.requestFrame()}requestFrame(){!this.frame&&!this.destroyed&&!document.hidden&&(this.frame=requestAnimationFrame(this.render))}render=e=>{if(this.frame=0,this.destroyed||document.hidden)return;let t=this.previousTime?(e-this.previousTime)/1e3:1/60,n=Math.min(t,.05);this.previousTime=e;let r=this.paused?1:1-Math.exp(-n*5.5);this.paused||(this.elapsed+=n);let i=this.elapsed;this.currentProgress=c.lerp(this.currentProgress,this.progress,r),this.yaw=c.lerp(this.yaw,this.targetYaw,r),this.pitch=c.lerp(this.pitch,this.targetPitch,r),this.smoothCursor.lerp(this.paused?new P:this.cursor,r*.4);let a=this.currentProgress,o=Math.min(2,Math.floor(a)),s=$(a-o),l=e=>c.lerp(e[o],e[o+1],s),u=2*Math.tan(c.degToRad(this.camera.fov)/2)*this.camera.position.z*this.camera.aspect,d=this.mobile?Math.min(.72,u/7.4):Math.min(1.05,u/11.6),f=this.mobile?0:l([.225,-.235,.24,0])*u,p=this.mobile?l([-1.9,-2.15,-2,2.25]):l([.12,.22,.2,2.35]),m=l([1,.83,.9,.7]);this.root.position.set(f,p,0),this.root.scale.setScalar(d*m),this.assembly.rotation.set(.1+this.pitch+this.smoothCursor.y*.045,-.2+this.yaw+this.smoothCursor.x*.13+l([0,.6,-.6,.15]),-.13),this.assembly.position.y=Math.sin(i*.65)*.065;let h=this.exploded?1.5:l([0,1.3,.08,.4]);this.expansion=c.lerp(this.expansion,h,r),this.rings.forEach((e,t)=>{let n=[[.64,.1,-.4],[1.08,-.65,.85],[-.38,.62,-.28]];e.rotation.set(n[t][0]+Math.sin(i*.15+t)*.12,n[t][1]+i*[.07,-.1,.045][t],n[t][2]+Math.sin(i*.1+t)*.14),e.position.z=(t-1)*this.expansion*.55}),this.parts.forEach(e=>e.mesh.position.copy(e.origin).addScaledVector(e.direction,this.expansion)),this.center.rotation.set(Math.sin(i*.16)*.1,Math.sin(i*.22)*.3,0),this.kernelMaterial.uniforms.uTime.value=i,this.orbit.rotation.set(.65+Math.sin(i*.14)*.15,.2,i*.055),this.orbit.scale.setScalar(1+this.expansion*.07),this.orbit.children.forEach((e,t)=>{t<8&&(e.rotation.x=i*.2+t,e.rotation.y=i*.3)}),this.dust.rotation.y=i*.006,this.lamp.intensity=10+Math.sin(i*.9)*2;try{this.composer&&!this.mobile?this.composer.render(n):this.renderer.render(this.scene,this.camera)}catch{this.onFatal(),this.dispose();return}!this.paused&&this.adaptiveFrames<180&&(this.adaptiveFrames++,t>.034&&this.slowFrames++,this.adaptiveFrames===180&&this.slowFrames>65&&(this.pixelRatio=1,this.renderer.setPixelRatio(1),this.composer?.setPixelRatio(1),this.bloom&&(this.bloom.enabled=!1))),this.paused||this.requestFrame()};contextLost=e=>{e.preventDefault(),this.frame&&cancelAnimationFrame(this.frame),this.frame=0,this.onFatal()};visibilityChanged=()=>{document.hidden?(this.frame&&cancelAnimationFrame(this.frame),this.frame=0):(this.previousTime=0,this.requestFrame())};dispose(){if(this.destroyed)return;this.destroyed=!0,this.frame&&cancelAnimationFrame(this.frame),this.canvas.removeEventListener(`webglcontextlost`,this.contextLost),document.removeEventListener(`visibilitychange`,this.visibilityChanged);let e=new Set,t=new Set;this.scene.traverse(n=>{let r=n;r.geometry&&e.add(r.geometry),r.material&&(Array.isArray(r.material)?r.material:[r.material]).forEach(e=>t.add(e))}),e.forEach(e=>e.dispose()),t.forEach(e=>e.dispose()),this.composer?.passes.forEach(e=>e.dispose()),this.composer?.dispose(),this.environment.dispose(),this.renderer.dispose()}};export{he as OrbitalScene};