// Vector layer on top of the drawing: temperatures on the surfaces, the person as a thermometer (mean radiant
// temperature from the 2D section + the thermal model), sun / heat flows, title, time, legend, scale, levels.
export const TXT = {
  en: { title: "The wall that keeps the heat", sub: "As found · section A-A' · Montjuïc cemetery retaining wall, Carrer de la Mare de Déu de Port, Barcelona",
        air: "air", wall: "wall face", setts: "granite setts", footpath: "footpath", terrace: "cemetery terrace", hedge: "hedge",
        you: "you, here", feels: "radiant", day1: "The sun loads the wall", day2: "SSW face · %h h of direct sun today",
        night1: "The stone gives the day back", night2: "surfaces warmer than the air, all night",
        cool: "the cool is up here — behind the wall", scale: "scale", cold: "cooler", hot: "hotter", rel: "°C above air",
        stored: "heat stored in the mass", sep22: "22 September 2026", jul08: "8 July 2026", jul09: "9 July 2026", sep23: "23 September 2026",
        model: "Surface temperatures modelled from ERA5 hourly weather and ray-traced sun on the survey model · indicative ±3 °C" },
  ca: { title: "El mur que guarda la calor", sub: "Tal com és · secció A-A' · mur de contenció del cementiri de Montjuïc, c/ de la Mare de Déu de Port, Barcelona",
        air: "aire", wall: "parament", setts: "llambordes", footpath: "vorera", terrace: "terrassa del cementiri", hedge: "bardissa",
        you: "tu, aquí", feels: "radiant", day1: "El sol carrega el mur", day2: "façana SSO · %h h de sol directe avui",
        night1: "La pedra torna el dia", night2: "superfícies més calentes que l'aire tota la nit",
        cool: "la fresca és aquí dalt, darrere el mur", scale: "escala", cold: "més fresc", hot: "més calent", rel: "°C sobre l'aire",
        stored: "calor acumulada a la massa", sep22: "22 de setembre de 2026", jul08: "8 de juliol de 2026", jul09: "9 de juliol de 2026", sep23: "23 de setembre de 2026",
        model: "Temperatures superficials modelitzades amb meteorologia horària ERA5 i sol traçat sobre el model · indicatiu ±3 °C" },
  es: { title: "El muro que guarda el calor", sub: "Tal como está · sección A-A' · muro de contención del cementerio de Montjuïc, c/ Mare de Déu de Port, Barcelona",
        air: "aire", wall: "paramento", setts: "adoquines", footpath: "acera", terrace: "terraza del cementerio", hedge: "seto",
        you: "tú, aquí", feels: "radiante", day1: "El sol carga el muro", day2: "fachada SSO · %h h de sol directo hoy",
        night1: "La piedra devuelve el día", night2: "superficies más calientes que el aire toda la noche",
        cool: "el fresco está aquí arriba, tras el muro", scale: "escala", cold: "más fresco", hot: "más caliente", rel: "°C sobre el aire",
        stored: "calor acumulado en la masa", sep22: "22 de septiembre de 2026", jul08: "8 de julio de 2026", jul09: "9 de julio de 2026", sep23: "23 de septiembre de 2026",
        model: "Temperaturas superficiales modelizadas con meteorología horaria ERA5 y sol trazado sobre el modelo · indicativo ±3 °C" },
  ru: { title: "Стена, которая держит жар", sub: "Как есть · разрез A-A' · подпорная стена кладбища Монжуик, Carrer de la Mare de Déu de Port, Барселона",
        air: "воздух", wall: "лицо стены", setts: "брусчатка", footpath: "тротуар", terrace: "терраса кладбища", hedge: "изгородь",
        you: "ты, здесь", feels: "радиационная", day1: "Солнце заряжает стену", day2: "фасад на ЮЮЗ · %h ч прямого солнца сегодня",
        night1: "Камень возвращает день", night2: "поверхности теплее воздуха всю ночь",
        cool: "прохлада здесь, наверху — за стеной", scale: "масштаб", cold: "прохладнее", hot: "горячее", rel: "°C выше воздуха",
        stored: "тепло, накопленное в массе", sep22: "22 сентября 2026", jul08: "8 июля 2026", jul09: "9 июля 2026", sep23: "23 сентября 2026",
        model: "Температуры поверхностей: модель по почасовой погоде ERA5 и трассировке солнца на модели · ориентировочно ±3 °C" },
};
const FONTS = {
  hand: ["'Caveat', 'Ink Free', cursive", "'Caveat', 'Ink Free', cursive", 1.25],
  serif: ["'Fraunces', 'Georgia', serif", "'Fraunces', 'Georgia', serif", 1.0],
  mono: ["'IBM Plex Mono', 'Consolas', monospace", "'IBM Plex Mono', 'Consolas', monospace", 0.92],
  grotesk: ["'Space Grotesk', 'Segoe UI', sans-serif", "'Space Grotesk', 'Segoe UI', sans-serif", 1.0],
};
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = a => `rgb(${a.map(v => Math.round(v)).join(",")})`;
export function rampColor(S, x) {
  const st = [S.r0, S.r1, S.r2, S.r3, S.r4].map(hex); x = Math.min(1, Math.max(0, x)) * 4;
  const i = Math.min(3, Math.floor(x)), f = x - i;
  return st[i].map((v, j) => v + (st[i + 1][j] - v) * f);
}

// ---------------------------------------------------------------- thermal evaluation for points (probes)
export function probeT(state, pr) {
  const { co, Ta, DNI, DHI, cosNow } = state;
  if (pr.mat === "veg") { const k = (pr.cls === 30 || pr.cls === 31) ? 0.03 : 0.008; return Ta + k * 0.5 * (DNI * cosNow(pr.cos) + DHI * pr.svf); }
  const c = co[pr.mat]; let T = c[0] + pr.svf * c[1];
  for (let k = 0; k < pr.cos.length; k++) T += pr.cos[k] * c[2 + k];
  return T;
}

// mean radiant temperature of a standing person in the 2D section (infinite extrusion along the wall)
export function mrt(state, terrain, P0, Ts) {
  const { Ta, Tsky, DNI, DHI, sunVec } = state;
  const Y = terrain.y, Z = terrain.z, y0 = Y[0], dy = Y[1] - Y[0];
  const top = y => { const i = Math.round((y - y0) / dy); return (i < 0 || i >= Z.length) ? 0 : Math.max(Z[i], -1); };
  const trace = (d) => {       // d = [dx, dy, dz]
    const h = Math.hypot(d[1], d[2]); if (h < 1e-4) return d[2] < 0 ? "ground" : "sky";
    for (let s = 0.05; s < 80; s += 0.05) {
      const y = P0[0] + d[1] * s, z = P0[1] + d[2] * s;
      if (z < top(y) - 0.01) {
        if (Math.abs(y) < 0.45 && z > 0.15) return "wall";
        if (y < -2.1) return "setts"; if (y < 0) return "footpath"; return "terrace";
      }
      if (z > 40) return "sky";
    }
    return d[2] < 0 ? "setts" : "sky";
  };
  const sig = 5.67e-8, eps = 0.97, ak = 0.7; let L = 0, K = 0, n = 0;
  const GHI = DHI + DNI * Math.max(0, sunVec ? sunVec[2] : 0);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 32; j++) {
    const u = (i + 0.5) / 16 * 2 - 1, ph = (j + 0.5) / 32 * 2 * Math.PI, r = Math.sqrt(1 - u * u);
    const d = [r * Math.cos(ph), r * Math.sin(ph), u];
    const hit = trace(d); n++;
    if (hit === "sky") { L += sig * Math.pow(Tsky + 273.15, 4); K += DHI; }
    else { const T = Ts[hit] ?? Ta; L += 0.95 * sig * Math.pow(T + 273.15, 4); K += 0.25 * GHI; }
  }
  L /= n; K /= n;
  let dir = 0;
  if (sunVec && sunVec[2] > 0 && trace(sunVec) === "sky") dir = 0.25 * DNI;
  const S = ak * (K + dir) + eps * L;
  return Math.pow(S / (eps * sig), 0.25) - 273.15;
}

// ---------------------------------------------------------------- drawing
export function drawOverlay(ctx, S, st, M, mmToPx, pxPerMm) {
  const T = TXT[S.lang] || TXT.en;
  const [fHead, fBody, fk] = FONTS[S.font] || FONTS.hand;
  const ts = S.textScale * fk;
  story(ctx, S, st, pxPerMm);
  const pt = v => v * 0.3528 * pxPerMm * ts;           // points -> px
  const ink = S.dark ? "#ece5d8" : "#2b2926";
  const soft = S.dark ? "rgba(236,229,216,0.75)" : "rgba(43,41,38,0.75)";
  const acc = S.cAccent;
  const W = (p) => mmToPx(M.worldToSheet(p));
  const txt = (s, p, size, col, align = "left", font = fBody, weight = 400, base = "alphabetic") => {
    ctx.font = `${weight} ${pt(size)}px ${font}`; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, p[0], p[1]);
  };
  const line = (pts, col, w, dash) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.strokeStyle = col; ctx.lineWidth = w * pxPerMm; ctx.setLineDash(dash ? dash.map(v => v * pxPerMm) : []); ctx.stroke(); ctx.setLineDash([]); };
  const wavy = (a, b, col, w, amp = 1.2, wl = 4) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; const n = Math.max(8, L / (pxPerMm * 0.5));
    const pts = []; for (let i = 0; i <= n; i++) { const t = i / n, s = Math.sin(t * L / (wl * pxPerMm) * 2 * Math.PI) * amp * pxPerMm * Math.min(1, t * 4, (1 - t) * 4);
      pts.push([a[0] + ux * t * L - uy * s, a[1] + uy * t * L + ux * s]); }
    line(pts, col, w); const h = 2.2 * pxPerMm; ctx.beginPath(); ctx.moveTo(b[0] - ux * h - uy * h * 0.55, b[1] - uy * h + ux * h * 0.55);
    ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0] - ux * h + uy * h * 0.55, b[1] - uy * h - ux * h * 0.55); ctx.strokeStyle = col; ctx.lineWidth = w * pxPerMm; ctx.stroke();
  };
  const heatCol = (Tv) => rgb(rampColor(S, ((Tv - (S.hRel === "1" ? st.Ta : 0)) - S.hTmin) / (S.hTmax - S.hTmin)));
  const isDay = st.sunVec && st.sunVec[2] > 0.02;

  // ---- temperatures on the surfaces
  const Ts = {};
  for (const [k, pr] of Object.entries(st.probes)) Ts[k] = probeT(st, pr);
  if (S.ovTemps) {
    const place = { wall: [-14, -6], setts: [0, -6], footpath: [-6, 10], terrace: [0, -7], hedge: [0, -12] };
    for (const [k, pr] of Object.entries(st.probes)) {
      const a = W(M.labelPoint(k, pr.world)); const off = place[k] || [0, -6];
      const p = [a[0] + off[0] * pxPerMm, a[1] + off[1] * pxPerMm];
      const lo = ((S._half === 2) ? S.splitX + 14 : 14) * pxPerMm, hi = ((S.split && S._half !== 2) ? S.splitX - 14 : st.sheet[0] - 14) * pxPerMm;
      p[0] = Math.min(hi, Math.max(lo, p[0]));
      ctx.beginPath(); ctx.arc(a[0], a[1], 0.7 * pxPerMm, 0, 7); ctx.fillStyle = ink; ctx.fill();
      line([a, [p[0], p[1] + 1.2 * pxPerMm]], soft, 0.14);
      const col = k === "hedge" ? S.cVeg : heatCol(Ts[k]);
      txt(`${Ts[k].toFixed(0)}°`, p, 34, col, "center", fHead, 600);
      txt(T[k] || k, [p[0], p[1] + pt(14)], 13, soft, "center", fBody, 400);
    }
  }
  // ---- sun and heat flows
  if (S.ovSun) {
    const wallPts = [M.labelPoint("wall", [M.SX - 1.0, 0.06, 2.0]), M.labelPoint("wall", [M.SX - 2.5, 0.08, 4.2]), M.labelPoint("wall", [M.SX - 4.0, 0.1, 6.0])];
    if (isDay) {
      const sv = st.sunVec; const dirS = M.dirToSheet([-sv[0], -sv[1], -sv[2]]);
      const paperCol = S.dark ? S.cPaper : "rgba(243,238,227,0.85)";
      let first = null;
      for (const wp of wallPts) {
        const b = W(wp); const bm = [b[0] / pxPerMm, b[1] / pxPerMm];
        let L = 0; while (L < 900) { const q = [bm[0] - dirS[0] * L, bm[1] - dirS[1] * L]; if (q[0] < 22 || q[1] < 70 || (S.view === "sec" && L > 150)) break; L += 2; }
        const a = [b[0] - dirS[0] * L * pxPerMm, b[1] - dirS[1] * L * pxPerMm]; if (!first) first = a;
        const e = [b[0] - dirS[0] * 2.5 * pxPerMm, b[1] - dirS[1] * 2.5 * pxPerMm];
        line([a, e], paperCol, 1.3); line([a, e], acc, 0.45, [3, 1.6]);
        const h = 3.2 * pxPerMm, ux = dirS[0], uy = dirS[1];
        ctx.beginPath(); ctx.moveTo(e[0] - ux * h - uy * h * .45, e[1] - uy * h + ux * h * .45); ctx.lineTo(e[0] + ux * 1.5 * pxPerMm, e[1] + uy * 1.5 * pxPerMm);
        ctx.lineTo(e[0] - ux * h + uy * h * .45, e[1] - uy * h - ux * h * .45); ctx.closePath(); ctx.fillStyle = acc; ctx.fill();
      }
      const sp = [first[0] + 9 * pxPerMm, first[1] - 9 * pxPerMm];
      ctx.beginPath(); ctx.arc(sp[0], sp[1], 5 * pxPerMm, 0, 7); ctx.fillStyle = acc; ctx.fill();
      for (let i = 0; i < 12; i++) { const a = i / 12 * 2 * Math.PI; line([[sp[0] + Math.cos(a) * 7 * pxPerMm, sp[1] + Math.sin(a) * 7 * pxPerMm], [sp[0] + Math.cos(a) * 9.5 * pxPerMm, sp[1] + Math.sin(a) * 9.5 * pxPerMm]], acc, 0.4); }
      const az = st.sunAz != null ? ` · az ${st.sunAz.toFixed(0)}° alt ${st.sunEl.toFixed(0)}°` : "";
      if (S.ovNotes) txt(`sun${az}`, [sp[0] + 12 * pxPerMm, sp[1] + pt(4)], 12, acc, "left", fBody, 600);
    } else {
      const pp = W(M.personPoint());
      for (const [src, n] of [[M.labelPoint("wall", [M.SX - 0.8, 0.06, 1.8]), 1], [M.labelPoint("wall", [M.SX - 0.8, 0.07, 3.6]), 1], [M.labelPoint("setts", [M.SX - 0.6, -4.0, 0.05]), 1]]) {
        const a = W(src); const b = [pp[0] + (a[0] - pp[0]) * 0.25, pp[1] + (a[1] - pp[1]) * 0.25 - 10 * pxPerMm]; wavy(a, b, acc, 0.35);
      }
      if (S.ovNotes) { const q = W(M.labelPoint("wall", [M.SX - 3, 0.1, 6.8]));
        txt(T.night1, [q[0] - 60 * pxPerMm, q[1] - 30 * pxPerMm], 13, acc, "left", fHead, 600);
        txt(T.night2, [q[0] - 60 * pxPerMm, q[1] - 30 * pxPerMm + pt(13)], 10, acc, "left", fBody); }
    }
    if (S.ovNotes) { const hp = W(M.labelPoint("hedge", [M.SX - 1.5, 4.5, 8.3]));
      txt(T.cool, [hp[0] + 8 * pxPerMm, hp[1] - 14 * pxPerMm], 11, S.cVeg, "left", fHead, 600); }
  }
  // ---- the person: a thermometer
  if (S.ovPerson) {
    const Tm = mrt(st, st.terrain, [-1.2, 1.1], { wall: Ts.wall, footpath: Ts.footpath, setts: Ts.setts, terrace: Ts.terrace });
    const base = W(M.personPoint()), hpx = 1.72 * 1000 / S.scaleN * pxPerMm;
    const col = heatCol(Tm);
    const x = base[0], y = base[1];
    ctx.save(); ctx.beginPath();
    ctx.arc(x, y - hpx * 0.88, hpx * 0.09, 0, 7);
    ctx.moveTo(x - hpx * 0.17, y); ctx.bezierCurveTo(x - hpx * 0.19, y - hpx * 0.45, x - hpx * 0.2, y - hpx * 0.7, x - hpx * 0.05, y - hpx * 0.76);
    ctx.lineTo(x + hpx * 0.05, y - hpx * 0.76); ctx.bezierCurveTo(x + hpx * 0.2, y - hpx * 0.7, x + hpx * 0.19, y - hpx * 0.45, x + hpx * 0.17, y); ctx.closePath();
    ctx.fillStyle = col; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = 0.25 * pxPerMm; ctx.stroke(); ctx.restore();
    const lp = [x - 14 * pxPerMm, y - hpx * 1.25];
    txt(`${Tm.toFixed(0)}°`, lp, 40, col, "right", fHead, 600);
    txt(`${T.you} · ${T.feels}`, [lp[0], lp[1] + pt(15)], 13, ink, "right", fBody, 600);
    txt(`${T.air} ${st.Ta.toFixed(0)}°`, [lp[0], lp[1] + pt(29)], 13, soft, "right", fBody);
    line([[lp[0] + 1.5 * pxPerMm, lp[1] - pt(8)], [x - hpx * 0.15, y - hpx * 0.8]], soft, 0.14);
  }
  // ---- title + time
  if (S.ovTitle) {
    const m = 16 * pxPerMm;
    txt(T.title, [m, m + pt(34)], 40, ink, "left", fHead, 500);
    txt(T.sub, [m, m + pt(34) + pt(19)], 13, soft, "left", fBody);
    const hh = S.hour % 24, H = Math.floor(hh), Mi = Math.round((hh - H) * 60) % 60;
    const dayKey = S.hour >= 24 ? (S.day === "sep22" ? "sep23" : "jul09") : S.day;
    const tp = [(S.split ? S.splitX - 16 : st.sheet[0] - 16) * pxPerMm, m + pt(40)];
    txt(`${String(H).padStart(2, "0")}:${String(Mi).padStart(2, "0")}`, tp, 54, ink, "right", fHead, 300);
    txt(T[dayKey], [tp[0], tp[1] + pt(16)], 11, soft, "right", fBody);
    txt(`${T.air} ${st.Ta.toFixed(0)}°`, [tp[0], tp[1] + pt(38)], 30, ink, "right", fHead, 300);
  }
  // ---- legend: the colour of temperature
  if (S.ovLegend) {
    const w = 150 * pxPerMm, h = 6 * pxPerMm, x0 = st.sheet[0] * pxPerMm - 16 * pxPerMm - w, y0 = st.sheet[1] * pxPerMm - 30 * pxPerMm;
    for (let i = 0; i < 100; i++) { ctx.fillStyle = rgb(rampColor(S, i / 99)); ctx.fillRect(x0 + w * i / 100, y0, w / 100 + 1, h); }
    ctx.strokeStyle = ink; ctx.lineWidth = 0.15 * pxPerMm; ctx.strokeRect(x0, y0, w, h);
    const rel = S.hRel === "1";
    for (let v = Math.ceil(S.hTmin / 2) * 2; v <= S.hTmax; v += (S.hTmax - S.hTmin > 30 ? 10 : (S.hTmax - S.hTmin > 14 ? 4 : 2))) {
      const xx = x0 + w * (v - S.hTmin) / (S.hTmax - S.hTmin); line([[xx, y0 + h], [xx, y0 + h + 1.2 * pxPerMm]], ink, 0.15);
      txt(rel ? (v > 0 ? `+${v}°` : `${v}°`) : `${v}°`, [xx, y0 + h + pt(12)], 10, soft, "center");
    }
    txt(T.cold, [x0, y0 - pt(4)], 12, rgb(rampColor(S, 0.05)), "left", fHead, 600); txt(T.hot, [x0 + w, y0 - pt(4)], 12, rgb(rampColor(S, 0.95)), "right", fHead, 600);
    txt(rel ? T.rel : "°C", [x0 + w / 2, y0 - pt(4)], 10, soft, "center");
    txt(T.model, [st.sheet[0] * pxPerMm - 16 * pxPerMm, st.sheet[1] * pxPerMm - 7 * pxPerMm], 7, soft, "right");
  }
  // ---- scale bar and levels
  if (S.ovScale) {
    const u = 1000 / S.scaleN * pxPerMm, x0 = 16 * pxPerMm, y0 = st.sheet[1] * pxPerMm - 14 * pxPerMm;
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? "transparent" : ink; if (i % 2 === 0) ctx.fillRect(x0 + i * u, y0, u, 1.4 * pxPerMm);
      txt(`${i}`, [x0 + i * u, y0 + pt(11)], 8.5, soft, "center"); }
    ctx.strokeStyle = ink; ctx.lineWidth = 0.15 * pxPerMm; ctx.strokeRect(x0, y0, 3 * u, 1.4 * pxPerMm);
    txt("3 m", [x0 + 3 * u, y0 + pt(11)], 8.5, soft, "center"); txt(`1:${S.scaleN}`, [x0 + 3 * u + 6 * pxPerMm, y0 + 1.4 * pxPerMm], 11, ink, "left", fHead, 600);
    for (const [z, lab, yy] of [[0, "±0.00", 0.5], [6.2, "+6.20", 2.2], [7.31, "+7.31", 0.6]]) {
      const p = W(M.labelPoint("lvl", [M.SX, yy, z])); const tri = [[p[0], p[1]], [p[0] - 1.5 * pxPerMm, p[1] - 2.2 * pxPerMm], [p[0] + 1.5 * pxPerMm, p[1] - 2.2 * pxPerMm], [p[0], p[1]]];
      line(tri, ink, 0.15); line([[p[0] + 1.5 * pxPerMm, p[1]], [p[0] + 12 * pxPerMm, p[1]]], ink, 0.12);
      txt(lab, [p[0] + 3 * pxPerMm, p[1] - 1 * pxPerMm], 8.5, soft, "left");
    }
  }
}

// labels of the time strip (the same section at five moments)
export function drawStripLabels(ctx, S, panels, stateAt, pxPerMm) {
  const T = TXT[S.lang] || TXT.en; const [fHead, fBody, fk] = FONTS[S.font] || FONTS.hand; const ts = S.textScale * fk;
  const pt = v => v * 0.3528 * pxPerMm * ts; const ink = S.dark ? "#ece5d8" : "#2b2926"; const soft = S.dark ? "rgba(236,229,216,0.75)" : "rgba(43,41,38,0.72)";
  const txt = (s, x, y, size, col, align = "left", font = fBody, weight = 400) => { ctx.font = `${weight} ${pt(size)}px ${font}`; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = "alphabetic"; ctx.fillText(s, x * pxPerMm, y * pxPerMm); };
  const hs = { en: "The same section, one day", ca: "La mateixa secció, un dia", es: "La misma sección, un día", ru: "Тот же разрез, одни сутки" };
  const p0 = panels[0];
  txt(hs[S.lang] || hs.en, p0.x, p0.y - 5, 16, ink, "left", fHead, 600);
  for (const p of panels) {
    const st = stateAt(p.hour); const h = p.hour % 24;
    const lab = `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60) % 60).padStart(2, "0")}`;
    ctx.strokeStyle = soft; ctx.lineWidth = 0.15 * pxPerMm; ctx.strokeRect(p.x * pxPerMm, p.y * pxPerMm, p.w * pxPerMm, p.h * pxPerMm);
    txt(lab, p.x + 2, p.y + p.h + 7, 15, ink, "left", fHead, 600);
    const wall = st.T.wall, setts = st.T.setts;
    const col = v => rgb(rampColor(S, ((v - (S.hRel === "1" ? st.Ta : 0)) - S.hTmin) / (S.hTmax - S.hTmin)));
    txt(`${T.air} ${st.Ta.toFixed(0)}°`, p.x + p.w - 1, p.y + p.h + 5, 9, soft, "right");
    txt(`${T.wall} ${wall.toFixed(0)}°  ·  ${T.setts} ${setts.toFixed(0)}°`, p.x + p.w - 1, p.y + p.h + 9.5, 8.5, col(Math.max(wall, setts)), "right");
    const day = st.sunVec && st.sunVec[2] > 0.02; const cx = (p.x + 5) * pxPerMm, cy = (p.y + 5) * pxPerMm, r = 2 * pxPerMm;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = day ? S.cAccent : "transparent"; ctx.fill(); ctx.strokeStyle = day ? S.cAccent : ink; ctx.lineWidth = 0.2 * pxPerMm; ctx.stroke();
    if (!day) { ctx.beginPath(); ctx.arc(cx + r * 0.6, cy - r * 0.2, r * 0.9, 0, 7); ctx.fillStyle = S.dark ? S.cPaper : "#f3eee3"; ctx.fill(); }
  }
}

// numbered story in plain words, numbers computed for the chosen day
export const STORY = {
  en: ["The sun loads the wall", "%h h of direct sun on its SSW face; the face reaches %wmax°",
       "The mass keeps it", "the day's heat sinks into the stone, ~%d cm deep by night",
       "At night it comes back", "the street stays %n° warmer than the air until dawn",
       "The cool is out of reach", "hedges at air temperature, 6 m up, behind the wall"],
  ca: ["El sol carrega el mur", "%h h de sol directe a la façana SSO; arriba a %wmax°",
       "La massa ho guarda", "la calor del dia penetra la pedra, ~%d cm a la nit",
       "A la nit torna", "el carrer és %n° més calent que l'aire fins a l'alba",
       "La fresca queda lluny", "bardisses a temperatura de l'aire, 6 m amunt, darrere el mur"],
  es: ["El sol carga el muro", "%h h de sol directo en su fachada SSO; llega a %wmax°",
       "La masa lo guarda", "el calor del día penetra la piedra, ~%d cm por la noche",
       "De noche lo devuelve", "la calle sigue %n° más caliente que el aire hasta el alba",
       "El fresco queda lejos", "setos a temperatura del aire, 6 m arriba, tras el muro"],
  ru: ["Солнце заряжает стену", "%h ч прямого солнца на фасаде ЮЮЗ; лицо стены до %wmax°",
       "Масса держит тепло", "дневное тепло уходит в камень, к ночи на ~%d см",
       "Ночью оно возвращается", "улица до рассвета на %n° теплее воздуха",
       "Прохлада недоступна", "изгороди при температуре воздуха — в 6 м выше, за стеной"],
};
function story(ctx, S, st, pxPerMm) {
  if (!S.ovNotes || !S.story || !st.storyNums) return;
  const L = STORY[S.lang] || STORY.en; const [fHead, fBody, fk] = FONTS[S.font] || FONTS.hand; const ts = S.textScale * fk;
  const pt = v => v * 0.3528 * pxPerMm * ts; const ink = S.dark ? "#ece5d8" : "#2b2926"; const soft = S.dark ? "rgba(236,229,216,0.78)" : "rgba(43,41,38,0.78)";
  const n = st.storyNums; const secv = S.view === "sec";
  const x0 = (secv ? 30 : (S.storyX ?? 452)) * pxPerMm; let y = (secv ? 150 : (S.storyY ?? 300)) * pxPerMm;
  const cols = [S.cAccent, S.cAccent, S.cAccent, S.cVeg];
  for (let i = 0; i < 4; i++) {
    const t1 = L[i * 2], t2 = L[i * 2 + 1].replace("%h", n.h.toFixed(1)).replace("%wmax", n.wmax.toFixed(0)).replace("%d", n.d.toFixed(0)).replace("%n", `+${n.n.toFixed(1)}`);
    ctx.font = `600 ${pt(30)}px ${fHead}`; ctx.fillStyle = cols[i]; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(String(i + 1), x0, y + pt(24));
    ctx.font = `600 ${pt(17)}px ${fHead}`; ctx.fillStyle = ink; ctx.fillText(t1, x0 + pt(26), y + pt(12));
    ctx.font = `400 ${pt(12)}px ${fBody}`; ctx.fillStyle = soft; ctx.fillText(t2, x0 + pt(26), y + pt(27));
    y += pt(40);
  }
}

export function drawSplitLabel(ctx, S, S2, st, st2, pxPerMm) {
  const [fHead, fBody, fk] = FONTS[S.font] || FONTS.hand; const pt = v => v * 0.3528 * pxPerMm * S.textScale * fk;
  const x = S.splitX * pxPerMm, H = st.sheet[1] * pxPerMm;
  ctx.strokeStyle = S.dark ? "#ece5d8" : "#2b2926"; ctx.lineWidth = 0.35 * pxPerMm; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  const fmt = h => { h = h % 24; return String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.round((h % 1) * 60) % 60).padStart(2, "0"); };
  const inkR = S2.dark ? "#ece5d8" : "#2b2926";
  ctx.font = `300 ${pt(54)}px ${fHead}`; ctx.textAlign = "left"; ctx.fillStyle = inkR; ctx.fillText(fmt(S2.hour), x + 14 * pxPerMm, 16 * pxPerMm + pt(40));
  const T = TXT[S.lang] || TXT.en;
  ctx.font = `300 ${pt(30)}px ${fHead}`; ctx.fillText(`${T.air} ${st2.Ta.toFixed(0)}°`, x + 14 * pxPerMm, 16 * pxPerMm + pt(78));
  ctx.font = `600 ${pt(15)}px ${fHead}`; ctx.fillStyle = S2.cAccent || S.cAccent;
  ctx.fillText(T.night1, x + 14 * pxPerMm, 16 * pxPerMm + pt(104));
}
