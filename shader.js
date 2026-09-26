// Fragment shader: draws the section stroke by stroke from the data textures, and evaluates the thermal model
// per pixel for the current time (T = A + svf*B + sum_k cos_k * G_k, per material; profiles inside the cut).
export const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

export const FRAG = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
in vec2 vUv; out vec4 outColor;
uniform sampler2D tIds, tGeo, tDep, tNrm, tCol, tSec, tAir, tProf;
uniform sampler2DArray tSun;
uniform sampler2D tPhoto;
uniform vec4 uFrame;          // oblique frame of the data (sx0,sx1,sz0,sz1)
uniform vec2 uSheetMM;        // sheet size (mm)
uniform vec2 uOrigin;         // oblique coords (m) of the sheet's top-left corner
uniform float uScale;         // 1:scale
uniform vec4 uView;           // screen->sheet: X = uView.x + fragX*uView.z ; Y = uView.y + fragY*uView.w  (mm)
uniform vec2 uRes;            // render target size (px)
uniform float uK, uTH, uSX;
// thermal state for the current time
uniform float uA[7], uB[7];
uniform vec4 uG[56];          // 7 materials x 32 slots (8 vec4 each)
uniform int uNSlots;
uniform float uTa, uTsky, uDNI, uDHI, uTref;
uniform int uSlot0; uniform float uSlotW;   // current lighting: slot index + blend to next
uniform int uLightSlot0; uniform float uLightW; uniform float uLightOn;
// style
uniform vec3 cPaper, cInk, cCut, cVeg, cAccent, cCool;
uniform vec3 cRamp[5];
uniform vec3 cRampCut[5];
uniform float uCutSmooth, uCutSeams;        // heat ramp (cold .. hot)
uniform float uDark;          // 0 multiply inks on paper, 1 light inks on dark paper
uniform float pSpacing, pWidth, pWobble, pGaps, pSeam, pJitter, pToneVar, pT1, pT2, pT3, pContrast;
uniform float pCutDensity, pCutLine, pEarthFade, pVegAmt, pDepthFade, pEdgeFade, pGrain, pLines, pAmb;
uniform int pStyle;           // 0 hatch 1 stipple 2 halftone 3 flat 4 lines-only 5 engraving 6 cells(colour)
uniform int pCutStyle;        // 0 per-stone hatch 1 solid 2 stipple 3 thermal fill
uniform float hInk, hWash, hIso, hDots, hHalo, hTmin, hTmax, hIsoStep, hRel, hCut, hMisreg, hPhotoCol;
uniform float uTime;          // for subtle animation (not used for data)
uniform float hPost, pToneHeat, pRidge, pTopClip;
uniform int uOut;             // 0 drawing, 1 temperature field (R,G = T, B = kind)
uniform vec3 uFocus;          // focus centre (sx, sz) and radius (m); radius 0 = off
uniform float uFocusSoft;

const float PI = 3.14159265;
// ---------------------------------------------------------------- hashing / noise
uint hu(uint x){ x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h2(int i, int j, int s){ return float(hu(uint(i)*1664525u ^ hu(uint(j)*22695477u ^ uint(s)*2654435761u)) & 0xffffffu) / 16777216.0; }
float hf(float x, int s){ return h2(int(floor(x*65536.0)), 7, s); }
float vn(vec2 p, float sc, int s){
  vec2 g = p/sc; vec2 i = floor(g); vec2 f = fract(g); f = f*f*(3.-2.*f);
  int ix=int(i.x), iy=int(i.y);
  float a=h2(ix,iy,s), b=h2(ix+1,iy,s), c=h2(ix,iy+1,s), d=h2(ix+1,iy+1,s);
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float sm(float x, float a, float b){ float t = clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }

// pencil lines: angle (rad), spacing (mm), width (mm), px = pixel size (mm)
float hatch(vec2 P, float ang, float sp, float w, float px, int seed, float wob, float gaps, float seglen){
  float ca = cos(ang), sa = sin(ang);
  float s = P.x*sa - P.y*ca, t = P.x*ca + P.y*sa;
  s += wob*(vn(P,5.,seed)-.5)*2.*sp;
  float q = s/sp; float k = floor(q); float f = q-k;
  float dist = abs(f-.5)*sp;
  float r = h2(int(k), int(ang*1000.), seed);
  float ww = max(w*(.65+.7*r), px*0.9);
  float cov = clamp(.5-(dist-ww*.5)/px, 0., 1.);
  float press = .55+.45*vn(vec2(t+r*97., k*3.1), 2.2, seed+1);
  float brk = vn(vec2(t+r*53., k*5.7), seglen, seed+2);
  return cov*press*sm(brk, gaps, gaps+.08);
}
float stip(vec2 P, float dens, float cell, float rad, float px, int seed){
  vec2 g = floor(P/cell); int gi=int(g.x), gj=int(g.y);
  vec2 c = (g + .2 + .6*vec2(h2(gi,gj,seed), h2(gi,gj,seed+1)))*cell;
  float on = h2(gi,gj,seed+2);
  float rr = rad*(.7+.6*h2(gi,gj,seed+3));
  float d = length(P-c);
  return clamp(.5-(d-rr)/px,0.,1.)*step(on, dens);
}
float halftone(vec2 P, float tone, float cell, float ang, float px){
  mat2 R = mat2(cos(ang),-sin(ang),sin(ang),cos(ang)); vec2 q = R*P/cell; vec2 f = fract(q)-.5;
  float r = sqrt(clamp(tone,0.,1.))*.62; return clamp(.5-(length(f)-r)*cell/px,0.,1.);
}
vec2 voro(vec2 uv, float size, int seed){         // (cell hash, distance to edge proxy)
  vec2 g = floor(uv/size); float best = 1e9, second = 1e9; float id = 0.;
  for(int du=-1; du<=1; du++) for(int dv=-1; dv<=1; dv++){
    int iu = int(g.x)+du, iv = int(g.y)+dv;
    vec2 p = (vec2(iu,iv) + .15 + .7*vec2(h2(iu,iv,seed), h2(iu,iv,seed+1)))*size;
    vec2 dd = uv-p; dd.y *= 1.35; float d = dot(dd,dd);
    if(d < best){ second = best; best = d; id = h2(iu,iv,seed+2); } else if(d < second) second = d;
  }
  return vec2(id, sqrt(second)-sqrt(best));
}

// ---------------------------------------------------------------- data access
vec2 obl(vec2 XY){ return vec2(uOrigin.x + XY.x*uScale/1000., uOrigin.y - XY.y*uScale/1000.); }
vec2 tuv(vec2 o){ return vec2((o.x-uFrame.x)/(uFrame.y-uFrame.x), (uFrame.w-o.y)/(uFrame.w-uFrame.z)); }
bool inside(vec2 uv){ return all(greaterThanEqual(uv, vec2(0.))) && all(lessThanEqual(uv, vec2(1.))); }
float dec16(vec2 v){ return (floor(v.x*255.+.5)*256. + floor(v.y*255.+.5))/65535.; }
int cls_at(vec2 uv){ return int(floor(texture(tIds,uv).b*255.+.5)); }
float uid_at(vec2 uv){ vec3 t = texture(tIds,uv).rgb; return dec16(t.rg); }
int flags_at(vec2 uv){ return int(floor(texture(tGeo,uv).b*255.+.5)); }
float sunslot(vec2 uv, int k, float lod){ vec3 v = textureLod(tSun, vec3(uv, float(k/3)), lod).rgb; int c = k - (k/3)*3; return c==0? v.r : (c==1? v.g : v.b); }

int matOf(int c){
  if(c==1||c==21) return 1; if(c==2) return 2;
  if(c==3||c==4||c==5||c==6||c==7||c==8||c==9) return 0;
  if(c==11||c==12||c==13) return 3; if(c==14||c==19) return 4;
  if(c==15||c==16||c==17||c==18) return 5; if(c==20) return 6; return -1;
}
bool isVeg(int c){ return c>=30 && c<=34; }
bool isMason(int c){ return c==1||c==2||c==3||c==8||c==9||c==4||c==5||c==6||c==7||c==20; }
bool isSoil(int c){ return c==15||c==16||c==17||c==18||c==12||c==14||c==19||c==0; }

float surfT(vec2 uv, int c, float svf){
  int m = matOf(c);
  if(isVeg(c)){
    float cn = mix(sunslot(uv,uSlot0,1.5), sunslot(uv,min(uSlot0+1,uNSlots-1),1.5), uSlotW)*uLightOn;
    float k = (c==30||c==31)? .03 : .008;
    return uTa + k*.5*(uDNI*cn + uDHI*svf);
  }
  if(m<0) return uTa;
  float T = uA[m] + svf*uB[m];
  for(int k=0;k<32;k++){
    if(k>=uNSlots) break;
    vec4 g = uG[m*8 + k/4]; int j = k - (k/4)*4;
    float gk = j==0? g.x : (j==1? g.y : (j==2? g.z : g.w));
    T += gk * sunslot(uv,k,1.5);
  }
  return T;
}
float cutT(vec2 uv){
  vec3 s = texture(tSec,uv).rgb; float dep = dec16(s.rg)*4.; int grp = int(floor(s.b*255.+.5));
  if(grp>=21) return uTref;
  float x = clamp(dep/1.6,0.,1.)*40.; int i0 = int(floor(x)); int i1 = min(i0+1,40); float f = x-float(i0);
  return mix(texelFetch(tProf, ivec2(i0,grp),0).r, texelFetch(tProf, ivec2(i1,grp),0).r, f);
}
vec3 rampCut(float x){
  x = clamp(x,0.,1.)*4.; int i = int(floor(min(x,3.999))); float f = x-float(i);
  vec3 a = cRampCut[0], b = cRampCut[1];
  for(int k=0;k<4;k++){ if(k==i){ a = cRampCut[k]; b = cRampCut[k+1]; } }
  return mix(a,b,f);
}
vec3 ramp(float x){
  x = clamp(x,0.,1.)*4.; int i = int(floor(min(x,3.999))); float f = x-float(i);
  vec3 a = cRamp[0], b = cRamp[1];
  for(int k=0;k<4;k++){ if(k==i){ a = cRamp[k]; b = cRamp[k+1]; } }
  return mix(a,b,f);
}

void main(){
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 P = vec2(uView.x + frag.x*uView.z, uView.y + frag.y*uView.w);     // sheet mm
  float px = uView.z;
  vec3 paper = cPaper*(0.985 + 0.03*(vn(P,.35,90)*.6 + vn(P,2.5,91)*.4));
  if(P.x<0.||P.y<0.||P.x>uSheetMM.x||P.y>uSheetMM.y){ outColor = vec4(cPaper*0.82,1.); return; }
  vec2 o = obl(P); vec2 uv = tuv(o);
  float inkG=0., inkC=0., inkV=0., inkH=0., inkE=0.; vec3 hotCol = cAccent; float washA = 0.; vec3 washC = cAccent;
  bool cov=false, cut=false, veg=false; int c=-1; float T=uTa, d=0., z=0., svf=1.;
  if(inside(uv)){
    int fl = flags_at(uv); cov = (fl&1)!=0; cut = (fl&2)!=0; veg = (fl&4)!=0;
    if(cov){
      c = cls_at(uv);
      vec3 dp = texture(tDep,uv).rgb; d = dec16(dp.rg)*80.; svf = dp.b;
      z = dec16(texture(tGeo,uv).rg)*40.-5.;
    }
  }
  float fade = 1. - pDepthFade*sm(d, 3., 32.);
  float tex_px = (uFrame.y-uFrame.x)/float(textureSize(tGeo,0).x);   // m per field texel
  // ---------------------------------------------------------- surfaces
  if(cov){
    vec3 n = texture(tNrm,uv).rgb*2.-1.;
    float uid = uid_at(uv);
    float lab = uid;
    // world position (from the oblique relation) for procedural cells
    float y = o.x + uK*d*cos(uTH), x = uSX - d;
    if(c>=4 && c<=7 && !cut){
      vec2 q = abs(n.x)>.7? vec2(y,z) : (abs(n.z)>.7? vec2(x,y) : vec2(x,z));
      lab = voro(q, .30, 14).x + 2.;
    }
    if(cut && (c==9 || (c>=4&&c<=7))){ lab = voro(vec2(y,z), .24, 17).x + 5.; }
    // light: follows the chosen time
    float cn = mix(sunslot(uv,uLightSlot0,0.), sunslot(uv,min(uLightSlot0+1,uNSlots-1),0.), uLightW)*uLightOn;
    float lit = clamp(cn/.6,0.,1.), amb = svf;
    float L = .65*lit + .35*amb*mix(1., pAmb, 1.-uLightOn);
    vec3 pc = texture(tCol,uv).rgb; float colL = dot(pc, vec3(.3,.55,.15));
    float alb = colL>.02? colL : .5;
    if(c==14) alb=.55; if(c==15) alb=.35; if(c==16) alb=.45; if(c==17) alb=.3; if(c==18) alb=.5; if(c==20) alb=.8; if(c==8||c==9) alb=.58;
    float D = clamp(((1.-L)*.85 + (.5-alb)*.45 + (hf(lab,3)-.5)*pToneVar)*pContrast, 0., 1.);
    // temperature
    T = cut? cutT(uv) : surfT(uv, c, svf);
    float Tr = T - mix(0., uTa, hRel);
    float heat = clamp((Tr - hTmin)/(hTmax - hTmin), 0., 1.);
    float heat0 = heat;
    if(hPost > 1.5 && !(cut && uCutSmooth > .5)) heat = (floor(heat*hPost) + .5)/hPost;
    hotCol = cut? rampCut(heat) : ramp(heat);
    D = mix(D, heat, pToneHeat);
    // unit seams (200 px/m ids)
    float sr = pSeam*.10/1000.*uScale;      // seam half width in m
    vec2 du = vec2(max(sr, .5/200.), 0.);
    float uidL = uid_at(tuv(o-du.xy)), uidR = uid_at(tuv(o+du.xy)), uidU = uid_at(tuv(o+du.yx)), uidD = uid_at(tuv(o-du.yx));
    bool seam = pSeam>0. && (abs(uidL-uid)+abs(uidR-uid)+abs(uidU-uid)+abs(uidD-uid)) > 0.;
    if((c>=4&&c<=7) || (cut && c==9)){
      vec2 q = cut? vec2(y,z) : (abs(n.x)>.7? vec2(y,z) : (abs(n.z)>.7? vec2(x,y) : vec2(x,z)));
      float sz_ = cut? .24 : .30; vec2 vv = voro(q, sz_, cut? 17: 14);
      seam = pSeam>0. && vv.y < pSeam*.012*uScale/30.;
    }
    // --- hatch parameters per class
    float a0=0., jit=180., sp=.52, wd=.15; bool hatchC=false;
    if(c==3){a0=0.;jit=180.;sp=.52;wd=.15;hatchC=true;}
    else if(c==1||c==21){a0=90.;jit=16.;sp=.40;wd=.13;hatchC=true;}
    else if(c==2){a0=45.;jit=12.;sp=.5;wd=.14;hatchC=true;}
    else if(c==13){a0=20.;jit=50.;sp=.5;wd=.14;hatchC=true;}
    else if(c==14){a0=150.;jit=0.;sp=.62;wd=.12;hatchC=true;}
    else if(c==20){a0=0.;jit=6.;sp=.75;wd=.11;hatchC=true;}
    else if(c==19){a0=30.;jit=0.;sp=.7;wd=.11;hatchC=true;}
    else if(c>=4&&c<=7){a0=0.;jit=180.;sp=.55;wd=.14;hatchC=true;}
    float ang = radians(a0 + (hf(lab,5)-.5)*jit*pJitter);
    sp *= pSpacing*(.9+.2*hf(lab,6)); wd *= pWidth;
    float g = 0.;
    if(veg){
      vec2 vc = voro(P, 2.1, 31); float fa = vc.x*PI;
      float s1 = hatch(P, fa, .42*pSpacing, .13*pWidth, px, 33, .35, .25, 1.2);
      float s2 = hatch(P, fa+1.4, .38*pSpacing, .12*pWidth, px, 34, .35, .25, 1.) * sm(D,.35,.6);
      float cs = vc.y < .08 ? 0. : 1.;
      bool dry = (c==30||c==31) && y < .3 && z < 1.2;
      float vv = max(s1*(.55+.45*sm(D,.2,.7)), s2)*cs;
      if(pStyle==3 || pStyle==6){ vv = .55 + .3*sm(D,.2,.8); }
      if(pStyle==2) vv = halftone(P, .35+.5*D, .7, .6, px);
      if(pStyle==10) vv = 0.;
      if(dry) inkG = max(inkG, vv*.55*fade); else { inkV = max(inkV, vv*pVegAmt*fade); inkV = max(inkV, (.16+.12*vn(P,3.,37))*pVegAmt); }
    } else if(cut){
      // ------------------------------------------------ section poche
      float cutAmt = pCutDensity;
      if(isMason(c) || c==13){
        bool ctx = (c>=4&&c<=7)||c==20;
        float angc = hf(lab,41)*PI;
        float c1 = hatch(P, angc, .34*pSpacing, .15*pWidth, px, 42, .1, .08, 4.);
        float c2 = hatch(P, angc+PI*.5, .40*pSpacing, .13*pWidth, px, 43, .1, .1, 4.);
        float v = max(c1, c2*.8);
        if(pCutStyle==1) v = .92; if(pCutStyle==2) v = stip(P, .85, .3, .09, px, 44); if(pCutStyle==3) v = (seam && uCutSeams > .5)? .55 : .9;
        if(pCutStyle==4){ vec2 wc = floor(P/1.6); float hv = mod(wc.x+wc.y,2.); v = seam? 0. : (.55 + .45*hatch(P, hv>.5? 0. : PI*.5, .30*pSpacing, .16*pWidth, px, 9, .05, .0, 9.)); }
        if(pStyle==2) v = halftone(P, .8, .55, .3, px);
        if(pStyle==4) v = 0.;
        v *= ctx? .45 : 1.; if(seam && pCutStyle!=1 && pCutStyle!=3 && pCutStyle!=4) v = 0.;
        inkC = max(inkC, v*cutAmt);
      } else if(c==18){                                        // drainage gravel: packed round pebbles ~35 mm, never fades
        float cs = 35./uScale;                                   // pebble cell in sheet mm
        vec2 g = floor(P/cs); vec2 cc = (g + .5 + .3*(vec2(h2(int(g.x),int(g.y),71), h2(int(g.x),int(g.y),72))-.5))*cs;
        float rr = cs*(.34 + .08*h2(int(g.x),int(g.y),73));
        float ring = abs(length(P-cc)-rr);
        inkC = max(inkC, max(clamp(.5-(ring-.07)/px,0.,1.), .3)*cutAmt);
      } else if(c==19){                                        // drain pipe
        inkC = max(inkC, .95*cutAmt);
      } else {
        float dep = dec16(texture(tSec,uv).rg)*4. + (vn(P,6.,49)-.5)*.5;
        float ef = 1. - sm(dep, .25, pEarthFade);
        float e = stip(P, .8*ef, .36, .085, px, 45)*.95;
        e = max(e, hatch(P, radians(-20.), 1.4, .11, px, 47, .18, .55, 2.)*.55*sm(ef,.35,.8));
        if(pCutStyle==1) e = ef*.5;
        if(pCutStyle==4){ vec2 wc = floor(P/1.6); float hv = mod(wc.x+wc.y,2.); e = ef*(.25+.55*hatch(P, hv>.5? 0. : PI*.5, .36*pSpacing, .12*pWidth, px, 9, .05, .0, 9.)); } if(pStyle==2) e = halftone(P, .6*ef, .6, .3, px);
        inkE = max(inkE, e*cutAmt*.85);
      }
    } else {
      // ------------------------------------------------ elevation beyond
      if(hatchC){
        if(pStyle==0 || pStyle==5){
          float t1 = pT1, t2 = pT2, t3 = pT3;
          float a1 = hatch(P, ang, sp, wd * (pStyle==5? (.5+1.6*D) : 1.), px, 1, .18*pWobble, pGaps, 4.) * (pStyle==5? 1. : sm(D, t1, t1+.08));
          float a2 = pStyle==5? 0. : hatch(P, ang + radians(80.+20.*hf(lab,8)), sp*1.05, wd, px, 2, .18*pWobble, pGaps, 4.)*sm(D,t2,t2+.08);
          float a3 = pStyle==5? 0. : hatch(P, ang + radians(35.), sp*.8, wd, px, 3, .18*pWobble, pGaps, 4.)*sm(D,t3,t3+.08);
          g = max(max(a1,a2),a3);
        } else if(pStyle==1){ g = stip(P, clamp(.1+.9*D,0.,1.), .38*pSpacing, .085*pWidth, px, 21); }
        else if(pStyle==2){ g = halftone(P, D, .6*pSpacing, .785, px); }
        else if(pStyle==3){ g = .12 + .55*D; }
        else if(pStyle==6){ g = .25 + .5*D; }
        else if(pStyle==7){                                   // ridges: horizontal lines lifted by the heat
          float Ts = T - uTa; float lift = clamp(Ts, -8., 20.)*pRidge*.18;
          float q = (P.y + lift)/(.9*pSpacing); float f = abs(fract(q)-.5)*.9*pSpacing;
          g = clamp(.5-(f-.07*pWidth)/px,0.,1.);
        }
        else if(pStyle==8){                                   // grid: pencil grid, cells tinted
          vec2 f = abs(fract(P/(2.2*pSpacing))-.5)*2.2*pSpacing; float l = min(f.x,f.y);
          g = max(clamp(.5-(l-.05*pWidth)/px,0.,1.)*.7, .10+.35*D);
        }
        else if(pStyle==9){                                   // weave: warp and weft by cell
          vec2 cell = floor(P/1.6); float hv = mod(cell.x+cell.y, 2.);
          g = hatch(P, hv>.5? 0. : PI*.5, .32*pSpacing, .12*pWidth, px, 9, .05, .0, 9.) * (.45+.55*D);
        }
        if(pStyle==10) g = 0.;
        if(seam && pStyle < 7) g = 0.;
      } else if(isSoil(c)){
        float dens = clamp(.45*(.35+.9*D),0.,1.);
        g = pStyle==2? halftone(P, dens*.7, .6, .785, px) : (pStyle==3||pStyle==6? .1+.4*D : stip(P, dens, .42, .075, px, 20+c)*.8);
        if(pStyle==7){ float lift = clamp(T-uTa,-8.,20.)*pRidge*.18; float q = (P.y+lift)/(.9*pSpacing); g = clamp(.5-(abs(fract(q)-.5)*.9*pSpacing-.07*pWidth)/px,0.,1.); }
        if(pStyle==8){ vec2 f = abs(fract(P/(2.2*pSpacing))-.5)*2.2*pSpacing; g = max(clamp(.5-(min(f.x,f.y)-.05*pWidth)/px,0.,1.)*.7, .08+.3*D); }
      } else g = .1*D;
      if(pStyle==10) g = 0.;
      inkG = max(inkG, g*.9*fade);
    }
    // ------------------------------------------------ heat
    if(!veg || true){
      float ex = clamp((T - uTa - 3.)/15., 0., 1.);
      if(hWash>0. && !veg) { washA = max(washA, hWash*(hRel>.5? ex : heat)); washC = hotCol; }
      if(hDots>0. && !veg) inkH = max(inkH, stip(P, sm(T-uTa, 5., 20.)*.8*hDots, .46, .10, px, 60));
      if(hIso>0. && !veg){
        float tv = T/hIsoStep; float fw = fwidth(tv);
        float l = clamp(1. - abs(fract(tv+.5)-.5)/max(fw*1.2, 1e-4), 0., 1.) * step(fw, .6);
        inkH = max(inkH, l*hIso*step(uTa+2., T));
      }
    }
    // ------------------------------------------------ lines: silhouettes, depth steps, cut outline
    float lr = pLines*.09/1000.*uScale;
    float lw = max(lr, tex_px*.6);
    float edge = 0., cedge = 0.;
    for(int k=0;k<4;k++){
      vec2 dd = k==0? vec2(lw,0.) : (k==1? vec2(-lw,0.) : (k==2? vec2(0.,lw) : vec2(0.,-lw)));
      vec2 u2 = tuv(o+dd);
      int f2 = flags_at(u2);
      if((f2&1)==0) edge = 1.;
      else {
        float d2 = dec16(texture(tDep,u2).rg)*80.; float z2 = dec16(texture(tGeo,u2).rg)*40.-5.;
        if(abs(d2-d) > .25 || abs(z2-z) > .25) edge = 1.;
        if(((f2&2)!=0) != cut) cedge = 1.;
      }
    }
    if(cut && isSoil(c)) { edge *= 0.; }
    if(cut && isSoil(c) && z < -0.3) cedge *= 0.;
    if(veg){ inkV = max(inkV, edge*.8); edge = 0.; }
    inkG = max(inkG, edge*.85*fade*step(.001,pLines));
    inkC = max(inkC, cedge*step(.001,pCutLine)*1.);
  } else if(inside(uv) && hHalo > 0.){
    // ------------------------------------------------ air: heat rings from warm surfaces nearby
    vec3 a = texture(tAir,uv).rgb;
    float dist = a.b*255./100.;                // m
    if(dist < 2.5){
      vec2 off = (a.rg*255.-128.)/100.;        // m to the nearest surface
      vec2 o2 = o + vec2(off.x, -off.y);
      vec2 u2 = tuv(o2);
      int c2 = cls_at(u2); int f2 = flags_at(u2);
      float s2 = texture(tDep,u2).b;
      float T2 = ((f2&2)!=0)? cutT(u2) : surfT(u2, c2, s2);
      if(!isVeg(c2)){
        float ex = max(T2 - uTa, 0.);
        float reach = ex*hHalo*uScale/1000.*4.;           // m
        float dmm = dist*1000./uScale;
        float ring = abs(fract((dmm + .25*(vn(P,3.,63)-.5)*2.)/1.1) - .5)*1.1;
        float rl = clamp(.5-(ring-.06)/px,0.,1.) * step(dist, reach) * pow(clamp(1.-dist/max(reach,1e-3),0.,1.), .7);
        rl *= sm(vn(P*.7,1.6,64), .25, .35);
        inkH = max(inkH, rl*.95);
        hotCol = ramp(clamp((T2 - mix(0.,uTa,hRel) - hTmin)/(hTmax-hTmin),0.,1.));
      }
    }
  }
  // ---------------------------------------------------------- sheet edge dissolve
  float e = min(min(P.x, P.y), min(uSheetMM.x-P.x, uSheetMM.y-P.y));
  float nz = (vn(P,7.,65)-.5)*pEdgeFade*.8 + (vn(P,1.5,66)-.5)*pEdgeFade*.25;
  float kf = pEdgeFade>0.? sm(e+nz, 2., pEdgeFade) : 1.;
  if(pTopClip > 0.) kf *= sm(P.y - pTopClip + nz*.5, 0., max(pEdgeFade*.6, 1.));
  if(uFocus.z > 0.){
    float fd = length((o - uFocus.xy)*vec2(1., 1.25)) + (vn(P,9.,67)-.5)*uFocusSoft*.9 + (vn(P,2.,68)-.5)*uFocusSoft*.3;
    kf *= 1. - sm(fd, uFocus.z, uFocus.z + uFocusSoft);
  }
  if(uOut == 1){
    float depE = cov && cut ? dec16(texture(tSec,uv).rg)*4. : 0.;
    bool show = cov && kf > .5 && !(cut && isSoil(c) && depE > pEarthFade*.8) && !(cut && d > .1);
    if(!show){ outColor = vec4(0.,0.,0.,1.); return; }
    float q = clamp((T + 20.)/100., 0., 1.)*65535.;
    float kind = cut? 0.75 : (veg? 0.5 : 0.25);
    outColor = vec4(floor(q/256.)/255., mod(q,256.)/255., kind, 1.); return;
  }
  inkG*=kf; inkC*=kf; inkV*=kf; inkH*=kf; inkE*=kf; washA*=kf;
  // ---------------------------------------------------------- composite
  vec3 inkCol = mix(cInk, hotCol, hInk);          // thermal ink: the stroke colour is the temperature
  vec3 cutCol = mix(cCut, hotCol, hCut);
  vec3 col = paper;
  if(pStyle==10 && inside(uv)){
    vec4 ph = texture(tPhoto, uv);
    float a = ph.a * (cut? 0. : 1.) * kf * mix(1., fade, .6);
    col = mix(col, ph.rgb, a);
  }
  if(hPhotoCol>0. && cov && !cut){ vec3 pc = texture(tCol,uv).rgb; col = mix(col, col*mix(vec3(1.), pc*1.25, .55), hPhotoCol); }
  if(uDark < .5){
    col *= mix(vec3(1.), washC/cPaper, washA);
    col *= mix(vec3(1.), cVeg/cPaper, clamp(inkV,0.,1.));
    col *= mix(vec3(1.), inkCol/cPaper, clamp(inkG,0.,1.));
    col *= mix(vec3(1.), cutCol/cPaper, clamp(inkC,0.,1.));
    col *= mix(vec3(1.), mix(cCut, hotCol, .35*hCut)/cPaper, clamp(inkE,0.,1.));
    vec3 hc = hIso>0.||hDots>0.||hHalo>0.? mix(cAccent, hotCol, step(.5, hInk+hHalo*0.)) : cAccent;
    col *= mix(vec3(1.), hotCol/cPaper, clamp(inkH,0.,1.));
  } else {
    col = mix(col, washC, washA*.8);
    col = mix(col, cVeg, clamp(inkV,0.,1.));
    col = mix(col, inkCol, clamp(inkG,0.,1.));
    col = mix(col, cutCol, clamp(inkC,0.,1.));
    col = mix(col, mix(cCut, hotCol, .35*hCut), clamp(inkE,0.,1.));
    col = mix(col, hotCol, clamp(inkH,0.,1.));
  }
  col *= (1. - pGrain*.05) + pGrain*.05*vn(P,.12,92)*2.;
  outColor = vec4(clamp(col,0.,1.),1.);
}`;
