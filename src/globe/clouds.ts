import { Color, Mesh, ShaderMaterial, SphereGeometry, Vector3, type Scene } from 'three';

interface GlobeLike {
  scene(): Scene;
  getGlobeRadius(): number;
}

const cssInk = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * Weather, engraved: a cloud deck drawn the way an atlas plate draws it, with a 1px outline
 * and fine strokes running along the latitude lines, drifting slowly east.
 *
 * Decoration, not data: the shapes come from 3D noise, not a satellite. Faint on the night side.
 */
export function createClouds(globe: GlobeLike) {
  const R = globe.getGlobeRadius();
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      ink: { value: new Color() },
      sunDirection: { value: new Vector3(1, 0, 0) },
      time: { value: 0 },
      intro: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 ink;
      uniform vec3 sunDirection;
      uniform float time, intro;
      varying vec3 vDir;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      float hairline(float x) {
        float d = abs(fract(x + 0.5) - 0.5);
        float w = fwidth(x);
        return 1.0 - smoothstep(w * 0.5, w * 1.5, d);
      }

      void main() {
        // drift east: rotate the sample point around the polar axis over time
        float a = time * 0.006;
        vec3 d = vec3(cos(a) * vDir.x + sin(a) * vDir.z, vDir.y, -sin(a) * vDir.x + cos(a) * vDir.z);
        // stretch east-west so cloud decks lie in bands, like weather does
        float n = fbm(vec3(d.x * 2.6, d.y * 5.0, d.z * 2.6) + vec3(0.0, 0.0, time * 0.01));
        float cover = smoothstep(0.56, 0.62, n);
        float edge = hairline(n * 18.0) * smoothstep(0.5, 0.56, n) * (1.0 - smoothstep(0.6, 0.66, n));

        float lat = asin(clamp(d.y, -1.0, 1.0));
        float strokes = hairline(lat * 90.0 + n * 6.0); // along the latitude, bent by the cloud

        float day = smoothstep(-0.1, 0.1, dot(vDir, sunDirection));
        float alpha = (cover * (0.16 + 0.34 * strokes) + edge * 0.5) * mix(0.5, 1.0, day) * intro;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(ink, alpha);
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new Mesh(new SphereGeometry(R * 1.007, 128, 96), material);
  mesh.renderOrder = 1;
  globe.scene().add(mesh);

  const readInk = () => material.uniforms.ink.value.set(cssInk('--ink-type', '#f1e6c8'));
  readInk();
  new MutationObserver(readInk).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-phase'],
  });

  return {
    setSun(dir: Vector3) {
      material.uniforms.sunDirection.value.copy(dir);
    },
    frame(timeSec: number, intro: number) {
      material.uniforms.time.value = timeSec;
      material.uniforms.intro.value = intro;
    },
  };
}
