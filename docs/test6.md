# Webigram /test6

An isolated, English-language 3D showcase at `https://webigram.ir/test6/`.
The main website and existing tools retain their own styles and scripts.

## Experience

- Four scroll-linked chapters move and open a procedural Orbital Engine.
- Three machined gimbal assemblies contain beveled metal quadrants, luminous
  inlays, instanced fasteners, bearings, orbiting satellites, and a modeled W.
- A custom animated shader lights the core; environment lighting, physical
  materials, and desktop bloom provide depth without external model assets.
- Drag or use the arrow keys on the sculpture to rotate it. R resets its pose.
- Alloy, Pearl, and Wire buttons change its materials. Unfold separates its
  components; Fold returns to the current chapter's arrangement.
- Pause freezes autonomous motion; scrolling and explicit controls still work.

## Accessibility and delivery

All navigation and content are server-rendered. The 3D module is dynamically
loaded only on this route. Fonts and scripts are served by Webigram, not a CDN.
Reduced-motion preferences are honored on load and when changed. Rendering
stops in hidden tabs, releases resources on navigation, and uses a fallback
message if WebGL is unavailable. Mobile devices omit bloom and cap pixel ratio;
persistently slow frames lower rendering resolution further. Native scrolling
and touch pinch zoom remain available.

The experimental page is marked `noindex, follow` while the design is evaluated.
Run `npm ci`, `npm run check`, and `npm run build` for local validation. Docker
uses the same dependency lockfile. The existing production workflow checks that
`dist/test6/index.html` exists before publishing and before applying the release.
The deployment also checks the public `/test6/` response for the sculpture and
its controls; a failed check uses the workflow's existing automatic rollback.
