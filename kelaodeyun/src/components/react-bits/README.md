# React Bits — Light Rays

Source: https://reactbits.dev/c/backgrounds/light-rays
Registry: https://reactbits.dev/r/LightRays-JS-CSS.json
Retrieved: 2026-10-26

LightRays.jsx and LightRays.css are copied from the official JavaScript/CSS registry. Hero colors and motion are set through the component's public props. License is preserved alongside source.

## Dot Grid → Dot Globe (active Hero, 2026-10-26)

Official source: https://reactbits.dev/backgrounds/dot-grid
Registry: https://reactbits.dev/r/DotGrid-JS-CSS.json

DotGrid.jsx / DotGrid.css preserve the retrieved source. DotGlobe.jsx adapts its instanced circular dot renderer and spring interaction with an inverse sphere projection, a land/ocean map, and slow longitude rotation. No solid surface, scene lighting, geographic route arcs, or COBE dependency remain. The existing React Bits license applies to this derivative.

Land/ocean map: https://unpkg.com/three-globe@2.31.1/example/img/earth-water.png (three-globe MIT example asset), served locally at /images/globe/earth-water.png. Original texture retained without image edits.

CardSwap.jsx / CardSwap.css: official React Bits Card Swap, fetched 2026-10-27 from https://github.com/DavidHDev/react-bits/tree/main/src/content/Components/CardSwap (MIT; see LICENSE.md). Removed stock photo items and Hugeicons dependencies; custom project cards supply content. Autoplay pauses for keyboard focus and is disabled under prefers-reduced-motion. Palette overrides live in gateway-hero.css.
