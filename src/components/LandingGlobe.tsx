import { useEffect, useRef } from 'react';

const vertexSource = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const fragmentSource = `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uScroll;
  uniform float uEntry;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += noise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  float blob(vec2 ll, vec2 center, vec2 radius) {
    float longitude = atan(sin(ll.x - center.x), cos(ll.x - center.x));
    vec2 point = vec2(longitude / radius.x, (ll.y - center.y) / radius.y);
    return 1.0 - smoothstep(0.72, 1.08, length(point));
  }

  float smoothStop(float a, float b, float t) {
    float x = clamp((t - a) / (b - a), 0.0, 1.0);
    return x * x * (3.0 - 2.0 * x);
  }

  void main() {
    float aspect = uResolution.x / uResolution.y;
    float p = clamp(uScroll, 0.0, 1.0);
    float p1 = smoothStop(0.0, 0.32, p);
    float p2 = smoothStop(0.32, 0.64, p);
    float p3 = smoothStop(0.64, 1.0, p);
    float sideLimit = max(0.0, aspect * 0.5 - min(0.72, aspect * 0.49));
    float sideScale = clamp(aspect / 1.5, 0.22, 0.75);
    float swing = mix(0.0, -sideLimit * sideScale, p1);
    swing = mix(swing, sideLimit * sideScale, p2);
    swing = mix(swing, 0.0, p3);
    float radius = mix(0.72, 0.47, p1);
    radius = mix(radius, 0.45, p2);
    radius = mix(radius, 0.54, p3);
    radius = min(radius, aspect * 0.49);
    float centerY = mix(-0.55 + (uEntry * 0.14), 0.06, p1);
    centerY = mix(centerY, 0.09, p2);
    centerY = mix(centerY, 0.10, p3);

    vec2 screen = (vUv - 0.5) * vec2(aspect, 1.0);
    vec2 local = (screen - vec2(swing, centerY)) / radius;
    float distanceFromCenter = length(local);
    float edge = 1.0 - smoothstep(0.992, 1.008, distanceFromCenter);
    float halo = exp(-max(distanceFromCenter - 1.0, 0.0) * 5.2) * 0.16;

    vec2 starGrid = floor(vUv * uResolution / 46.0);
    float starSeed = hash(starGrid);
    vec2 starOffset = vec2(hash(starGrid + 1.7), hash(starGrid + 8.3));
    float starDistance = length(fract(vUv * uResolution / 46.0) - starOffset);
    float star = (1.0 - smoothstep(0.0, 0.055, starDistance))
      * step(0.984, starSeed)
      * (0.25 + 0.75 * sin(uTime * 1.3 + starSeed * 48.0) * sin(uTime * 1.3 + starSeed * 48.0));

    vec3 color = vec3(0.015, 0.035, 0.09) * halo;
    float alpha = max(halo * 0.65, star * 0.82);
    color += vec3(0.56, 0.72, 1.0) * star * 0.72;

    if (edge > 0.001) {
      float z = sqrt(max(1.0 - dot(local, local), 0.0));
      float rotation = 2.07 + uTime * 0.035 + p * 5.0265;
      vec3 normal = normalize(vec3(
        local.x * cos(rotation) - z * sin(rotation),
        local.y,
        local.x * sin(rotation) + z * cos(rotation)
      ));
      vec2 ll = vec2(atan(normal.z, normal.x), asin(clamp(normal.y, -1.0, 1.0)));
      float landShape = max(
        max(blob(ll, vec2(-1.96, 0.66), vec2(0.62, 0.52)), blob(ll, vec2(-2.51, 1.03), vec2(0.25, 0.19))),
        max(blob(ll, vec2(-0.97, -0.56), vec2(0.32, 0.78)), blob(ll, vec2(0.25, 0.06), vec2(0.43, 0.72)))
      );
      landShape = max(landShape, blob(ll, vec2(0.86, 0.78), vec2(1.18, 0.44)));
      landShape = max(landShape, blob(ll, vec2(1.24, 0.22), vec2(0.28, 0.34)));
      landShape = max(landShape, blob(ll, vec2(2.34, -0.48), vec2(0.35, 0.23)));
      landShape = max(landShape, blob(ll, vec2(-1.56, 1.20), vec2(0.25, 0.19)));
      float terrain = fbm(ll * vec2(24.0, 14.0));
      float land = smoothstep(0.44, 0.57, landShape + (terrain - 0.5) * 0.13);
      float coastline = smoothstep(0.40, 0.49, landShape) * (1.0 - land);
      float cloudNoise = fbm(ll * vec2(8.0, 5.0) + vec2(uTime * 0.018, -uTime * 0.009));
      float cloud = smoothstep(0.62, 0.79, cloudNoise) * 0.32;
      vec3 sun = normalize(vec3(-0.82, 0.24, 0.52));
      float day = smoothstep(-0.25, 0.38, dot(normal, sun));

      vec3 ocean = mix(vec3(0.012, 0.065, 0.15), vec3(0.025, 0.22, 0.34), terrain);
      vec3 ground = mix(vec3(0.07, 0.31, 0.29), vec3(0.17, 0.53, 0.39), terrain);
      ground = mix(ground, vec3(0.56, 0.57, 0.43), smoothstep(0.70, 0.88, terrain));
      vec3 surface = mix(ocean, ground, land);
      surface = mix(surface, vec3(0.12, 0.43, 0.55), coastline * 0.7);

      vec2 cityCell = floor(vec2(ll.x * 47.0, ll.y * 34.0));
      float city = step(0.91, hash(cityCell)) * land * (1.0 - day) * 0.62;
      surface = surface * (0.17 + day * 0.94);
      surface += vec3(1.0, 0.62, 0.26) * city;
      surface += vec3(0.62, 0.83, 1.0) * cloud * (0.28 + day * 0.45);
      float rim = pow(1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0), 2.4);
      surface += vec3(0.23, 0.62, 1.0) * rim * 0.55;

      color = mix(color, surface, edge);
      color += vec3(0.23, 0.62, 1.0) * rim * edge * 0.12;
      alpha = max(alpha, edge);
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Landing globe shader compilation failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function LandingGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const fallback = fallbackRef.current;
    if (!canvas || !fallback) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
      premultipliedAlpha: false,
    });
    if (!gl) return;

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Landing globe program linking failed:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    const buffer = gl.createBuffer();
    if (!buffer) {
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, 'uResolution');
    const time = gl.getUniformLocation(program, 'uTime');
    const scroll = gl.getUniformLocation(program, 'uScroll');
    const entry = gl.getUniformLocation(program, 'uEntry');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const startedAt = performance.now();
    let frame = 0;
    let lastFrame = 0;
    let currentScroll = 0;
    let width = 0;
    let height = 0;

    fallback.hidden = true;
    canvas.hidden = false;
    gl.clearColor(0, 0, 0, 0);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      gl.viewport(0, 0, canvas.width, canvas.height);
      schedule();
    };

    const updateScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      currentScroll = maxScroll > 0 ? Math.max(0, Math.min(1, window.scrollY / maxScroll)) : 0;
      if (reducedMotion.matches) schedule();
    };

    const render = (now: number) => {
      frame = 0;
      if (document.visibilityState === 'hidden') return;
      if (!reducedMotion.matches && now - lastFrame < 33) {
        frame = window.requestAnimationFrame(render);
        return;
      }

      const elapsed = Math.max(0, now - startedAt);
      const entryProgress = reducedMotion.matches ? 1 : Math.min(1, elapsed / 1900);
      const easedEntry = 1 - Math.pow(1 - entryProgress, 3);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, reducedMotion.matches ? 0 : elapsed / 1000);
      gl.uniform1f(scroll, currentScroll);
      gl.uniform1f(entry, easedEntry);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      lastFrame = now;
      if (!reducedMotion.matches) frame = window.requestAnimationFrame(render);
    };

    function schedule() {
      if (!frame && document.visibilityState === 'visible') frame = window.requestAnimationFrame(render);
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') schedule();
      else if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    const onMotionChange = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      schedule();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      canvas.hidden = true;
      fallback.hidden = false;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };

    resize();
    updateScroll();
    schedule();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', updateScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.addEventListener('change', onMotionChange);
    canvas.addEventListener('webglcontextlost', onContextLost);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', updateScroll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotion.removeEventListener('change', onMotionChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="plus-landing-globe" aria-hidden="true" hidden />
      <div ref={fallbackRef} className="plus-landing-globe-fallback" aria-hidden="true">
        <div className="plus-fallback-earth">
          <svg viewBox="0 0 400 400" focusable="false" aria-hidden="true">
            <path d="M75 102 104 79l36 8 18 24-12 20-28 2-13 22-26-9-13-24-20-5zm49 72 26 9 10 24-7 31-13 39-16 29-14-19 4-28-11-27 4-34zm81-113 27-14 25 8 8 19-17 16-32-3-15-13zm-6 63 26-18 40-7 29 11 34-3 25 18-14 19-32 4-16 20-26-3-17 19-21-9-19 17-17-13 11-27-15-14zm49 89 24 6 16 24-15 17-25-10-12-19zm73-19 20 9 8 22-19 12-17-15z" />
          </svg>
        </div>
      </div>
    </>
  );
}
