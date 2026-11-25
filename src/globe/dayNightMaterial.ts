import { ShaderMaterial, SRGBColorSpace, TextureLoader, Vector3 } from 'three';

/**
 * Globe surface lit by the real sun. The night side shows city lights; the
 * day side is a dimmed, desaturated day map so the globe stays dark overall.
 * The terminator itself is drawn as a thin glowing seam: the "night line".
 */
export function createDayNightMaterial() {
  const loader = new TextureLoader();
  const load = (url: string) => {
    const t = loader.load(url);
    t.colorSpace = SRGBColorSpace;
    return t;
  };

  return new ShaderMaterial({
    uniforms: {
      dayTexture: { value: load('/textures/earth-day.jpg') },
      nightTexture: { value: load('/textures/earth-night.jpg') },
      sunDirection: { value: new Vector3(1, 0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D dayTexture;
      uniform sampler2D nightTexture;
      uniform vec3 sunDirection;
      varying vec3 vWorldNormal;
      varying vec2 vUv;

      void main() {
        // sine of the sun's altitude at this point: >0 day, <0 night
        float sunAlt = dot(normalize(vWorldNormal), sunDirection);

        vec3 day = texture2D(dayTexture, vUv).rgb;
        float grey = dot(day, vec3(0.299, 0.587, 0.114));
        day = mix(vec3(grey), day, 0.45) * 0.16; // linear space: ≈ 40% perceived brightness

        vec3 night = texture2D(nightTexture, vUv).rgb;

        // civil twilight band (sun 0–6° below horizon ≈ sin -0.105..0)
        float dayness = smoothstep(-0.105, 0.02, sunAlt);
        vec3 color = mix(night, day, dayness);

        // the night line: a soft seam right on the terminator
        float seam = exp(-pow(sunAlt / 0.007, 2.0));
        color += vec3(0.45, 0.52, 1.0) * seam * 0.3;

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
