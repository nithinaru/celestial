import { CanvasTexture, Color, LinearFilter, ShaderMaterial, Vector3 } from 'three';

/**
 * The Earth as a plate from an old astronomy atlas: flat ink, no lighting, no shine.
 *
 *   day      ocean in planet periwinkle, land in cream
 *   night    the same shapes in the darker planet shade, with fine diagonal engraving
 *   lines    1px coastlines, a 15° graticule at 15% cream, and the night line on the terminator
 *
 * A water mask is read once, as data: where the land is. Everything else is drawn
 * in the shader in screen-space pixels (fwidth), so every line stays one pixel thin at any zoom.
 *
 * Intro uniforms run the draw-in: coastlines trace west to east, then the fills arrive.
 */
const W = 2048;
const H = 1024;

const ink = (name: string, fallback: string) =>
  new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

export function createDayNightMaterial() {
  const material = new ShaderMaterial({
    uniforms: {
      landMask: { value: null },
      sunDirection: { value: new Vector3(1, 0, 0) },
      ground: { value: new Color() },
      oceanDay: { value: new Color() },
      oceanNight: { value: new Color() },
      landDay: { value: new Color('#EDE3CF') },
      landNight: { value: new Color() },
      line: { value: new Color() },
      coastTrace: { value: 0 }, // 0..1: how far east the coastline has been traced
      fill: { value: 0 }, // 0..1: fills, graticule and engraving fade in
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D landMask;
      uniform vec3 sunDirection;
      uniform vec3 ground, oceanDay, oceanNight, landDay, landNight, line;
      uniform float coastTrace, fill;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      // 1 on a ~1px line where x crosses an integer, 0 elsewhere
      float hairline(float x, float px) {
        float d = abs(fract(x + 0.5) - 0.5);
        float w = fwidth(x);
        return 1.0 - smoothstep(w * (px * 0.5), w * (px * 0.5 + 1.0), d);
      }

      void main() {
        float sunAlt = dot(normalize(vWorldNormal), sunDirection); // sine of the sun's altitude
        float aa = fwidth(sunAlt);
        float night = 1.0 - smoothstep(-aa, aa, sunAlt); // a crisp printed edge, not a gradient

        float land = texture2D(landMask, vUv).r;
        float lw = max(fwidth(land), 1e-4);
        float isLand = smoothstep(0.5 - lw, 0.5 + lw, land);
        float coast = 1.0 - smoothstep(0.0, 1.0, abs(land - 0.5) / lw);

        vec3 day = mix(oceanDay, landDay, isLand);
        vec3 dark = mix(oceanNight, landNight, isLand);
        vec3 color = mix(ground, mix(day, dark, night), fill);

        // engraving: parallel diagonal cuts, night side only
        float hatch = hairline((vWorldPos.x + vWorldPos.y) / 4.5, 1.0);
        color = mix(color, line, hatch * night * 0.1 * fill);

        // graticule every 15°
        float grat = max(hairline(vUv.x * 24.0, 1.0), hairline(vUv.y * 12.0, 1.0));
        color = mix(color, line, grat * 0.15 * fill);

        // coastlines: cream while they trace in, a darker rule once the land is filled
        float traced = step(vUv.x, coastTrace);
        vec3 coastInk = mix(line, mix(oceanNight, ground, night), fill);
        color = mix(color, coastInk, coast * traced * 0.9);

        // the night line
        float seam = 1.0 - smoothstep(aa * 0.75, aa * 1.75, abs(sunAlt));
        color = mix(color, line, seam * 0.85 * fill);

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const u = material.uniforms;
  const readInks = () => {
    u.ground.value.copy(ink('--ink-ground', '#0e1524'));
    u.oceanDay.value.copy(ink('--ink-planet', '#5b6fb5'));
    u.oceanNight.value.copy(ink('--ink-planet-shade', '#2a3558'));
    u.landNight.value.copy(ink('--ink-planet', '#5b6fb5'));
    u.line.value.copy(ink('--ink-type', '#f1e6c8'));
  };
  readInks();
  // the app swaps inks at dawn / day / dusk (html[data-phase])
  new MutationObserver(readInks).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-phase'],
  });

  let ready: () => void;
  const loaded = new Promise<void>((r) => (ready = r));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, W, H);
    const px = x.getImageData(0, 0, W, H);
    const d = px.data;
    // the water mask is white where there is water; invert so land = 1
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] > 127 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    x.putImageData(px, 0, 0);
    const t = new CanvasTexture(c);
    t.minFilter = LinearFilter; // no mipmaps: they would blur the coast into a halo
    t.generateMipmaps = false;
    u.landMask.value = t;
    ready();
  };
  img.src = '/textures/earth-water.png'; // three-globe's water mask: sea ice counts as sea

  return { material, loaded };
}
