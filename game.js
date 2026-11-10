import * as THREE from "three";

/* =========================================================================
   CONFIG
   ========================================================================= */
const CONFIG = {
  LANE_WIDTH: 2.4,
  LANES: [-2.4, 0, 2.4],
  BASE_SPEED: 22,           // world units / second
  MAX_SPEED: 58,
  SPEED_RAMP: 0.55,         // added speed per second survived (capped by MAX)
  BOOST_MULT: 1.75,
  BOOST_DURATION: 4.0,
  BOOST_MAX: 100,
  COIN_BOOST_GAIN: 6,
  JUMP_VELOCITY: 10.5,
  GRAVITY: 28,
  SLIDE_DURATION: 0.8,
  LANE_LERP: 14,
  SPAWN_AHEAD: 220,
  DESPAWN_BEHIND: 25,
  SEGMENT_LENGTH: 24,
  ROAD_LENGTH: 480,
  PLAYER_Z: 0,
  CAMERA_OFFSET: new THREE.Vector3(0, 4.2, 9.5),
  DISTANCE_SCALE: 1,        // world units -> meters
  STORAGE_KEY: "neonRush3D.v1",
  MAX_PIXEL_RATIO_DESKTOP: 2,
  MAX_PIXEL_RATIO_MOBILE: 1.5,
};

const COLOR_PRESETS = {
  cyan:   { hex: 0x00f0ff, css: "#00f0ff" },
  pink:   { hex: 0xff2bd6, css: "#ff2bd6" },
  green:  { hex: 0x39ff14, css: "#39ff14" },
  orange: { hex: 0xff8a1f, css: "#ff8a1f" },
};

const NEON = {
  cyan: 0x00f0ff,
  pink: 0xff2bd6,
  purple: 0x9d4dff,
  blue: 0x2d7bff,
  yellow: 0xffd84d,
  red: 0xff3b6b,
};

/* =========================================================================
   STORAGE
   ========================================================================= */
const Storage = {
  defaults: {
    bestDistance: 0,
    totalCoins: 0,
    color: "cyan",
    soundOn: true,
  },
  data: null,
  load() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      this.data = { ...this.defaults, ...parsed };
      if (!COLOR_PRESETS[this.data.color]) this.data.color = "cyan";
    } catch (e) {
      this.data = { ...this.defaults };
    }
    return this.data;
  },
  save() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      /* storage may be unavailable (private mode); fail silently */
    }
  },
};

/* =========================================================================
   AUDIO (Web Audio, fully procedural, no asset files required)
   ========================================================================= */
const Audio_ = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  enabled: true,
  musicTimer: null,
  musicStep: 0,
  unlocked: false,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);
  },

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    this.unlocked = true;
  },

  setEnabled(on) {
    this.enabled = on;
    if (!this.master) return;
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
    if (!on) this.stopMusic();
    else if (this.unlocked && this.isPlayingMusic) this.startMusic();
  },

  tone({ freq = 440, type = "sine", dur = 0.15, vol = 0.3, slide = 0, delay = 0, dest = null }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  noise({ dur = 0.2, vol = 0.2, delay = 0, filterFreq = 1200 }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  },

  play(name) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case "click":
        this.tone({ freq: 880, type: "square", dur: 0.06, vol: 0.12 });
        break;
      case "select":
        this.tone({ freq: 660, type: "triangle", dur: 0.12, vol: 0.2 });
        this.tone({ freq: 990, type: "triangle", dur: 0.14, vol: 0.18, delay: 0.07 });
        break;
      case "jump":
        this.tone({ freq: 260, type: "sawtooth", dur: 0.28, vol: 0.14, slide: 520 });
        break;
      case "slide":
        this.noise({ dur: 0.25, vol: 0.12, filterFreq: 900 });
        break;
      case "coin":
        this.tone({ freq: 1320, type: "sine", dur: 0.08, vol: 0.22 });
        this.tone({ freq: 1760, type: "sine", dur: 0.12, vol: 0.2, delay: 0.06 });
        break;
      case "boost":
        this.tone({ freq: 220, type: "sawtooth", dur: 0.6, vol: 0.18, slide: 880 });
        break;
      case "crash":
        this.noise({ dur: 0.7, vol: 0.5, filterFreq: 700 });
        this.tone({ freq: 140, type: "sawtooth", dur: 0.6, vol: 0.3, slide: -90 });
        break;
      case "step":
        this.tone({ freq: 90 + Math.random() * 25, type: "triangle", dur: 0.06, vol: 0.09 });
        break;
      case "record":
        [523, 659, 784, 1046].forEach((f, i) =>
          this.tone({ freq: f, type: "triangle", dur: 0.18, vol: 0.2, delay: i * 0.1 })
        );
        break;
    }
  },

  /* Simple 4-step synth loop: bass pulse + arpeggio, scheduled ahead */
  startMusic() {
    if (!this.ctx || !this.enabled) return;
    this.stopMusic();
    this.isPlayingMusic = true;
    const bassNotes = [55, 55, 65.4, 49];
    const arp = [220, 262, 330, 392, 330, 262, 220, 196];
    let step = 0;
    const schedule = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.05;
      const stepDur = 0.22;
      const bass = bassNotes[Math.floor(step / 4) % bassNotes.length];
      this.musicTone(bass, t, 0.2, "sawtooth", 0.18);
      this.musicTone(arp[step % arp.length] * 2, t, 0.14, "square", 0.06);
      step++;
    };
    this.musicTimer = setInterval(schedule, 220);
    schedule();
  },

  musicTone(freq, t, dur, type, vol) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  stopMusic() {
    this.isPlayingMusic = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  },
};

/* =========================================================================
   UI HELPERS
   ========================================================================= */
const UI = {
  screens: {},
  current: null,
  init() {
    document.querySelectorAll(".screen").forEach((el) => {
      this.screens[el.id.replace("screen-", "")] = el;
    });
  },
  show(name) {
    Object.entries(this.screens).forEach(([k, el]) => {
      const on = k === name;
      el.classList.toggle("active", on);
    });
    this.current = name;
  },
  el(id) { return document.getElementById(id); },
  setText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent !== String(text)) el.textContent = text;
  },
  flash(msg) {
    const el = this.el("float-msg");
    el.textContent = msg;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  },
};

/* =========================================================================
   INPUT
   ========================================================================= */
const Input = {
  queue: {},
  held: {},
  swipeStart: null,
  init() {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(k) || ["a", "d", "w", "s", "p", "b", "escape"].includes(k)) {
        e.preventDefault();
      }
      if (e.repeat) return;
      this.onKey(k);
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      this.held[k] = false;
    });

    const canvas = this.el = document.getElementById("game-canvas");
    const target = document.getElementById("app");
    target.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
    target.addEventListener("touchend", (e) => this.onTouchEnd(e), { passive: false });
    target.addEventListener("touchmove", (e) => { if (Game.state === "playing") e.preventDefault(); }, { passive: false });

    document.querySelectorAll(".touch-btn").forEach((btn) => {
      const action = btn.dataset.touch;
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add("pressed");
        this.trigger(action);
      };
      btn.addEventListener("touchstart", fire, { passive: false });
      btn.addEventListener("mousedown", fire);
      const release = () => btn.classList.remove("pressed");
      btn.addEventListener("touchend", release);
      btn.addEventListener("mouseup", release);
      btn.addEventListener("mouseleave", release);
    });
  },
  el: null,
  onKey(k) {
    Audio_.unlock();
    const map = {
      arrowleft: "left", a: "left",
      arrowright: "right", d: "right",
      arrowup: "jump", w: "jump", " ": "jump",
      arrowdown: "slide", s: "slide",
      escape: "pause", p: "pause",
      b: "boost",
    };
    const action = map[k];
    if (!action) return;
    if (action === "pause") {
      Game.togglePause();
      return;
    }
    this.trigger(action);
  },
  trigger(action) {
    Audio_.unlock();
    if (Game.state !== "playing") return;
    if (action === "boost") { Game.activateBoost(); return; }
    this.queue[action] = true;
  },
  consume(action) {
    if (this.queue[action]) { this.queue[action] = false; return true; }
    return false;
  },
  onTouchStart(e) {
    if (e.target.closest(".btn, .char-card, .pause-btn, .touch-btn")) return;
    const t = e.changedTouches[0];
    this.swipeStart = { x: t.clientX, y: t.clientY, time: performance.now() };
    Audio_.unlock();
  },
  onTouchEnd(e) {
    if (!this.swipeStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this.swipeStart.x;
    const dy = t.clientY - this.swipeStart.y;
    const dt = performance.now() - this.swipeStart.time;
    this.swipeStart = null;
    const min = 30;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < min || dt > 800) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.trigger(dx > 0 ? "right" : "left");
    } else {
      this.trigger(dy < 0 ? "jump" : "slide");
    }
  },
};

/* =========================================================================
   RENDERER / SCENE
   ========================================================================= */
const World = {
  renderer: null,
  scene: null,
  camera: null,
  canvas: null,
  clock: new THREE.Clock(),
  roadSegments: [],
  buildings: [],
  lights: [],
  particles: null,
  tmpVec: new THREE.Vector3(),
  shakeTime: 0,
  shakeAmp: 0,
  mobile: false,
  quality: 1,

  init() {
    this.canvas = document.getElementById("game-canvas");
    this.mobile = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: !this.mobile,
        powerPreference: "high-performance",
        alpha: false,
      });
    } catch (e) {
      return false;
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = !this.mobile;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060f);
    this.scene.fog = new THREE.FogExp2(0x0a0820, 0.018);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);
    this.camera.position.copy(CONFIG.CAMERA_OFFSET);

    this.buildLighting();
    this.buildSky();
    this.buildRoad();
    this.buildCityBlocks();
    this.buildParticles();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 150));
    return true;
  },

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const maxPR = this.mobile ? CONFIG.MAX_PIXEL_RATIO_MOBILE : CONFIG.MAX_PIXEL_RATIO_DESKTOP;
    const pr = Math.min(window.devicePixelRatio || 1, maxPR);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    // widen FOV on narrow portrait screens so lanes stay visible
    this.camera.fov = w / h < 0.7 ? 78 : 65;
    this.camera.updateProjectionMatrix();
  },

  buildLighting() {
    const hemi = new THREE.HemisphereLight(0x3a4cff, 0x140a2a, 0.9);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0x9ad8ff, 0.6);
    key.position.set(-10, 20, 8);
    if (!this.mobile) {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -14;
      key.shadow.camera.right = 14;
      key.shadow.camera.top = 14;
      key.shadow.camera.bottom = -14;
      key.shadow.camera.far = 80;
    }
    this.scene.add(key);
    this.keyLight = key;

    this.playerLight = new THREE.PointLight(0x00f0ff, 2.2, 12, 2);
    this.playerLight.position.set(0, 2.5, 1);
    this.scene.add(this.playerLight);
  },

  buildSky() {
    const geo = new THREE.SphereGeometry(180, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x06041a) },
        mid: { value: new THREE.Color(0x2a0c4a) },
        bottom: { value: new THREE.Color(0x0b0a22) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, bottom, smoothstep(0.0, -0.4, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);

    // distant neon sun / moon disc
    const sunGeo = new THREE.CircleGeometry(14, 40);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.35, fog: false });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(0, 28, -170);
    this.scene.add(sun);
  },

  buildRoad() {
    // Base dark road slab
    const roadGeo = new THREE.PlaneGeometry(CONFIG.LANE_WIDTH * 3 + 2, CONFIG.ROAD_LENGTH);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d1f,
      roughness: 0.35,
      metalness: 0.4,
    });
    this.road = new THREE.Mesh(roadGeo, roadMat);
    this.road.rotation.x = -Math.PI / 2;
    this.road.position.z = -CONFIG.ROAD_LENGTH / 2 + 60;
    this.road.receiveShadow = !this.mobile;
    this.scene.add(this.road);

    // Glowing lane separators (animated via texture offset)
    const laneTexCanvas = document.createElement("canvas");
    laneTexCanvas.width = 64;
    laneTexCanvas.height = 256;
    const lctx = laneTexCanvas.getContext("2d");
    lctx.fillStyle = "#000";
    lctx.fillRect(0, 0, 64, 256);
    lctx.fillStyle = "#fff";
    lctx.fillRect(28, 0, 8, 128);
    const grad = lctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    lctx.fillStyle = grad;
    lctx.fillRect(28, 0, 8, 256);
    const laneTex = new THREE.CanvasTexture(laneTexCanvas);
    laneTex.wrapS = laneTex.wrapT = THREE.RepeatWrapping;
    laneTex.repeat.set(1, CONFIG.ROAD_LENGTH / 6);
    this.laneTex = laneTex;

    const laneMat = new THREE.MeshBasicMaterial({
      map: laneTex,
      color: NEON.cyan,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const laneGeo = new THREE.PlaneGeometry(0.18, CONFIG.ROAD_LENGTH);
    const lineXs = [-CONFIG.LANE_WIDTH * 0.5 - 0.0, CONFIG.LANE_WIDTH * 0.5];
    this.laneLines = [];
    lineXs.forEach((x) => {
      const line = new THREE.Mesh(laneGeo, laneMat.clone());
      line.material.map = laneTex;
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.02, this.road.position.z);
      this.scene.add(line);
      this.laneLines.push(line);
    });

    // Edge neon rails
    const railGeo = new THREE.BoxGeometry(0.2, 0.25, CONFIG.ROAD_LENGTH);
    const railMatL = new THREE.MeshBasicMaterial({ color: NEON.pink });
    const railMatR = new THREE.MeshBasicMaterial({ color: NEON.cyan });
    const edge = CONFIG.LANE_WIDTH * 1.5 + 0.2;
    const railL = new THREE.Mesh(railGeo, railMatL);
    railL.position.set(-edge, 0.12, this.road.position.z);
    const railR = new THREE.Mesh(railGeo, railMatR);
    railR.position.set(edge, 0.12, this.road.position.z);
    this.scene.add(railL, railR);

    // Sidewalk slabs
    const sideGeo = new THREE.BoxGeometry(6, 0.3, CONFIG.ROAD_LENGTH);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x14122e, roughness: 0.6, metalness: 0.2 });
    const sideL = new THREE.Mesh(sideGeo, sideMat);
    sideL.position.set(-edge - 3.2, 0.15, this.road.position.z);
    const sideR = new THREE.Mesh(sideGeo, sideMat);
    sideR.position.set(edge + 3.2, 0.15, this.road.position.z);
    this.scene.add(sideL, sideR);
  },

  buildCityBlocks() {
    // Pool of building meshes, recycled as the player advances
    const palette = [NEON.cyan, NEON.pink, NEON.purple, NEON.blue];
    this.buildingPool = [];
    const count = this.mobile ? 36 : 64;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const w = 4 + Math.random() * 5;
      const h = 8 + Math.random() * 26;
      const d = 6 + Math.random() * 8;
      const color = palette[i % palette.length];
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: 0x0a0c1e, roughness: 0.8, metalness: 0.1, emissive: 0x000000 })
      );
      const trimGeo = new THREE.BoxGeometry(w + 0.1, 0.18, d + 0.1);
      const trim = new THREE.Mesh(trimGeo, new THREE.MeshBasicMaterial({ color }));
      trim.position.y = h / 2;
      body.add(trim);

      // window strips
      const winMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 });
      const stripes = Math.floor(h / 2.2);
      for (let s = 0; s < stripes; s++) {
        if (Math.random() < 0.35) continue;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.12, 0.12), winMat);
        strip.position.set(0, -h / 2 + 1.5 + s * 2.2, d / 2 + 0.02);
        body.add(strip);
      }

      body.userData = { side, w, h, d, baseX: 0, z: 0, color };
      body.visible = false;
      this.scene.add(body);
      this.buildingPool.push(body);
    }
    // Scatter an initial set of buildings along the street; the cursor marks
    // where the next row appears at the far end and scrolls with the world
    for (let z = 40; z > -240; z -= 18) this.spawnBuildingRow(z);
    this.buildingCursor = -240;
  },

  /* Places one building on each side at depth z, reusing hidden pool members */
  spawnBuildingRow(z) {
    for (const sideSign of [-1, 1]) {
      const b = this.buildingPool.find((m) => !m.visible);
      if (!b) return;
      const u = b.userData;
      const edge = CONFIG.LANE_WIDTH * 1.5 + 6 + u.w / 2 + Math.random() * 3;
      b.position.set(sideSign * edge, u.h / 2, z - Math.random() * 4);
      b.visible = true;
      u.z = z;
    }
  },

  buildParticles() {
    // Neon sparks used for coin pickup and boost trail; pooled
    const count = this.mobile ? 120 : 220;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const col = new Float32Array(count * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.particles = { geo, pos, vel, life, col, count, cursor: 0, mesh: new THREE.Points(geo, mat) };
    this.scene.add(this.particles.mesh);

    // Ambient floating dust/neon motes that drift past the camera
    const ambCount = this.mobile ? 80 : 160;
    const ambGeo = new THREE.BufferGeometry();
    const ambPos = new Float32Array(ambCount * 3);
    for (let i = 0; i < ambCount; i++) {
      ambPos[i * 3] = (Math.random() - 0.5) * 26;
      ambPos[i * 3 + 1] = Math.random() * 10 + 0.5;
      ambPos[i * 3 + 2] = -Math.random() * 160;
    }
    ambGeo.setAttribute("position", new THREE.BufferAttribute(ambPos, 3));
    const ambMat = new THREE.PointsMaterial({
      size: 0.12,
      color: 0x8fe9ff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ambient = { geo: ambGeo, pos: ambPos, count: ambCount, mesh: new THREE.Points(ambGeo, ambMat) };
    this.scene.add(this.ambient.mesh);
  },

  emitBurst(x, y, z, colorHex, n = 14) {
    const p = this.particles;
    const c = new THREE.Color(colorHex);
    for (let k = 0; k < n; k++) {
      const i = p.cursor;
      p.cursor = (p.cursor + 1) % p.count;
      p.pos[i * 3] = x;
      p.pos[i * 3 + 1] = y;
      p.pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 5;
      p.vel[i * 3] = Math.cos(a) * s;
      p.vel[i * 3 + 1] = Math.sin(a) * s * 0.7 + 2;
      p.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      p.life[i] = 0.6 + Math.random() * 0.4;
      p.col[i * 3] = c.r;
      p.col[i * 3 + 1] = c.g;
      p.col[i * 3 + 2] = c.b;
    }
    p.geo.attributes.color.needsUpdate = true;
  },

  updateParticles(dt) {
    const p = this.particles;
    for (let i = 0; i < p.count; i++) {
      if (p.life[i] <= 0) {
        p.pos[i * 3 + 1] = -100;
        continue;
      }
      p.life[i] -= dt;
      p.vel[i * 3 + 1] -= 14 * dt;
      p.pos[i * 3] += p.vel[i * 3] * dt;
      p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt;
      p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
      if (p.pos[i * 3 + 1] < 0.05) p.pos[i * 3 + 1] = 0.05;
    }
    p.geo.attributes.position.needsUpdate = true;
  },

  updateAmbient(dt, speed) {
    const a = this.ambient;
    for (let i = 0; i < a.count; i++) {
      a.pos[i * 3 + 2] += speed * dt * 0.6;
      if (a.pos[i * 3 + 2] > 6) {
        a.pos[i * 3 + 2] = -160 - Math.random() * 40;
        a.pos[i * 3] = (Math.random() - 0.5) * 26;
        a.pos[i * 3 + 1] = Math.random() * 10 + 0.5;
      }
    }
    a.geo.attributes.position.needsUpdate = true;
  },

  render() {
    this.renderer.render(this.scene, this.camera);
  },
};

/* =========================================================================
   OBJECT FACTORIES (obstacles, coins, pickups)
   ========================================================================= */
const Factory = {
  geos: {},
  mats: {},

  geo(key, make) {
    if (!this.geos[key]) this.geos[key] = make();
    return this.geos[key];
  },
  mat(key, make) {
    if (!this.mats[key]) this.mats[key] = make();
    return this.mats[key];
  },

  coin() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      this.geo("coinRing", () => new THREE.TorusGeometry(0.42, 0.1, 10, 22)),
      this.mat("coinRing", () => new THREE.MeshBasicMaterial({ color: NEON.yellow }))
    );
    const core = new THREE.Mesh(
      this.geo("coinCore", () => new THREE.CircleGeometry(0.32, 18)),
      this.mat("coinCore", () => new THREE.MeshBasicMaterial({ color: 0xfff3a6, transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
    );
    group.add(ring, core);
    group.userData.kind = "coin";
    return group;
  },

  /* Neon barrier: low horizontal bar to jump OVER */
  barrier() {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(
      this.geo("barBox", () => new THREE.BoxGeometry(2.0, 0.8, 0.6)),
      this.mat("barMat", () => new THREE.MeshStandardMaterial({ color: 0x1a0b2e, emissive: 0xff2bd6, emissiveIntensity: 0.8, roughness: 0.4 }))
    );
    bar.position.y = 0.4;
    const glow = new THREE.Mesh(
      this.geo("barGlow", () => new THREE.BoxGeometry(2.1, 0.12, 0.7)),
      this.mat("barGlowMat", () => new THREE.MeshBasicMaterial({ color: NEON.pink }))
    );
    glow.position.y = 0.82;
    g.add(bar, glow);
    g.userData = { kind: "obstacle", type: "barrier", hitH: 0.8, slideSafe: false, lethalLanes: 1 };
    return g;
  },

  /* Road block: full-height solid block, must change lane */
  roadBlock() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      this.geo("rbBox", () => new THREE.BoxGeometry(1.9, 2.2, 1.4)),
      this.mat("rbMat", () => new THREE.MeshStandardMaterial({ color: 0x0d0a1f, roughness: 0.5, metalness: 0.5, emissive: 0x2d7bff, emissiveIntensity: 0.25 }))
    );
    body.position.y = 1.1;
    const stripe = new THREE.Mesh(
      this.geo("rbStripe", () => new THREE.BoxGeometry(1.92, 0.16, 1.42)),
      this.mat("rbStripe", () => new THREE.MeshBasicMaterial({ color: NEON.cyan }))
    );
    stripe.position.y = 1.9;
    g.add(body, stripe);
    g.userData = { kind: "obstacle", type: "roadblock", hitH: 2.2, slideSafe: false, lethalLanes: 1 };
    return g;
  },

  /* Overhead energy barrier: must SLIDE under */
  overhead() {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(
      this.geo("ohBox", () => new THREE.BoxGeometry(2.2, 0.55, 0.5)),
      this.mat("ohMat", () => new THREE.MeshStandardMaterial({ color: 0x0a0a18, emissive: NEON.cyan, emissiveIntensity: 0.9 }))
    );
    bar.position.y = 2.1;
    const p1 = new THREE.Mesh(this.geo("ohPost", () => new THREE.BoxGeometry(0.22, 2.1, 0.22)), this.mat("ohPostMat", () => new THREE.MeshBasicMaterial({ color: NEON.cyan })));
    p1.position.set(-1.05, 1.05, 0);
    const p2 = p1.clone();
    p2.position.x = 1.05;
    g.add(bar, p1, p2);
    g.userData = { kind: "obstacle", type: "overhead", hitH: 2.5, slideSafe: true, lethalLanes: 1, bottomY: 1.85 };
    return g;
  },

  /* Laser gate: two posts + beam, dangerous if you are in the lane at beam height */
  laserGate() {
    const g = new THREE.Group();
    const postGeo = this.geo("lgPost", () => new THREE.BoxGeometry(0.25, 2.4, 0.25));
    const postMat = this.mat("lgPostMat", () => new THREE.MeshBasicMaterial({ color: NEON.red }));
    const p1 = new THREE.Mesh(postGeo, postMat);
    p1.position.set(-1.05, 1.2, 0);
    const p2 = new THREE.Mesh(postGeo, postMat);
    p2.position.set(1.05, 1.2, 0);
    const beam = new THREE.Mesh(
      this.geo("lgBeam", () => new THREE.BoxGeometry(2.2, 0.14, 0.14)),
      this.mat("lgBeamMat", () => new THREE.MeshBasicMaterial({ color: 0xff7a9c }))
    );
    beam.position.y = 1.0;
    g.add(p1, p2, beam);
    g.userData = { kind: "obstacle", type: "laser", hitH: 2.4, slideSafe: false, lethalLanes: 1, beamY: 1.0 };
    return g;
  },

  /* Energy wall: a full-width pulsing wall in one lane (jump over or change lane) */
  energyBarrier() {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(
      this.geo("ebWall", () => new THREE.BoxGeometry(2.3, 1.5, 0.25)),
      this.mat("ebWallMat", () => new THREE.MeshBasicMaterial({ color: NEON.purple, transparent: true, opacity: 0.55 }))
    );
    wall.position.y = 0.95;
    const frame = new THREE.Mesh(
      this.geo("ebFrame", () => new THREE.BoxGeometry(2.4, 1.6, 0.3)),
      this.mat("ebFrame", () => new THREE.MeshBasicMaterial({ color: NEON.pink, wireframe: true }))
    );
    frame.position.y = 0.95;
    g.add(wall, frame);
    g.userData = { kind: "obstacle", type: "energy", hitH: 1.6, slideSafe: false, lethalLanes: 1, pulse: Math.random() * 6 };
    return g;
  },
};

/* =========================================================================
   PLAYER
   ========================================================================= */
const Player = {
  group: null,
  body: null,
  head: null,
  legL: null,
  legR: null,
  armL: null,
  armR: null,
  glow: null,
  shadow: null,
  lane: 1,
  x: 0,
  y: 0,
  vy: 0,
  onGround: true,
  sliding: false,
  slideTimer: 0,
  runPhase: 0,
  colorHex: NEON.cyan,
  invincible: 0,

  build(colorHex) {
    if (this.group) World.scene.remove(this.group);
    this.colorHex = colorHex;
    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0c0d20, roughness: 0.4, metalness: 0.6 });
    const neonMat = new THREE.MeshBasicMaterial({ color: colorHex });

    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.42), bodyMat);
    torso.position.y = 1.35;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.05), neonMat);
    chest.position.set(0, 1.45, 0.23);
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), bodyMat);
    this.head.position.y = 2.0;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), neonMat);
    visor.position.set(0, 2.02, 0.24);
    this.body.add(torso, chest, this.head, visor);

    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    const armGeo = new THREE.BoxGeometry(0.16, 0.65, 0.16);
    const armMeshL = new THREE.Mesh(armGeo, bodyMat);
    armMeshL.position.y = -0.3;
    const armMeshR = armMeshL.clone();
    this.armL.add(armMeshL);
    this.armR.add(armMeshR);
    this.armL.position.set(-0.46, 1.7, 0);
    this.armR.position.set(0.46, 1.7, 0);
    this.body.add(this.armL, this.armR);

    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.2, 0.8, 0.22);
    const legMeshL = new THREE.Mesh(legGeo, bodyMat);
    legMeshL.position.y = -0.4;
    const legMeshR = legMeshL.clone();
    this.legL.add(legMeshL);
    this.legR.add(legMeshR);
    this.legL.position.set(-0.18, 0.95, 0);
    this.legR.position.set(0.18, 0.95, 0);
    this.body.add(this.legL, this.legR);

    // neon stripes on legs
    const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.24), neonMat);
    stripeL.position.y = -0.2;
    this.legL.add(stripeL);
    const stripeR = stripeL.clone();
    this.legR.add(stripeR);

    this.group.add(this.body);

    // glow halo
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 14, 10),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.glow.position.y = 1.2;
    this.group.add(this.glow);

    // ground shadow disc
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.group.add(this.shadow);

    this.group.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = !World.mobile; });
    World.scene.add(this.group);
  },

  reset() {
    this.lane = 1;
    this.x = CONFIG.LANES[1];
    this.y = 0;
    this.vy = 0;
    this.onGround = true;
    this.sliding = false;
    this.slideTimer = 0;
    this.runPhase = 0;
    this.invincible = 0;
    this.group.position.set(this.x, 0, CONFIG.PLAYER_Z);
    this.applySlidePose(false);
  },

  changeLane(dir) {
    const next = Math.max(0, Math.min(2, this.lane + dir));
    if (next === this.lane) return false;
    this.lane = next;
    return true;
  },

  jump() {
    if (!this.onGround || this.sliding) return false;
    this.vy = CONFIG.JUMP_VELOCITY;
    this.onGround = false;
    return true;
  },

  slide() {
    if (!this.onGround || this.sliding) return false;
    this.sliding = true;
    this.slideTimer = CONFIG.SLIDE_DURATION;
    return true;
  },

  applySlidePose(on) {
    if (!this.body) return;
    this.body.rotation.x = on ? -0.9 : 0;
    this.body.position.y = on ? -0.55 : 0;
  },

  update(dt, speed) {
    // lane lerp
    const targetX = CONFIG.LANES[this.lane];
    this.x += (targetX - this.x) * Math.min(1, CONFIG.LANE_LERP * dt);
    this.group.position.x = this.x;

    // vertical physics
    if (!this.onGround) {
      this.vy -= CONFIG.GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.onGround = true;
      }
    }
    this.group.position.y = this.y;

    // slide timer
    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.sliding = false;
        this.applySlidePose(false);
      } else if (this.body.rotation.x !== -0.9) {
        this.applySlidePose(true);
      }
    }

    // run cycle
    this.runPhase += dt * (6 + speed * 0.18);
    const swing = this.onGround && !this.sliding ? Math.sin(this.runPhase) * 0.9 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    if (!this.onGround) {
      this.legL.rotation.x = -0.6;
      this.legR.rotation.x = 0.5;
      this.armL.rotation.x = -2.2;
      this.armR.rotation.x = -2.2;
    }
    if (this.sliding) {
      this.legL.rotation.x = -1.2;
      this.legR.rotation.x = -1.2;
    }

    // slight bob + glow pulse
    if (this.onGround && !this.sliding) this.body.position.y = Math.abs(Math.sin(this.runPhase)) * 0.08;
    this.glow.material.opacity = 0.07 + 0.04 * Math.sin(performance.now() * 0.006);
    this.glow.scale.setScalar(1 + 0.06 * Math.sin(performance.now() * 0.008));

    // invincibility blink
    if (this.invincible > 0) {
      this.invincible -= dt;
      this.body.visible = Math.floor(this.invincible * 14) % 2 === 0;
    } else {
      this.body.visible = true;
    }

    // shadow scale with height
    const s = Math.max(0.4, 1 - this.y * 0.25);
    this.shadow.scale.setScalar(s);
    this.shadow.material.opacity = 0.45 * s;
  },

  /* Collision volume in lane-local terms */
  box() {
    const sliding = this.sliding;
    return {
      x: this.x,
      yMin: this.y,
      yMax: this.y + (sliding ? 0.9 : 1.9),
      halfW: 0.45,
      halfD: 0.4,
      z: CONFIG.PLAYER_Z,
    };
  },
};

/* =========================================================================
   LEVEL / SPAWNING
   ========================================================================= */
const Level = {
  entities: [],          // { obj, kind, lane, z, active }
  nextSpawnZ: 0,
  spawnGap: 16,
  coinChance: 0.6,
  pattern: 0,

  reset() {
    this.entities.forEach((e) => this.remove(e));
    this.entities = [];
    this.nextSpawnZ = -40;
    this.spawnGap = 16;
  },

  remove(e) {
    World.scene.remove(e.obj);
    e.obj.visible = false;
    e.dead = true;
  },

  difficulty(distance) {
    // 0..1 ramp over roughly the first 1200 m
    return Math.min(1, distance / 1200);
  },

  spawnAhead(zFar, distance) {
    const d = this.difficulty(distance);
    while (this.nextSpawnZ > zFar * -1) {
      const z = this.nextSpawnZ - 0;
      this.spawnRow(z, d);
      this.nextSpawnZ -= this.spawnGap - d * 5 + Math.random() * 4;
    }
  },

  spawnRow(z, d) {
    // roll a pattern: 0 = single obstacle, 1 = two lanes blocked, 2 = coin line, 3 = mixed
    const roll = Math.random();
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);

    if (roll < 0.12 + d * 0.1) {
      // coin trail in a random lane
      this.spawnCoinLine(lanes[0], z, 6);
      return;
    }

    if (roll < 0.55) {
      const count = Math.random() < 0.25 + d * 0.3 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const type = this.pickObstacleType(d);
        this.spawnObstacle(type, lanes[i], z);
      }
      // leave a safe lane sometimes with coins
      if (Math.random() < this.coinChance) this.spawnCoinLine(lanes[count], z - 2, 4);
      return;
    }

    // mixed: coins in one lane, obstacle in another
    this.spawnObstacle(this.pickObstacleType(d), lanes[0], z);
    this.spawnCoinLine(lanes[1], z - 3, 5);
  },

  pickObstacleType(d) {
    const pool = ["barrier", "roadblock", "laser", "energy", "overhead"];
    const weights = [3, 2, 1.2 + d * 1.5, 1.2 + d * 1.5, 1 + d * 1.5];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return "barrier";
  },

  spawnObstacle(type, lane, z) {
    let obj;
    switch (type) {
      case "barrier": obj = Factory.barrier(); break;
      case "roadblock": obj = Factory.roadBlock(); break;
      case "laser": obj = Factory.laserGate(); break;
      case "energy": obj = Factory.energyBarrier(); break;
      case "overhead": obj = Factory.overhead(); break;
      default: obj = Factory.barrier();
    }
    obj.position.set(CONFIG.LANES[lane], 0, z);
    World.scene.add(obj);
    Level.entities.push({ obj, kind: "obstacle", type: obj.userData.type, lane, z, dead: false, hit: false });
  },

  spawnCoinLine(lane, z, count) {
    for (let i = 0; i < count; i++) {
      const c = Factory.coin();
      c.position.set(CONFIG.LANES[lane], 1.0 + (Math.sin(i * 0.5) * 0.0), z - i * 1.6);
      World.scene.add(c);
      this.entities.push({ obj: c, kind: "coin", lane, z: z - i * 1.6, dead: false, phase: Math.random() * 6 });
    }
  },

  /* Remove entities behind the player, spawn ahead */
  cull(playerZ) {
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e.z > CONFIG.DESPAWN_BEHIND) this.remove(e);
    }
    this.entities = this.entities.filter((e) => !e.dead);
  },
};

/* =========================================================================
   GAME CONTROLLER
   ========================================================================= */
const Game = {
  state: "boot",     // boot | menu | characters | playing | paused | over | final
  distance: 0,
  coins: 0,
  speed: CONFIG.BASE_SPEED,
  topSpeed: 0,
  boostEnergy: 0,
  boostActive: 0,
  elapsed: 0,
  scroll: 0,
  color: "cyan",
  newRecord: false,
  lastHudKey: "",

  init() {
    Storage.load();
    this.color = Storage.data.color;
    this.refreshMenuStats();
    this.syncSoundUI();
    this.updateCharSelection();
  },

  refreshMenuStats() {
    UI.setText("menu-best", `${Math.floor(Storage.data.bestDistance)} m`);
    UI.setText("menu-coins", Storage.data.totalCoins);
    UI.setText("hud-best", `${Math.floor(Storage.data.bestDistance)} m`);
  },

  syncSoundUI() {
    const label = Storage.data.soundOn ? "SOUND: ON" : "SOUND: OFF";
    document.querySelectorAll("[data-action='toggle-sound'] span, .sound-label").forEach((el) => (el.textContent = label));
    Audio_.setEnabled(Storage.data.soundOn);
  },

  updateCharSelection() {
    document.querySelectorAll(".char-card").forEach((card) => {
      card.classList.toggle("selected", card.dataset.color === this.color);
    });
  },

  start() {
    Audio_.unlock();
    Audio_.play("select");
    this.resetRun();
    this.state = "playing";
    UI.show("hud");
    this.setBoostButton();
    UI.flash("GO!");
    if (Storage.data.soundOn) Audio_.startMusic();
  },

  resetRun() {
    Level.reset();
    Player.build(COLOR_PRESETS[this.color].hex);
    Player.reset();
    this.distance = 0;
    this.coins = 0;
    this.speed = CONFIG.BASE_SPEED;
    this.topSpeed = CONFIG.BASE_SPEED;
    this.boostEnergy = 0;
    this.boostActive = 0;
    this.elapsed = 0;
    this.scroll = 0;
    this.newRecord = false;
    this.lastHudKey = "";
    this.stepTimer = 0;
    Level.nextSpawnZ = -30;
    Level.spawnAhead(CONFIG.SPAWN_AHEAD, 0);
    World.particles.life.fill(0);
    World.emitBurst(0, 0.5, 0, 0x00f0ff, 0);
  },

  restart() {
    this.start();
  },

  togglePause() {
    if (this.state === "playing") {
      this.state = "paused";
      Audio_.stopMusic();
      UI.show("pause");
    } else if (this.state === "paused") {
      this.resume();
    }
  },

  resume() {
    if (this.state !== "paused") return;
    Audio_.unlock();
    this.state = "playing";
    UI.show("hud");
    this.setBoostButton();
    if (Storage.data.soundOn) Audio_.startMusic();
  },

  activateBoost() {
    if (this.boostEnergy < CONFIG.BOOST_MAX || this.boostActive > 0) return;
    this.boostActive = CONFIG.BOOST_DURATION;
    this.boostEnergy = 0;
    Audio_.play("boost");
    UI.flash("BOOST!");
    World.emitBurst(Player.x, 1.2, 0, 0xff2bd6, 24);
  },

  setBoostButton() {
    const btn = UI.el("boost-btn");
    if (btn) btn.disabled = this.boostEnergy < CONFIG.BOOST_MAX || this.boostActive > 0;
  },

  collectCoin(e) {
    if (e.dead) return;
    e.dead = true;
    World.scene.remove(e.obj);
    e.obj.visible = false;
    this.coins += 1;
    this.boostEnergy = Math.min(CONFIG.BOOST_MAX, this.boostEnergy + CONFIG.COIN_BOOST_GAIN);
    Audio_.play("coin");
    World.emitBurst(e.obj.position.x, 1.2, e.obj.position.z, NEON.yellow, 12);
  },

  crash(obstacle) {
    if (this.state !== "playing") return;
    this.state = "over";
    Audio_.play("crash");
    Audio_.stopMusic();
    World.shakeTime = 0.45;
    World.shakeAmp = 0.5;
    World.emitBurst(Player.x, 1.0, 0, COLOR_PRESETS[this.color].hex, 40);

    const reasonEl = UI.el("go-reason");
    if (reasonEl) {
      const reasons = {
        barrier: "You hit a neon barrier. Jump higher next time.",
        roadblock: "Solid road block. Change lanes quickly.",
        laser: "Caught in a laser gate.",
        energy: "Energy wall. Jump over it or dodge sideways.",
        overhead: "Overhead barrier. Slide under it.",
      };
      reasonEl.textContent = reasons[obstacle?.type] || "You crashed.";
    }

    // persist totals
    const finalDist = Math.floor(this.distance);
    Storage.data.totalCoins += this.coins;
    const isRecord = finalDist > Storage.data.bestDistance && finalDist > 0;
    if (isRecord) Storage.data.bestDistance = finalDist;
    Storage.save();
    this.newRecord = isRecord;
    this.refreshMenuStats();

    setTimeout(() => {
      if (this.state === "over") UI.show("gameover");
    }, 900);
  },

  showFinal() {
    UI.setText("final-distance", `${Math.floor(this.distance)} m`);
    UI.setText("final-coins", this.coins);
    UI.setText("final-speed", `${Math.floor(this.topSpeed * 3.6)} km/h`);
    UI.setText("final-best", `${Math.floor(Storage.data.bestDistance)} m`);
    const rec = UI.el("new-record");
    if (rec) rec.classList.toggle("hidden", !this.newRecord);
    if (this.newRecord) Audio_.play("record");
    UI.show("final");
    this.state = "final";
  },

  hudUpdate() {
    const kmh = Math.floor(this.speed * 3.6);
    const dist = `${Math.floor(this.distance)} m`;
    const key = `${dist}|${kmh}|${this.coins}|${Math.floor(this.boostEnergy)}|${this.boostActive > 0 ? 1 : 0}`;
    if (key === this.lastHudKey) return;
    this.lastHudKey = key;
    UI.setText("hud-distance", dist);
    UI.setText("hud-speed", `${kmh} km/h`);
    UI.setText("hud-coins", this.coins);
    const fill = UI.el("boost-fill");
    if (fill) fill.style.width = `${(this.boostEnergy / CONFIG.BOOST_MAX) * 100}%`;
    this.setBoostButton();
  },

  update(dt) {
    this.elapsed += dt;
    // difficulty ramp
    const targetBase = Math.min(CONFIG.MAX_SPEED, CONFIG.BASE_SPEED + this.elapsed * CONFIG.SPEED_RAMP);
    this.speed = targetBase * (this.boostActive > 0 ? CONFIG.BOOST_MULT : 1);
    if (this.boostActive > 0) this.boostActive = Math.max(0, this.boostActive - dt);
    this.topSpeed = Math.max(this.topSpeed, this.speed);

    const moveStep = this.speed * dt;
    this.distance += moveStep * CONFIG.DISTANCE_SCALE;
    this.scroll += moveStep;

    // consume input
    if (Input.consume("left")) {
      if (Player.changeLane(-1)) Audio_.play("step");
    }
    if (Input.consume("right")) {
      if (Player.changeLane(1)) Audio_.play("step");
    }
    if (Input.consume("jump")) {
      if (Player.jump()) Audio_.play("jump");
    }
    if (Input.consume("slide")) {
      if (Player.slide()) Audio_.play("slide");
    }

    Player.update(dt, this.speed);
    if (Player.onGround && Player.sliding === false) {
      this.stepTimer = (this.stepTimer || 0) + dt;
      if (this.stepTimer > 0.32) {
        this.stepTimer = 0;
        Audio_.play("step");
      }
    }

    // move every entity toward the camera (world moves, player stays at z=0)
    for (const e of Level.entities) {
      if (e.dead) continue;
      e.prevZ = e.z;
      e.z += moveStep;
      e.obj.position.z = e.z;
      if (e.kind === "coin") {
        e.obj.rotation.y += dt * 4;
        e.obj.position.y = 1.0 + Math.sin(this.elapsed * 3 + e.phase) * 0.15;
      }
      if (e.kind === "obstacle" && e.type === "energy") {
        e.obj.userData.pulse += dt * 6;
        const s = 1 + Math.sin(e.obj.userData.pulse) * 0.05;
        e.obj.scale.set(1, s, 1);
      }
    }

    // collision & pickup
    this.checkCollisions();

    // spawn & cull
    Level.spawnAhead(CONFIG.SPAWN_AHEAD, this.distance);
    Level.cull(0);

    // world scroll: road lane texture offset, buildings, ambient dust
    if (World.laneTex) World.laneTex.offset.y = -this.scroll / 6;
    this.updateBuildings(moveStep);
    World.updateAmbient(dt, this.speed);
    World.updateParticles(dt);

    // boost builds up only through coins (+ slow passive trickle while sprinting)
    if (this.boostActive <= 0) this.boostEnergy = Math.min(CONFIG.BOOST_MAX, this.boostEnergy + dt * 0.4);
    this.hudUpdate();
  },

  checkCollisions() {
    const pb = Player.box();
    for (const e of Level.entities) {
      if (e.dead) continue;
      // Swept interval: the entity may have crossed the player's depth this frame
      // (prevents tunnelling at boost speed or low frame rates)
      const prev = e.prevZ === undefined ? e.z : e.prevZ;
      const lo = Math.min(prev, e.z);
      const hi = Math.max(prev, e.z);
      const pad = e.kind === "coin" ? 0.7 : 0.9;
      const overlapsDepth = hi + pad >= pb.z - 0.9 && lo - pad <= pb.z + 0.9;

      if (e.kind === "coin") {
        if (overlapsDepth && Math.abs(e.obj.position.x - pb.x) < 0.9 && Math.abs(e.obj.position.y - 1.2) < 1.4) {
          this.collectCoin(e);
        }
        continue;
      }

      if (e.kind === "obstacle") {
        if (!overlapsDepth) continue;
        if (Math.abs(e.obj.position.x - pb.x) > 1.05) continue;
        const u = e.obj.userData;
        let hit = false;
        switch (u.type) {
          case "barrier":
            hit = pb.yMin < u.hitH - 0.05;
            break;
          case "roadblock":
            hit = pb.yMin < u.hitH - 0.05;
            break;
          case "energy":
            hit = pb.yMin < u.hitH - 0.05;
            break;
          case "laser":
            hit = pb.yMin < u.beamY + 0.2 && pb.yMax > u.beamY - 0.2;
            break;
          case "overhead":
            // hit if the player's head reaches under the bar (bottom at bottomY)
            hit = pb.yMax > u.bottomY;
            break;
        }
        if (hit) {
          this.crash(u);
          return;
        }
      }
    }
  },

  updateBuildings(moveStep) {
    for (const b of World.buildingPool) {
      if (!b.visible) continue;
      b.position.z += moveStep;
      if (b.position.z > 30) b.visible = false;
    }
    // Scroll the spawn cursor with the world and add rows at the far end
    World.buildingCursor += moveStep;
    while (World.buildingCursor > -240) {
      World.spawnBuildingRow(World.buildingCursor);
      World.buildingCursor -= 18;
    }
  },

  /* --------- Main loop --------- */
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dtRaw = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;

    if (this.state === "playing") {
      this.update(dtRaw);
    } else if (this.state === "over") {
      // let particles & shake finish
      World.updateParticles(dtRaw);
    }

    // camera follow
    const cam = World.camera;
    const tx = Player.x * 0.6;
    cam.position.x += (tx - cam.position.x) * Math.min(1, 6 * dtRaw);
    cam.position.y = CONFIG.CAMERA_OFFSET.y + (Player.y * 0.25);
    cam.position.z = CONFIG.CAMERA_OFFSET.z;
    cam.lookAt(cam.position.x * 0.3, 1.4, -10);

    if (World.shakeTime > 0) {
      World.shakeTime -= dtRaw;
      const s = World.shakeAmp * Math.max(0, World.shakeTime);
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }

    // player point light follows
    World.playerLight.position.set(Player.x, 2.5, 1);
    World.playerLight.intensity = 1.8 + Math.sin(now * 0.01) * 0.3;

    // dynamic neon colours shift slowly for atmosphere
    if (World.sky) {
      World.sky.material.uniforms.top.value.setHSL(0.72 + Math.sin(now * 0.00005) * 0.03, 0.7, 0.05);
    }

    World.render();
  },
};

/* =========================================================================
   BOOTSTRAP
   ========================================================================= */
function setupControls() {
  // buttons with data-action
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const sound = btn.dataset.sound;
    if (sound) Audio_.play(sound);
    handleAction(action);
  });

  // character cards
  document.querySelectorAll(".char-card").forEach((card) => {
    card.addEventListener("click", () => {
      Game.color = card.dataset.color;
      Storage.data.color = Game.color;
      Storage.save();
      Game.updateCharSelection();
    });
  });

  // mouse-down pulse for button hover sound already done via click
}

function handleAction(action) {
  switch (action) {
    case "play":
      Game.start();
      break;
    case "pause":
      Game.togglePause();
      break;
    case "resume":
      Game.resume();
      break;
    case "restart":
      Game.start();
      break;
    case "goto-characters":
      UI.show("characters");
      Game.updateCharSelection();
      break;
    case "back-menu":
    case "quit-menu":
      Audio_.stopMusic();
      Game.state = "menu";
      Game.refreshMenuStats();
      UI.show("menu");
      break;
    case "show-help":
      UI.el("help-overlay").classList.remove("hidden");
      break;
    case "hide-help":
      UI.el("help-overlay").classList.add("hidden");
      break;
    case "toggle-sound":
      Storage.data.soundOn = !Storage.data.soundOn;
      Storage.save();
      Game.syncSoundUI();
      if (!Storage.data.soundOn) Audio_.stopMusic();
      else if (Game.state === "playing") Audio_.startMusic();
      break;
    case "boost":
      Game.activateBoost();
      break;
    case "show-final":
      Game.showFinal();
      break;
  }
}

function runSplash() {
  const bar = document.getElementById("loader-bar");
  const hint = document.getElementById("splash-hint");
  let p = 0;
  const step = () => {
    p += 6 + Math.random() * 14;
    if (p >= 100) {
      p = 100;
      bar.style.width = "100%";
      hint.textContent = "Tap to start";
      const go = () => {
        Audio_.unlock();
        document.removeEventListener("pointerdown", go);
        document.removeEventListener("keydown", go);
        Game.state = "menu";
        UI.show("menu");
      };
      document.addEventListener("pointerdown", go);
      document.addEventListener("keydown", go);
      return;
    }
    bar.style.width = `${p}%`;
    setTimeout(step, 90);
  };
  step();
}

function showWebGLError() {
  UI.show(null);
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  UI.el("webgl-error").classList.remove("hidden");
  UI.el("webgl-error").classList.add("active");
}

function boot() {
  UI.init();
  Input.init();
  setupControls();
  Game.init();

  const ok = World.init();
  if (!ok) {
    showWebGLError();
    return;
  }
  Player.build(COLOR_PRESETS[Game.color].hex);
  Player.reset();
  Level.reset();

  // Warm the scene once so the first frame is not blank
  Level.spawnAhead(CONFIG.SPAWN_AHEAD, 0);
  World.render();

  Game.lastFrame = performance.now();
  requestAnimationFrame((t) => Game.loop(t));
  runSplash();
}

window.addEventListener("DOMContentLoaded", boot);
