/**
 * The depth hero (M6, P7). A hand-written WebGL2 shader, no library.
 *
 * The cover is drawn over itself on a canvas, each pixel shifted by how
 * near it is (the depth map the worker made from the cover) as the pointer
 * moves — or the phone tilts, where the browser gives orientation without a
 * permission prompt. Near things move more than far ones: a window, not a
 * picture.
 *
 * Loaded only when a listing HAS a depth map (listing-enhance imports it on
 * [data-depth]), so every other page pays nothing. Nothing at all for a
 * reader who asked for less motion, or without WebGL2, or if either image
 * fails to load with CORS: the photograph simply stays a photograph.
 * Paused off screen and in a background tab.
 */
const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, 1.0 - (aPos.y + 1.0) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D uImg;
uniform sampler2D uDepth;
uniform vec2 uScale;
uniform vec2 uOrigin;
uniform vec2 uShift;
in vec2 vUv;
out vec4 color;
void main() {
  vec2 uv = uOrigin + vUv * uScale;
  float near = texture(uDepth, uv).r;
  vec2 moved = uv + uShift * (near - 0.45) * 0.024;
  color = texture(uImg, clamp(moved, vec2(0.001), vec2(0.999)));
}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function texture(gl: WebGL2RenderingContext, unit: number, image: HTMLImageElement): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
}

/** object-fit: cover, as a UV window: which part of the image the box shows. */
function coverWindow(box: DOMRect, image: HTMLImageElement, position: string): { scale: [number, number]; origin: [number, number] } {
  const boxRatio = box.width / Math.max(1, box.height);
  const imageRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
  const [px = '50%', py = '50%'] = position.split(' ');
  const fx = Number.parseFloat(px) / 100;
  const fy = Number.parseFloat(py) / 100;
  if (imageRatio > boxRatio) {
    const w = boxRatio / imageRatio;
    return { scale: [w, 1], origin: [(1 - w) * (Number.isFinite(fx) ? fx : 0.5), 0] };
  }
  const h = imageRatio / boxRatio;
  return { scale: [1, h], origin: [0, (1 - h) * (Number.isFinite(fy) ? fy : 0.5)] };
}

export async function bindDepth(img: HTMLImageElement): Promise<void> {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const depthSrc = img.dataset.depth;
  const host = img.parentElement;
  if (!depthSrc || !host) return;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false });
  if (!gl) return;

  let photo: HTMLImageElement;
  let depth: HTMLImageElement;
  try {
    [photo, depth] = await Promise.all([loadImage(img.currentSrc || img.src), loadImage(depthSrc)]);
  } catch {
    return;
  }

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  try {
    texture(gl, 0, photo);
    texture(gl, 1, depth);
  } catch {
    return; // a tainted image (no CORS) cannot be a texture: keep the photograph
  }
  gl.uniform1i(gl.getUniformLocation(program, 'uImg'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'uDepth'), 1);
  const uScale = gl.getUniformLocation(program, 'uScale');
  const uOrigin = gl.getUniformLocation(program, 'uOrigin');
  const uShift = gl.getUniformLocation(program, 'uShift');

  // The canvas takes the photograph's place and its classes (the slow
  // breathing scale keeps working); the <img> stays in the DOM for its alt.
  canvas.className = img.className;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;inline-size:100%;block-size:100%;display:block';
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const size = () => {
    const box = img.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    const fit = coverWindow(box, photo, getComputedStyle(img).objectPosition);
    gl.uniform2f(uScale, fit.scale[0], fit.scale[1]);
    gl.uniform2f(uOrigin, fit.origin[0], fit.origin[1]);
  };

  const target = { x: 0, y: 0 };
  const now = { x: 0, y: 0 };
  let frame = 0;
  let visible = true;
  const draw = () => {
    frame = 0;
    now.x += (target.x - now.x) * 0.08;
    now.y += (target.y - now.y) * 0.08;
    gl.uniform2f(uShift, now.x, now.y);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (visible && (Math.abs(target.x - now.x) > 0.001 || Math.abs(target.y - now.y) > 0.001)) {
      frame = requestAnimationFrame(draw);
    }
  };
  const nudge = (x: number, y: number) => {
    target.x = Math.max(-1, Math.min(1, x));
    target.y = Math.max(-1, Math.min(1, y));
    if (!frame && visible) frame = requestAnimationFrame(draw);
  };

  size();
  host.append(canvas);
  draw();
  img.style.visibility = 'hidden';

  new ResizeObserver(() => {
    size();
    draw();
  }).observe(img);
  new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting) && !document.hidden;
    if (visible) nudge(target.x, target.y);
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
  });

  window.addEventListener(
    'pointermove',
    (event) => nudge((event.clientX / innerWidth - 0.5) * -2, (event.clientY / innerHeight - 0.5) * -2),
    { passive: true },
  );
  // Tilt, only where it needs no permission prompt (iOS asks; a forwarded
  // page does not get to ask).
  const orientation = window.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined;
  if (orientation && typeof orientation.requestPermission !== 'function') {
    window.addEventListener(
      'deviceorientation',
      (event) => {
        if (event.gamma === null || event.beta === null) return;
        nudge(-event.gamma / 30, -(event.beta - 45) / 30);
      },
      { passive: true },
    );
  }
}
