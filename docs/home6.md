# Animated homepage experiment

`/home6/` recreates the existing Persian homepage and its three-stage scroll narrative. The original copy and navigation remain, with a separately loaded Three.js scene occupying the illustration area.

The scene develops from outlined models through pastel color into a lit, physical workspace. The third stage includes a modeled desk, monitor, phone, keyboard, lamp, coffee and plant, with floating interface panels, moving chart bars and data packets. Monitor and phone show a procedurally modeled mountain scene rendered into a texture; no external model or image download is needed.

Drag or use arrow keys on the canvas to rotate. The Persian toolbar provides night lighting (third stage), component separation, animation pause and reset. Reduced-motion preferences pause ambient motion; hidden tabs stop rendering. Device quality adapts, and the original composition is the fallback when WebGL is unavailable. The page is marked noindex while experimental.

Validation: Astro check and production build pass. Static route, control IDs, anchors and generated assets checked. Browser rendering and physical-device performance have not been verified. Production deployment checks require the actual canvas and toolbar IDs at the public route, rejecting homepage fallback responses.
