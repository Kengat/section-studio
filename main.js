import { VERT, FRAG } from "./shader.js";
import { PARAMS, GROUPS, DEFAULTS, PRESETS } from "./params.js";
import { drawOverlay, drawStripLabels, drawSplitLabel, probeT } from "./overlay.js";

const $ = s => document.querySelector(s);
const SHEET = [841, 594];
const ORIGIN = { obl: [-10.5, 13.9], sec: [-11.6, 13.2] };
let S = { ...DEFAULTS };
let META, TH, gl, prog, U = {};
const TEX = {}, SUN = {};
let PROF, PRINT = null, PRINT_MONO = null;
const view = { x0: 0, y0: 0, mmpp: 1 };
const glc = $("#gl"), ovc = $("#ov"), octx = ovc.getContext("2d");
const status = s => { $("#status").textContent = s || ""; };

// ---------------------------------------------------------------- loading (both views stay on the GPU)
async function bitmap(url) {
  let r; for (let k = 0; k < 4; k++) { try { r = await fetch(url); if (r.ok) break; } catch (e) { await new Promise(z => setTimeout(z, 400)); } }
  const b = await r.blob();
  return createImageBitmap(b, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
}
// the sun print: a finished sheet (asfound/sunprint), sampled with mipmaps so it stays clean when zoomed out
async function loadPrint(url) {
  try { const img = await bitmap(url); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
    return t; } catch { return null; }
}
function tex2d(img) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
  return t;
}
async function ensure(v, day) {
  if (!TEX[v]) {
    status(`loading view «${v}»…`);
    const names = ["ids", "geo", "dep", "nrm", "col", "sec", "air", "photo"];
    const imgs = await Promise.all(names.map(n => bitmap(`data/${v}_${n}.png`)));
    TEX[v] = Object.fromEntries(names.map((n, i) => [n, tex2d(imgs[i])]));
  }
  const key = v + day;
  if (!SUN[key]) {
    status(`loading sun ${day}…`);
    const n = META.views[v].nslots[day], L = Math.ceil(n / 3);
    const imgs = await Promise.all([...Array(L).keys()].map(i => bitmap(`data/${v}_${day}_sun${String(i).padStart(2, "0")}.png`)));
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 6, gl.RGBA8, imgs[0].width, imgs[0].height, L);
    imgs.forEach((im, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, im.width, im.height, 1, gl.RGBA, gl.UNSIGNED_BYTE, im));
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    for (const [p, v2] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, v2);
    SUN[key] = t;
  }
  status("");
}

// ---------------------------------------------------------------- GL
function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(s); status("shader: " + e); throw new Error(e); } return s; }
function initGL() {
  gl = glc.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!gl) { status("This needs a browser with WebGL2"); throw new Error("no webgl2"); }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(prog, i); U[inf.name.replace("[0]", "")] = gl.getUniformLocation(prog, inf.name); }
  PROF = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, PROF);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 41, 21, 0, gl.RED, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}
const c3 = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// ---------------------------------------------------------------- thermal state for a time
function thermalState(Sx) {
  const D = TH.days[Sx.day]; const f = Math.min(Math.max(0, Sx.hour) * 4, D.t.length - 1.001); const i = Math.floor(f), w = f - i;
  const lerp = (a, b) => a + (b - a) * w;
  const co = {}; for (const m of TH.mats) co[m] = D.coef[m][i].map((v, k) => lerp(v, D.coef[m][i + 1][k]));
  const tod = Sx.hour % 24, tk = D.tod_k, step = tk[1] - tk[0], K = tk.length;
  const slot = t => { if (t < tk[0]) return [0, 0, Math.max(0, 1 - (tk[0] - t) / step)]; if (t > tk[K - 1]) return [K - 1, 0, Math.max(0, 1 - (t - tk[K - 1]) / step)];
    const s = Math.min(K - 2, Math.floor((t - tk[0]) / step)); return [s, (t - tk[s]) / step, 1]; };
  const now = slot(tod), light = Sx.lightFollows ? now : slot(17 + 40 / 60);
  const cosNow = c => now[2] * (c[now[0]] * (1 - now[1]) + (c[Math.min(K - 1, now[0] + 1)] || 0) * now[1]);
  let sunVec = null;
  if (tod >= tk[0] - step * 0.5 && tod <= tk[K - 1] + step * 0.5) { const a = D.sun_vec[now[0]], b = D.sun_vec[Math.min(K - 1, now[0] + 1)]; sunVec = a.map((v, j) => v + (b[j] - v) * now[1]); }
  const prof = new Float32Array(41 * 21).fill(lerp(D.Ta[i], D.Ta[i + 1]));
  TH.mats.forEach((m, mi) => TH.orient.forEach((o, oi) => { const P = D.prof[`${m}:${o}`]; if (!P) return;
    for (let j = 0; j < 41; j++) prof[(mi * 3 + oi) * 41 + j] = lerp(P[i][j], P[i + 1][j]); }));
  const sunHours = D.probes.wall.cos.filter(v => v > 0.05).length * step;
  const i24 = Math.max(0, i - 96); let Tref = 0; for (let j = i24; j <= i; j++) Tref += D.Ta[j]; Tref /= (i - i24 + 1);
  const st = { co, Ta: lerp(D.Ta[i], D.Ta[i + 1]), Tsky: lerp(D.Tsky[i], D.Tsky[i + 1]), DNI: lerp(D.DNI[i], D.DNI[i + 1]) * now[2],
    DHI: lerp(D.DHI[i], D.DHI[i + 1]), now, light, K, cosNow, sunVec, prof, probes: D.probes, terrain: TH.terrain, sunHours, Tref, sheet: SHEET };
  st.T = Object.fromEntries(Object.entries(D.probes).map(([k, pr]) => [k, probeT(st, pr)]));
  if (sunVec) { const a = D.sun_az[now[0]], b = D.sun_az[Math.min(K - 1, now[0] + 1)], e0 = D.sun_el[now[0]], e1 = D.sun_el[Math.min(K - 1, now[0] + 1)];
    st.sunAz = a + (b - a) * now[1]; st.sunEl = e0 + (e1 - e0) * now[1]; }
  if (!Sx._inner) st.storyNums = storyNums(Sx);
  return st;
}

const _sn = {};
function storyNums(Sx) {
  if (_sn[Sx.day]) return _sn[Sx.day];
  const D = TH.days[Sx.day]; let wmax = -99, nsum = 0, nc = 0;
  for (let h = 6; h <= 21; h += 0.25) { const s = thermalState({ ...Sx, hour: h, _inner: 1 }); wmax = Math.max(wmax, s.T.wall); }
  for (let h = 27; h <= 29; h += 0.25) { const s = thermalState({ ...Sx, hour: h, _inner: 1 }); nsum += Math.max(s.T.setts, s.T.wall) - s.Ta; nc++; }
  const P = D.prof["rubble:street"][Math.min(D.t.length - 1, 28 * 4)]; let im = 0; P.forEach((v, j) => { if (v > P[im]) im = j; });
  const s0 = thermalState({ ...Sx, hour: 12, _inner: 1 });
  return (_sn[Sx.day] = { h: s0.sunHours, wmax, n: nsum / nc, d: D.prof_depth[im] * 100 });
}

// ---------------------------------------------------------------- projection of world points onto a sheet
function makeM(Sx, origin, sheet = SHEET) {
  const vm = META.views[Sx.view], K = vm.K, th = vm.TH * Math.PI / 180, SX = META.SX, sc = Number(Sx.scale);
  const org = origin || [ORIGIN[Sx.view][0] - Sx.offX, ORIGIN[Sx.view][1] + Sx.offZ];
  const obl = p => { const d = SX - p[0]; return [p[1] - K * d * Math.cos(th), p[2] + K * d * Math.sin(th)]; };
  const worldToSheet = p => { const o = obl(p); return [(o[0] - org[0]) * 1000 / sc, (org[1] - o[1]) * 1000 / sc]; };
  return { SX, K, th, org, sc, sheet, worldToSheet, labelPoint: (k, w) => w, personPoint: () => [SX - 0.4, -1.2, 0.02],
    dirToSheet: v => { const a = worldToSheet([SX, 0, 0]), b = worldToSheet([SX + v[0], v[1], v[2]]); const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; } };
}

// ---------------------------------------------------------------- uniforms + draw
function setUniforms(Sx, st, M, res, vw) {
  const vm = META.views[Sx.view], T = TEX[Sx.view];
  gl.useProgram(prog);
  const bind = (name, t, unit, target = gl.TEXTURE_2D) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, t); gl.uniform1i(U[name], unit); };
  bind("tIds", T.ids, 0); bind("tGeo", T.geo, 1); bind("tDep", T.dep, 2); bind("tNrm", T.nrm, 3); bind("tCol", T.col, 4);
  bind("tSec", T.sec, 5); bind("tAir", T.air, 6); bind("tPhoto", T.photo, 9); { const pt = Sx.printHand ? PRINT : PRINT_MONO; if (pt) bind("tPrint", pt, 10); } bind("tProf", PROF, 7); bind("tSun", SUN[Sx.view + Sx.day], 8, gl.TEXTURE_2D_ARRAY);
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, PROF);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 41, 21, gl.RED, gl.FLOAT, st.prof);
  gl.uniform4f(U.uFrame, ...vm.frame); gl.uniform2f(U.uSheetMM, ...M.sheet); gl.uniform2f(U.uOrigin, ...M.org); gl.uniform1f(U.uScale, M.sc);
  gl.uniform4f(U.uView, ...vw); gl.uniform2f(U.uRes, ...res);
  gl.uniform1f(U.uK, vm.K); gl.uniform1f(U.uTH, vm.TH * Math.PI / 180); gl.uniform1f(U.uSX, META.SX);
  const G = new Float32Array(7 * 32); TH.mats.forEach((m, mi) => { for (let k = 0; k < st.K; k++) G[mi * 32 + k] = st.co[m][2 + k]; });
  gl.uniform1fv(U.uA, TH.mats.map(m => st.co[m][0])); gl.uniform1fv(U.uB, TH.mats.map(m => st.co[m][1])); gl.uniform4fv(U.uG, G); gl.uniform1i(U.uNSlots, st.K);
  gl.uniform1f(U.uTa, st.Ta); gl.uniform1f(U.uTsky, st.Tsky); gl.uniform1f(U.uDNI, st.DNI); gl.uniform1f(U.uDHI, st.DHI); gl.uniform1f(U.uTref, st.Tref);
  gl.uniform1i(U.uSlot0, st.now[0]); gl.uniform1f(U.uSlotW, st.now[1]);
  gl.uniform1i(U.uLightSlot0, st.light[0]); gl.uniform1f(U.uLightW, st.light[1]); gl.uniform1f(U.uLightOn, st.light[2]);
  ["cPaper", "cInk", "cCut", "cVeg", "cAccent"].forEach(k => gl.uniform3f(U[k], ...c3(Sx[k])));
  gl.uniform3fv(U.cCool, c3(Sx.r0));
  gl.uniform3fv(U.cRampCut, (Sx.cutRampOwn ? [Sx.cr0, Sx.cr1, Sx.cr2, Sx.cr3, Sx.cr4] : [Sx.r0, Sx.r1, Sx.r2, Sx.r3, Sx.r4]).flatMap(c3));
  gl.uniform1f(U.uCutSmooth, Sx.cutSmooth ? 1 : 0); gl.uniform1f(U.uCutSeams, Sx.cutSeams ? 1 : 0); gl.uniform3fv(U.cRamp, [Sx.r0, Sx.r1, Sx.r2, Sx.r3, Sx.r4].flatMap(c3));
  gl.uniform1f(U.uDark, Sx.dark ? 1 : 0);
  const f = (u, v) => U[u] && gl.uniform1f(U[u], v);
  f("pSpacing", Sx.spacing); f("pWidth", Sx.width); f("pWobble", Sx.wobble); f("pGaps", Sx.gaps); f("pSeam", Sx.seam); f("pJitter", Sx.jitter);
  f("pToneVar", Sx.toneVar); f("pT1", Sx.t1); f("pT2", Sx.t2); f("pT3", Sx.t3); f("pContrast", Sx.contrast);
  f("pCutDensity", Sx.cutDensity); f("pCutLine", Sx.cutLine); f("pEarthFade", Sx.earthFade); f("pVegAmt", Sx.vegAmt); f("pDepthFade", Sx.depthFade);
  f("pEdgeFade", Sx.edgeFade); f("pGrain", Sx.grain); f("pLines", Sx.lines); f("pAmb", Sx.amb);
  gl.uniform1i(U.pStyle, Number(Sx.style)); gl.uniform1i(U.pCutStyle, Number(Sx.cutStyle));
  f("hInk", Sx.hInk); f("hWash", Sx.hWash); f("hIso", Sx.hIso); f("hDots", Sx.hDots); f("hHalo", Sx.hHalo); f("hTmin", Sx.hTmin); f("hTmax", Sx.hTmax);
  f("hIsoStep", Sx.hIsoStep); f("hRel", Number(Sx.hRel)); f("hCut", Sx.hCut); f("hMisreg", 0); f("hPhotoCol", Sx.photoCol);
  gl.uniform3f(U.uFocus, Sx.focusX, Sx.focusZ, Sx.focusR); f("uFocusSoft", Sx.focusSoft);
  gl.uniform1i(U.uOut, Sx._out || 0); f("hPost", Sx.hPost); f("pToneHeat", Sx.toneHeat); f("pRidge", Sx.ridge); f("pTopClip", Sx.topClip);
}
// render a sheet region into pixels: returns ImageData (w x h), region given in sheet mm
let FB = null;
function renderRegion(Sx, st, M, x0, y0, mmpp, w, h, target) {
  if (!FB || FB.w < w || FB.h < h) {
    if (FB) { gl.deleteFramebuffer(FB.fb); gl.deleteTexture(FB.t); }
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); const W = Math.max(w, 2048), H = Math.max(h, 2048);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    FB = { fb, t, w: W, h: H, px: new Uint8Array(W * H * 4) };
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, FB.fb); gl.viewport(0, 0, w, h);
  setUniforms(Sx, st, M, [w, h], [x0, y0, mmpp, mmpp]); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, FB.px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const id = target || new ImageData(w, h);
  for (let y = 0; y < h; y++) id.data.set(FB.px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return id;
}

// ---------------------------------------------------------------- the time strip: the same section at five moments
function stripLayout(Sx) {
  const hours = Sx.day === "sep22" ? [8, 12, 17 + 40 / 60, 22, 28] : [8, 12, 15, 22, 28];
  const sec = Sx.view === "sec" && Sx._layout !== false;
  const dz = (Sx.offZ || 0) * 1000 / Number(Sx.scale || 30);
  const W = 70, H = 52, gap = 5.5, x0 = sec ? 30 : (Sx.stripX ?? 452), y0 = (sec ? 510 : (Sx.stripY ?? 400)) + dz;
  const crop = [-6.4, 6.1, -1.3, 8.1];                    // pure section: y from, y to, z from, z to (m)
  const sc = (crop[1] - crop[0]) * 1000 / W;
  return hours.map((h, i) => ({ hour: h, x: x0 + i * (W + gap), y: y0, w: W, h: H, crop, sc }));
}
function stripPanels(Sx, pxPerMm, draw) {
  for (const p of stripLayout(Sx)) {
    const S2 = { ...Sx, ...(Sx.stripRel ? { hRel: "1", hTmin: -8, hTmax: 14, cutStyle: "3", cutSmooth: true, cutSeams: false } : {}), view: "sec", hour: p.hour, lightFollows: true, focusR: 0, edgeFade: 3, topClip: 0, offX: 0, offZ: 0, scale: String(p.sc), scaleN: p.sc, depthFade: 0.9 };
    const st = thermalState(S2), M = makeM(S2, [p.crop[0], p.crop[3]], [p.w, p.h]);
    draw(p, S2, st, M);
  }
}

// ---------------------------------------------------------------- temperature field -> numbers
function numberField(Sx, st, M) {
  const step = Sx.numStep, nx = Math.ceil(SHEET[0] / step), ny = Math.ceil(SHEET[1] / step);
  const id = renderRegion({ ...Sx, _out: 1 }, st, M, 0, 0, step, nx, ny);
  const out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = (j * nx + i) * 4, kind = id.data[k + 2];
    if (kind < 32) continue;
    const T = (id.data[k] * 256 + id.data[k + 1]) / 65535 * 100 - 20;
    out.push({ x: (i + 0.5) * step, y: (j + 0.5) * step, T, kind: kind > 170 ? "cut" : (kind > 100 ? "veg" : "surf") });
  }
  return out;
}
function drawNumbers(ctx, Sx, st, list, toPx, pxPerMm) {
  const rel = Sx.hRel === "1";
  const fam = { hand: "'Caveat'", serif: "'Fraunces'", mono: "'IBM Plex Mono'", grotesk: "'Space Grotesk'" }[Sx.font] || "'IBM Plex Mono'";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ramp = x => { const stp = [Sx.r0, Sx.r1, Sx.r2, Sx.r3, Sx.r4].map(hx); x = Math.min(1, Math.max(0, x)) * 4; const i = Math.min(3, Math.floor(x)), f = x - i; return stp[i].map((v, j) => Math.round(v + (stp[i + 1][j] - v) * f)); };
  for (const n of list) {
    const v = (n.T - (rel ? st.Ta : 0) - Sx.hTmin) / (Sx.hTmax - Sx.hTmin);
    const size = Sx.numStep * Sx.numSize * (0.42 + 0.5 * Math.min(1, Math.max(0, v))) * pxPerMm;
    const p = toPx([n.x, n.y]);
    ctx.font = `${n.kind === "cut" ? 600 : 400} ${size}px ${fam}`;
    ctx.fillStyle = n.kind === "veg" ? Sx.cVeg : `rgb(${ramp(v).join(",")})`;
    ctx.globalAlpha = n.kind === "cut" ? 0.95 : 0.85; ctx.fillText(n.T.toFixed(0), p[0], p[1]);
  }
  ctx.globalAlpha = 1;
}
// right half of a diptych: the same sheet at another hour (optionally night palette)
const NIGHT = { dark: true, cPaper: "#1d1c1a", cInk: "#d8d1c3", cCut: "#cfc6b6", cVeg: "#7f9a78", r0: "#6f8fb5", r1: "#9fb2bd", r2: "#8c8478", r3: "#e0874f", r4: "#ff5a3a", amb: 0.45 };
function splitState(Sx) {
  // the right half shows the SAME part of the drawing as the left half, at another hour
  const S2 = { ...Sx, hour: Sx.splitHour, ...(Sx.splitDark ? NIGHT : {}), split: false };
  const M1 = makeM(Sx); const org2 = [M1.org[0] - Sx.splitX * M1.sc / 1000, M1.org[1]];
  return [S2, thermalState(S2), makeM(S2, org2)];
}

// ---------------------------------------------------------------- screen render
let pending = false;
function requestRender() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; render(); }); } }
function render() {
  if (!TEX[S.view] || !SUN[S.view + S.day]) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const W = Math.floor(glc.clientWidth * dpr), H = Math.floor(glc.clientHeight * dpr);
  if (glc.width !== W || glc.height !== H) { glc.width = W; glc.height = H; ovc.width = W; ovc.height = H; }
  const Sx = { ...S, scaleN: Number(S.scale) }, st = thermalState(Sx), M = makeM(Sx);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
  const mmpp = view.mmpp / dpr;
  setUniforms(Sx, st, M, [W, H], [view.x0, view.y0, mmpp, mmpp]); gl.drawArrays(gl.TRIANGLES, 0, 3);
  octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, W, H);
  if (S.style === "11") { $("#readout").textContent = "sun print · 22 Sep 2026, sunrise → sunset (static render)"; return; }
  const pxPerMm = 1 / mmpp, toPx = p => [(p[0] - view.x0) * pxPerMm, (p[1] - view.y0) * pxPerMm];
  if (S.split) {
    const [S2, st2, M2] = splitState(Sx); const a = toPx([S.splitX, 0]); const x0 = Math.max(0, Math.round(a[0]));
    if (x0 < W) { const w = W - x0; const id = renderRegion(S2, st2, M2, view.x0 + x0 * mmpp, view.y0, mmpp, w, H); octx.putImageData(id, x0, 0); }
  }
  if (S.strip && TEX.sec && SUN["sec" + S.day]) {
    stripPanels(Sx, pxPerMm, (p, S2, st2, M2) => {
      const a = toPx([p.x, p.y]); const w = Math.round(p.w * pxPerMm), h = Math.round(p.h * pxPerMm);
      if (w < 8 || h < 8 || a[0] > W || a[1] > H || a[0] + w < 0 || a[1] + h < 0) return;
      const id = renderRegion(S2, st2, M2, 0, 0, p.w / w, w, h); octx.putImageData(id, Math.round(a[0]), Math.round(a[1]));
    });
  }
  if (S.numbers) drawNumbers(octx, Sx, st, numberField(Sx, st, M), toPx, pxPerMm);
  octx.save(); octx.translate(-view.x0 * pxPerMm, -view.y0 * pxPerMm);
  drawOverlay(octx, Sx, st, M, p => [p[0] * pxPerMm, p[1] * pxPerMm], pxPerMm);
  if (S.split) { const [S2, st2, M2] = splitState(Sx); octx.save(); octx.beginPath(); octx.rect(S.splitX * pxPerMm, 0, 1e6, 1e6); octx.clip();
    drawOverlay(octx, { ...S2, ovTitle: false, ovLegend: false, ovScale: false, story: false, _half: 2, split: true }, st2, M2, p => [p[0] * pxPerMm, p[1] * pxPerMm], pxPerMm); octx.restore();
    drawSplitLabel(octx, Sx, S2, st, st2, pxPerMm); }
  if (S.strip) drawStripLabels(octx, Sx, stripLayout(Sx), h => thermalState({ ...Sx, hour: h }), pxPerMm);
  octx.restore();
  $("#readout").textContent = `air ${st.Ta.toFixed(1)} °C · sky ${st.Tsky.toFixed(1)} °C · sun ${st.DNI.toFixed(0)} W/m²`;
}
function fit() {
  const r = glc.getBoundingClientRect(); const m = 1.04;
  view.mmpp = Math.max(SHEET[0] * m / r.width, SHEET[1] * m / r.height);
  view.x0 = SHEET[0] / 2 - r.width * view.mmpp / 2; view.y0 = SHEET[1] / 2 - r.height * view.mmpp / 2; requestRender();
}

// ---------------------------------------------------------------- UI
function fmtTime(h) { const d = h >= 24 ? " (+1)" : ""; h = h % 24; const H = Math.floor(h), M = Math.round((h - H) * 60) % 60; return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}${d}`; }
const controls = {};
function buildUI() {
  const box = $("#params");
  for (const [g, title] of GROUPS) {
    const sec = document.createElement("details"); sec.open = ["time", "heat"].includes(g);
    sec.innerHTML = `<summary>${title}</summary>`; const body = document.createElement("div"); body.className = "grp"; sec.appendChild(body); box.appendChild(sec);
    for (const p of PARAMS.filter(p => p.g === g)) {
      const row = document.createElement("label"); row.className = "row " + p.t;
      const name = document.createElement("span"); name.className = "nm"; name.textContent = p.l; row.appendChild(name);
      let inp; const val = document.createElement("span"); val.className = "val";
      if (p.t === "r") { inp = document.createElement("input"); inp.type = "range"; inp.min = p.min; inp.max = p.max; inp.step = p.step; if (p.k === "hour") inp.id = "hourCtl"; }
      else if (p.t === "c") { inp = document.createElement("input"); inp.type = "color"; }
      else if (p.t === "b") { inp = document.createElement("input"); inp.type = "checkbox"; }
      else { inp = document.createElement("select"); for (const [v, t] of p.o) { const o = document.createElement("option"); o.value = v; o.textContent = t; inp.appendChild(o); } }
      const sync = () => { if (p.t === "b") inp.checked = !!S[p.k]; else inp.value = S[p.k];
        val.textContent = p.t === "r" ? (p.fmt === "time" ? fmtTime(Number(S[p.k])) : Number(S[p.k]).toFixed(p.step < 0.1 ? 2 : 1)) : ""; };
      inp.addEventListener("input", async () => { S[p.k] = p.t === "b" ? inp.checked : (p.t === "r" ? Number(inp.value) : inp.value); sync(); await onChange(p.k); });
      row.appendChild(inp); if (p.t === "r") row.appendChild(val); body.appendChild(row); controls[p.k] = sync; sync();
    }
  }
}
function syncAll() { Object.values(controls).forEach(f => f()); syncClock(); }
function syncClock() { $("#hour2").value = S.hour; $("#clock").textContent = fmtTime(S.hour).replace(" (+1)", "⁺¹"); }
async function onChange(k) {
  if (k === "view" || k === "day") await ensure(S.view, S.day);
  if (k === "day" || k === "strip") await ensure("sec", S.day);
  if (k === "hour") syncClock();
  requestRender();
}
async function applyPreset(i) {
  S = { ...DEFAULTS, ...PRESETS[i].o };
  document.querySelectorAll(".preset").forEach((e, j) => e.classList.toggle("on", j === i));
  $("#note").textContent = PRESETS[i].note;
  syncAll(); await ensure(S.view, S.day); await ensure("sec", S.day); requestRender();
}
async function buildPresets() {
  const box = $("#presets");
  PRESETS.forEach((p, i) => { const d = document.createElement("button"); d.className = "preset"; d.innerHTML = `<canvas width="352" height="248"></canvas><span>${p.name}</span>`;
    d.onclick = () => applyPreset(i); box.appendChild(d); });
  for (let i = 0; i < PRESETS.length; i++) {
    const Sx = { ...DEFAULTS, ...PRESETS[i].o }; Sx.scaleN = Number(Sx.scale);
    await ensure(Sx.view, Sx.day);
    const st = thermalState(Sx), M = makeM(Sx);
    const cv = box.children[i].querySelector("canvas");
    cv.getContext("2d").putImageData(renderRegion(Sx, st, M, 225, 240, 230 / 352, 352, 248), 0, 0);
    status(`thumbnails ${i + 1}/${PRESETS.length}`); await new Promise(r => setTimeout(r, 0));
  }
  status(""); requestRender();
}

// ---------------------------------------------------------------- interaction
let drag = null;
const stage = $("#stage");
stage.addEventListener("pointerdown", e => { if (e.target.closest("#hud")) return; drag = [e.clientX, e.clientY, view.x0, view.y0]; });
window.addEventListener("pointermove", e => { if (!drag) return; view.x0 = drag[2] - (e.clientX - drag[0]) * view.mmpp; view.y0 = drag[3] - (e.clientY - drag[1]) * view.mmpp; requestRender(); });
window.addEventListener("pointerup", () => drag = null);
stage.addEventListener("wheel", e => { e.preventDefault(); const r = glc.getBoundingClientRect();
  const mx = view.x0 + (e.clientX - r.left) * view.mmpp, my = view.y0 + (e.clientY - r.top) * view.mmpp;
  view.mmpp = Math.min(3, Math.max(0.01, view.mmpp * Math.exp(e.deltaY * 0.0012)));
  view.x0 = mx - (e.clientX - r.left) * view.mmpp; view.y0 = my - (e.clientY - r.top) * view.mmpp; requestRender(); }, { passive: false });
window.addEventListener("keydown", e => { if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
  if (e.key === "f") fit(); if (e.key === " ") { e.preventDefault(); togglePlay(); } });
let playing = false, lastT = 0;
function togglePlay() { playing = !playing; $("#play").textContent = playing ? "❚❚" : "▶"; if (playing) { lastT = performance.now(); requestAnimationFrame(tick); } }
function tick(t) { if (!playing) return; const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  S.hour = (S.hour + dt * Number($("#speed").value)) % 36; controls.hour(); syncClock(); render(); requestAnimationFrame(tick); }

// ---------------------------------------------------------------- export: A1 at a chosen dpi (tiled)
async function save(blob, name) {
  try { const r = await fetch(`save?name=${encodeURIComponent(name)}`, { method: "POST", body: blob }); if (!r.ok) throw 0; status(`saved: asfound/app/exports/${name}`); }
  catch { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); status(""); }
}
async function exportSheet(dpi, forceName) {
  const W = Math.round(SHEET[0] / 25.4 * dpi), H = Math.round(SHEET[1] / 25.4 * dpi), mm = 25.4 / dpi;
  const Sx = { ...S, scaleN: Number(S.scale) }, st = thermalState(Sx), M = makeM(Sx);
  const big = document.createElement("canvas"); big.width = W; big.height = H; const bctx = big.getContext("2d");
  const T = 2048; let n = 0; const tot = Math.ceil(W / T) * Math.ceil(H / T);
  for (let ty = 0; ty < H; ty += T) for (let tx = 0; tx < W; tx += T) {
    const w = Math.min(T, W - tx), h = Math.min(T, H - ty);
    bctx.putImageData(renderRegion(Sx, st, M, tx * mm, ty * mm, mm, w, h), tx, ty);
    status(`export ${++n}/${tot}`); await new Promise(r => setTimeout(r, 0));
  }
  if (S.split) { const [S2, st2, M2] = splitState(Sx); const x0 = Math.round(S.splitX / mm);
    for (let ty = 0; ty < H; ty += T) for (let tx = x0; tx < W; tx += T) { const w = Math.min(T, W - tx), h = Math.min(T, H - ty);
      bctx.putImageData(renderRegion(S2, st2, M2, tx * mm, ty * mm, mm, w, h), tx, ty); await new Promise(r => setTimeout(r, 0)); } }
  if (S.numbers) drawNumbers(bctx, Sx, st, numberField(Sx, st, M), p => [p[0] / mm, p[1] / mm], 1 / mm);
  if (S.strip) stripPanels(Sx, 1 / mm, (p, S2, st2, M2) => {
    const w = Math.round(p.w / mm), h = Math.round(p.h / mm);
    bctx.putImageData(renderRegion(S2, st2, M2, 0, 0, p.w / w, w, h), Math.round(p.x / mm), Math.round(p.y / mm)); });
  drawOverlay(bctx, Sx, st, M, p => [p[0] / mm, p[1] / mm], 1 / mm);
  if (S.split) { const [S2, st2, M2] = splitState(Sx); bctx.save(); bctx.beginPath(); bctx.rect(S.splitX / mm, 0, 1e7, 1e7); bctx.clip();
    drawOverlay(bctx, { ...S2, ovTitle: false, ovLegend: false, ovScale: false, story: false, _half: 2, split: true }, st2, M2, p => [p[0] / mm, p[1] / mm], 1 / mm); bctx.restore();
    drawSplitLabel(bctx, Sx, S2, st, st2, 1 / mm); }
  if (S.strip) drawStripLabels(bctx, Sx, stripLayout(Sx), h => thermalState({ ...Sx, hour: h }), 1 / mm);
  status("encoding PNG…");
  const name = forceName || `AsFound_${S.view}_${S.day}_${fmtTime(S.hour).replace(":", "").replace(" (+1)", "n")}_${dpi}dpi.png`;
  await new Promise(res => big.toBlob(async b => { await save(b, name); res(); }, "image/png"));
  requestRender();
}
// ---------------------------------------------------------------- video: one day in 16 s (webm)
async function recordDay() {
  const comp = document.createElement("canvas"); comp.width = 1920; comp.height = Math.round(1920 * SHEET[1] / SHEET[0]); const cc = comp.getContext("2d");
  const rec = new MediaRecorder(comp.captureStream(30), { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 16e6 }); const chunks = [];
  rec.ondataavailable = e => chunks.push(e.data); rec.start();
  const mm = SHEET[0] / comp.width, frames = 16 * 30;
  for (let f = 0; f < frames; f++) {
    const Sx = { ...S, hour: 5 + 26 * f / frames, scaleN: Number(S.scale), strip: false }, st = thermalState(Sx), M = makeM(Sx);
    cc.putImageData(renderRegion(Sx, st, M, 0, 0, mm, comp.width, comp.height), 0, 0);
    drawOverlay(cc, Sx, st, M, p => [p[0] / mm, p[1] / mm], 1 / mm);
    status(`video ${f + 1}/${frames}`); await new Promise(r => setTimeout(r, 1000 / 30));
  }
  rec.stop(); await new Promise(r => rec.onstop = r);
  await save(new Blob(chunks, { type: "video/webm" }), `AsFound_day_${S.view}_${S.day}.webm`); requestRender();
}

// ---------------------------------------------------------------- my presets
function saveMine() { const name = prompt("Preset name:", "my variant"); if (!name) return;
  const mine = JSON.parse(localStorage.getItem("asf_mine") || "[]"); mine.push({ name, o: S }); localStorage.setItem("asf_mine", JSON.stringify(mine)); listMine(); }
function listMine() { const box = $("#mine"); box.innerHTML = ""; let mine = []; try { mine = JSON.parse(localStorage.getItem("asf_mine") || "[]"); } catch { }
  mine.forEach((m, i) => { const b = document.createElement("button"); b.textContent = m.name; b.onclick = async () => { S = { ...DEFAULTS, ...m.o }; syncAll(); await onChange("view"); };
    b.oncontextmenu = e => { e.preventDefault(); mine.splice(i, 1); localStorage.setItem("asf_mine", JSON.stringify(mine)); listMine(); }; box.appendChild(b); }); }
function exportJSON() { save(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" }), "asfound_settings.json"); }
function importJSON() { const i = document.createElement("input"); i.type = "file"; i.accept = ".json"; i.onchange = async () => { S = { ...DEFAULTS, ...JSON.parse(await i.files[0].text()) }; syncAll(); await onChange("view"); }; i.click(); }

window.ASF = { batch: async (dpi) => { const P = PRESETS; for (let i = 0; i < P.length; i++) { await applyPreset(i); await exportSheet(dpi, `preset_${String(i).padStart(2, "0")}.png`); } await applyPreset(0); return "done"; }, get S() { return S; }, set: async o => { Object.assign(S, o); syncAll(); await onChange("view"); await onChange("day"); }, preset: applyPreset, exportSheet, recordDay, fit,
  // raw temperature field of the whole sheet (R,G = T16, B = kind) for offline renderers (asfound/bloom)
  field: async (o, dpi, name) => { const Sx = { ...S, ...o, focusR: 0, topClip: 0, edgeFade: 0, _out: 1 }; const st = thermalState(Sx), M = makeM(Sx);
    const mm = 25.4 / dpi, W = Math.round(SHEET[0] / mm), H = Math.round(SHEET[1] / mm), T = 2048;
    const big = document.createElement("canvas"); big.width = W; big.height = H; const bctx = big.getContext("2d");
    for (let ty = 0; ty < H; ty += T) for (let tx = 0; tx < W; tx += T) { const w = Math.min(T, W - tx), h = Math.min(T, H - ty);
      bctx.putImageData(renderRegion(Sx, st, M, tx * mm, ty * mm, mm, w, h), tx, ty); }
    await save(await new Promise(r => big.toBlob(r, "image/png")), name);
    return { W, H, Ta: st.Ta, org: M.org, sc: M.sc, T: st.T, sunAz: st.sunAz, sunEl: st.sunEl, sunVec: st.sunVec }; } };

// ---------------------------------------------------------------- boot
(async () => {
  initGL();
  status("loading data…");
  [META, TH] = await Promise.all([fetch("data/meta.json").then(r => r.json()), fetch("data/thermal.json").then(r => r.json())]);
  [PRINT, PRINT_MONO] = await Promise.all([loadPrint("data/sunprint.jpg"), loadPrint("data/sunprint_mono.jpg")]);
  buildUI(); await ensure(S.view, S.day); await ensure("sec", S.day); fit();
  $("#play").onclick = togglePlay; $("#fit").onclick = fit;
  $("#hour2").addEventListener("input", () => { S.hour = Number($("#hour2").value); controls.hour(); syncClock(); requestRender(); });
  $("#exp150").onclick = () => exportSheet(150); $("#exp300").onclick = () => exportSheet(300); $("#vid").onclick = recordDay;
  $("#save").onclick = saveMine; $("#json").onclick = exportJSON; $("#load").onclick = importJSON; listMine();
  new ResizeObserver(requestRender).observe(glc);
  await applyPreset(0);
  await buildPresets();
})();
