import{$ as e,A as t,B as n,D as r,G as i,H as a,I as o,K as s,L as c,M as l,N as u,O as d,Q as f,R as p,U as m,V as h,W as g,X as _,Y as v,Z as y,_ as b,_t as x,a as S,at as C,b as w,c as T,ct as E,d as D,et as O,f as ee,ft as k,g as A,gt as j,h as M,ht as N,i as te,it as P,j as ne,k as re,l as ie,lt as ae,m as F,mt as I,n as L,nt as R,o as oe,p as se,pt as z,q as ce,r as le,rt as B,s as ue,st as V,t as de,tt as fe,u as H,ut as U,v as pe,vt as W,w as me,x as he,y as ge,z as G}from"./RoomEnvironment.C6J9DBsj.js";var K={name:`GTAOShader`,defines:{PERSPECTIVE_CAMERA:1,SAMPLES:16,NORMAL_VECTOR_TYPE:1,DEPTH_SWIZZLING:`x`,SCREEN_SPACE_RADIUS:0,SCREEN_SPACE_RADIUS_SCALE:100,SCENE_CLIP_BOX:0},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new j},cameraNear:{value:null},cameraFar:{value:null},cameraProjectionMatrix:{value:new G},cameraProjectionMatrixInverse:{value:new G},cameraWorldMatrix:{value:new G},radius:{value:.25},distanceExponent:{value:1},thickness:{value:1},distanceFallOff:{value:1},scale:{value:1},sceneBoxMin:{value:new x(-1,-1,-1)},sceneBoxMax:{value:new x(1,1,1)}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		varying vec2 vUv;
		uniform highp sampler2D tNormal;
		uniform highp sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraProjectionMatrixInverse;
		uniform mat4 cameraWorldMatrix;
		uniform float radius;
		uniform float distanceExponent;
		uniform float thickness;
		uniform float distanceFallOff;
		uniform float scale;
		#if SCENE_CLIP_BOX == 1
			uniform vec3 sceneBoxMin;
			uniform vec3 sceneBoxMax;
		#endif

		#include <common>
		#include <packing>

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(vec3(ao), 1.)
		#endif

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				vec4 clipSpacePosition = vec4( vec2( screenPosition ) * 2.0 - 1.0, depth, 1.0 );
			#else
				vec4 clipSpacePosition = vec4( vec3( screenPosition, depth ) * 2.0 - 1.0, 1.0 );
			#endif
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}

		float getDepth(const vec2 uv) {
			return textureLod(tDepth, uv.xy, 0.0).DEPTH_SWIZZLING;
		}

		float fetchDepth(const ivec2 uv) {
			return texelFetch(tDepth, uv.xy, 0).DEPTH_SWIZZLING;
		}

		float getViewZ(const in float depth) {
			#if PERSPECTIVE_CAMERA == 1
				return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
			#else
				return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ? ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz : -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ? ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz : -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
			#if NORMAL_VECTOR_TYPE == 2
				return normalize(textureLod(tNormal, uv, 0.).rgb);
			#elif NORMAL_VECTOR_TYPE == 1
				return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
			#else
				return computeNormalFromDepth(uv);
			#endif
		}

		vec3 getSceneUvAndDepth(vec3 sampleViewPos) {
			vec4 sampleClipPos = cameraProjectionMatrix * vec4(sampleViewPos, 1.);
			vec2 sampleUv = sampleClipPos.xy / sampleClipPos.w * 0.5 + 0.5;
			float sampleSceneDepth = getDepth(sampleUv);
			return vec3(sampleUv, sampleSceneDepth);
		}

		void main() {
			float depth = getDepth(vUv.xy);

			#ifdef USE_REVERSED_DEPTH_BUFFER
				if (depth <= 0.0) {
					discard;
					return;
				}
			#else
				if (depth >= 1.0) {
					discard;
					return;
				}
			#endif
			
			vec3 viewPos = getViewPosition(vUv, depth);
			vec3 viewNormal = getViewNormal(vUv);

			float radiusToUse = radius;
			float distanceFalloffToUse = thickness;
			#if SCREEN_SPACE_RADIUS == 1
				float radiusScale = getViewPosition(vec2(0.5 + float(SCREEN_SPACE_RADIUS_SCALE) / resolution.x, 0.0), depth).x;
				radiusToUse *= radiusScale;
				distanceFalloffToUse *= radiusScale;
			#endif

			#if SCENE_CLIP_BOX == 1
				vec3 worldPos = (cameraWorldMatrix * vec4(viewPos, 1.0)).xyz;
				float boxDistance = length(max(vec3(0.0), max(sceneBoxMin - worldPos, worldPos - sceneBoxMax)));
				if (boxDistance > radiusToUse) {
					discard;
					return;
				}
			#endif

			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
			vec3 randomVec = noiseTexel.xyz * 2.0 - 1.0;
			vec3 tangent = normalize(vec3(randomVec.xy, 0.));
			vec3 bitangent = vec3(-tangent.y, tangent.x, 0.);
			mat3 kernelMatrix = mat3(tangent, bitangent, vec3(0., 0., 1.));

			const int DIRECTIONS = SAMPLES < 30 ? 3 : 5;
			const int STEPS = (SAMPLES + DIRECTIONS - 1) / DIRECTIONS;
			float ao = 0.0;
			for (int i = 0; i < DIRECTIONS; ++i) {

				float angle = float(i) / float(DIRECTIONS) * PI;
				vec4 sampleDir = vec4(cos(angle), sin(angle), 0., 0.5 + 0.5 * noiseTexel.w);
				sampleDir.xyz = normalize(kernelMatrix * sampleDir.xyz);

				vec3 viewDir = normalize(-viewPos.xyz);
				vec3 sliceBitangent = normalize(cross(sampleDir.xyz, viewDir));
				vec3 sliceTangent = cross(sliceBitangent, viewDir);
				vec3 normalInSlice = normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent));

				vec3 tangentToNormalInSlice = cross(normalInSlice, sliceBitangent);
				vec2 cosHorizons = vec2(dot(viewDir, tangentToNormalInSlice), dot(viewDir, -tangentToNormalInSlice));

				for (int j = 0; j < STEPS; ++j) {
					vec3 sampleViewOffset = sampleDir.xyz * radiusToUse * sampleDir.w * pow(float(j + 1) / float(STEPS), distanceExponent);

					vec3 sampleSceneUvDepth = getSceneUvAndDepth(viewPos + sampleViewOffset);
					vec3 sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					vec3 viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.x += max(0., (sampleCosHorizon - cosHorizons.x) * mix(1., 2. / float(j + 2), distanceFallOff));
					}

					sampleSceneUvDepth = getSceneUvAndDepth(viewPos - sampleViewOffset);
					sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.y += max(0., (sampleCosHorizon - cosHorizons.y) * mix(1., 2. / float(j + 2), distanceFallOff));
					}
				}

				vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);
				float nx = dot(normalInSlice, sliceTangent);
				float ny = dot(normalInSlice, viewDir);
				float nxb = 1. / 2. * (acos(cosHorizons.y) - acos(cosHorizons.x) + sinHorizons.x * cosHorizons.x - sinHorizons.y * cosHorizons.y);
				float nyb = 1. / 2. * (2. - cosHorizons.x * cosHorizons.x - cosHorizons.y * cosHorizons.y);
				float occlusion = nx * nxb + ny * nyb;
				ao += occlusion;
			}

			ao = clamp(ao / float(DIRECTIONS), 0., 1.);
		#if SCENE_CLIP_BOX == 1
			ao = mix(ao, 1., smoothstep(0., radiusToUse, boxDistance));
		#endif
			ao = pow(ao, scale);

			gl_FragColor = FRAGMENT_OUTPUT;
		}`},q={name:`GTAODepthShader`,defines:{PERSPECTIVE_CAMERA:1},uniforms:{tDepth:{value:null},cameraNear:{value:null},cameraFar:{value:null}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform sampler2D tDepth;
		uniform float cameraNear;
		uniform float cameraFar;
		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 screenPosition ) {
			#if PERSPECTIVE_CAMERA == 1
				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			#else
				return texture2D( tDepth, screenPosition ).x;
			#endif
		}

		void main() {
			float depth = getLinearDepth( vUv );
			gl_FragColor = vec4( vec3( 1.0 - depth ), 1.0 );

		}`},J={name:`GTAOBlendShader`,uniforms:{tDiffuse:{value:null},intensity:{value:1}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform float intensity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;

		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = vec4(mix(vec3(1.), texel.rgb, intensity), texel.a);
		}`};function _e(e=5){let t=Math.floor(e)%2==0?Math.floor(e)+1:Math.floor(e),n=ve(t),r=n.length,i=new Uint8Array(r*4);for(let e=0;e<r;++e){let t=n[e],a=2*Math.PI*t/r,o=new x(Math.cos(a),Math.sin(a),0).normalize();i[e*4]=(o.x*.5+.5)*255,i[e*4+1]=(o.y*.5+.5)*255,i[e*4+2]=127,i[e*4+3]=255}let a=new pe(i,t,t);return a.wrapS=R,a.wrapT=R,a.needsUpdate=!0,a}function ve(e){let t=Math.floor(e)%2==0?Math.floor(e)+1:Math.floor(e),n=t*t,r=Array(n).fill(0),i=Math.floor(t/2),a=t-1;for(let e=1;e<=n;){if(i===-1&&a===t?(a=t-2,i=0):(a===t&&(a=0),i<0&&(i=t-1)),r[i*t+a]!==0){a-=2,i++;continue}r[i*t+a]=e++,a++,i--}return r}var ye={name:`PoissonDenoiseShader`,defines:{SAMPLES:16,SAMPLE_VECTORS:be(16,2,1),NORMAL_VECTOR_TYPE:1,DEPTH_VALUE_SOURCE:0},uniforms:{tDiffuse:{value:null},tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new j},cameraProjectionMatrixInverse:{value:new G},lumaPhi:{value:5},depthPhi:{value:5},normalPhi:{value:5},radius:{value:4},index:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`

		varying vec2 vUv;

		uniform sampler2D tDiffuse;
		uniform sampler2D tNormal;
		uniform sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform mat4 cameraProjectionMatrixInverse;
		uniform float lumaPhi;
		uniform float depthPhi;
		uniform float normalPhi;
		uniform float radius;
		uniform int index;

		#include <common>
		#include <packing>

		#ifndef SAMPLE_LUMINANCE
		#define SAMPLE_LUMINANCE dot(vec3(0.2125, 0.7154, 0.0721), a)
		#endif

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(denoised, 1.)
		#endif

		float getLuminance(const in vec3 a) {
			return SAMPLE_LUMINANCE;
		}

		const vec3 poissonDisk[SAMPLES] = SAMPLE_VECTORS;

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				vec4 clipSpacePosition = vec4( vec2( screenPosition ) * 2.0 - 1.0, depth, 1.0 );
			#else
				vec4 clipSpacePosition = vec4( vec3( screenPosition, depth ) * 2.0 - 1.0, 1.0 );
			#endif
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}

		float getDepth(const vec2 uv) {
		#if DEPTH_VALUE_SOURCE == 1
			return textureLod(tDepth, uv.xy, 0.0).a;
		#else
			return textureLod(tDepth, uv.xy, 0.0).r;
		#endif
		}

		float fetchDepth(const ivec2 uv) {
			#if DEPTH_VALUE_SOURCE == 1
				return texelFetch(tDepth, uv.xy, 0).a;
			#else
				return texelFetch(tDepth, uv.xy, 0).r;
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ?  ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz
									: -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ?  ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz
									: -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
		#if NORMAL_VECTOR_TYPE == 2
			return normalize(textureLod(tNormal, uv, 0.).rgb);
		#elif NORMAL_VECTOR_TYPE == 1
			return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
		#else
			return computeNormalFromDepth(uv);
		#endif
		}

		void denoiseSample(in vec3 center, in vec3 viewNormal, in vec3 viewPos, in vec2 sampleUv, inout vec3 denoised, inout float totalWeight) {
			vec4 sampleTexel = textureLod(tDiffuse, sampleUv, 0.0);
			float sampleDepth = getDepth(sampleUv);
			vec3 sampleNormal = getViewNormal(sampleUv);
			vec3 neighborColor = sampleTexel.rgb;
			vec3 viewPosSample = getViewPosition(sampleUv, sampleDepth);

			float normalDiff = dot(viewNormal, sampleNormal);
			float normalSimilarity = pow(max(normalDiff, 0.), normalPhi);
			float lumaDiff = abs(getLuminance(neighborColor) - getLuminance(center));
			float lumaSimilarity = max(1.0 - lumaDiff / lumaPhi, 0.0);
			float depthDiff = abs(dot(viewPos - viewPosSample, viewNormal));
			float depthSimilarity = max(1. - depthDiff / depthPhi, 0.);
			float w = lumaSimilarity * depthSimilarity * normalSimilarity;

			denoised += w * neighborColor;
			totalWeight += w;
		}

		void main() {
			float depth = getDepth(vUv.xy);
			vec3 viewNormal = getViewNormal(vUv);
			if (depth == 1. || dot(viewNormal, viewNormal) == 0.) {
				discard;
				return;
			}
			vec4 texel = textureLod(tDiffuse, vUv, 0.0);
			vec3 center = texel.rgb;
			vec3 viewPos = getViewPosition(vUv, depth);

			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
      		vec2 noiseVec = vec2(sin(noiseTexel[index % 4] * 2. * PI), cos(noiseTexel[index % 4] * 2. * PI));
    		mat2 rotationMatrix = mat2(noiseVec.x, -noiseVec.y, noiseVec.x, noiseVec.y);

			float totalWeight = 1.0;
			vec3 denoised = texel.rgb;
			for (int i = 0; i < SAMPLES; i++) {
				vec3 sampleDir = poissonDisk[i];
				vec2 offset = rotationMatrix * (sampleDir.xy * (1. + sampleDir.z * (radius - 1.)) / resolution);
				vec2 sampleUv = vUv + offset;
				denoiseSample(center, viewNormal, viewPos, sampleUv, denoised, totalWeight);
			}

			if (totalWeight > 0.) {
				denoised /= totalWeight;
			}
			gl_FragColor = FRAGMENT_OUTPUT;
		}`};function be(e,t,n){let r=xe(e,t,n),i=`vec3[SAMPLES](`;for(let t=0;t<e;t++){let n=r[t];i+=`vec3(${n.x}, ${n.y}, ${n.z})${t<e-1?`,`:`)`}`}return i}function xe(e,t,n){let r=[];for(let i=0;i<e;i++){let a=2*Math.PI*t*i/e,o=(i/(e-1))**n;r.push(new x(Math.cos(a),Math.sin(a),o))}return r}var Se=class{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let t=0;t<256;t++)this.p[t]=Math.floor(e.random()*256);this.perm=[];for(let e=0;e<512;e++)this.perm[e]=this.p[e&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}noise(e,t){let n,r,i,a=.5*(Math.sqrt(3)-1),o=(e+t)*a,s=Math.floor(e+o),c=Math.floor(t+o),l=(3-Math.sqrt(3))/6,u=(s+c)*l,d=s-u,f=c-u,p=e-d,m=t-f,h,g;p>m?(h=1,g=0):(h=0,g=1);let _=p-h+l,v=m-g+l,y=p-1+2*l,b=m-1+2*l,x=s&255,S=c&255,C=this.perm[x+this.perm[S]]%12,w=this.perm[x+h+this.perm[S+g]]%12,T=this.perm[x+1+this.perm[S+1]]%12,E=.5-p*p-m*m;E<0?n=0:(E*=E,n=E*E*this._dot(this.grad3[C],p,m));let D=.5-_*_-v*v;D<0?r=0:(D*=D,r=D*D*this._dot(this.grad3[w],_,v));let O=.5-y*y-b*b;return O<0?i=0:(O*=O,i=O*O*this._dot(this.grad3[T],y,b)),70*(n+r+i)}noise3d(e,t,n){let r,i,a,o,s=(e+t+n)*(1/3),c=Math.floor(e+s),l=Math.floor(t+s),u=Math.floor(n+s),d=1/6,f=(c+l+u)*d,p=c-f,m=l-f,h=u-f,g=e-p,_=t-m,v=n-h,y,b,x,S,C,w;g>=_?_>=v?(y=1,b=0,x=0,S=1,C=1,w=0):g>=v?(y=1,b=0,x=0,S=1,C=0,w=1):(y=0,b=0,x=1,S=1,C=0,w=1):_<v?(y=0,b=0,x=1,S=0,C=1,w=1):g<v?(y=0,b=1,x=0,S=0,C=1,w=1):(y=0,b=1,x=0,S=1,C=1,w=0);let T=g-y+d,E=_-b+d,D=v-x+d,O=g-S+2*d,ee=_-C+2*d,k=v-w+2*d,A=g-1+3*d,j=_-1+3*d,M=v-1+3*d,N=c&255,te=l&255,P=u&255,ne=this.perm[N+this.perm[te+this.perm[P]]]%12,re=this.perm[N+y+this.perm[te+b+this.perm[P+x]]]%12,ie=this.perm[N+S+this.perm[te+C+this.perm[P+w]]]%12,ae=this.perm[N+1+this.perm[te+1+this.perm[P+1]]]%12,F=.6-g*g-_*_-v*v;F<0?r=0:(F*=F,r=F*F*this._dot3(this.grad3[ne],g,_,v));let I=.6-T*T-E*E-D*D;I<0?i=0:(I*=I,i=I*I*this._dot3(this.grad3[re],T,E,D));let L=.6-O*O-ee*ee-k*k;L<0?a=0:(L*=L,a=L*L*this._dot3(this.grad3[ie],O,ee,k));let R=.6-A*A-j*j-M*M;return R<0?o=0:(R*=R,o=R*R*this._dot3(this.grad3[ae],A,j,M)),32*(r+i+a+o)}noise4d(e,t,n,r){let i=this.grad4,a=this.simplex,o=this.perm,s=(Math.sqrt(5)-1)/4,c=(5-Math.sqrt(5))/20,l,u,d,f,p,m=(e+t+n+r)*s,h=Math.floor(e+m),g=Math.floor(t+m),_=Math.floor(n+m),v=Math.floor(r+m),y=(h+g+_+v)*c,b=h-y,x=g-y,S=_-y,C=v-y,w=e-b,T=t-x,E=n-S,D=r-C,O=w>T?32:0,ee=w>E?16:0,k=T>E?8:0,A=w>D?4:0,j=T>D?2:0,M=+(E>D),N=O+ee+k+A+j+M,te=+(a[N][0]>=3),P=+(a[N][1]>=3),ne=+(a[N][2]>=3),re=+(a[N][3]>=3),ie=+(a[N][0]>=2),ae=+(a[N][1]>=2),F=+(a[N][2]>=2),I=+(a[N][3]>=2),L=+(a[N][0]>=1),R=+(a[N][1]>=1),oe=+(a[N][2]>=1),se=+(a[N][3]>=1),z=w-te+c,ce=T-P+c,le=E-ne+c,B=D-re+c,ue=w-ie+2*c,V=T-ae+2*c,de=E-F+2*c,fe=D-I+2*c,H=w-L+3*c,U=T-R+3*c,pe=E-oe+3*c,W=D-se+3*c,me=w-1+4*c,he=T-1+4*c,ge=E-1+4*c,G=D-1+4*c,K=h&255,q=g&255,J=_&255,_e=v&255,ve=o[K+o[q+o[J+o[_e]]]]%32,ye=o[K+te+o[q+P+o[J+ne+o[_e+re]]]]%32,be=o[K+ie+o[q+ae+o[J+F+o[_e+I]]]]%32,xe=o[K+L+o[q+R+o[J+oe+o[_e+se]]]]%32,Se=o[K+1+o[q+1+o[J+1+o[_e+1]]]]%32,Y=.6-w*w-T*T-E*E-D*D;Y<0?l=0:(Y*=Y,l=Y*Y*this._dot4(i[ve],w,T,E,D));let X=.6-z*z-ce*ce-le*le-B*B;X<0?u=0:(X*=X,u=X*X*this._dot4(i[ye],z,ce,le,B));let Ce=.6-ue*ue-V*V-de*de-fe*fe;Ce<0?d=0:(Ce*=Ce,d=Ce*Ce*this._dot4(i[be],ue,V,de,fe));let Z=.6-H*H-U*U-pe*pe-W*W;Z<0?f=0:(Z*=Z,f=Z*Z*this._dot4(i[xe],H,U,pe,W));let Q=.6-me*me-he*he-ge*ge-G*G;return Q<0?p=0:(Q*=Q,p=Q*Q*this._dot4(i[Se],me,he,ge,G)),27*(l+u+d+f+p)}_dot(e,t,n){return e[0]*t+e[1]*n}_dot3(e,t,n,r){return e[0]*t+e[1]*n+e[2]*r}_dot4(e,t,n,r,i){return e[0]*t+e[1]*n+e[2]*r+e[3]*i}},Y=class e extends oe{constructor(e,t,n=512,r=512,i,a,o){super(),this.width=n,this.height=r,this.clear=!0,this.camera=t,this.scene=e,this.output=0,this._renderGBuffer=!0,this._visibilityCache=[],this.blendIntensity=1,this.pdRings=2,this.pdRadiusExponent=2,this.pdSamples=16,this.gtaoNoiseTexture=_e(),this.pdNoiseTexture=this._generateNoise(),this.gtaoRenderTarget=new W(this.width,this.height,{type:d}),this.pdRenderTarget=this.gtaoRenderTarget.clone(),this.gtaoMaterial=new C({defines:Object.assign({},K.defines),uniforms:z.clone(K.uniforms),vertexShader:K.vertexShader,fragmentShader:K.fragmentShader,blending:0,depthTest:!1,depthWrite:!1}),this.gtaoMaterial.defines.PERSPECTIVE_CAMERA=+!!this.camera.isPerspectiveCamera,this.gtaoMaterial.uniforms.tNoise.value=this.gtaoNoiseTexture,this.gtaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.normalMaterial=new m,this.normalMaterial.blending=0,this.pdMaterial=new C({defines:Object.assign({},ye.defines),uniforms:z.clone(ye.uniforms),vertexShader:ye.vertexShader,fragmentShader:ye.fragmentShader,depthTest:!1,depthWrite:!1}),this.pdMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.pdMaterial.uniforms.tNoise.value=this.pdNoiseTexture,this.pdMaterial.uniforms.resolution.value.set(this.width,this.height),this.pdMaterial.uniforms.lumaPhi.value=10,this.pdMaterial.uniforms.depthPhi.value=2,this.pdMaterial.uniforms.normalPhi.value=3,this.pdMaterial.uniforms.radius.value=8,this.depthRenderMaterial=new C({defines:Object.assign({},q.defines),uniforms:z.clone(q.uniforms),vertexShader:q.vertexShader,fragmentShader:q.fragmentShader,blending:0}),this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new C({uniforms:z.clone(ue.uniforms),vertexShader:ue.vertexShader,fragmentShader:ue.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:208,blendDst:200,blendEquation:100,blendSrcAlpha:206,blendDstAlpha:200,blendEquationAlpha:100}),this.blendMaterial=new C({uniforms:z.clone(J.uniforms),vertexShader:J.vertexShader,fragmentShader:J.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blending:5,blendSrc:208,blendDst:200,blendEquation:100,blendSrcAlpha:206,blendDstAlpha:200,blendEquationAlpha:100}),this._fsQuad=new S(null),this._originalClearColor=new M,this.setGBuffer(i?i.depthTexture:void 0,i?i.normalTexture:void 0),a!==void 0&&this.updateGtaoMaterial(a),o!==void 0&&this.updatePdMaterial(o)}setSize(e,t){this.width=e,this.height=t,this.gtaoRenderTarget.setSize(e,t),this.normalRenderTarget.setSize(e,t),this.pdRenderTarget.setSize(e,t),this.gtaoMaterial.uniforms.resolution.value.set(e,t),this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.pdMaterial.uniforms.resolution.value.set(e,t),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)}dispose(){this.gtaoNoiseTexture.dispose(),this.pdNoiseTexture.dispose(),this.normalRenderTarget.dispose(),this.gtaoRenderTarget.dispose(),this.pdRenderTarget.dispose(),this.normalMaterial.dispose(),this.pdMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this._fsQuad.dispose()}get gtaoMap(){return this.pdRenderTarget.texture}setGBuffer(e,t){e===void 0?(this.depthTexture=new w,this.depthTexture.format=ge,this.depthTexture.type=N,this.normalRenderTarget=new W(this.width,this.height,{minFilter:s,magFilter:s,type:d,depthTexture:this.depthTexture}),this.normalTexture=this.normalRenderTarget.texture,this._renderGBuffer=!0):(this.depthTexture=e,this.normalTexture=t,this._renderGBuffer=!1);let n=+!!this.normalTexture,r=this.depthTexture===this.normalTexture?`w`:`x`;this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE=n,this.gtaoMaterial.defines.DEPTH_SWIZZLING=r,this.gtaoMaterial.uniforms.tNormal.value=this.normalTexture,this.gtaoMaterial.uniforms.tDepth.value=this.depthTexture,this.pdMaterial.defines.NORMAL_VECTOR_TYPE=n,this.pdMaterial.defines.DEPTH_SWIZZLING=r,this.pdMaterial.uniforms.tNormal.value=this.normalTexture,this.pdMaterial.uniforms.tDepth.value=this.depthTexture,this.depthRenderMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture}setSceneClipBox(e){e?(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX!==1,this.gtaoMaterial.defines.SCENE_CLIP_BOX=1,this.gtaoMaterial.uniforms.sceneBoxMin.value.copy(e.min),this.gtaoMaterial.uniforms.sceneBoxMax.value.copy(e.max)):(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX===0,this.gtaoMaterial.defines.SCENE_CLIP_BOX=0)}updateGtaoMaterial(e){e.radius!==void 0&&(this.gtaoMaterial.uniforms.radius.value=e.radius),e.distanceExponent!==void 0&&(this.gtaoMaterial.uniforms.distanceExponent.value=e.distanceExponent),e.thickness!==void 0&&(this.gtaoMaterial.uniforms.thickness.value=e.thickness),e.distanceFallOff!==void 0&&(this.gtaoMaterial.uniforms.distanceFallOff.value=e.distanceFallOff,this.gtaoMaterial.needsUpdate=!0),e.scale!==void 0&&(this.gtaoMaterial.uniforms.scale.value=e.scale),e.samples!==void 0&&e.samples!==this.gtaoMaterial.defines.SAMPLES&&(this.gtaoMaterial.defines.SAMPLES=e.samples,this.gtaoMaterial.needsUpdate=!0),e.screenSpaceRadius!==void 0&&+!!e.screenSpaceRadius!==this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS&&(this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS=+!!e.screenSpaceRadius,this.gtaoMaterial.needsUpdate=!0)}updatePdMaterial(e){let t=!1;e.lumaPhi!==void 0&&(this.pdMaterial.uniforms.lumaPhi.value=e.lumaPhi),e.depthPhi!==void 0&&(this.pdMaterial.uniforms.depthPhi.value=e.depthPhi),e.normalPhi!==void 0&&(this.pdMaterial.uniforms.normalPhi.value=e.normalPhi),e.radius!==void 0&&e.radius!==this.radius&&(this.pdMaterial.uniforms.radius.value=e.radius),e.radiusExponent!==void 0&&e.radiusExponent!==this.pdRadiusExponent&&(this.pdRadiusExponent=e.radiusExponent,t=!0),e.rings!==void 0&&e.rings!==this.pdRings&&(this.pdRings=e.rings,t=!0),e.samples!==void 0&&e.samples!==this.pdSamples&&(this.pdSamples=e.samples,t=!0),t&&(this.pdMaterial.defines.SAMPLES=this.pdSamples,this.pdMaterial.defines.SAMPLE_VECTORS=be(this.pdSamples,this.pdRings,this.pdRadiusExponent),this.pdMaterial.needsUpdate=!0)}render(t,n,r){switch(this._renderGBuffer&&(this._overrideVisibility(),this._renderOverride(t,this.normalMaterial,this.normalRenderTarget,7829503,1),this._restoreVisibility()),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy(this.camera.matrixWorld),this._renderPass(t,this.gtaoMaterial,this.gtaoRenderTarget,16777215,1),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this._renderPass(t,this.pdMaterial,this.pdRenderTarget,16777215,1),this.output){case e.OUTPUT.Off:break;case e.OUTPUT.Diffuse:this.copyMaterial.uniforms.tDiffuse.value=r.texture,this.copyMaterial.blending=0,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:n);break;case e.OUTPUT.AO:this.copyMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.copyMaterial.blending=0,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:n);break;case e.OUTPUT.Denoise:this.copyMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.copyMaterial.blending=0,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:n);break;case e.OUTPUT.Depth:this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this._renderPass(t,this.depthRenderMaterial,this.renderToScreen?null:n);break;case e.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalRenderTarget.texture,this.copyMaterial.blending=0,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:n);break;case e.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=r.texture,this.copyMaterial.blending=0,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:n),this.blendMaterial.uniforms.intensity.value=this.blendIntensity,this.blendMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this._renderPass(t,this.blendMaterial,this.renderToScreen?null:n);break;default:console.warn(`THREE.GTAOPass: Unknown output type.`)}}_renderPass(e,t,n,r,i){e.getClearColor(this._originalClearColor);let a=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(n),e.autoClear=!1,r!=null&&(e.setClearColor(r),e.setClearAlpha(i||0),e.clear()),this._fsQuad.material=t,this._fsQuad.render(e),e.autoClear=o,e.setClearColor(this._originalClearColor),e.setClearAlpha(a)}_renderOverride(e,t,n,r,i){e.getClearColor(this._originalClearColor);let a=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(n),e.autoClear=!1,r=t.clearColor||r,i=t.clearAlpha||i,r!=null&&(e.setClearColor(r),e.setClearAlpha(i||0),e.clear()),this.scene.overrideMaterial=t,e.render(this.scene,this.camera),this.scene.overrideMaterial=null,e.autoClear=o,e.setClearColor(this._originalClearColor),e.setClearAlpha(a)}_overrideVisibility(){let e=this.scene,t=this._visibilityCache;e.traverse(function(e){(e.isPoints||e.isLine||e.isLine2)&&e.visible&&(e.visible=!1,t.push(e))})}_restoreVisibility(){let e=this._visibilityCache;for(let t=0;t<e.length;t++)e[t].visible=!0;e.length=0}_generateNoise(e=64){let t=new Se,n=e*e*4,r=new Uint8Array(n);for(let n=0;n<e;n++)for(let i=0;i<e;i++){let a=n,o=i;r[(n*e+i)*4]=(t.noise(a,o)*.5+.5)*255,r[(n*e+i)*4+1]=(t.noise(a+e,o)*.5+.5)*255,r[(n*e+i)*4+2]=(t.noise(a,o+e)*.5+.5)*255,r[(n*e+i)*4+3]=(t.noise(a+e,o+e)*.5+.5)*255}let i=new pe(r,e,e,O,I);return i.wrapS=R,i.wrapT=R,i.needsUpdate=!0,i}};Y.OUTPUT={Off:-1,Default:0,Diffuse:1,Depth:2,Normal:3,AO:4,Denoise:5};var X={name:`BokehShader`,defines:{DEPTH_PACKING:1,PERSPECTIVE_CAMERA:1},uniforms:{tColor:{value:null},tDepth:{value:null},focus:{value:1},aspect:{value:1},aperture:{value:.025},maxblur:{value:.01},nearClip:{value:1},farClip:{value:1e3}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		#include <common>

		varying vec2 vUv;

		uniform sampler2D tColor;
		uniform sampler2D tDepth;

		uniform float maxblur; // max blur amount
		uniform float aperture; // aperture - bigger values for shallower depth of field

		uniform float nearClip;
		uniform float farClip;

		uniform float focus;
		uniform float aspect;

		#include <packing>

		float getDepth( const in vec2 screenPosition ) {
			#if DEPTH_PACKING == 1
			return unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );
			#else
			return texture2D( tDepth, screenPosition ).x;
			#endif
		}

		float getViewZ( const in float depth ) {
			#if PERSPECTIVE_CAMERA == 1
			return perspectiveDepthToViewZ( depth, nearClip, farClip );
			#else
			return orthographicDepthToViewZ( depth, nearClip, farClip );
			#endif
		}


		void main() {

			vec2 aspectcorrect = vec2( 1.0, aspect );

			float viewZ = getViewZ( getDepth( vUv ) );

			float factor = ( focus + viewZ ); // viewZ is <= 0, so this is a difference equation

			vec2 dofblur = vec2 ( clamp( factor * aperture, -maxblur, maxblur ) );

			vec2 dofblur9 = dofblur * 0.9;
			vec2 dofblur7 = dofblur * 0.7;
			vec2 dofblur4 = dofblur * 0.4;

			vec4 col = vec4( 0.0 );

			col += texture2D( tColor, vUv.xy );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.15,  0.37 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37,  0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37, -0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15, -0.37 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15,  0.37 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37,  0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37, -0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.15, -0.37 ) * aspectcorrect ) * dofblur );

			col += texture2D( tColor, vUv.xy + ( vec2(  0.15,  0.37 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37,  0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37, -0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15, -0.37 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15,  0.37 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37,  0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37, -0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.15, -0.37 ) * aspectcorrect ) * dofblur9 );

			col += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur7 );

			col += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.4,   0.0  ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur4 );

			gl_FragColor = col / 41.0;
			gl_FragColor.a = 1.0;

		}`},Ce=class extends oe{constructor(t,n,r){super(),this.scene=t,this.camera=n;let i=r.focus===void 0?1:r.focus,o=r.aperture===void 0?.025:r.aperture,c=r.maxblur===void 0?1:r.maxblur;this._renderTargetDepth=new W(1,1,{minFilter:s,magFilter:s,type:d}),this._renderTargetDepth.texture.name=`BokehPass.depth`,this._materialDepth=new a,this._materialDepth.depthPacking=e,this._materialDepth.blending=0;let l=z.clone(X.uniforms);l.tDepth.value=this._renderTargetDepth.texture,l.focus.value=i,l.aspect.value=n.aspect,l.aperture.value=o,l.maxblur.value=c,l.nearClip.value=n.near,l.farClip.value=n.far,this.materialBokeh=new C({defines:Object.assign({},X.defines),uniforms:l,vertexShader:X.vertexShader,fragmentShader:X.fragmentShader}),this.uniforms=l,this._fsQuad=new S(this.materialBokeh),this._oldClearColor=new M}render(e,t,n){this.scene.overrideMaterial=this._materialDepth,e.getClearColor(this._oldClearColor);let r=e.getClearAlpha(),i=e.autoClear;e.autoClear=!1,e.setClearColor(16777215),e.setClearAlpha(1),e.setRenderTarget(this._renderTargetDepth),e.clear(),e.render(this.scene,this.camera),this.uniforms.tColor.value=n.texture,this.uniforms.nearClip.value=this.camera.near,this.uniforms.farClip.value=this.camera.far,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),e.clear(),this._fsQuad.render(e)),this.scene.overrideMaterial=null,e.setClearColor(this._oldClearColor),e.setClearAlpha(r),e.autoClear=i}setSize(e,t){this.materialBokeh.uniforms.aspect.value=e/t,this._renderTargetDepth.setSize(e,t)}dispose(){this._renderTargetDepth.dispose(),this._materialDepth.dispose(),this.materialBokeh.dispose(),this._fsQuad.dispose()}},Z=new x;function Q(e,t,n,r,i,a){let o=2*Math.PI*i/4,s=Math.max(a-2*i,0),c=Math.PI/4;Z.copy(t),Z[r]=0,Z.normalize();let l=.5*o/(o+s),u=1-Z.angleTo(e)/c;return Math.sign(Z[n])===1?u*l:s/(o+s)+l+l*(1-u)}var we=class e extends H{constructor(e=1,t=1,n=1,r=2,i=.1){let a=r*2+1;if(i=Math.min(e/2,t/2,n/2,i),super(1,1,1,a,a,a),this.type=`RoundedBoxGeometry`,this.parameters={width:e,height:t,depth:n,segments:r,radius:i},a===1)return;let o=this.toNonIndexed();this.index=null,this.attributes.position=o.attributes.position,this.attributes.normal=o.attributes.normal,this.attributes.uv=o.attributes.uv;let s=new x,c=new x,l=new x(e,t,n).divideScalar(2).subScalar(i),u=this.attributes.position.array,d=this.attributes.normal.array,f=this.attributes.uv.array,p=u.length/6,m=new x,h=.5/a;for(let r=0,a=0;r<u.length;r+=3,a+=2)switch(s.fromArray(u,r),c.copy(s),c.x-=Math.sign(c.x)*h,c.y-=Math.sign(c.y)*h,c.z-=Math.sign(c.z)*h,c.normalize(),u[r+0]=l.x*Math.sign(s.x)+c.x*i,u[r+1]=l.y*Math.sign(s.y)+c.y*i,u[r+2]=l.z*Math.sign(s.z)+c.z*i,d[r+0]=c.x,d[r+1]=c.y,d[r+2]=c.z,Math.floor(r/p)){case 0:m.set(1,0,0),f[a+0]=Q(m,c,`z`,`y`,i,n),f[a+1]=1-Q(m,c,`y`,`z`,i,t);break;case 1:m.set(-1,0,0),f[a+0]=1-Q(m,c,`z`,`y`,i,n),f[a+1]=1-Q(m,c,`y`,`z`,i,t);break;case 2:m.set(0,1,0),f[a+0]=1-Q(m,c,`x`,`z`,i,e),f[a+1]=Q(m,c,`z`,`x`,i,n);break;case 3:m.set(0,-1,0),f[a+0]=1-Q(m,c,`x`,`z`,i,e),f[a+1]=1-Q(m,c,`z`,`x`,i,n);break;case 4:m.set(0,0,1),f[a+0]=1-Q(m,c,`x`,`y`,i,e),f[a+1]=1-Q(m,c,`y`,`x`,i,t);break;case 5:m.set(0,0,-1),f[a+0]=Q(m,c,`x`,`y`,i,e),f[a+1]=1-Q(m,c,`y`,`x`,i,t)}}static fromJSON(t){return new e(t.width,t.height,t.depth,t.segments,t.radius)}},Te=p.clamp,$=p.lerp,Ee=e=>(e=Te(e,0,1),e*e*(3-2*e)),De=class{canvas;onFailure;renderer;scene=new P;camera=new v(38,1,.1,80);world=new r;surfaces=[];outline=new u({color:3224385,transparent:!0,opacity:.62});floating=[];curves=[];packets=[];bars=[];leaves=[];screenSurfaces=[];terrain=new P;terrainCamera=new v(43,16/9,.1,70);landscape;clouds=new r;daylight=new he(16773599,2.8);fill=new re(15265535,11840160,1);rim=new he(12104152,.65);deskLamp=new E(16766369,0,9,Math.PI/3,.65,2);screenGlow=new y(11450623,.55,5.5,2);bulb;steam;screenTexture;supportCanvas;environment;contactShadowMap;glassReflectionMap;ticks=0;previous=0;elapsed=0;progress=2;currentProgress=2;expansion=0;exploded=!1;night=!1;nightMix=0;paused;destroyed=!1;frame=0;yaw=0;pitch=0;userYaw=0;userPitch=0;cursor=new j;slowFrames=0;checkedFrames=0;constructor(e,t,n){this.canvas=e,this.onFailure=n,this.paused=t,this.renderer=new ie({canvas:e,antialias:!0,powerPreference:`high-performance`}),this.renderer.setClearColor(16118767),this.renderer.outputColorSpace=B,this.renderer.toneMapping=4,this.renderer.toneMappingExposure=.96,this.renderer.shadowMap.enabled=!0,this.renderer.shadowMap.type=2,this.scene.background=new M(16118767),this.scene.fog=new me(16118767,18,33),this.scene.add(this.world,this.daylight,this.fill,this.rim),this.daylight.position.set(-4.5,8.5,5.5),this.daylight.castShadow=!0;let r=window.innerWidth>820?2048:1024;this.daylight.shadow.mapSize.set(r,r),Object.assign(this.daylight.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:28}),this.daylight.shadow.normalBias=.015,this.daylight.shadow.bias=-18e-5,this.daylight.shadow.radius=3,this.rim.position.set(5,2.5,-5);let i=new de,a=new T(this.renderer);this.environment=a.fromScene(i,.09),this.scene.environment=this.environment.texture,this.scene.environmentIntensity=.5,i.dispose(),a.dispose(),this.landscape=new W(768,432,{depthBuffer:!0}),this.buildLandscape(),this.buildDesk(),this.buildDevices();let o=this.buildPanels();this.supportCanvas=o.canvas,this.screenTexture=o.texture,this.bulb=this.buildLamp(),this.steam=this.buildCoffeeAndPlant(),this.scene.add(this.steam),this.world.add(this.deskLamp,this.screenGlow),this.deskLamp.position.set(2.7,.92,-.48),this.deskLamp.target.position.set(2.1,-1.9,.15),this.world.add(this.deskLamp.target),this.screenGlow.position.set(.1,.35,1.08),this.resize(),this.canvas.addEventListener(`webglcontextlost`,this.contextLost),document.addEventListener(`visibilitychange`,this.visibilityChange),this.requestFrame()}material(e,t=.1,n=.4){let r=new g({color:e,metalness:t,roughness:n,clearcoat:t>.5?.12:.05,clearcoatRoughness:.34});return this.surfaces.push({material:r,color:new M(e),metalness:t,roughness:n}),r}mesh(e,t,r,i=[0,0,0],a=!0){let o=new n(e,t);return o.position.set(...i),o.castShadow=!0,o.receiveShadow=!0,r.add(o),o}box(e,t,n,r=.08){return new we(e,t,n,3,Math.min(r,e/3,t/3,n/3))}floatingObject(e,t){this.floating.push({group:e,origin:e.position.clone(),phase:t})}surfaceTexture(e){let t=new Uint8Array(262144);for(let n=0;n<256;n++)for(let r=0;r<256;r++){let i=((Math.imul(r+17,374761393)^Math.imul(n+31,668265263))>>>0)%997/997,a=Math.sin(n*.42+Math.sin(r*.027)*2.8+Math.sin(r*.009)*5),o=e===`wood`?.53+a*.16+i*.12:e===`metal`?.64+Math.sin(n*2.8)*.065+i*.08:e===`fabric`?.45+(r%4<2==n%4<2?.18:0)+i*.1:.62+i*.16,s=(n*256+r)*4,c=Math.round(Te(o,0,1)*255);t[s]=t[s+1]=t[s+2]=c,t[s+3]=255}let n=new pe(t,256,256,O);return n.wrapS=n.wrapT=R,n.magFilter=o,n.minFilter=c,n.generateMipmaps=!0,n.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy()),n.repeat.set(e===`wood`?2:e===`metal`?1:8,e===`wood`?5:e===`metal`?3:8),n.needsUpdate=!0,n}detailedMaterial(e,t,n,r){let i=this.material(e,t,n),a=this.surfaceTexture(r);return i.bumpMap=a,i.bumpScale=r===`wood`?.018:r===`fabric`?.007:.0025,i.roughnessMap=a,r===`wood`?(i.map=a,i.clearcoat=.13,i.clearcoatRoughness=.5):r===`metal`?(i.anisotropy=.52,i.anisotropyRotation=Math.PI/2,i.clearcoat=.08):r===`fabric`?(i.sheen=.28,i.sheenRoughness=.9,i.sheenColor.set(15330815)):(i.clearcoat=.5,i.clearcoatRoughness=.24),i}cable(e,t,n,r=.018){let i=new F(t.map(e=>new x(e[0],e[1],e[2])));return this.mesh(new k(i,40,r,8,!1),n,e,[0,0,0],!1)}glassTexture(){if(this.glassReflectionMap)return this.glassReflectionMap;let e=document.createElement(`canvas`);e.width=256,e.height=256;let t=e.getContext(`2d`);t.clearRect(0,0,256,256);let n=t.createLinearGradient(18,230,238,22);n.addColorStop(0,`rgba(255,255,255,0)`),n.addColorStop(.38,`rgba(255,255,255,.035)`),n.addColorStop(.49,`rgba(255,255,255,.22)`),n.addColorStop(.58,`rgba(255,255,255,.04)`),n.addColorStop(1,`rgba(255,255,255,0)`),t.fillStyle=n,t.fillRect(0,0,256,256);let r=new se(e);return r.colorSpace=B,r.needsUpdate=!0,this.glassReflectionMap=r,r}screenGlass(e,t,r,i,a=0){let o=new g({color:15200255,metalness:0,roughness:.08,clearcoat:1,clearcoatRoughness:.035,transparent:!0,opacity:.16,depthWrite:!1,envMapIntensity:1.7,ior:1.48,transmission:.08,thickness:.018}),s=this.mesh(new _(t,r),o,e,[0,a,i],!1);s.castShadow=!1,s.receiveShadow=!1;let c=new n(new _(t*.985,r*.985),new h({map:this.glassTexture(),transparent:!0,opacity:.22,depthWrite:!1,toneMapped:!1}));c.position.set(0,a,i+.0025),c.castShadow=!1,c.receiveShadow=!1,c.renderOrder=3,e.add(c)}shadowTexture(){if(this.contactShadowMap)return this.contactShadowMap;let e=document.createElement(`canvas`);e.width=256,e.height=256;let t=e.getContext(`2d`),n=t.createRadialGradient(128,128,6,128,128,128);n.addColorStop(0,`rgba(22,20,24,.72)`),n.addColorStop(.34,`rgba(22,20,24,.42)`),n.addColorStop(.7,`rgba(22,20,24,.12)`),n.addColorStop(1,`rgba(22,20,24,0)`),t.fillStyle=n,t.fillRect(0,0,256,256);let r=new se(e);return r.needsUpdate=!0,this.contactShadowMap=r,r}contactShadow(e,t,r,i,a,o=.18){let s=new h({map:this.shadowTexture(),transparent:!0,opacity:o,depthWrite:!1,toneMapped:!1}),c=new n(new _(i,a),s);return c.rotation.x=-Math.PI/2,c.position.set(e,t,r),c.castShadow=!1,c.receiveShadow=!1,c.renderOrder=2,this.world.add(c),c}buildKeyboard(e,t){this.mesh(this.box(2.65,.09,.87),t,e);let r=this.detailedMaterial(16184559,0,.55,`ceramic`),i=[`ESC 1 2 3 4 5 6 7 8 9 0 − ⌫`,`TAB Q W E R T Y U I O P [ ]`,`CAP A S D F G H J K L ; ' ↵`,`⇧ Z X C V B N M , . / ↑ ⇧`].map(e=>e.split(` `)),a=new ne(this.box(.145,.05,.125,.018),r,52),o=new ce,s=document.createElement(`canvas`);s.width=1560,s.height=520;let c=s.getContext(`2d`);c.fillStyle=`#505565`,c.font=`500 26px Arial`,c.textAlign=`center`,c.textBaseline=`middle`;for(let e=0;e<4;e++)for(let t=0;t<13;t++){let n=(t-6)*.185,r=-.3+e*.145;o.position.set(n,.07,r),o.updateMatrix(),a.setMatrixAt(e*13+t,o.matrix),c.fillText(i[e][t]||``,(n/2.65+.5)*1560,(r/.87+.5)*520)}a.castShadow=a.receiveShadow=!0,e.add(a);for(let t of[-1.11,-.925,-.74,.74,.925,1.11])this.mesh(this.box(.145,.05,.125,.018),r,e,[t,.07,.28],!1);this.mesh(this.box(1.17,.05,.125,.018),r,e,[0,.07,.28],!1);let l=new se(s);l.colorSpace=B,l.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());let u=new n(new _(2.65,.87),new h({map:l,transparent:!0,depthWrite:!1,toneMapped:!1}));u.rotation.x=-Math.PI/2,u.position.y=.096,e.add(u)}buildDesk(){let e=this.detailedMaterial(15789802,0,.48,`ceramic`),t=this.detailedMaterial(12107726,.88,.3,`metal`),i=this.mesh(this.box(7.7,.2,3.55,.1),this.detailedMaterial(14599588,0,.5,`wood`),this.world,[0,-2,.1]);this.mesh(this.box(7.3,.075,3.15),t,i,[0,-.13,0]);for(let t of[-3.1,3.1])this.mesh(this.box(.14,1.8,2.3),e,this.world,[t,-3,.05]);let a=this.material(15328994,0,.94),o=new n(new _(200,200),a);o.rotation.x=-Math.PI/2,o.position.y=-3.95,o.receiveShadow=!0,o.castShadow=!1,this.world.add(o);let s=this.material(15657701,0,.92),c=new n(new _(30,14),s);c.position.set(0,1.15,-5.3),c.receiveShadow=!0,c.castShadow=!1,this.world.add(c),this.mesh(this.box(30,.16,.08,.025),e,this.world,[0,-3.84,-5.22],!1).castShadow=!1;let l=new r;l.position.set(0,-1.83,1.04),this.world.add(l);let u=this.mesh(this.box(4.35,.025,1.42,.055),this.detailedMaterial(5396839,0,.85,`fabric`),this.world,[.38,-1.885,.87],!1);this.mesh(this.box(4.3,.004,1.37,.05),this.detailedMaterial(6120820,0,.88,`fabric`),u,[0,.013,0],!1),this.buildKeyboard(l,t);let d=this.mesh(this.box(.38,.16,.63),e,this.world,[1.73,-1.78,1]);this.mesh(this.box(.02,.025,.13,.005),t,d,[0,.08,-.08]);let f=this.material(7040370,0,.75);this.cable(d,[[0,.08,-.27],[0,.081,-.1],[0,.08,.03]],f,.004);for(let e=0;e<7;e++)this.mesh(new H(.024,.003,.003),f,d,[0,.095,-.13+e*.015],!1);this.cable(this.world,[[0,-1.88,-.38],[.2,-1.89,-.8],[.8,-1.9,-1.3],[1.1,-2.25,-1.65],[1.2,-3.3,-1.65]],this.material(4080204,0,.8));let p=this.material(3749446,.3,.42),m=this.material(14990984,0,.7);[8479213,16102210].forEach((e,t)=>{let n=new r;n.position.set(-1.85+t*.34,-1.8,1.25),n.rotation.set(0,.35+t*.3,Math.PI/2),this.world.add(n),this.mesh(new b(.037,.037,1.32,6),this.material(e),n),this.mesh(new A(.038,.16,6),m,n,[0,.74,0]),this.mesh(new A(.014,.07,6),p,n,[0,.845,0])});let h=this.mesh(this.box(1.5,.035,.19,.01),this.material(13227756,.25,.2),this.world,[-.95,-1.86,1.55]);for(let e=0;e<15;e++)this.mesh(new H(.008,.006,e%5==0?.1:.055),p,h,[-.67+e*.095,.02,.035],!1);this.contactShadow(0,-1.894,.02,1.6,.85,.18),this.contactShadow(2.12,-1.894,1.08,1,.78,.18),this.contactShadow(1.73,-1.872,1,.58,.82,.14),this.contactShadow(-2.58,-1.893,1.15,.72,.72,.18),this.contactShadow(-3.28,-1.893,-.95,.8,.8,.18),this.contactShadow(3,-1.893,-.6,1,1,.18),this.contactShadow(0,-3.944,.05,7.2,3.7,.09)}buildDevices(){let e=this.detailedMaterial(11252415,.92,.29,`metal`),t=this.material(1317673,.12,.38),n=new r;n.position.set(0,.4,-.2),this.world.add(n),this.mesh(this.box(3.85,2.5,.18),e,n),this.mesh(this.box(3.74,2.38,.09),t,n,[0,.015,.1]),this.mesh(this.box(.19,1.05,.19),e,n,[0,-1.7,-.04]),this.mesh(this.box(1.2,.07,.65),e,n,[0,-2.265,.2]);let i=new h({map:this.landscape.texture,transparent:!0,toneMapped:!1});this.screenSurfaces.push(i),this.mesh(new _(3.52,1.98),i,n,[0,.11,.156],!1),[16608358,16764261,5623446].forEach((e,t)=>this.mesh(new V(.023,10,8),this.material(e),n,[-1.64+t*.095,1.17,.157],!1));let a=this.uiTexture(`Webigram`,`IDEAS, IN REAL LIFE`,`title`);this.mesh(new _(1.36,.26),new h({map:a.texture,transparent:!0,toneMapped:!1}),n,[0,-1.045,.159],!1),this.screenGlass(n,3.52,1.98,.16,.11);let o=this.material(1192777,.65,.1);this.mesh(new b(.037,.037,.014,24),t,n,[0,1.17,.155],!1).rotation.x=Math.PI/2,this.mesh(new V(.021,16,10),o,n,[0,1.17,.169],!1);let s=this.mesh(new V(.009,10,8),new h({color:11462865,toneMapped:!1}),n,[1.7,-1.12,.15],!1);s.castShadow=!1;let c=new ne(new H(.026,.12,.012),t,32),l=new ce;for(let e=0;e<32;e++)l.position.set((e-15.5)*.092,-.94,-.096),l.updateMatrix(),c.setMatrixAt(e,l.matrix);n.add(c);for(let r of[-1.68,1.68])for(let i of[-1.05,1.05])this.mesh(new b(.025,.025,.013,12),e,n,[r,i,-.1],!1).rotation.x=Math.PI/2,this.mesh(new H(.023,.004,.002),t,n,[r,i,-.108],!1);for(let e=0;e<3;e++)this.mesh(this.box(.18,.065,.016,.012),t,n,[-.55+e*.28,-.95,-.11],!1);this.floatingObject(n,0);let u=new r;u.position.set(2.12,-.86,1.14),u.rotation.set(-.08,-.23,-.06),this.world.add(u),this.mesh(this.box(.92,1.98,.15),e,u),this.mesh(this.box(.84,1.89,.075),t,u,[0,0,.085]);let d=new h({map:this.landscape.texture,transparent:!0,toneMapped:!1});this.screenSurfaces.push(d),this.mesh(new _(.75,1.6),d,u,[0,0,.13],!1),this.mesh(this.box(.28,.055,.01,.015),t,u,[0,.81,.145]),this.mesh(this.box(.24,.018,.01,.007),e,u,[0,-.84,.145]),this.mesh(this.box(.025,.27,.06,.009),e,u,[.465,.37,0]),this.screenGlass(u,.75,1.6,.134),this.mesh(new V(.025,16,10),o,u,[.095,.81,.156],!1),this.mesh(this.box(.023,.22,.035,.006),e,u,[-.468,.32,0],!1),this.mesh(this.box(.023,.16,.035,.006),e,u,[-.468,.04,0],!1),this.mesh(this.box(.15,.015,.045,.005),t,u,[0,-.993,0],!1);for(let e=0;e<5;e++)for(let n of[-1,1])this.mesh(new V(.008,8,6),t,u,[n*(.16+e*.035),-.995,0],!1);let f=this.mesh(this.box(.36,.43,.035,.055),e,u,[-.2,.63,-.095],!1);for(let e of[-.095,.095])this.mesh(new b(.075,.075,.025,24),t,f,[0,e,-.025],!1).rotation.x=Math.PI/2,this.mesh(new V(.052,16,10),o,f,[0,e,-.042],!1);this.mesh(this.box(.79,.045,.65,.08),e,this.world,[2.12,-1.875,1.08],!1),this.floatingObject(u,1.4)}uiTexture(e,t,n){let r=document.createElement(`canvas`);r.width=640,r.height=400;let i=r.getContext(`2d`);if(i.fillStyle=n===`title`?`#192237`:`#ffffff`,i.fillRect(0,0,640,400),i.fillStyle=n===`title`?`#e9eefa`:`#273354`,i.font=`600 39px Arial`,i.fillText(e,38,66),i.fillStyle=`#8b91ae`,i.font=`24px Arial`,i.fillText(t,38,106),n===`form`){for(let e=0;e<2;e++)i.fillStyle=`#f1f3fa`,i.beginPath(),i.roundRect(38,145+e*66,564,48,10),i.fill(),i.fillStyle=`#949bb4`,i.fillText(e?`Your email`:`Your name`,56,177+e*66);i.fillStyle=`#755bea`,i.beginPath(),i.roundRect(330,290,270,64,13),i.fill(),i.fillStyle=`white`,i.font=`600 27px Arial`,i.fillText(`Let’s create`,380,332)}else if(n===`design`)[`#7960ef`,`#52b8f5`,`#efb453`,`#59c8ac`].forEach((e,t)=>{i.fillStyle=e,i.beginPath(),i.roundRect(38+t*145,150,120,120,18),i.fill()}),i.fillStyle=`#eef0f7`,i.fillRect(38,307,430,13),i.fillRect(38,337,320,13);else if(n===`chat`)i.fillStyle=`#f1edff`,i.beginPath(),i.roundRect(38,150,515,83,18),i.fill(),i.fillStyle=`#7960ef`,i.font=`26px Arial`,i.fillText(`What shall we build?`,62,200),i.fillStyle=`#7960ef`,i.beginPath(),i.roundRect(166,256,434,83,18),i.fill(),i.fillStyle=`white`,i.fillText(`Something extraordinary.`,190,307);else if(n===`admin`){i.fillStyle=`#f1f3fa`,i.fillRect(38,140,105,220);for(let e=0;e<4;e++)i.fillStyle=`#b9bdd1`,i.fillRect(54,159+e*43,70,10);i.lineWidth=12,i.strokeStyle=`#8667ef`,i.beginPath(),i.arc(263,238,65,0,Math.PI*1.5),i.stroke();for(let e=0;e<5;e++)i.fillStyle=[`#aa97ed`,`#7c60e8`,`#60c5d6`][e%3],i.fillRect(382+e*39,300-e*21,24,45+e*21)}let a=new se(r);return a.colorSpace=B,a.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy()),{canvas:r,texture:a}}buildPanels(){let e=this.material(16185343,.03,.32),t=this.material(8478959,.06,.34),i;[[`UI / UX`,`A language of your own`,`design`,-2.26,2.34,-.6,1.78],[`Let’s connect`,`One idea starts it all`,`form`,1.23,2.72,-.65,1.68],[`Live support`,`Every conversation matters`,`chat`,-2.55,-.73,.8,1.65],[`Dashboard`,`Everything in one place`,`admin`,.36,-1.1,2.05,1.62]].forEach(([t,a,o,s,c,l,u],d)=>{let f=new r;f.position.set(s,c,l),f.rotation.y=d%2?-.08:.1,this.world.add(f),this.mesh(this.box(u,u*.625,.075,.06),e,f);let p=this.uiTexture(t,a,o),m=new h({map:p.texture,transparent:!0,toneMapped:!1});this.screenSurfaces.push(m),this.mesh(new _(u*.94,u*.625*.92),m,f,[0,0,.05],!1),this.floatingObject(f,d+.5),o===`chat`&&(i=p);let g=new F([new x(s,c,l-.1),new x(s*.72,c*.6,-.65),new x(0,.35,-.5)]);this.curves.push(g);let v=this.material(9730281,.03,.62);this.mesh(new k(g,40,.011,6,!1),v,this.world,[0,0,0],!1);let y=new n(new V(.035,10,8),new h({color:10255359,toneMapped:!1}));this.world.add(y),this.packets.push(y)});let a=new r;a.position.set(-3,.64,.1),a.rotation.y=.16,this.world.add(a),this.mesh(this.box(1.35,1.65,.08),e,a);for(let e=0;e<4;e++){let n=this.mesh(this.box(.17,.38+e*.2,.11,.025),e%2?t:this.material(5685208,.03,.46),a,[-.42+e*.28,-.45+e*.2/2,.15]);this.bars.push(n)}return this.floatingObject(a,2.2),i}buildLamp(){let e=this.detailedMaterial(9213094,.85,.3,`metal`),t=this.detailedMaterial(15723257,0,.4,`ceramic`);t.side=2;let n=new r;n.position.set(3,-1.85,-.6),this.world.add(n),this.mesh(new b(.35,.4,.08,40),e,n);let a=new F([new x(0,0,0),new x(.1,1.2,0),new x(0,2.45,0),new x(-.3,2.9,.12)]);this.mesh(new k(a,40,.035,10,!1),e,n);let o=this.mesh(new A(.36,.37,40,1,!0),t,n,[-.3,2.9,.12]);return o.rotation.z=.12,this.mesh(new U(.355,.012,8,48),e,n,[-.3,2.715,.12],!1).rotation.x=Math.PI/2,this.mesh(new b(.055,.055,.015,20),e,n,[.18,.048,.1],!1),this.cable(n,[[0,-.02,-.1],[.2,-.04,-.3],[.38,-.04,-.55],[.48,-.7,-1.05]],this.material(4737106,0,.8),.012),this.mesh(new V(.16,20,14),new i({color:16772556,emissive:16762481,emissiveIntensity:.2}),n,[-.3,2.77,.12],!1)}buildCoffeeAndPlant(){let e=this.detailedMaterial(15657182,0,.24,`ceramic`);e.clearcoat=.8,e.clearcoatRoughness=.15;let n=this.material(3875868,0,.12);n.clearcoat=1;let i=new r;i.position.set(-2.58,-1.61,1.15),this.world.add(i);let a=[[0,-.22],[.16,-.22],[.18,-.19],[.205,.08],[.23,.225],[.224,.24],[.207,.24],[.193,.08],[.16,-.175],[0,-.175]].map(([e,t])=>new j(e,t));this.mesh(new l(a,64),e,i,[0,0,0],!1),this.mesh(new b(.203,.203,.008,48),n,i,[0,.19,0],!1),this.mesh(new U(.17,.031,14,40,Math.PI*1.55),e,i,[.24,.015,0]).rotation.z=-Math.PI*.77;let o=this.material(12093782,0,.4);this.mesh(new U(.192,.005,8,64),o,i,[0,.196,0],!1).rotation.x=Math.PI/2,this.mesh(new b(.33,.33,.035,48),this.detailedMaterial(12887939,0,.9,`wood`),this.world,[-2.58,-1.879,1.15],!1);let s=this.mesh(new V(1,20,12),this.detailedMaterial(13357529,.95,.22,`metal`),this.world,[-2.08,-1.865,1.24],!1);s.scale.set(.075,.018,.115),this.mesh(this.box(.025,.013,.39,.01),s.material,this.world,[-2.08,-1.855,1.47],!1);let c=new Float32Array(90),u=new ee;u.setAttribute(`position`,new D(c,3));let d=new f(u,new C({transparent:!0,depthWrite:!1,vertexShader:`void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_PointSize=48.0/-p.z;gl_Position=projectionMatrix*p;}`,fragmentShader:`void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.74,.75,.79,(1.0-d*2.0)*.09);}`})),p=new r;p.position.set(-3.28,-1.62,-.95),this.world.add(p),this.mesh(new b(.3,.22,.56,32),this.detailedMaterial(14144205,0,.9,`ceramic`),p),this.mesh(new b(.275,.275,.018,32),this.material(4798250,0,1),p,[0,.28,0]);let m=this.detailedMaterial(5850935,0,1,`ceramic`),h=new ne(new t(.017,0),m,65),g=new ce;for(let e=0;e<65;e++){let t=e*2.4,n=.25*Math.sqrt((e+.5)/65);g.position.set(Math.cos(t)*n,.297,Math.sin(t)*n),g.scale.setScalar(.6+e%5*.15),g.updateMatrix(),h.setMatrixAt(e,g.matrix)}p.add(h),this.mesh(new U(.294,.012,10,48),m,p,[0,.278,0],!1).rotation.x=Math.PI/2;let v=this.material(4091971,0,.54);v.side=2,v.sheen=.25,v.sheenColor.set(9678435);for(let e=0;e<9;e++){let t=new r;t.position.y=.26,t.rotation.y=e*2.4,t.rotation.z=.12+Math.sin(e)*.24,p.add(t),this.leaves.push(t);let n=new F([new x,new x(.05,.5,0),new x(.22,.84+e%3*.14,0)]);this.mesh(new k(n,15,.011,5,!1),v,t,[0,0,0],!1);let i=new _(.28,.67,10,18),a=i.attributes.position;for(let e=0;e<a.count;e++){let t=a.getX(e)/.14,n=Te((a.getY(e)+.335)/.67,0,1);a.setX(e,t*.14*Math.max(0,Math.sin(Math.PI*n))**.75),a.setZ(e,.05*Math.sin(n*Math.PI)-Math.abs(t)*.033*Math.sin(n*Math.PI))}i.computeVertexNormals();let o=this.mesh(i,v,t,[.21,.81+e%3*.14,0],!1);o.rotation.z=-.45;let s=this.material(8889187,0,.7);this.cable(o,[[0,-.31,.002],[0,0,.052],[0,.31,.012]],s,.003);for(let e=0;e<4;e++)for(let t of[-1,1]){let n=-.2+e*.115;this.cable(o,[[0,n,.045],[t*.065,n+.038,.038],[t*.1,n+.07,.015]],s,.0014)}}return d}buildLandscape(){this.terrain.background=new M(14150132),this.terrain.fog=new me(14150132,14,35),this.terrain.add(new re(16184817,7172483,3));let e=new he(16768428,4);e.position.set(-7,7,5),this.terrain.add(e);let t=new n(new V(.55,24,16),new h({color:16772032,toneMapped:!1}));t.position.set(-3,4,-7),this.terrain.add(t);let r=new _(19,14,96,72);r.rotateX(-Math.PI/2);let a=r.attributes.position,o=new Float32Array(a.count*3),s=new M(16184817),c=new M(7835040),l=new M(8492937);for(let e=0;e<a.count;e++){let t=a.getX(e),n=a.getZ(e),r=0;for(let[e,i,a]of[[-2,-1,3.6],[2,-2,4.1],[4,1,2.7],[-5,2,2.3]])r=Math.max(r,a*Math.exp(-((t-e)**2*.13+(n-i)**2*.18)));r+=Math.sin(t*2.9+n*.7)*Math.cos(n*3.2)*.2+Math.sin(t*7+n*5)*.075,a.setY(e,r-.6),(r>2.75?s:c.clone().lerp(l,Math.max(0,1-r/2.4))).toArray(o,e*3)}r.setAttribute(`color`,new D(o,3)),r.computeVertexNormals(),this.terrain.add(new n(r,new i({vertexColors:!0,roughness:1,flatShading:!1})));let u=new i({color:16777215,roughness:1}),d=new V(1,12,8);for(let e=0;e<18;e++){let t=new n(d,u);t.position.set((e%6-3)*2.1,3.7+Math.sin(e)*.2,-3-Math.floor(e/6)*1.1),t.scale.set(.9,.15,.35),this.clouds.add(t)}this.terrain.add(this.clouds),this.terrainCamera.position.set(7,4.8,10),this.terrainCamera.lookAt(0,1.1,0)}resize(){if(this.destroyed)return;let e=this.canvas.parentElement.getBoundingClientRect();e.width<1||e.height<1||(this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,window.innerWidth<=820?1.25:1.65)),this.renderer.setSize(e.width,e.height,!1),this.camera.aspect=e.width/e.height,this.camera.updateProjectionMatrix(),this.requestFrame())}setProgress(e){this.progress=Te(e,0,2),this.requestFrame()}setNight(e){this.night=e,this.requestFrame()}setExpanded(e){this.exploded=e,this.requestFrame()}setPaused(e){this.paused=e,this.previous=0,this.frame&&cancelAnimationFrame(this.frame),this.frame=0,this.requestFrame()}pointer(e,t){this.cursor.set(e,t)}rotate(e,t){this.userYaw=Te(this.userYaw+e,-.7,.7),this.userPitch=Te(this.userPitch+t,-.25,.3),this.requestFrame()}reset(){this.userYaw=0,this.userPitch=0,this.exploded=!1,this.night=!1,this.requestFrame()}requestFrame(){!this.frame&&!this.destroyed&&!document.hidden&&(this.frame=requestAnimationFrame(this.render))}render=e=>{if(this.frame=0,this.destroyed||document.hidden)return;let t=this.previous?(e-this.previous)/1e3:1/60,n=Math.min(t,.05);this.previous=e,this.paused||(this.elapsed+=n);let r=this.elapsed,i=this.paused?1:1-Math.exp(-n*6);this.currentProgress=$(this.currentProgress,this.progress,i);let a=this.currentProgress,o=Ee(a/.75),s=Ee((a-1)/.85);this.nightMix=$(this.nightMix,this.night?s:0,i),this.expansion=$(this.expansion,+!!this.exploded,i),this.yaw=$(this.yaw,this.userYaw+(this.paused?0:this.cursor.x*.055),i),this.pitch=$(this.pitch,this.userPitch+(this.paused?0:this.cursor.y*.024),i);let c=Math.max(12.5,9/(2*Math.tan(p.degToRad(38)/2)*this.camera.aspect)),l=s*.28+this.yaw+Math.sin(r*.17)*.012*s,u=.035+s*.15+this.pitch;this.camera.position.set(Math.sin(l)*c,Math.sin(u)*c+.08,Math.cos(l)*Math.cos(u)*c),this.camera.lookAt(0,-.03,0);let d=new M(16513783),f=new M(15921131),m=new M(1250859);this.scene.background.copy(d).lerp(f,o).lerp(m,this.nightMix),this.scene.fog.color.copy(this.scene.background),this.daylight.intensity=$(2.8,.18,this.nightMix),this.fill.intensity=$(1,.18,this.nightMix),this.rim.intensity=$(.65,.26,this.nightMix),this.deskLamp.intensity=s*$(.35,8.5,this.nightMix),this.screenGlow.intensity=s*$(.18,1.9,this.nightMix),this.bulb.material.emissiveIntensity=$(.2,2.4,this.nightMix),this.scene.environmentIntensity=$(.18,.58,s)*(1-this.nightMix*.66),this.outline.opacity=(1-o)*.6,this.surfaces.forEach(e=>{e.material.color.set(16777215).lerp(e.color,o),e.material.metalness=e.metalness*s,e.material.roughness=$(.86,e.roughness,s)}),this.screenSurfaces.forEach(e=>{e.opacity=o,e.visible=o>.005}),this.floating.forEach(({group:e,origin:t,phase:n},i)=>{e.position.copy(t),i>1&&(e.position.y+=Math.sin(r*.48+n)*(.006+.012*s),e.position.z+=Math.sin(r*.34+n)*.014*s),e.position.x+=t.x*.14*this.expansion,e.position.y+=t.y*.09*this.expansion,e.position.z+=(i%2?1:-.6)*this.expansion,i>1&&(e.rotation.z=Math.sin(r*.28+n)*.008*s)}),this.bars.forEach((e,t)=>{e.scale.y=1+Math.sin(r*.85+t)*.035*s}),this.leaves.forEach((e,t)=>{e.rotation.z=.12+Math.sin(t)*.24+Math.sin(r*.62+t*.4)*.025*s}),this.packets.forEach((e,t)=>{e.position.copy(this.curves[t].getPointAt((r*.11+t*.25)%1)),e.visible=o>.2});let h=this.steam.geometry.attributes.position;for(let e=0;e<h.count;e++){let t=(r*.18+e/h.count)%1;h.setXYZ(e,-2.58+Math.sin(t*7+r+e*.2)*.045,-1.35+t*.7,1.15+Math.cos(t*9+e)*.035)}h.needsUpdate=!0,this.steam.visible=s>.4,this.clouds.position.x=Math.sin(r*.1)*.45,this.terrainCamera.position.x=7+Math.sin(r*.1)*.55*s,this.terrainCamera.lookAt(0,1.1,0);try{if((this.ticks++%3==0||this.paused)&&(this.renderer.setRenderTarget(this.landscape),this.renderer.render(this.terrain,this.terrainCamera),this.renderer.setRenderTarget(null)),this.ticks%18==0&&s>.3){let e=this.supportCanvas.getContext(`2d`);e.fillStyle=`#f1edff`,e.fillRect(60,174,466,39),e.fillStyle=`#7960ef`,e.font=`26px Arial`,e.fillText(`What shall we build?`.slice(0,Math.min(20,Math.floor(r*4)%32)),62,201),this.screenTexture.needsUpdate=!0}this.renderer.render(this.scene,this.camera)}catch{this.onFailure(),this.dispose();return}!this.paused&&this.checkedFrames<180&&(this.checkedFrames++,t>.035&&this.slowFrames++,this.checkedFrames===180&&this.slowFrames>65&&(this.renderer.setPixelRatio(1),this.daylight.castShadow=!1)),this.paused||this.requestFrame()};contextLost=e=>{e.preventDefault(),this.onFailure(),this.dispose()};visibilityChange=()=>{document.hidden?(this.frame&&cancelAnimationFrame(this.frame),this.frame=0):(this.previous=0,this.requestFrame())};dispose(){if(this.destroyed)return;this.destroyed=!0,this.frame&&cancelAnimationFrame(this.frame),this.canvas.removeEventListener(`webglcontextlost`,this.contextLost),document.removeEventListener(`visibilitychange`,this.visibilityChange);let e=new Set,t=new Set,n=new Set;[this.scene,this.terrain].forEach(r=>r.traverse(r=>{let i=r;i.geometry&&e.add(i.geometry),i.material&&(Array.isArray(i.material)?i.material:[i.material]).forEach(e=>{t.add(e);for(let t of Object.values(e))t instanceof ae&&n.add(t)})})),e.forEach(e=>e.dispose()),t.forEach(e=>e.dispose()),n.forEach(e=>e.dispose()),this.landscape.dispose(),this.environment.dispose(),this.renderer.dispose()}},Oe=class extends De{canvasEl;composer;gtao;bokeh;output;windowLight;originalRender;originalRendererRender;originalResize;cinematicDisposed=!1;postEnabled=!1;renderSamples=0;slowSamples=0;lastRenderTime=0;composerPixelRatio=0;sceneTarget=new x(0,-.03,0);focusTarget=new x(0,-.08,-.05);photographicFov=32.5;photographicDistanceScale=Math.tan(p.degToRad(19))/Math.tan(p.degToRad(32.5/2));constructor(e,t,n){super(e,t,n),this.canvasEl=e;let r=this;this.addPhotographicLighting(r),this.installPipeline(r)}addPhotographicLighting(e){this.windowLight=new fe(16773599,7.2,4.8,5.8),this.windowLight.position.set(-4.8,3,3.4),this.windowLight.lookAt(.15,-1.15,.05),e.scene.add(this.windowLight);let t=new fe(14476799,1.15,2.8,3.6);t.position.set(4.8,1.2,1.4),t.lookAt(.2,-1.15,0),e.scene.add(t)}installPipeline(e){let{renderer:t,scene:n,camera:r}=e;if(this.postEnabled=window.innerWidth>820&&t.capabilities.isWebGL2,r.fov=this.photographicFov,r.updateProjectionMatrix(),this.postEnabled){this.composer=new te(t);let i=new le(n,r);this.gtao=new Y(n,r,512,512),this.gtao.blendIntensity=.46,this.gtao.updateGtaoMaterial({radius:.18,distanceExponent:2,thickness:.85,distanceFallOff:.35,scale:1,samples:8,screenSpaceRadius:!1}),this.gtao.updatePdMaterial({lumaPhi:8,depthPhi:2,normalPhi:3,radius:5,rings:2,samples:8}),this.bokeh=new Ce(n,r,{focus:14,aperture:45e-6,maxblur:.0032}),this.output=new L,this.composer.addPass(i),this.composer.addPass(this.gtao),this.composer.addPass(this.bokeh),this.composer.addPass(this.output),this.syncComposerSize(e)}this.originalRender=e.render,this.originalRendererRender=t.render.bind(t),this.originalResize=this.resize.bind(this),e.frame&&cancelAnimationFrame(e.frame),e.frame=0,e.render=this.cinematicRender,this.resize=()=>{this.originalResize?.();let e=this;e.camera.fov=this.photographicFov,e.camera.updateProjectionMatrix(),this.syncComposerSize(e)},e.requestFrame()}syncComposerSize(e){if(!this.composer)return;let t=this.canvasEl.parentElement?.getBoundingClientRect();if(!t||t.width<1||t.height<1)return;let n=Math.min(e.renderer.getPixelRatio(),1.25);Math.abs(n-this.composerPixelRatio)>.01&&(this.composerPixelRatio=n,this.composer.setPixelRatio(n)),this.composer.setSize(t.width,t.height)}preparePhotographicCamera(e){let t=e.camera,n=t.position.clone().sub(this.sceneTarget);t.position.copy(this.sceneTarget).add(n.multiplyScalar(this.photographicDistanceScale)),t.fov=this.photographicFov,t.updateProjectionMatrix(),this.bokeh&&(this.bokeh.uniforms.focus.value=t.position.distanceTo(this.focusTarget),this.bokeh.uniforms.aperture.value=p.lerp(45e-6,32e-6,e.nightMix)),this.windowLight&&(this.windowLight.intensity=p.lerp(7.2,.45,e.nightMix))}cinematicRender=e=>{let t=this;if(!this.originalRender||!this.originalRendererRender||t.destroyed)return;let n=this.originalRendererRender,r=t.renderer,i=r.render;if(this.lastRenderTime){let t=e-this.lastRenderTime;this.postEnabled&&this.renderSamples<150&&(this.renderSamples++,t>34&&this.slowSamples++,this.renderSamples===150&&this.slowSamples>52&&(this.postEnabled=!1))}this.lastRenderTime=e;let a=((e,i)=>{if(e===t.scene&&i===t.camera){this.preparePhotographicCamera(t),this.postEnabled&&this.composer?(r.render=n,this.syncComposerSize(t),this.composer.render(),r.render=a):n(e,i);return}n(e,i)});r.render=a;try{this.originalRender(e)}finally{r.render=i}};dispose(){this.cinematicDisposed||(this.cinematicDisposed=!0,this.gtao?.dispose(),this.bokeh?.dispose(),this.output?.dispose(),this.composer?.dispose(),super.dispose())}};export{Oe as CinematicHomeScene};