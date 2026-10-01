import * as THREE from "three";

// Links das aplicações — preencha com as URLs reais
const LINKS = {
  ponto: "#",
  nexo: "#",
  opina: "#",
  contact: "#",
};

document.querySelectorAll("[data-app]").forEach((a) => {
  const url = LINKS[a.dataset.app];
  if (url && url !== "#") { a.href = url; a.target = "_blank"; a.rel = "noopener"; }
});
document.querySelectorAll("[data-contact]").forEach((a) => { if (LINKS.contact !== "#") a.href = LINKS.contact; });
document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- UI animations ---------- */
const nav = document.querySelector(".nav");
addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 20), { passive: true });

const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    e.target.querySelectorAll("[data-count]").forEach(countUp);
    io.unobserve(e.target);
  });
}, { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

function countUp(el) {
  const target = +el.dataset.count, suffix = el.dataset.suffix || "";
  const start = performance.now();
  const step = (t) => {
    const p = Math.min((t - start) / 1400, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Spotlight + tilt nos cards
document.querySelectorAll(".app").forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    card.style.setProperty("--mx", x * 100 + "%");
    card.style.setProperty("--my", y * 100 + "%");
    card.style.transform = `perspective(900px) rotateY(${(x - 0.5) * 6}deg) rotateX(${(0.5 - y) * 6}deg) translateY(-4px)`;
  });
  card.addEventListener("pointerleave", () => { card.style.transform = ""; });
});

/* ---------- Three.js: "mente" de dados ---------- */
const canvas = document.getElementById("bg");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b0d1a, 0.045);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 0, 9);

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = innerWidth < 700;

const mind = new THREE.Group();
scene.add(mind);

// Pontos sobre uma esfera (fibonacci) com leve ruído
const N = mobile ? 420 : 900;
const R = 3;
const pts = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = Math.PI * (3 - Math.sqrt(5)) * i;
  const k = R * (0.92 + Math.random() * 0.16);
  pts.push(new THREE.Vector3(Math.cos(th) * r * k, y * k, Math.sin(th) * r * k));
}

const palette = [new THREE.Color(0x6d8bff), new THREE.Color(0xa78bfa), new THREE.Color(0x2dd4bf)];
const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N);
pts.forEach((p, i) => {
  p.toArray(pos, i * 3);
  const c = palette[0].clone().lerp(palette[1], (p.y / R + 1) / 2).lerp(palette[2], Math.max(0, p.x / R) * 0.7);
  c.toArray(col, i * 3);
  seed[i] = Math.random();
});

const dotGeo = new THREE.BufferGeometry();
dotGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
dotGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
dotGeo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));

const dotMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
  vertexShader: `
    attribute vec3 color; attribute float seed;
    uniform float uTime; uniform float uPR;
    varying vec3 vColor; varying float vA;
    void main() {
      vColor = color;
      vec3 p = position * (1.0 + 0.03 * sin(uTime * 1.2 + seed * 6.28));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float tw = 0.55 + 0.45 * sin(uTime * 2.0 + seed * 40.0);
      vA = tw;
      gl_PointSize = (3.0 + 4.0 * tw) * uPR * (6.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vColor; varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vColor, a * vA);
    }`,
});
mind.add(new THREE.Points(dotGeo, dotMat));

// Conexões entre vizinhos próximos ("sinapses")
const linePos = [], lineCol = [];
const maxD = mobile ? 0.62 : 0.5;
for (let i = 0; i < N; i++) {
  let links = 0;
  for (let j = i + 1; j < N && links < 3; j++) {
    if (pts[i].distanceTo(pts[j]) < maxD) {
      linePos.push(...pts[i].toArray(), ...pts[j].toArray());
      lineCol.push(col[i * 3], col[i * 3 + 1], col[i * 3 + 2], col[j * 3], col[j * 3 + 1], col[j * 3 + 2]);
      links++;
    }
  }
}
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
lineGeo.setAttribute("color", new THREE.Float32BufferAttribute(lineCol, 3));
mind.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
})));

// Núcleo brilhante
const glowTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.25, "rgba(255,255,255,.5)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8b7bff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
core.scale.setScalar(5);
mind.add(core);

// Três produtos orbitando como satélites, com rastro
const orbiters = [0x6d8bff, 0xa78bfa, 0x2dd4bf].map((hex, i) => {
  const g = new THREE.Group();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(0.9);
  g.add(s);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.1 + i * 0.45, 0.006, 8, 200),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.25 })
  );
  const tilt = new THREE.Euler(Math.PI / 2 + (i - 1) * 0.5, (i - 1) * 0.6, 0);
  ring.rotation.copy(tilt);
  scene.add(ring);
  scene.add(g);
  return { g, r: 4.1 + i * 0.45, tilt, speed: 0.25 + i * 0.08, phase: (i * Math.PI * 2) / 3 };
});

// Poeira estelar de fundo
const starN = mobile ? 600 : 1500;
const starPos = new Float32Array(starN * 3);
for (let i = 0; i < starN; i++) {
  starPos[i * 3] = (Math.random() - 0.5) * 60;
  starPos[i * 3 + 1] = (Math.random() - 0.5) * 60;
  starPos[i * 3 + 2] = -Math.random() * 40 - 5;
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.06, color: 0xb9b0ff, transparent: true, opacity: 0.6, depthWrite: false }));
scene.add(stars);

// Interação
const mouse = new THREE.Vector2(), target = new THREE.Vector2();
addEventListener("pointermove", (e) => {
  target.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Desloca a esfera para a direita em telas largas, centraliza no mobile
  mind.position.x = w > 960 ? 3.2 : 0;
  mind.position.y = w > 960 ? 0 : w < 600 ? 4.2 : 2.6;
  // Em retrato, afasta a câmera para a esfera caber na largura
  camera.position.z = camera.aspect < 1 ? Math.min(9 / camera.aspect * 0.8, 20) : 9;
}
addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
function tick() {
  const t = clock.getElapsedTime();
  const sp = scrollY / innerHeight;

  mouse.lerp(target, 0.05);
  dotMat.uniforms.uTime.value = t;

  mind.rotation.y = t * 0.08 + mouse.x * 0.4 + sp * 0.8;
  mind.rotation.x = mouse.y * 0.25 + sp * 0.2;
  const s = 1 + Math.sin(t * 0.8) * 0.015;
  mind.scale.setScalar(s * (1 - Math.min(sp, 1.5) * 0.12));
  core.material.opacity = 0.45 + Math.sin(t * 1.6) * 0.12;

  orbiters.forEach((o) => {
    const a = t * o.speed + o.phase;
    tmp.set(Math.cos(a) * o.r, Math.sin(a) * o.r, 0).applyEuler(o.tilt);
    o.g.position.copy(tmp).add(mind.position);
  });
  scene.children.forEach((c) => { if (c.isMesh) c.position.copy(mind.position); });

  stars.rotation.z = t * 0.005;
  camera.position.x = mouse.x * 0.6;
  camera.position.y = mouse.y * 0.4 - sp * 1.2;
  camera.lookAt(mind.position.x * 0.5, -sp * 1.2, 0);

  renderer.render(scene, camera);
  if (!reduceMotion) requestAnimationFrame(tick);
}
tick();
