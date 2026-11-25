import { CanvasTexture, Color, LinearFilter, SRGBColorSpace, ShaderMaterial, TextureLoader, Vector2, Vector3 } from 'three';

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
      // elevation (three-globe's topology map) and the satellite photo, read as data only
      topo: { value: null },
      topoTexel: { value: new Vector2(1.5 / 2048, 1.5 / 1024) },
      photo: { value: null },
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
      uniform sampler2D landMask, topo, photo;
      uniform vec2 topoTexel;
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

        // terrain: hill shading lit from the north-west, the printed-map convention, so ranges read
        // as raised. Flat ground gets shade 0; slopes facing the light brighten, the rest darken.
        float hgt = texture2D(topo, vUv).r;
        float hx = texture2D(topo, vUv + vec2(topoTexel.x, 0.0)).r - texture2D(topo, vUv - vec2(topoTexel.x, 0.0)).r;
        float hy = texture2D(topo, vUv + vec2(0.0, topoTexel.y)).r - texture2D(topo, vUv - vec2(0.0, topoTexel.y)).r;
        vec3 L = normalize(vec3(-0.55, 0.55, 0.62));
        float shade = dot(normalize(vec3(-hx * 7.0, -hy * 7.0, 1.0)), L) - L.z;

        // land colour: the photo's own hue (sand deserts, green forests, white ice), desaturated
        // and pulled toward cream so it stays in the ink palette
        vec3 ph = texture2D(photo, vUv).rgb;
        ph = mix(vec3(dot(ph, vec3(0.299, 0.587, 0.114))), ph, 0.7) * 1.35;
        vec3 landTone = mix(landDay, ph, 0.55) * (1.0 + shade * 1.6);
        vec3 landDark = landNight * (1.0 + shade * 1.3);

        vec3 day = mix(oceanDay, landTone, isLand);
        vec3 dark = mix(oceanNight, landDark, isLand);
        vec3 color = mix(ground, mix(day, dark, night), fill);

        // engraving: parallel diagonal cuts, night side only
        float hatch = hairline((vWorldPos.x + vWorldPos.y) / 4.5, 1.0);
        color = mix(color, line, hatch * night * 0.1 * fill);

        // contour lines: one engraved rule every 1/16 of the elevation range, on land only
        float contour = hairline(hgt * 16.0, 1.0) * isLand * step(0.03, hgt);
        color = mix(color, mix(oceanNight, line, night), contour * 0.28 * fill);

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

  const loader = new TextureLoader();
  u.topo.value = loader.load('/textures/earth-topology.png');
  const photo = loader.load('/textures/earth-day.jpg');
  photo.colorSpace = SRGBColorSpace;
  u.photo.value = photo;

  return { material, loaded };
}
