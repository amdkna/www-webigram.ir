# Homepage: paper → 2D → 3D

`/home6/` has exactly three sections:

1. The complete homepage design is drawn on one continuous warm graph-paper sheet. Logo, navigation, copy, buttons and diagrams all use the pencil treatment. Drawings stay still: there is no floating or physical model.
2. The same composition is implemented as a finished, colored, flat HTML/SVG interface. No perspective, simulated depth, object rotation or floating animation.
3. A separate Three.js workspace adds modeled devices, live screen scenery, lighting, coffee steam, plant motion and floating UI. Drag/arrow-key rotation, night lighting, component separation, pause and reset apply here only.

The canvas is inside the third slide and inherits its scroll-reveal clipping. It is lazy-loaded only when section three begins to enter, and pauses when the user returns to an earlier section. The first two sections remain available without WebGL. Reduced motion and the original third-stage fallback remain supported.

Validation: Astro check, production build, and static structure checks. No browser rendering or physical-device testing performed.
