// Apex: własny renderer WebGL2 Predatora. Klocki rysowane instancjami (jedna paczka na kształt), cienie z mapy głębi
// z filtrem PCF, niebo liczone w shaderze, mgła, woda, teren. Bez żadnych bibliotek.
import { SKYBOXES, type SkyboxDef } from "../../../shared/skybox.ts";
import type { WeatherId } from "../../../shared/types.ts";
import { OVERCAST, skyAt } from "./atmosphere.ts";
import { GRASS_CHUNK } from "./nature.ts";
import { TERRAIN_MATERIALS, type TerrainGrid } from "../../../shared/terrain.ts";
import type { Part, PartShape } from "../../../shared/types.ts";
import { boxMesh, cylinderMesh, frustumMesh, hemiMesh, sphereMesh, torusMesh, wedgeMesh, type Mesh } from "./geometry.ts";
import { partTextureCanvas } from "../engine/partTextures.ts";
import type { VoxBucket, VoxGeo } from "../engine/voxelAtlas.ts";
import { invert, lookAt, multiply, ortho, perspective, type Mat4, type V3 } from "./math.ts";
import { TIERS, detectTier, type QualityTier } from "./quality.ts";

void SKYBOXES;

/** floaty na instancję: model(16) kolor(4) rozmiar+materiał(4) */
const STRIDE = 24;
export const MAT = { plastic: 0, neon: 1, metal: 2, glass: 3, water: 4, terrain: 5 } as const;

const colorCache = new Map<string, [number, number, number]>();
export function rgb(hex: string): [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    const n = m ? parseInt(m[1], 16) : 0xcccccc;
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    colorCache.set(hex, c);
  }
  return c;
}

/** ile jednostek świata zajmuje jedno powtórzenie tekstury klocka */
const PART_TILE = 8;

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 iM0;
layout(location=4) in vec4 iM1;
layout(location=5) in vec4 iM2;
layout(location=6) in vec4 iM3;
layout(location=7) in vec4 iCol;
layout(location=8) in vec4 iMisc;
layout(location=9) in vec4 aJ;
layout(location=10) in vec4 aWt;
uniform highp sampler2D uJT; uniform float uSkin;
mat4 joint(float i){ int k = int(i) * 4; return mat4(texelFetch(uJT, ivec2(k, 0), 0), texelFetch(uJT, ivec2(k + 1, 0), 0), texelFetch(uJT, ivec2(k + 2, 0), 0), texelFetch(uJT, ivec2(k + 3, 0), 0)); }
uniform mat4 uVP;
uniform mat4 uLightVP; uniform mat4 uLightVP2;
uniform float uTile;
out vec3 vN; out vec3 vW; out vec2 vUv; out vec4 vCol; out float vMat; out vec4 vL; out vec4 vL2; out vec2 vT;
void main(){
  mat4 M = mat4(iM0,iM1,iM2,iM3);
  vec3 P0 = aPos, N0 = aNrm;
  if (uSkin > 0.5) {
    // skóra: pozycja i normalna przez cztery kości (układ glTF), potem odbicie z -> -z do układu lewoskrętnego
    mat4 sk = aWt.x * joint(aJ.x) + aWt.y * joint(aJ.y) + aWt.z * joint(aJ.z) + aWt.w * joint(aJ.w);
    vec4 sp = sk * vec4(aPos, 1.0);
    P0 = vec3(sp.x, sp.y, -sp.z);
    vec3 sn = mat3(sk) * aNrm;
    N0 = vec3(sn.x, sn.y, -sn.z);
  }
  vec4 w = M * vec4(P0,1.0);
  vec3 s = max(iMisc.xyz, vec3(1e-3));
  vN = mat3(M) * (N0 / (s*s));
  vW = w.xyz; vUv = aUv; vCol = iCol; vMat = iMisc.w;
  // tekstura kafelkowana w jednostkach świata: rzut wzdłuż dominującej osi normalnej
  vec3 lp = aPos * s; vec3 an = abs(aNrm);
  vec2 tp = an.x > 0.5 ? lp.zy : (an.y > 0.5 ? lp.xz : lp.xy);
  vec2 uv = aUv;
  // uTile < 0: UV ściany (-1), tułów w koszulce (-2: przód i tył = lewa połowa, boki = prawa), kończyna (-3: paski z góry i z dołu)
  if (uTile < -1.5 && uTile > -2.5) uv.x = an.z > 0.5 ? uv.x * 0.5 : 0.5 + uv.x * 0.5;
  else if (uTile < -2.5 && uTile > -3.5) { if (aNrm.y > 0.5) uv.y = 0.97 + 0.03 * uv.y; else if (aNrm.y < -0.5) uv.y = 0.03 * uv.y; }
  vT = uTile > 0.0 ? tp / uTile : uv;
  // przesunięcie wzdłuż normalnej przy liczeniu cienia - mniej plam na ścianach ustawionych bokiem do słońca
  vL = uLightVP * vec4(w.xyz + normalize(vN) * 0.4, 1.0);
  vL2 = uLightVP2 * vec4(w.xyz + normalize(vN) * 1.1, 1.0);
  gl_Position = uVP * w;
}`;

const FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec2 vUv; in vec4 vCol; in float vMat; in vec4 vL; in vec4 vL2; in vec2 vT;
uniform sampler2D uTexD; uniform float uUseTex; uniform float uTile;
uniform vec3 uCam; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround;
uniform vec3 uFogCol; uniform vec2 uFog; uniform float uTime; uniform float uBevel; uniform float uShadowOn;
uniform sampler2DShadow uShadow; uniform sampler2DShadow uShadow2; uniform float uShadowTexel; uniform float uCasc;
uniform int uNL; uniform vec4 uLP[8]; uniform vec4 uLC[8]; uniform vec4 uLD[8];
uniform float uNeon;
uniform float uClipY; uniform vec3 uEnvTop; uniform vec3 uEnvHor; uniform sampler2D uRefl; uniform float uReflOn; uniform vec2 uRes;
out vec4 o;
// otoczenie odbijane w wodzie, szkle i metalu: niebo, słońce
vec3 envAt(vec3 R){
  vec3 c = R.y > 0.0 ? mix(uEnvHor, uEnvTop, pow(R.y, 0.55)) : uEnvHor * 0.55;
  return c + uSunCol * pow(max(dot(R, uSun), 0.0), 220.0) * 4.0;
}
// fale: nachylenie powierzchni z kilku sinusów w różnych kierunkach
vec2 waveSlope(vec3 w){
  vec2 s = vec2(0.0);
  s += vec2(0.8, 0.6) * cos(dot(w.xz, vec2(0.8, 0.6)) * 0.9 + uTime * 1.3) * 0.045;
  s += vec2(-0.5, 0.86) * cos(dot(w.xz, vec2(-0.5, 0.86)) * 1.7 + uTime * 1.7) * 0.03;
  s += vec2(0.95, -0.3) * cos(dot(w.xz, vec2(0.95, -0.3)) * 3.1 + uTime * 2.3) * 0.018;
  s += vec2(-0.2, -0.98) * cos(dot(w.xz, vec2(-0.2, -0.98)) * 5.3 + uTime * 3.1) * 0.01;
  return s;
}
const vec2 PD[12] = vec2[](vec2(-0.326,-0.406), vec2(-0.840,-0.074), vec2(-0.696,0.457), vec2(-0.203,0.621), vec2(0.962,-0.195), vec2(0.473,-0.480),
  vec2(0.519,0.767), vec2(0.185,-0.893), vec2(0.507,0.064), vec2(0.896,0.412), vec2(-0.322,-0.933), vec2(-0.792,-0.598));
float hash2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float tap(sampler2DShadow sm, vec3 p, float bias, float spread, mat2 R){
  float s = 0.0;
  for (int i=0;i<12;i++) s += texture(sm, vec3(p.xy + R * PD[i] * uShadowTexel * spread, p.z - bias));
  return s / 12.0;
}
// cienie kaskadowe: blisko gęsta mapa (ostre krawędzie), dalej szeroka (duże mapy); przejście płynne
float shadowAt(vec3 n){
  if (uShadowOn < 0.5) return 1.0;
  float ndl = max(dot(n,uSun),0.0);
  float bias = 0.0006 + 0.0022 * (1.0 - ndl);
  float a = hash2(gl_FragCoord.xy) * 6.2832;
  mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec3 p0 = vL.xyz / vL.w * 0.5 + 0.5;
  vec3 p1 = vL2.xyz / vL2.w * 0.5 + 0.5;
  float w = 0.0;
  if (uCasc > 1.5) {
    float e = max(abs(p0.x - 0.5), abs(p0.y - 0.5)) * 2.0;
    w = (p0.z > 1.0 || p0.z < 0.0) ? 0.0 : 1.0 - smoothstep(0.78, 0.96, e);
  }
  float s = 0.0;
  if (w > 0.001) s += w * tap(uShadow, p0, bias, 1.6, R);
  if (w < 0.999) {
    float lit = 1.0;
    if (p1.x > 0.0 && p1.x < 1.0 && p1.y > 0.0 && p1.y < 1.0 && p1.z < 1.0) lit = tap(uShadow2, p1, bias * (uCasc > 1.5 ? 2.6 : 1.0), uCasc > 1.5 ? 1.4 : 2.0, R);
    s += (1.0 - w) * lit;
  }
  return s;
}
void main(){
  if (vW.y < uClipY) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 base = vCol.rgb;
  float mat = vMat;
  float alpha = vCol.a;
  if (uUseTex > 0.5) {
    vec4 tx = texture(uTexD, uTile > 0.0 || uTile < -3.5 ? vT : vec2(vT.x, 1.0 - vT.y));
    base *= tx.rgb;
    alpha *= tx.a;
  }
  vec3 V = normalize(uCam - vW);
  vec3 col;
  if (mat > 0.5 && mat < 1.5) {
    col = base * uNeon;
  } else {
    float ndl = max(dot(n,uSun),0.0);
    float sh = shadowAt(n);
    vec3 amb = mix(uGround, uSky, n.y*0.5+0.5);
    vec3 lit = amb * 0.62 + uSunCol * ndl * sh * 0.78;
    // światła punktowe i reflektory (latarka, błyski strzałów)
    for (int i = 0; i < 8; i++) {
      if (i >= uNL) break;
      vec3 dl = uLP[i].xyz - vW;
      float dist = length(dl);
      float rng = uLP[i].w;
      if (dist < rng) {
        vec3 L = dl / dist;
        float att = 1.0 - dist / rng; att *= att;
        float spot = uLC[i].w > -0.5 ? smoothstep(uLC[i].w, uLD[i].w, dot(-L, uLD[i].xyz)) : 1.0;
        lit += uLC[i].rgb * max(dot(n, L), 0.0) * att * spot;
      }
    }
    float envMix = 0.0; vec3 env = vec3(0.0);
    if (mat > 3.5 && mat < 4.5) {
      // woda: fale zmieniają normalną, odbicie nieba (albo prawdziwe odbicie otoczenia) rośnie przy małym kącie
      vec2 sl = waveSlope(vW);
      n = normalize(vec3(-sl.x, 1.0, -sl.y));
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n,V),0.0), 4.0);
      vec3 R = reflect(-V, n);
      env = envAt(R);
      if (uReflOn > 0.5) env = texture(uRefl, gl_FragCoord.xy / uRes + n.xz * 0.05).rgb;
      envMix = clamp(fres * 1.1 + 0.1, 0.0, 0.85);
      alpha = clamp(alpha + fres * 0.35, 0.0, 0.94);
    } else if (mat > 2.5 && mat < 3.5) {
      // szkło odbija otoczenie
      float fres = pow(1.0 - max(dot(n,V),0.0), 3.0);
      env = envAt(reflect(-V, n));
      envMix = 0.16 + 0.55 * fres;
      alpha = clamp(alpha + fres * 0.3, 0.0, 1.0);
    } else if (mat > 1.5 && mat < 2.5) {
      float fres = pow(1.0 - max(dot(n,V),0.0), 3.0);
      env = envAt(reflect(-V, n)) * base;
      envMix = 0.3 + 0.4 * fres;
    }
    col = base * lit;
    if (envMix > 0.0) col = mix(col, env, envMix);
    if (uBevel > 0.5 && mat < 3.5) {
      vec2 e = min(vUv, 1.0 - vUv);
      float edge = smoothstep(0.0, 0.035, min(e.x,e.y));
      col *= mix(0.86, 1.0, edge);
    }
    vec3 H = normalize(uSun + V);
    float sp = (mat > 1.5 && mat < 2.5) ? 0.8 : (mat > 2.5 && mat < 3.5) ? 1.0 : 0.12;
    float pw = (mat > 1.5 && mat < 3.5) ? 90.0 : 28.0;
    col += uSunCol * pow(max(dot(n,H),0.0), pw) * sp * ndl * sh;
  }
  float d = length(uCam - vW);
  float f = clamp((d - uFog.x) / max(uFog.y - uFog.x, 1.0), 0.0, 1.0);
  o = vec4(mix(col, uFogCol, f*f), alpha);
}`;

const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=3) in vec4 iM0;
layout(location=4) in vec4 iM1;
layout(location=5) in vec4 iM2;
layout(location=6) in vec4 iM3;
layout(location=9) in vec4 aJ;
layout(location=10) in vec4 aWt;
uniform highp sampler2D uJT; uniform float uSkin;
mat4 joint(float i){ int k = int(i) * 4; return mat4(texelFetch(uJT, ivec2(k, 0), 0), texelFetch(uJT, ivec2(k + 1, 0), 0), texelFetch(uJT, ivec2(k + 2, 0), 0), texelFetch(uJT, ivec2(k + 3, 0), 0)); }
uniform mat4 uVP;
void main(){
  vec3 P0 = aPos;
  if (uSkin > 0.5) {
    mat4 sk = aWt.x * joint(aJ.x) + aWt.y * joint(aJ.y) + aWt.z * joint(aJ.z) + aWt.w * joint(aJ.w);
    vec4 sp = sk * vec4(aPos, 1.0);
    P0 = vec3(sp.x, sp.y, -sp.z);
  }
  gl_Position = uVP * (mat4(iM0,iM1,iM2,iM3) * vec4(P0,1.0));
}`;
const DEPTH_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main(){ o = vec4(1.0); }`;

const SKY_VS = `#version 300 es
out vec2 vP;
void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vP = p*2.0-1.0; gl_Position = vec4(vP, 1.0, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vP; uniform mat4 uInvVP; uniform vec3 uCam; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot;
uniform vec3 uSun; uniform vec4 uSunDisc; uniform float uStars; uniform vec4 uClouds; uniform float uTime; uniform float uCover;
out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec4 w = uInvVP * vec4(vP, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w - uCam);
  float t = d.y;
  vec3 c = t > 0.0 ? mix(uHor, uTop, pow(t, 0.55)) : mix(uHor, uBot, pow(-t, 0.45));
  if (uStars > 0.02 && t > -0.05) {
    // małe, migoczące gwiazdy: w każdej kratce nieba najwyżej jedna, w losowym miejscu
    vec2 sp = d.xz / (abs(d.y) + 0.35) * 70.0;
    vec2 id = floor(sp), f = fract(sp) - 0.5;
    float r = h21(id);
    vec2 o = (vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5) * 0.6;
    float star = step(0.9, r) * smoothstep(0.075, 0.012, length(f - o)) * (0.55 + 0.45 * sin(uTime * 2.5 + r * 60.0));
    c += vec3(star) * smoothstep(0.0, 0.2, t) * (0.6 + 0.4 * h21(id + 1.7)) * uStars;
  }
  float sd = dot(d, uSun);
  if (uSunDisc.w > 0.01) {
    c += uSunDisc.rgb * uSunDisc.w * (smoothstep(0.9975, 0.9992, sd) * 1.4 + pow(max(sd,0.0), 24.0) * 0.28);
  }
  if (uClouds.w > 0.02 && t > 0.02) {
    vec2 cp = d.xz / (t + 0.25) * 1.2 + vec2(uTime*0.012, 0.0);
    float n = vn(cp*2.0)*0.55 + vn(cp*4.3)*0.3 + vn(cp*9.0)*0.15;
    float a = smoothstep(0.52 - 0.34 * uCover, 0.78 - 0.2 * uCover, n) * uClouds.w * smoothstep(0.02, 0.25, t);
    c = mix(c, uClouds.rgb, a);
  }
  o = vec4(c, 1.0);
}`;

const GRASS_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aT;
uniform mat4 uVP; uniform vec3 uCam; uniform float uTime; uniform float uWind; uniform float uRange; uniform float uDensity; uniform vec2 uFog;
out vec3 vC; out float vF;
void main(){
  int blade = gl_VertexID / 3;
  int k = gl_VertexID - blade * 3;
  float seed = aT.w;
  float ang = seed * 6.2832 + float(blade) * 2.094;
  vec2 dir = vec2(cos(ang), sin(ang));
  float d = distance(aT.xz, uCam.xz);
  float fade = 1.0 - smoothstep(uRange * 0.65, uRange, d);
  float keep = step(fract(seed * 7.31), uDensity);
  float hgt = (0.5 + 0.8 * fract(seed * 13.7)) * fade * keep;
  float side = k == 0 ? -1.0 : (k == 1 ? 1.0 : 0.0);
  float tip = k == 2 ? 1.0 : 0.0;
  vec3 p = aT.xyz;
  p.xz += dir * side * 0.17 * keep;
  p.y += tip * hgt;
  float sw = sin(uTime * 1.8 + aT.x * 0.35 + aT.z * 0.27 + seed * 6.0);
  p.xz += vec2(0.55 * sw + 0.3, 0.25 * sw) * uWind * tip * hgt;
  p.xz += dir.yx * vec2(1.0, -1.0) * 0.18 * tip * hgt;
  vC = mix(vec3(0.17, 0.36, 0.11), vec3(0.46, 0.74, 0.23), tip) * (0.8 + 0.4 * fract(seed * 3.3));
  float dd = distance(p, uCam);
  vF = clamp((dd - uFog.x) / max(uFog.y - uFog.x, 1.0), 0.0, 1.0);
  gl_Position = uVP * vec4(p, 1.0);
}`;
const GRASS_FS = `#version 300 es
precision highp float;
in vec3 vC; in float vF; uniform vec3 uLit; uniform vec3 uFogCol; out vec4 o;
void main(){ o = vec4(mix(vC * uLit, uFogCol, vF * vF), 1.0); }`;

const WEATHER_VS = `#version 300 es
precision highp float;
uniform mat4 uVP; uniform vec3 uCam; uniform float uTime; uniform vec2 uWind; uniform float uSnow; uniform vec2 uRes;
out float vA;
vec3 h3(float n){ return fract(sin(vec3(n*12.9898, n*78.233, n*37.719)) * 43758.5453); }
void main(){
  const float BOX = 70.0; const float H = 48.0;
  bool snow = uSnow > 0.5;
  int id = snow ? gl_VertexID : gl_VertexID / 6;
  vec3 r = h3(float(id) + 1.0);
  float fall = snow ? (2.2 + 1.6 * r.z) : (62.0 + 20.0 * r.z);
  float y = mod(r.y * H - uTime * fall, H);
  vec3 p = vec3(uCam.x + mod(r.x * BOX - uCam.x + BOX * 0.5, BOX) - BOX * 0.5, uCam.y - 10.0 + y, uCam.z + mod(r.z * BOX * 1.37 - uCam.z + BOX * 0.5, BOX) - BOX * 0.5);
  float drift = snow ? 6.0 : 0.55;
  p.xz += uWind * (snow ? (y * 0.25 + sin(uTime * 0.8 + r.x * 40.0) * 1.2) : (y - H * 0.5) * drift * 0.18);
  float d = length(p - uCam);
  vA = (1.0 - smoothstep(BOX * 0.35, BOX * 0.5, d)) * smoothstep(0.0, 2.0, y) * smoothstep(0.0, 1.5, H - y);
  if (snow) {
    vec4 c = uVP * vec4(p, 1.0);
    gl_Position = c;
    gl_PointSize = clamp(uRes.y * 0.0075 * (0.6 + r.z) / max(c.w * 0.12, 0.15), 1.5, 9.0);
    return;
  }
  vec3 dir = normalize(vec3(uWind.x * 6.0, -fall, uWind.y * 6.0));
  int k = gl_VertexID - id * 6;
  int c = k == 0 ? 0 : k == 1 ? 1 : k == 2 ? 2 : k == 3 ? 2 : k == 4 ? 1 : 3;
  float endF = float(c >> 1);
  float side = float(c & 1) * 2.0 - 1.0;
  vec4 a = uVP * vec4(p, 1.0);
  vec4 b = uVP * vec4(p - dir * 1.5, 1.0);
  vec4 q = endF > 0.5 ? b : a;
  vec2 sa = a.xy / max(a.w, 0.01), sb = b.xy / max(b.w, 0.01);
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 dd = (sb - sa) * asp;
  vec2 pr = length(dd) > 1e-5 ? normalize(vec2(-dd.y, dd.x)) / asp : vec2(0.0, 1.0);
  q.xy += pr * side * (1.1 / uRes.y) * q.w * 2.0;
  gl_Position = q;
  vA *= 0.5 * (1.0 - endF * 0.7);
}`;
const WEATHER_FS = `#version 300 es
precision highp float;
in float vA; uniform float uSnow; uniform vec3 uCol; out vec4 o;
void main(){
  float a = vA;
  if (uSnow > 0.5) { vec2 pc = gl_PointCoord - 0.5; a *= smoothstep(0.5, 0.2, length(pc)) * 0.9; o = vec4(vec3(1.0), a); }
  else o = vec4(uCol, a);
}`;

const DECAL_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=2) in vec2 aUv;
uniform mat4 uVP; uniform mat4 uM; out vec2 vUv;
void main(){ vUv = aUv; gl_Position = uVP * uM * vec4(aPos,1.0); }`;
const DECAL_FS = `#version 300 es
precision mediump float;
in vec2 vUv; uniform sampler2D uTex; uniform vec4 uTint; out vec4 o;
void main(){ vec4 c = texture(uTex, vec2(vUv.x, 1.0 - vUv.y)); if (c.a < 0.05) discard; o = c * uTint; }`;

const VOX_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 aCol;
uniform mat4 uVP;
out vec2 vUv; out vec4 vCol; out vec3 vW;
void main(){ vUv = aUv; vCol = aCol; vW = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;
const VOX_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol; in vec3 vW;
uniform sampler2D uAtlas; uniform float uBright; uniform float uCut; uniform float uAlpha; uniform float uGlow;
uniform vec3 uCam; uniform vec3 uFogCol; uniform vec2 uFog;
out vec4 o;
void main(){
  vec4 t = texture(uAtlas, vUv);
  if (uCut > 0.5 && t.a < 0.5) discard;
  vec3 c = t.rgb * vCol.rgb * (uGlow > 0.5 ? uGlow : uBright);
  float f = clamp((length(uCam - vW) - uFog.x) / max(uFog.y - uFog.x, 1.0), 0.0, 1.0);
  o = vec4(mix(c, uFogCol, f * f), uAlpha);
}`;

const POST_VS = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;
const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uTex; uniform float uThr; out vec4 o;
void main(){ vec3 c = texture(uTex, vUv).rgb; float l = max(c.r, max(c.g, c.b)); float k = smoothstep(uThr - 0.25, uThr + 0.45, l); o = vec4(c * k, 1.0); }`;
const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main(){
  vec3 c = texture(uTex, vUv).rgb * 0.227027;
  c += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.3162162;
  c += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.0702703;
  o = vec4(c, 1.0);
}`;
const COMPOSE_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uScene; uniform sampler2D uB1; uniform sampler2D uB2; uniform float uAmount;
uniform sampler2D uDepth; uniform float uSsao; uniform float uDof; uniform vec2 uNF; uniform vec2 uTexel; uniform float uFocus;
uniform vec3 uSunScr; uniform vec3 uSunCol; uniform vec4 uGrade; uniform vec3 uTint;
out vec4 o;
float lin(float d){ return uNF.x * uNF.y / (uNF.y - d * (uNF.y - uNF.x)); }
float h12(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
void main(){
  float d0 = texture(uDepth, vUv).r;
  float z0 = lin(d0);
  vec3 c = texture(uScene, vUv).rgb;
  // głębia ostrości: dalekie tło lekko rozmyte (krążek próbek, promień rośnie z odległością)
  if (uDof > 0.5 && d0 < 0.99999) {
    float coc = clamp((z0 - uFocus * 5.0) / (uFocus * 25.0), 0.0, 1.0);
    if (coc > 0.02) {
      vec3 acc = c; float wsum = 1.0;
      float rot = h12(gl_FragCoord.xy) * 6.2832;
      for (int i = 0; i < 10; i++) {
        float a = rot + float(i) * 2.39996;
        float r = sqrt((float(i) + 0.5) / 10.0) * coc * 7.0;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
        float zs = lin(texture(uDepth, uv).r);
        float w = zs > z0 * 0.7 ? 1.0 : 0.0;
        acc += texture(uScene, uv).rgb * w; wsum += w;
      }
      c = acc / wsum;
    }
  }
  // SSAO: ciemniejsze zakamarki (porównanie głębi z sąsiednimi pikselami)
  if (uSsao > 0.5 && d0 < 0.99999) {
    float ao = 0.0;
    float rad = clamp(14.0 / z0, 2.0, 18.0);
    float rot = h12(gl_FragCoord.xy + 7.0) * 6.2832;
    float n = uSsao;
    for (int i = 0; i < 14; i++) {
      if (float(i) >= n) break;
      float a = rot + float(i) * 2.39996;
      float r = (float(i) + 1.0) / n * rad;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
      float zs = lin(texture(uDepth, uv).r);
      float diff = z0 - zs;
      ao += step(0.05 + z0 * 0.004, diff) * smoothstep(2.5, 0.3, diff);
    }
    c *= 1.0 - 0.55 * ao / n;
  }
  c += (texture(uB1, vUv).rgb * 0.75 + texture(uB2, vUv).rgb * 1.0) * uAmount;
  // promienie światła: marsz do słońca po pikselach nieba
  if (uSunScr.z > 0.01) {
    vec2 dir = (uSunScr.xy - vUv);
    float dist = length(dir);
    vec2 stp = dir / 28.0 * 0.85;
    vec2 uv = vUv + stp * h12(gl_FragCoord.xy);
    float acc = 0.0, wgt = 1.0;
    for (int i = 0; i < 28; i++) {
      float sky = texture(uDepth, uv).r >= 0.99999 ? 1.0 : 0.0;
      acc += sky * wgt; wgt *= 0.95; uv += stp;
    }
    float fall = pow(clamp(1.0 - dist * 0.9, 0.0, 1.0), 2.0);
    c += uSunCol * (acc / 28.0) * fall * 0.5 * uSunScr.z;
  }
  // błysk pioruna
  c += vec3(0.7, 0.75, 0.95) * uGrade.w * 0.25;
  // korekcja kolorów
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uGrade.y);
  c = (c - 0.5) * uGrade.x + 0.5;
  c *= uTint;
  vec2 q = vUv - 0.5;
  c *= 1.0 - uGrade.z * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
  o = vec4(max(c, 0.0), 1.0);
}`;

interface Target { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }
interface Post {
  w: number; h: number;
  /** scena (po rozmyciu MSAA): tekstura HDR */
  scene: Target;
  /** liczba próbek MSAA, z jaką zbudowano bufory */
  samples: number;
  /** wielopróbkowy bufor sceny (null = rysujemy wprost do `scene`) */
  ms: WebGLFramebuffer | null;
  msRb: WebGLRenderbuffer[];
  b1: Target[];
  b2: Target[];
  /** głębia sceny (kopia z bufora sceny) do SSAO, głębi ostrości i promieni światła */
  depthFbo: WebGLFramebuffer;
  depthTex: WebGLTexture;
}

class Program {
  p: WebGLProgram;
  private u = new Map<string, WebGLUniformLocation | null>();
  constructor(private gl: WebGL2RenderingContext, vs: string, fs: string) {
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("Apex shader: " + gl.getShaderInfoLog(s));
      return s;
    };
    this.p = gl.createProgram()!;
    gl.attachShader(this.p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(this.p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(this.p);
    if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw new Error("Apex program: " + gl.getProgramInfoLog(this.p));
  }
  loc(n: string) {
    let l = this.u.get(n);
    if (l === undefined) this.u.set(n, (l = this.gl.getUniformLocation(this.p, n)));
    return l;
  }
}

/** VAO z atrybutami instancji (macierz, kolor, rozmiar) z bufora `buf` i siatką `mesh` */
function instanceVao(gl: WebGL2RenderingContext, mesh: GpuMesh, buf: WebGLBuffer): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  mesh.bind(gl);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const bytes = STRIDE * 4;
  for (let k = 0; k < 4; k++) {
    gl.enableVertexAttribArray(3 + k);
    gl.vertexAttribPointer(3 + k, 4, gl.FLOAT, false, bytes, k * 16);
    gl.vertexAttribDivisor(3 + k, 1);
  }
  for (let k = 0; k < 2; k++) {
    gl.enableVertexAttribArray(7 + k);
    gl.vertexAttribPointer(7 + k, 4, gl.FLOAT, false, bytes, 64 + k * 16);
    gl.vertexAttribDivisor(7 + k, 1);
  }
  gl.bindVertexArray(null);
  return vao;
}

/** lista widocznych instancji (po ukryciu tego, czego nie widać) wysyłana do karty co klatkę */
class InstList {
  data = new Float32Array(STRIDE * 64);
  count = 0;
  cap = 0;
  buf: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  constructor(gl: WebGL2RenderingContext, readonly mesh: GpuMesh) {
    this.buf = gl.createBuffer()!;
    this.vao = instanceVao(gl, mesh, this.buf);
  }
  push(src: Float32Array, i: number) {
    if ((this.count + 1) * STRIDE > this.data.length) {
      const n = new Float32Array(this.data.length * 2);
      n.set(this.data);
      this.data = n;
    }
    const a = i * STRIDE, o = this.count * STRIDE, d = this.data;
    for (let k = 0; k < STRIDE; k++) d[o + k] = src[a + k];
    this.count++;
  }
  upload(gl: WebGL2RenderingContext) {
    if (!this.count) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (this.data.length > this.cap) {
      gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);
      this.cap = this.data.length;
    } else gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * STRIDE);
  }
}

/** paczka instancji jednego kształtu */
class Batch {
  data = new Float32Array(STRIDE * 64);
  count = 0;
  dirty = true;
  /** tekstura całej paczki (null = kolor) i rozmiar kafelka w jednostkach świata (0 = UV ściany) */
  tex: WebGLTexture | null = null;
  tile = 0;
  buf: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  cap = 0;
  /** stałe klocki świata: ukrywanie niewidocznych i uproszczone siatki z daleka */
  cullable = false;
  lowMesh: GpuMesh | null = null;
  culled = false;
  near: InstList | null = null;
  far: InstList | null = null;
  shadow: InstList | null = null;
  constructor(gl: WebGL2RenderingContext, readonly mesh: GpuMesh) {
    this.buf = gl.createBuffer()!;
    this.vao = instanceVao(gl, mesh, this.buf);
  }
  grow() {
    if ((this.count + 1) * STRIDE <= this.data.length) return;
    const n = new Float32Array(this.data.length * 2);
    n.set(this.data);
    this.data = n;
  }
  add(): number {
    this.grow();
    this.dirty = true;
    return this.count++;
  }
  /** zmienia się z każdą zmianą danych: pozwala pominąć ponowne ukrywanie niewidocznych */
  ver = 0;
  cullVer = -1;
  upload(gl: WebGL2RenderingContext) {
    if (!this.dirty) return;
    this.ver++;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (this.data.length > this.cap) {
      gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);
      this.cap = this.data.length;
    } else gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * STRIDE);
    this.dirty = false;
  }
}

class GpuMesh {
  vb: WebGLBuffer;
  ib: WebGLBuffer;
  n: number;
  /** typ indeksów: 16 bitów, a dla dużych modeli 32 */
  type: number;
  constructor(gl: WebGL2RenderingContext, m: Mesh) {
    this.type = m.index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    this.vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
    gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STATIC_DRAW);
    this.ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.index, gl.STATIC_DRAW);
    this.n = m.index.length;
  }
  bind(gl: WebGL2RenderingContext) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
  }
}

export interface Look {
  /** pozycja kamery i punkt, na który patrzy */
  eye: V3;
  target: V3;
  fov: number;
  near?: number;
  far?: number;
}

interface GpuGrid { vao: WebGLVertexArrayObject; n: number; big: boolean }
interface Slot { batch: Batch; index: number; key: string }

export interface DynLight {
  pos: V3;
  color: [number, number, number];
  intensity: number;
  range: number;
  /** reflektor: kierunek (znormalizowany) i połowa kąta stożka w radianach */
  dir?: V3;
  cone?: number;
}

export interface ApexStats { draws: number; instances: number; tris: number; ms: number }

/** wspólny interfejs silników rysujących (WebGL2: ApexRenderer, WebGPU: GpuRenderer) - reszta Apexa zna tylko to */
export type Renderer = Pick<
  ApexRenderer,
  | "drawBox" | "drawDecal" | "addWorldDecal" | "makeTexture" | "deleteTexture" | "registerMesh" | "deleteMeshes" | "registerSkinMesh" | "deleteSkinMeshes" | "drawSkinned" | "texFor"
  | "addPart" | "updatePart" | "removePart" | "clearParts" | "setTerrain" | "setGrass" | "setSky" | "setAtmosphere" | "setIndoor" | "indoorLevel" | "setLight" | "addLight"
  | "followShadows" | "setQuality" | "resize" | "render" | "ray" | "project" | "inView" | "dispose" | "setVoxelAtlas" | "setVoxelChunk" | "removeVoxelChunk" | "clearVoxels"
  | "setVoxelBrightness" | "tierHint" | "width" | "height" | "time" | "stats" | "onThunder" | "extent" | "reflActive" | "fxInfo" | "canvas"
>;

export class ApexRenderer {
  readonly gl: WebGL2RenderingContext;
  /** poziom jakości startowy i maksymalny dla tego urządzenia */
  tierHint() {
    return detectTier(this.gl);
  }
  private prog: Program;
  private depthProg: Program;
  private skyProg: Program;
  private decalProg: Program;
  private meshes = new Map<string, GpuMesh>();
  private partTex = new Map<string, WebGLTexture>();
  private texIds = new WeakMap<WebGLTexture, number>();
  private texCounter = 0;
  private quad: GpuMesh;
  private shadowTexInit = false;
  /** stałe klocki świata (id -> miejsce w paczce) */
  private statics = new Map<string, Slot>();
  private staticBatches = new Map<string, Batch>();
  /** tymczasowe klocki rysowane co klatkę (awatary, narzędzia, cząstki) */
  private frameBatches = new Map<string, Batch>();
  private shadowTex!: WebGLTexture;
  private shadowFbo!: WebGLFramebuffer;
  private shadowTex0!: WebGLTexture;
  private shadowFbo0!: WebGLFramebuffer;
  private lightVp2: Mat4 = new Float32Array(16);
  shadowSize = 2048;
  shadows = true;
  /** bieżący poziom jakości (setQuality) */
  q: QualityTier = TIERS.high;
  msaa = 4;
  private lowSphere!: GpuMesh;
  private lowCyl!: GpuMesh;
  private planes = new Float32Array(24);
  private terrain: GpuGrid | null = null;
  private water: GpuGrid | null = null;
  /** poziom wody terenu (do odbicia lustrzanego) */
  private waterY: number | null = null;
  private refl: Target | null = null;
  reflActive = false;
  private vp: Mat4 = new Float32Array(16);
  private invVp: Mat4 = new Float32Array(16);
  private lightVp: Mat4 = new Float32Array(16);
  private view: Mat4 = new Float32Array(16);
  private proj: Mat4 = new Float32Array(16);
  width = 1;
  height = 1;
  time = 0;
  stats: ApexStats = { draws: 0, instances: 0, tris: 0, ms: 0 };
  // otoczenie
  private sky = { top: [0.24, 0.56, 0.88] as number[], hor: [0.73, 0.88, 1] as number[], bot: [0.85, 0.92, 1] as number[], fog: [0.73, 0.88, 1] as number[], tint: [1, 1, 1] as number[], ground: [0.55, 0.55, 0.6] as number[], stars: 0, clouds: [1, 1, 1, 0] as number[], sunDisc: [1, 0.97, 0.8, 0] as number[], sunDir: norm3([0.4, 0.8, 0.35]) };
  private brightness = 1;
  private fogE = 700;
  private fogS = 250;
  // --- pora dnia i pogoda ---
  private atm: { hour: number; weather: WeatherId; wind: number } | null = null;
  private cover = 0;
  private flash = 0;
  private nextBolt = 6;
  private boltQueue: number[] = [];
  private lastRender = 0;
  /** 0 = na dworze, 1 = pod dachem (wygasza deszcz i śnieg) */
  private indoor = 0;
  private indoorGoal = 0;
  /** piorun uderzył (do dźwięku grzmotu) */
  onThunder: ((flash: number) => void) | null = null;
  private fogEnd = 700;
  private fogStart = 250;
  private shadowCenter: V3 = [0, 0, 0];
  private frameNo = 0;
  /** czy dalsza kaskada cieni ma w sobie ważny obraz (odświeżamy ją co drugą klatkę) */
  private farShadowOk = false;
  private lvScratch = new Float32Array(16);
  private lightVp2Next: Mat4 = new Float32Array(16);
  /** połowa boku obszaru z cieniami (jednostki świata) */
  extent = 90;
  private pending: (() => void)[] = [];
  // ---------- świat z bloków ----------
  private voxProg: Program | null = null;
  private voxAtlas: WebGLTexture | null = null;
  private voxChunks = new Map<string, { bucket: VoxBucket; vao: WebGLVertexArrayObject; vb: WebGLBuffer; ib: WebGLBuffer; n: number; big: boolean }[]>();
  private voxBright = 1;

  /** atlas tekstur bloków (piksele RGBA, rysowany bez filtrowania - pixel-art) */
  setVoxelAtlas(pixels: Uint8ClampedArray, w: number, h: number) {
    const gl = this.gl;
    if (this.voxAtlas) gl.deleteTexture(this.voxAtlas);
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.voxAtlas = t;
    if (!this.voxProg) this.voxProg = new Program(gl, VOX_VS, VOX_FS);
  }

  /** zastępuje siatki jednego kawałka świata */
  setVoxelChunk(key: string, geos: Record<VoxBucket, VoxGeo>) {
    this.removeVoxelChunk(key);
    const gl = this.gl;
    const list: { bucket: VoxBucket; vao: WebGLVertexArrayObject; vb: WebGLBuffer; ib: WebGLBuffer; n: number; big: boolean }[] = [];
    for (const bucket of Object.keys(geos) as VoxBucket[]) {
      const g = geos[bucket];
      if (!g.idx.length) continue;
      const count = g.pos.length / 3;
      const data = new Float32Array(count * 12);
      for (let i = 0; i < count; i++) {
        data.set([g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2], g.nor[i * 3], g.nor[i * 3 + 1], g.nor[i * 3 + 2], g.uv[i * 2], g.uv[i * 2 + 1], g.col[i * 4], g.col[i * 4 + 1], g.col[i * 4 + 2], g.col[i * 4 + 3]], i * 12);
      }
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const vb = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      for (const [loc, size, off] of [[0, 3, 0], [2, 2, 24], [3, 4, 32]] as const) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 48, off);
      }
      const big = count > 65535;
      const ib = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(g.idx) : new Uint16Array(g.idx), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      list.push({ bucket, vao, vb, ib, n: g.idx.length, big });
    }
    this.voxChunks.set(key, list);
  }

  removeVoxelChunk(key: string) {
    const gl = this.gl;
    for (const c of this.voxChunks.get(key) ?? []) {
      gl.deleteVertexArray(c.vao);
      gl.deleteBuffer(c.vb);
      gl.deleteBuffer(c.ib);
    }
    this.voxChunks.delete(key);
  }

  clearVoxels() {
    for (const k of [...this.voxChunks.keys()]) this.removeVoxelChunk(k);
    if (this.voxAtlas) this.gl.deleteTexture(this.voxAtlas);
    this.voxAtlas = null;
  }

  /** jasność dnia dla bloków (dzień / noc); bloki świecące zostają jasne */
  setVoxelBrightness(b: number) {
    this.voxBright = b;
  }

  private drawVoxels(buckets: VoxBucket[], eye: V3, fogCol: number[]) {
    const gl = this.gl, p = this.voxProg;
    if (!p || !this.voxAtlas || !this.voxChunks.size) return;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.loc("uVP"), false, this.vp);
    gl.uniform3fv(p.loc("uCam"), eye);
    gl.uniform3fv(p.loc("uFogCol"), fogCol);
    gl.uniform2f(p.loc("uFog"), this.fogS, this.fogE);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.voxAtlas);
    gl.uniform1i(p.loc("uAtlas"), 3);
    gl.activeTexture(gl.TEXTURE0);
    // siatki bloków mają trójkąty w kolejności Babylona (przeciwnej niż bryły Apex)
    gl.frontFace(gl.CCW);
    for (const bucket of buckets) {
      gl.uniform1f(p.loc("uBright"), this.voxBright);
      gl.uniform1f(p.loc("uCut"), bucket === "cutout" ? 1 : 0);
      gl.uniform1f(p.loc("uAlpha"), bucket === "water" ? 0.72 : 1);
      gl.uniform1f(p.loc("uGlow"), bucket === "glow" ? (this.postReady() ? 2.2 : 1.1) : 0);
      if (bucket === "cutout" || bucket === "water") gl.disable(gl.CULL_FACE);
      else gl.enable(gl.CULL_FACE);
      for (const chunk of this.voxChunks.values())
        for (const c of chunk) {
          if (c.bucket !== bucket) continue;
          gl.bindVertexArray(c.vao);
          gl.drawElements(gl.TRIANGLES, c.n, c.big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
          this.stats.draws++;
          this.stats.tris += c.n / 3;
        }
    }
    gl.frontFace(gl.CW);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }

  // ---------- poświata (bloom) ----------
  bloom = true;
  private post: Post | null = null;
  private postFailed = false;
  private postProgs: { bright: Program; blur: Program; compose: Program } | null = null;
  private emptyVao: WebGLVertexArrayObject | null = null;

  /** czy rysujemy przez bufor HDR z poświatą */
  postReady() {
    return this.bloom && !this.postFailed && !!this.post;
  }

  private makeTarget(w: number, h: number, depth = false): Target | null {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (depth) {
      const rb = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ok ? { fbo, tex, w, h } : null;
  }

  private freePost() {
    const gl = this.gl, p = this.post;
    if (!p) return;
    for (const t of [p.scene, ...p.b1, ...p.b2]) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    }
    gl.deleteFramebuffer(p.depthFbo);
    gl.deleteTexture(p.depthTex);
    if (p.ms) gl.deleteFramebuffer(p.ms);
    for (const rb of p.msRb) gl.deleteRenderbuffer(rb);
    this.post = null;
  }

  /** (re)tworzy bufory poświaty dla bieżącego rozmiaru; przy braku obsługi HDR wyłącza poświatę */
  private ensurePost() {
    if (!this.bloom || this.postFailed) {
      if (this.post) this.freePost();
      return;
    }
    const gl = this.gl;
    const want = Math.min(this.msaa, (gl.getParameter(gl.MAX_SAMPLES) as number) || 0);
    if (this.post && this.post.w === this.width && this.post.h === this.height && this.post.samples === want) return;
    this.freePost();
    if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float")) return void (this.postFailed = true);
    const w = this.width, h = this.height;
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    // wielopróbkowa scena (jak antialias kanwy) albo, gdy się nie da, zwykła tekstura z głębią
    let ms: WebGLFramebuffer | null = null;
    const msRb: WebGLRenderbuffer[] = [];
    let scene = this.makeTarget(w, h, false);
    if (!scene) return void (this.postFailed = true);
    try {
      const samples = want;
      if (samples > 1) {
        const f = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        const c = gl.createRenderbuffer()!, d = gl.createRenderbuffer()!;
        gl.bindRenderbuffer(gl.RENDERBUFFER, c);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c);
        gl.bindRenderbuffer(gl.RENDERBUFFER, d);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        msRb.push(c, d);
        if (ok) ms = f;
        else gl.deleteFramebuffer(f);
      }
    } catch {
      ms = null;
    }
    if (!ms) {
      // bez MSAA: scena wprost do tekstury, potrzebna własna głębia
      gl.deleteFramebuffer(scene.fbo);
      gl.deleteTexture(scene.tex);
      scene = this.makeTarget(w, h, true);
      if (!scene) return void (this.postFailed = true);
    }
    const b1 = [this.makeTarget(hw, hh), this.makeTarget(hw, hh)];
    const b2 = [this.makeTarget(qw, qh), this.makeTarget(qw, qh)];
    if (b1.some((t) => !t) || b2.some((t) => !t)) return void (this.postFailed = true);
    const depthTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const depthFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, depthFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.post = { w, h, samples: want, scene, ms, msRb, b1: b1 as Target[], b2: b2 as Target[], depthFbo, depthTex };
    if (!this.postProgs)
      this.postProgs = { bright: new Program(gl, POST_VS, BRIGHT_FS), blur: new Program(gl, POST_VS, BLUR_FS), compose: new Program(gl, POST_VS, COMPOSE_FS) };
    if (!this.emptyVao) this.emptyVao = gl.createVertexArray()!;
  }

  private fullscreen(prog: Program, target: Target | null, w: number, h: number, bind: (p: Program) => void) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.p);
    bind(prog);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.stats.draws++;
  }

  /** czy włączone są efekty ekranu wymagające głębi (SSAO, głębia ostrości, promienie światła) */
  private fxOn() {
    const q = this.q;
    return !!(this.post && (q.ssao > 0 || q.dof || q.rays));
  }
  fxInfo = { ssao: 0, dof: false, rays: false };

  /** uniformy końcowego przejścia: korekcja kolorów, SSAO, głębia ostrości, promienie słońca */
  private composeFx(pg: Program, p: Post, fx: boolean) {
    const gl = this.gl, q = this.q;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, p.depthTex);
    gl.uniform1i(pg.loc("uDepth"), 3);
    gl.activeTexture(gl.TEXTURE0);
    const ssao = fx ? q.ssao : 0;
    const rays = fx && q.rays;
    const dof = fx && q.dof;
    this.fxInfo = { ssao, dof, rays };
    gl.uniform1f(pg.loc("uSsao"), ssao);
    gl.uniform1f(pg.loc("uDof"), dof ? 1 : 0);
    gl.uniform2f(pg.loc("uNF"), this.nearFar[0], this.nearFar[1]);
    gl.uniform2f(pg.loc("uTexel"), 1 / p.w, 1 / p.h);
    gl.uniform1f(pg.loc("uFocus"), this.focus);
    // słońce na ekranie
    const m = this.vp, e = this.eyePos, s = this.sky.sunDir;
    const sx = e[0] + s[0] * 1000, sy = e[1] + s[1] * 1000, sz = e[2] + s[2] * 1000;
    const cw = m[3] * sx + m[7] * sy + m[11] * sz + m[15];
    const cx = m[0] * sx + m[4] * sy + m[8] * sz + m[12], cy = m[1] * sx + m[5] * sy + m[9] * sz + m[13];
    const vis = rays && cw > 0 ? this.sky.sunDisc[3] * (1 - this.cover) : 0;
    gl.uniform3f(pg.loc("uSunScr"), cw > 0 ? cx / cw * 0.5 + 0.5 : 0.5, cw > 0 ? cy / cw * 0.5 + 0.5 : 0.5, vis);
    const dc = this.sky.sunDisc;
    gl.uniform3f(pg.loc("uSunCol"), dc[0], dc[1], dc[2]);
    // korekcja kolorów: lekki kontrast i nasycenie, ciepło o zachodzie, chłód w nocy, winieta
    const g = this.grade;
    gl.uniform4f(pg.loc("uGrade"), g.contrast, g.saturation, g.vignette, this.flash);
    gl.uniform3f(pg.loc("uTint"), g.tint[0], g.tint[1], g.tint[2]);
  }

  /** odległość do ostrego punktu (gracza) - do głębi ostrości */
  focus = 14;
  private nearFar: [number, number] = [0.2, 2000];
  private grade = { contrast: 1.06, saturation: 1.08, vignette: 0.22, tint: [1, 1, 1] as number[] };

  /** poświata: jasne miejsca sceny (neon, słońce, odblaski) rozmyte i dodane do obrazu */
  private applyBloom() {
    const gl = this.gl, p = this.post!, pr = this.postProgs!;
    const fx = this.fxOn();
    if (p.ms) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, p.ms);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, p.scene.fbo);
      gl.blitFramebuffer(0, 0, p.w, p.h, 0, 0, p.w, p.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    if (fx) {
      // głębia sceny do osobnej tekstury (z bufora MSAA albo z bufora sceny)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, p.ms ?? p.scene.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, p.depthFbo);
      gl.blitFramebuffer(0, 0, p.w, p.h, 0, 0, p.w, p.h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    const tex = (unit: number, t: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
    };
    const [a, b] = p.b1, [c, d] = p.b2;
    this.fullscreen(pr.bright, a, a.w, a.h, (pg) => {
      tex(0, p.scene.tex);
      gl.uniform1i(pg.loc("uTex"), 0);
      gl.uniform1f(pg.loc("uThr"), 1.75);
    });
    const blur = (src: Target, dst: Target, dx: number, dy: number) =>
      this.fullscreen(pr.blur, dst, dst.w, dst.h, (pg) => {
        tex(0, src.tex);
        gl.uniform1i(pg.loc("uTex"), 0);
        gl.uniform2f(pg.loc("uDir"), dx / src.w, dy / src.h);
      });
    blur(a, b, 1, 0);
    blur(b, a, 0, 1);
    // ćwierć rozdzielczości: szersza poświata (a -> c przez zwykłe skalowanie liniowe)
    this.fullscreen(pr.blur, c, c.w, c.h, (pg) => {
      tex(0, a.tex);
      gl.uniform1i(pg.loc("uTex"), 0);
      gl.uniform2f(pg.loc("uDir"), 0, 0);
    });
    blur(c, d, 1.5, 0);
    blur(d, c, 0, 1.5);
    this.fullscreen(pr.compose, null, this.width, this.height, (pg) => {
      tex(0, p.scene.tex);
      tex(1, a.tex);
      tex(2, c.tex);
      gl.uniform1i(pg.loc("uScene"), 0);
      gl.uniform1i(pg.loc("uB1"), 1);
      gl.uniform1i(pg.loc("uB2"), 2);
      gl.uniform1f(pg.loc("uAmount"), 0.6);
      this.composeFx(pg, p, fx);
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  /** tło przezroczyste (miniaturki awatarów): bez nieba, wyczyszczone na alfa 0 */
  transparent = false;

  constructor(readonly canvas: HTMLCanvasElement, opts: { alpha?: boolean } = {}) {
    this.transparent = !!opts.alpha;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: !!opts.alpha, preserveDrawingBuffer: !!opts.alpha, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 niedostępne");
    this.gl = gl;
    this.prog = new Program(gl, VS, FS);
    this.depthProg = new Program(gl, DEPTH_VS, DEPTH_FS);
    this.skyProg = new Program(gl, SKY_VS, SKY_FS);
    this.decalProg = new Program(gl, DECAL_VS, DECAL_FS);
    this.meshes.set("box", new GpuMesh(gl, boxMesh()));
    this.meshes.set("sphere", new GpuMesh(gl, sphereMesh()));
    this.meshes.set("cylinder", new GpuMesh(gl, cylinderMesh()));
    this.meshes.set("wedge", new GpuMesh(gl, wedgeMesh()));
    this.quad = this.meshes.get("box")!;
    this.meshes.set("sphere:low", (this.lowSphere = new GpuMesh(gl, sphereMesh(8))));
    this.meshes.set("cylinder:low", (this.lowCyl = new GpuMesh(gl, cylinderMesh(10))));
    this.makeShadow(this.shadowSize);
    // stałe atrybuty (teren): macierz jednostkowa
    gl.vertexAttrib4f(3, 1, 0, 0, 0);
    gl.vertexAttrib4f(4, 0, 1, 0, 0);
    gl.vertexAttrib4f(5, 0, 0, 1, 0);
    gl.vertexAttrib4f(6, 0, 0, 0, 1);
    gl.frontFace(gl.CW);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
  }

  /** (re)tworzy mapy cieni (głębia z porównaniem sprzętowym): bliska i daleka kaskada */
  private makeShadow(size: number) {
    const gl = this.gl;
    if (this.shadowTexInit) {
      gl.deleteTexture(this.shadowTex);
      gl.deleteFramebuffer(this.shadowFbo);
      gl.deleteTexture(this.shadowTex0);
      gl.deleteFramebuffer(this.shadowFbo0);
    }
    this.shadowTexInit = true;
    this.shadowSize = size;
    const mk = () => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      return { tex, fbo };
    };
    const far = mk(), near = mk();
    this.shadowTex = far.tex; this.shadowFbo = far.fbo;
    this.farShadowOk = false;
    this.shadowTex0 = near.tex; this.shadowFbo0 = near.fbo;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** stosuje poziom jakości (cienie, MSAA, poświata, ukrywanie obiektów); `bloomUser` = ustawienie gracza */
  setQuality(q: QualityTier, bloomUser = true) {
    this.q = q;
    this.shadows = q.shadows;
    this.bloom = q.bloom && bloomUser;
    this.msaa = q.msaa;
    if (q.shadowSize !== this.shadowSize) this.makeShadow(q.shadowSize);
  }

  // ---------- rozmiar ----------

  resize(cssW: number, cssH: number, scale: number) {
    const w = Math.max(1, Math.floor(cssW * scale));
    const h = Math.max(1, Math.floor(cssH * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;
  }

  // ---------- klocki ----------

  /** bryła o danej nazwie: box, sphere, cylinder, wedge, hemi, frustum:<góra>, torus:<rurka> */
  private meshFor(shape: string): GpuMesh {
    let m = this.meshes.get(shape);
    if (!m) {
      const [kind, arg, arg2] = shape.split(":");
      const q = Math.round(parseFloat(arg ?? "0") * 50) / 50;
      const seg = Math.max(3, Math.min(32, parseInt(arg2 ?? "20", 10) || 20));
      m = new GpuMesh(this.gl, kind === "hemi" ? hemiMesh() : kind === "frustum" ? frustumMesh(q, seg) : torusMesh(Math.max(0.04, q)));
      this.meshes.set(shape, m);
    }
    return m;
  }

  /** własna siatka (model glb) pod kluczem `glb:...` - rysuje się przez drawBox(klucz, ...) */
  registerMesh(key: string, m: Mesh) {
    if (!this.meshes.has(key)) this.meshes.set(key, new GpuMesh(this.gl, m));
  }
  /** usuwa własne siatki o kluczach zaczynających się od `prefix` (i ich paczki) */
  deleteMeshes(prefix: string) {
    const gl = this.gl;
    for (const [k, m] of this.meshes)
      if (k.startsWith(prefix)) {
        gl.deleteBuffer(m.vb);
        gl.deleteBuffer(m.ib);
        this.meshes.delete(k);
      }
    for (const map of [this.frameBatches, this.staticBatches])
      for (const k of [...map.keys()]) if (k.startsWith(prefix)) map.delete(k);
  }

  private texId(t: WebGLTexture) {
    let id = this.texIds.get(t);
    if (id === undefined) this.texIds.set(t, (id = ++this.texCounter));
    return id;
  }

  /** tekstura wzoru klocka (Part.texture) - tworzona raz, powtarzana na ścianach */
  texFor(id: string): WebGLTexture | null {
    let t = this.partTex.get(id);
    if (!t) {
      const c = partTextureCanvas(id);
      if (!c) return null;
      t = this.makeTexture(c, true);
      this.partTex.set(id, t);
    }
    return t;
  }

  private batchFor(map: Map<string, Batch>, shape: string, transparent: boolean, tex: WebGLTexture | null = null, tile = 0): Batch {
    const key = shape + (tex ? "@" + this.texId(tex) + "/" + tile : "") + (transparent ? "|t" : "");
    let b = map.get(key);
    if (!b) {
      map.set(key, (b = new Batch(this.gl, this.meshFor(shape))));
      b.tex = tex;
      b.tile = tile;
      b.cullable = map === this.staticBatches && !shape.startsWith("glb:");
      b.lowMesh = shape === "sphere" ? this.lowSphere : shape === "cylinder" ? this.lowCyl : null;
    }
    return b;
  }

  /** zapisuje klocek w tablicy instancji */
  private writePart(out: Float32Array, at: number, p: Part, rot: number[]) {
    const a = at;
    out[a] = rot[0] * p.sx; out[a + 1] = rot[3] * p.sx; out[a + 2] = rot[6] * p.sx; out[a + 3] = 0;
    out[a + 4] = rot[1] * p.sy; out[a + 5] = rot[4] * p.sy; out[a + 6] = rot[7] * p.sy; out[a + 7] = 0;
    out[a + 8] = rot[2] * p.sz; out[a + 9] = rot[5] * p.sz; out[a + 10] = rot[8] * p.sz; out[a + 11] = 0;
    out[a + 12] = p.x; out[a + 13] = p.y; out[a + 14] = p.z; out[a + 15] = 1;
    const c = rgb(p.color);
    const glass = p.material === "glass";
    out[a + 16] = c[0]; out[a + 17] = c[1]; out[a + 18] = c[2];
    out[a + 19] = (1 - p.transparency) * (glass ? 0.45 : 1) * (p.kind === "water" ? 0.62 : 1);
    out[a + 20] = p.sx; out[a + 21] = p.sy; out[a + 22] = p.sz;
    out[a + 23] = p.kind === "water" ? MAT.water : MAT[p.material ?? "plastic"];
  }

  private isTransparent(p: Part) {
    return p.transparency > 0.001 || p.material === "glass" || p.kind === "water";
  }

  addPart(p: Part, rot: number[]) {
    this.removePart(p.id);
    if (p.transparency >= 0.999) return;
    const t = this.isTransparent(p);
    const tex = p.texture ? this.texFor(p.texture) : null;
    const batch = this.batchFor(this.staticBatches, p.shape, t, tex, PART_TILE);
    const index = batch.add();
    this.writePart(batch.data, index * STRIDE, p, rot);
    this.statics.set(p.id, { batch, index, key: p.shape + "|" + (tex ? this.texId(tex) : 0) + (t ? "|t" : "") });
  }

  updatePart(p: Part, rot: number[]) {
    const s = this.statics.get(p.id);
    const t = this.isTransparent(p);
    const tex = p.texture ? this.texFor(p.texture) : null;
    if (!s || s.key !== p.shape + "|" + (tex ? this.texId(tex) : 0) + (t ? "|t" : "") || p.transparency >= 0.999) return this.addPart(p, rot);
    this.writePart(s.batch.data, s.index * STRIDE, p, rot);
    s.batch.dirty = true;
  }

  removePart(id: string) {
    const s = this.statics.get(id);
    if (!s) return;
    const b = s.batch;
    const last = b.count - 1;
    if (s.index !== last) {
      b.data.copyWithin(s.index * STRIDE, last * STRIDE, (last + 1) * STRIDE);
      for (const [oid, o] of this.statics) if (o.batch === b && o.index === last) { o.index = s.index; void oid; break; }
    }
    b.count--;
    b.dirty = true;
    this.statics.delete(id);
  }

  clearParts() {
    for (const b of this.staticBatches.values()) {
      b.count = 0;
      b.dirty = true;
    }
    this.statics.clear();
  }

  // ---------- klatkowe (awatary itp.) ----------

  /** klocek rysowany tylko w tej klatce */
  drawBox(shape: string, rot: number[], pos: V3, size: V3, color: [number, number, number], alpha = 1, material: number = MAT.plastic, tex: WebGLTexture | null = null, tile = 0) {
    const t = alpha < 0.999 || material === MAT.glass;
    const b = this.batchFor(this.frameBatches, shape, t, tex, tile);
    const i = b.add();
    const o = b.data, a = i * STRIDE;
    o[a] = rot[0] * size[0]; o[a + 1] = rot[3] * size[0]; o[a + 2] = rot[6] * size[0]; o[a + 3] = 0;
    o[a + 4] = rot[1] * size[1]; o[a + 5] = rot[4] * size[1]; o[a + 6] = rot[7] * size[1]; o[a + 7] = 0;
    o[a + 8] = rot[2] * size[2]; o[a + 9] = rot[5] * size[2]; o[a + 10] = rot[8] * size[2]; o[a + 11] = 0;
    o[a + 12] = pos[0]; o[a + 13] = pos[1]; o[a + 14] = pos[2]; o[a + 15] = 1;
    o[a + 16] = color[0]; o[a + 17] = color[1]; o[a + 18] = color[2]; o[a + 19] = alpha;
    o[a + 20] = size[0]; o[a + 21] = size[1]; o[a + 22] = size[2]; o[a + 23] = material;
  }

  /** płaska naklejka z teksturą (twarz) - model 4x4 */
  private decals: { tex: WebGLTexture; m: Float32Array }[] = [];
  drawDecal(tex: WebGLTexture, rot: number[], pos: V3, w: number, h: number) {
    const m = new Float32Array(16);
    m[0] = rot[0] * w; m[1] = rot[3] * w; m[2] = rot[6] * w;
    m[4] = rot[1] * h; m[5] = rot[4] * h; m[6] = rot[7] * h;
    m[8] = rot[2] * 0.001; m[9] = rot[5] * 0.001; m[10] = rot[8] * 0.001;
    m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2]; m[15] = 1;
    this.decals.push({ tex, m });
  }

  // ---------- siatki ze skórą (animowane modele .glb) ----------
  private skinMeshes = new Map<string, { vao: WebGLVertexArrayObject; mesh: GpuMesh; jb: WebGLBuffer; wb: WebGLBuffer; joints: number }>();
  private skinQueue: { key: string; joints: Float32Array; m: Float32Array; k: number; color: [number, number, number]; alpha: number; tex: WebGLTexture | null }[] = [];
  private jointTex: WebGLTexture | null = null;
  registerSkinMesh(key: string, m: Mesh, joints: Float32Array, weights: Float32Array) {
    if (this.skinMeshes.has(key)) return;
    const gl = this.gl;
    const mesh = new GpuMesh(gl, m);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    mesh.bind(gl);
    const jb = gl.createBuffer()!, wb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, jb);
    gl.bufferData(gl.ARRAY_BUFFER, joints, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(9);
    gl.vertexAttribPointer(9, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, wb);
    gl.bufferData(gl.ARRAY_BUFFER, weights, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(10);
    gl.vertexAttribPointer(10, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.skinMeshes.set(key, { vao, mesh, jb, wb, joints: 0 });
  }
  deleteSkinMeshes(prefix: string) {
    const gl = this.gl;
    for (const [k, m] of this.skinMeshes)
      if (k.startsWith(prefix)) {
        gl.deleteVertexArray(m.vao);
        gl.deleteBuffer(m.mesh.vb);
        gl.deleteBuffer(m.mesh.ib);
        gl.deleteBuffer(m.jb);
        gl.deleteBuffer(m.wb);
        this.skinMeshes.delete(k);
      }
  }
  /** rysuje animowaną siatkę w tej klatce: `m` = macierz 4x4 modelu (obrót*skala, położenie), `joints` = macierze kości (16 liczb na kość) */
  drawSkinned(key: string, joints: Float32Array, m: Float32Array, color: [number, number, number], alpha: number, tex: WebGLTexture | null) {
    if (this.skinMeshes.has(key)) this.skinQueue.push({ key, joints, m, k: 1, color, alpha, tex });
  }
  /** tekstura z macierzami kości (unit 6); sampler musi wskazywać prawidłową teksturę także wtedy, gdy nic nie jest ze skórą */
  private bindJointTex(p: Program) {
    const gl = this.gl;
    if (!this.jointTex) {
      this.jointTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.jointTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 1024, 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.jointTex);
    gl.uniform1i(p.loc("uJT"), 6);
    gl.activeTexture(gl.TEXTURE0);
  }
  private drawSkinQueue(p: Program, depthOnly: boolean) {
    const q = this.skinQueue;
    if (!q.length) return;
    const gl = this.gl;
    this.bindJointTex(p);
    gl.uniform1f(p.loc("uSkin"), 1);
    for (const it of q) {
      const sm = this.skinMeshes.get(it.key)!;
      gl.activeTexture(gl.TEXTURE6);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Math.min(1024, (it.joints.length / 4) | 0), 1, gl.RGBA, gl.FLOAT, it.joints.length > 4096 ? it.joints.subarray(0, 4096) : it.joints);
      // stałe atrybuty instancji (jak teren): macierz modelu, kolor i rozmiar
      const m = it.m;
      gl.vertexAttrib4f(3, m[0], m[1], m[2], 0);
      gl.vertexAttrib4f(4, m[4], m[5], m[6], 0);
      gl.vertexAttrib4f(5, m[8], m[9], m[10], 0);
      gl.vertexAttrib4f(6, m[12], m[13], m[14], 1);
      if (!depthOnly) {
        const k = Math.hypot(m[0], m[1], m[2]);
        gl.vertexAttrib4f(7, it.color[0], it.color[1], it.color[2], it.alpha);
        gl.vertexAttrib4f(8, k, k, k, 0);
        gl.uniform1f(p.loc("uBevel"), 0);
        gl.uniform1f(p.loc("uUseTex"), it.tex ? 1 : 0);
        if (it.tex) {
          gl.uniform1f(p.loc("uTile"), -4);
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, it.tex);
          gl.activeTexture(gl.TEXTURE6);
        }
      }
      gl.bindVertexArray(sm.vao);
      gl.drawElements(gl.TRIANGLES, sm.mesh.n, sm.mesh.type, 0);
      this.stats.draws++;
      this.stats.tris += sm.mesh.n / 3;
    }
    gl.uniform1f(p.loc("uSkin"), 0);
    gl.vertexAttrib4f(3, 1, 0, 0, 0);
    gl.vertexAttrib4f(4, 0, 1, 0, 0);
    gl.vertexAttrib4f(5, 0, 0, 1, 0);
    gl.vertexAttrib4f(6, 0, 0, 0, 1);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** trwałe naklejki na świecie (ślady po kulach, plamy krwi): znikają po `ttl` sekundach, najstarsze wypadają przy nadmiarze */
  private worldDecals: { tex: WebGLTexture; m: Float32Array; born: number; ttl: number; grow: number }[] = [];
  addWorldDecal(tex: WebGLTexture, pos: V3, normal: V3, size: number, spin: number, ttl: number, grow = 0) {
    // baza stycznych do powierzchni: t ⟂ n, b = n × t
    const up: V3 = Math.abs(normal[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let t = norm3([up[1] * normal[2] - up[2] * normal[1], up[2] * normal[0] - up[0] * normal[2], up[0] * normal[1] - up[1] * normal[0]]);
    let b = norm3([normal[1] * t[2] - normal[2] * t[1], normal[2] * t[0] - normal[0] * t[2], normal[0] * t[1] - normal[1] * t[0]]);
    const c = Math.cos(spin), sn = Math.sin(spin);
    [t, b] = [norm3([t[0] * c + b[0] * sn, t[1] * c + b[1] * sn, t[2] * c + b[2] * sn]), norm3([-t[0] * sn + b[0] * c, -t[1] * sn + b[1] * c, -t[2] * sn + b[2] * c])];
    const m = new Float32Array(16);
    m[0] = t[0] * size; m[1] = t[1] * size; m[2] = t[2] * size;
    m[4] = b[0] * size; m[5] = b[1] * size; m[6] = b[2] * size;
    m[8] = normal[0] * 0.001; m[9] = normal[1] * 0.001; m[10] = normal[2] * 0.001;
    m[12] = pos[0] + normal[0] * 0.04; m[13] = pos[1] + normal[1] * 0.04; m[14] = pos[2] + normal[2] * 0.04; m[15] = 1;
    this.worldDecals.push({ tex, m, born: this.time, ttl, grow });
    if (this.worldDecals.length > 160) this.worldDecals.shift();
  }

  /** tekstura z płótna (np. twarz awatara) */
  makeTexture(canvas: HTMLCanvasElement, repeat = false): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    return t;
  }
  deleteTexture(t: WebGLTexture) {
    this.gl.deleteTexture(t);
  }

  // ---------- teren i woda ----------

  setTerrain(g: TerrainGrid | null) {
    const gl = this.gl;
    if (this.terrain) gl.deleteVertexArray(this.terrain.vao);
    if (this.water) gl.deleteVertexArray(this.water.vao);
    this.terrain = this.water = null;
    this.waterY = null;
    if (!g) return;
    const n = g.n;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const normalAt = (i: number, j: number) => {
      const hl = g.hAt(Math.max(0, i - 1), j), hr = g.hAt(Math.min(n, i + 1), j);
      const hd = g.hAt(i, Math.max(0, j - 1)), hu = g.hAt(i, Math.min(n, j + 1));
      const nx = (hl - hr) / (2 * g.cell), nz = (hd - hu) / (2 * g.cell);
      const l = Math.hypot(nx, 1, nz);
      return [nx / l, 1 / l, nz / l];
    };
    let v = 0;
    const vertex = (i: number, j: number, c: number[], flag: number) => {
      const nr = normalAt(i, j);
      pos.push(g.x0 + i * g.cell, g.hAt(i, j), g.z0 + j * g.cell, nr[0], nr[1], nr[2], 0, 0);
      col.push(c[0], c[1], c[2], 1, 1, 1, 1, flag);
      return v++;
    };
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const mid = g.m[j * n + i];
        const mat = TERRAIN_MATERIALS[mid] ?? TERRAIN_MATERIALS[0];
        const hsh = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
        const k = 0.94 + (hsh - Math.floor(hsh)) * 0.12;
        const c = [mat.color[0] * k, mat.color[1] * k, mat.color[2] * k];
        const flag = mid === 5 ? 1 : 5;
        const a = vertex(i, j, c, flag), b = vertex(i + 1, j, c, flag), d = vertex(i + 1, j + 1, c, flag), e = vertex(i, j + 1, c, flag);
        idx.push(a, d, b, a, e, d);
      }
    this.terrain = this.buildVao(pos, col, idx);
    // woda w kratkach
    const wp: number[] = [];
    const wc: number[] = [];
    const wi: number[] = [];
    let wv = 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const lv = g.w[j * n + i];
        if (Number.isNaN(lv)) continue;
        const x0 = g.x0 + i * g.cell, z0 = g.z0 + j * g.cell, x1 = x0 + g.cell, z1 = z0 + g.cell;
        for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
          wp.push(x, lv, z, 0, 1, 0, 0, 0);
          wc.push(0.16, 0.46, 0.78, 0.62, 1, 1, 1, MAT.water);
        }
        wi.push(wv, wv + 2, wv + 1, wv, wv + 3, wv + 2);
        wv += 4;
      }
    if (wi.length) this.water = this.buildVao(wp, wc, wi);
    // poziom wody do odbicia: najczęstszy w siatce
    const counts = new Map<number, number>();
    for (const lv of g.w) if (!Number.isNaN(lv)) counts.set(Math.round(lv * 20) / 20, (counts.get(Math.round(lv * 20) / 20) ?? 0) + 1);
    let best: number | null = null, bc = 0;
    for (const [lv, n2] of counts) if (n2 > bc) ((best = lv), (bc = n2));
    this.waterY = best;
  }

  /** siatka z kolorem na wierzchołek (atrybuty 7 i 8 nie są instancjonowane) */
  private buildVao(pos: number[], col: number[], idx: number[]): GpuGrid {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    for (const [l, size, off] of [[0, 3, 0], [1, 3, 12], [2, 2, 24]] as const) {
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, 32, off);
    }
    const cb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.STATIC_DRAW);
    for (const [l, off] of [[7, 0], [8, 16]] as const) {
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 32, off);
    }
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const big = pos.length / 8 > 65535;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(idx) : new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, n: idx.length, big };
  }

  // ---------- niebo i światło ----------

  setSky(color: string, def: SkyboxDef | null | undefined) {
    const s = this.sky;
    if (def) {
      s.top = rgb(def.top); s.hor = rgb(def.horizon); s.bot = rgb(def.bottom); s.fog = rgb(def.fog);
      s.tint = rgb(def.tint); s.ground = rgb(def.ground);
      s.stars = def.stars ? 1 : 0;
      const cl = def.clouds ? [...rgb(def.clouds.color), def.clouds.alpha] : [1, 1, 1, 0];
      s.clouds = cl;
      if (def.sun) {
        const el = Math.max(0.05, def.sun.height) * (Math.PI / 2) * 1.4;
        s.sunDir = norm3([Math.cos(el) * 0.6, Math.sin(el), Math.cos(el) * 0.8]);
        s.sunDisc = [...rgb(def.sun.color), 1];
      } else {
        s.sunDir = norm3([0.3, 0.75, 0.4]);
        s.sunDisc = [1, 1, 1, def.moon ? 1 : 0];
        if (def.moon) s.sunDir = norm3([-0.35, 0.6, 0.5]);
      }
      this.skyLight = def.light;
    } else {
      const c = rgb(color);
      s.top = s.hor = s.bot = s.fog = c;
      s.tint = [1, 1, 1];
      s.ground = [0.55, 0.55, 0.6];
      s.stars = 0;
      s.clouds = [1, 1, 1, 0];
      s.sunDisc = [1, 1, 1, 0];
      s.sunDir = norm3([0.4, 0.8, 0.35]);
      this.skyLight = 1;
    }
  }
  private skyLight = 1;

  /** godzina, pogoda i wiatr; null = zwykłe niebo ze skyboxa */
  setAtmosphere(a: { hour: number; weather: WeatherId; wind: number } | null) {
    this.atm = a ? { ...a } : null;
    if (!a) this.cover = 0;
  }
  /** czy gracz jest pod dachem (0-1) - wygasza deszcz i śnieg */
  setIndoor(k: number) {
    this.indoorGoal = k;
  }
  indoorLevel() {
    return this.indoor;
  }
  getAtmosphere() {
    return this.atm;
  }

  /** przelicza niebo, mgłę i błyski burzy na bieżącą klatkę */
  private stepAtmosphere() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastRender || now)) / 1000);
    this.lastRender = now;
    this.indoor += (this.indoorGoal - this.indoor) * Math.min(1, dt * 3);
    const a = this.atm;
    const goal = a ? OVERCAST[a.weather] : 0;
    this.cover += (goal - this.cover) * Math.min(1, dt * 0.35);
    // błyski burzy: dwa, trzy mrugnięcia pod rząd
    this.flash = Math.max(0, this.flash - dt * 4);
    if (a?.weather === "storm") {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 5 + Math.random() * 11;
        this.boltQueue = [0, 0.14 + Math.random() * 0.1, 0.4 + Math.random() * 0.3];
        this.boltT = 0;
      }
    }
    if (this.boltQueue.length) {
      this.boltT += dt;
      while (this.boltQueue.length && this.boltT >= this.boltQueue[0]) {
        this.boltQueue.shift();
        this.flash = 1;
        this.onThunder?.(this.flash);
      }
    }
    if (!a) return;
    const k = skyAt(a.hour, this.cover);
    const s = this.sky;
    s.top = k.top; s.hor = k.hor; s.bot = k.bot; s.fog = k.fog; s.tint = k.tint; s.ground = k.ground;
    s.stars = k.stars; s.clouds = k.clouds; s.sunDisc = k.sunDisc; s.sunDir = k.sunDir as V3;
    this.skyLight = k.light;
  }
  private boltT = 0;

  /** rysuje deszcz albo śnieg wokół kamery (cząsteczki liczone w shaderze) */
  private drawWeather(eye: V3, fc: number[]) {
    const a = this.atm;
    if (!a || a.weather === "clear" || this.indoor > 0.97) return;
    const gl = this.gl;
    this.weatherProg ??= new Program(gl, WEATHER_VS, WEATHER_FS);
    const w = this.weatherProg;
    const snow = a.weather === "snow";
    const dens = (this.q.shadowSize >= 2048 ? 1 : 0.5) * (1 - this.indoor);
    const n = Math.floor((snow ? 5000 : a.weather === "storm" ? 9000 : 6000) * dens);
    if (n < 50) return;
    gl.useProgram(w.p);
    gl.uniformMatrix4fv(w.loc("uVP"), false, this.vp);
    gl.uniform3fv(w.loc("uCam"), eye);
    gl.uniform1f(w.loc("uTime"), this.time);
    const wind = a.wind * (a.weather === "storm" ? 1.6 : 1);
    gl.uniform2f(w.loc("uWind"), wind * 0.55, wind * 0.25);
    gl.uniform1f(w.loc("uSnow"), snow ? 1 : 0);
    gl.uniform2f(w.loc("uRes"), this.width, this.height);
    gl.uniform3f(w.loc("uCol"), Math.min(1, fc[0] * 0.6 + 0.45), Math.min(1, fc[1] * 0.6 + 0.5), Math.min(1, fc[2] * 0.6 + 0.58));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.emptyVao);
    if (snow) gl.drawArrays(gl.POINTS, 0, n);
    else gl.drawArrays(gl.TRIANGLES, 0, n * 6);
    this.stats.draws++;
    gl.bindVertexArray(null);
  }
  private weatherProg: Program | null = null;

  // ---------- trawa ----------
  private grassProg: Program | null = null;
  private grass: { cx: number; cz: number; n: number; vao: WebGLVertexArrayObject; buf: WebGLBuffer }[] = [];
  setGrass(chunks: { cx: number; cz: number; data: Float32Array }[]) {
    const gl = this.gl;
    for (const c of this.grass) {
      gl.deleteVertexArray(c.vao);
      gl.deleteBuffer(c.buf);
    }
    this.grass = chunks.map((c) => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, c.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
      gl.vertexAttribDivisor(0, 1);
      gl.bindVertexArray(null);
      return { cx: c.cx, cz: c.cz, n: c.data.length / 4, vao, buf };
    });
  }
  private drawGrass(vp: Mat4, eye: V3, fc: number[], light: number) {
    const q = this.q;
    if (!this.grass.length || q.grass <= 0) return;
    const gl = this.gl;
    this.grassProg ??= new Program(gl, GRASS_VS, GRASS_FS);
    const g = this.grassProg;
    gl.useProgram(g.p);
    gl.uniformMatrix4fv(g.loc("uVP"), false, vp);
    gl.uniform3fv(g.loc("uCam"), eye);
    gl.uniform1f(g.loc("uTime"), this.time);
    const wind = (this.atm?.wind ?? 0.15) * (this.atm?.weather === "storm" ? 1.8 : 1);
    gl.uniform1f(g.loc("uWind"), 0.35 + wind * 1.3);
    gl.uniform1f(g.loc("uRange"), q.grassRange);
    gl.uniform1f(g.loc("uDensity"), q.grass);
    gl.uniform2f(g.loc("uFog"), this.fogS, this.fogE);
    const sk = this.sky.tint, up = Math.max(0.15, this.sky.sunDir[1]);
    gl.uniform3f(g.loc("uLit"), (sk[0] * 0.75 + 0.2 * up) * light, (sk[1] * 0.75 + 0.2 * up) * light, (sk[2] * 0.75 + 0.2 * up) * light);
    gl.uniform3fv(g.loc("uFogCol"), fc);
    gl.disable(gl.CULL_FACE);
    const pl = this.planes, R = q.grassRange + GRASS_CHUNK;
    for (const c of this.grass) {
      const mx = (c.cx + 0.5) * GRASS_CHUNK, mz = (c.cz + 0.5) * GRASS_CHUNK;
      if (Math.hypot(mx - eye[0], mz - eye[2]) > R + GRASS_CHUNK * 0.7) continue;
      let vis = true;
      for (let k = 0; k < 6 && vis; k++) {
        const r = GRASS_CHUNK * 0.75 + 3;
        // środek kwadratu na wysokości oka - wystarczy do odrzucenia tego, co za plecami
        if (pl[k * 4] * mx + pl[k * 4 + 1] * eye[1] + pl[k * 4 + 2] * mz + pl[k * 4 + 3] < -r - 12) vis = false;
      }
      if (!vis) continue;
      gl.bindVertexArray(c.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 9, c.n);
      this.stats.draws++;
      this.stats.instances += c.n;
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.useProgram(this.prog.p);
  }

  // ---------- światła dynamiczne ----------

  private lights: DynLight[] = [];
  /** światło tylko na tę klatkę (do 8): punktowe albo reflektor (dir + cone) */
  addLight(l: DynLight) {
    if (this.lights.length < 8) this.lights.push(l);
  }
  private lightData = { p: new Float32Array(32), c: new Float32Array(32), d: new Float32Array(32) };
  private uploadLights(p: Program) {
    const gl = this.gl, ld = this.lightData;
    ld.p.fill(0); ld.c.fill(0); ld.d.fill(0);
    this.lights.forEach((l, i) => {
      ld.p.set([l.pos[0], l.pos[1], l.pos[2], l.range], i * 4);
      const k = l.intensity;
      const spot = l.dir !== undefined && l.cone !== undefined;
      ld.c.set([l.color[0] * k, l.color[1] * k, l.color[2] * k, spot ? Math.cos(l.cone!) : -1], i * 4);
      if (spot) ld.d.set([l.dir![0], l.dir![1], l.dir![2], Math.cos(l.cone! * 0.55)], i * 4);
    });
    gl.uniform1i(p.loc("uNL"), this.lights.length);
    gl.uniform4fv(p.loc("uLP[0]"), ld.p);
    gl.uniform4fv(p.loc("uLC[0]"), ld.c);
    gl.uniform4fv(p.loc("uLD[0]"), ld.d);
  }

  setLight(brightness: number, fog: number) {
    this.brightness = brightness;
    if (fog > 0) {
      this.fogStart = fog * 0.25;
      this.fogEnd = fog;
    } else {
      this.fogStart = 250;
      this.fogEnd = 700;
    }
  }

  /** środek obszaru z cieniami (zwykle gracz) */
  followShadows(p: V3) {
    this.shadowCenter = p;
  }

  // ---------- rysowanie ----------

  /** punkt świata -> piksele CSS ekranu (null gdy za kamerą) */
  project(p: V3, cssW: number, cssH: number): [number, number] | null {
    const m = this.vp;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0.05) return null;
    return [(x / w * 0.5 + 0.5) * cssW, (1 - (y / w * 0.5 + 0.5)) * cssH];
  }

  /** promień ze współrzędnych ekranu (0..1) */
  ray(nx: number, ny: number, eye: V3): V3 {
    const m = this.invVp;
    const cx = nx * 2 - 1, cy = 1 - ny * 2;
    const x = m[0] * cx + m[4] * cy + m[8] + m[12];
    const y = m[1] * cx + m[5] * cy + m[9] + m[13];
    const z = m[2] * cx + m[6] * cy + m[10] + m[14];
    const w = m[3] * cx + m[7] * cy + m[11] + m[15];
    return norm3([x / w - eye[0], y / w - eye[1], z / w - eye[2]]);
  }

  /** niebo i nieprzezroczysta część sceny (też do odbicia w wodzie: mirrorY = poziom wody, wszystko pod nim jest odcinane) */
  private drawOpaque(eye: V3, vp: Mat4, invVp: Mat4, light: number, fc: number[], sun: V3, casc2: boolean, mirrorY: number | null) {
    const gl = this.gl, sky = this.sky, wCover = this.cover;
    // niebo
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const sp = this.skyProg;
    gl.useProgram(sp.p);
    gl.uniformMatrix4fv(sp.loc("uInvVP"), false, invVp);
    gl.uniform3fv(sp.loc("uCam"), eye);
    // ciemne światy (horror): niebo i mgła ciemnieją razem z jasnością
    const dim = 0.12 + 0.88 * Math.min(1, light);
    const sc3 = (c: number[]) => [c[0] * dim, c[1] * dim, c[2] * dim];
    gl.uniform3fv(sp.loc("uTop"), sc3(sky.top));
    gl.uniform3fv(sp.loc("uHor"), sc3(sky.hor));
    gl.uniform3fv(sp.loc("uBot"), sc3(sky.bot));
    gl.uniform3fv(sp.loc("uSun"), sun);
    gl.uniform4fv(sp.loc("uSunDisc"), sky.sunDisc);
    gl.uniform1f(sp.loc("uStars"), sky.stars);
    gl.uniform4fv(sp.loc("uClouds"), sky.clouds);
    gl.uniform1f(sp.loc("uCover"), wCover);
    gl.uniform1f(sp.loc("uTime"), this.time);
    gl.bindVertexArray(null);
    if (!this.transparent) gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    const p = this.prog;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.loc("uVP"), false, vp);
    gl.uniformMatrix4fv(p.loc("uLightVP"), false, this.lightVp);
    gl.uniformMatrix4fv(p.loc("uLightVP2"), false, this.lightVp2);
    gl.uniform1f(p.loc("uCasc"), casc2 ? 2 : 1);
    gl.uniform3fv(p.loc("uCam"), eye);
    gl.uniform3fv(p.loc("uSun"), sun);
    const sc = sky.tint;
    gl.uniform3f(p.loc("uSunCol"), sc[0] * light, sc[1] * light, sc[2] * light);
    gl.uniform3f(p.loc("uSky"), sc[0] * light, sc[1] * light, sc[2] * light);
    gl.uniform3f(p.loc("uGround"), sky.ground[0] * light, sky.ground[1] * light, sky.ground[2] * light);
    gl.uniform3fv(p.loc("uFogCol"), fc);
    gl.uniform2f(p.loc("uFog"), this.fogS, this.fogE);
    gl.uniform1f(p.loc("uTime"), this.time);
    gl.uniform1f(p.loc("uClipY"), mirrorY ?? -1e9);
    gl.uniform1i(p.loc("uRefl"), 5);
    this.bindJointTex(p);
    gl.uniform3fv(p.loc("uEnvTop"), sc3(sky.top));
    gl.uniform3fv(p.loc("uEnvHor"), sc3(sky.hor));
    gl.uniform1f(p.loc("uShadowOn"), this.shadows && light > 0.1 ? 1 : 0);
    gl.uniform1f(p.loc("uShadowTexel"), 1 / this.shadowSize);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex0);
    gl.uniform1i(p.loc("uShadow"), 0);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(p.loc("uShadow2"), 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(p.loc("uBevel"), 0);
    gl.uniform1i(p.loc("uTexD"), 2);
    gl.uniform1f(p.loc("uUseTex"), 0);
    gl.uniform1f(p.loc("uNeon"), this.postReady() ? 1.9 : 1.15);
    this.uploadLights(p);
    if (this.terrain) this.drawTerrain(this.terrain);
    this.drawBatches(this.staticBatches, false, p);
    this.drawBatches(this.frameBatches, false, p);
    this.drawSkinQueue(p, false);
    if (mirrorY === null) this.drawGrass(vp, eye, fc, light);
    if (mirrorY === null) this.drawVoxels(["opaque", "cutout", "glow"], eye, fc);
  }

  render(look: Look) {
    const t0 = performance.now();
    const gl = this.gl;
    this.stats = { draws: 0, instances: 0, tris: 0, ms: 0 };
    this.ensurePost();
    this.nearFar = [look.near ?? 0.2, look.far ?? 2000];
    this.focus = Math.max(6, Math.hypot(look.eye[0] - look.target[0], look.eye[1] - look.target[1], look.eye[2] - look.target[2]));
    perspective(look.fov, this.width / this.height, look.near ?? 0.2, look.far ?? 2000, this.proj);
    lookAt(look.eye, look.target, [0, 1, 0], this.view);
    multiply(this.proj, this.view, this.vp);
    invert(this.vp, this.invVp);
    this.stepAtmosphere();
    const wCover = this.cover;
    const fogK = 1 - 0.55 * wCover;
    this.fogS = this.fogStart * fogK * fogK;
    this.fogE = this.fogEnd * fogK;
    {
      // barwa końcowa zależy od nieba: ciepła przy zachodzie słońca, chłodna w nocy
      const t = this.sky.tint, g = this.grade;
      g.tint = [0.85 + 0.15 * t[0], 0.9 + 0.1 * t[1], 0.92 + 0.08 * t[2]];
      g.contrast = 1.05 + 0.05 * (1 - this.cover);
      g.saturation = 1.1 - 0.25 * this.cover;
    }
    const sky = this.sky;
    const light = this.brightness * this.skyLight * (1 + this.flash * 1.6);
    const sun = sky.sunDir;

    // macierze światła (ortogonalne wokół gracza, przyciągnięte do pikseli mapy, żeby cień nie drżał): dwie kaskady
    const c = this.shadowCenter;
    const casc2 = this.q.cascades > 1;
    const lightMatrix = (ext: number, out: Mat4) => {
      const texel = (ext * 2) / this.shadowSize;
      const eyeL: V3 = [c[0] + sun[0] * 160, c[1] + sun[1] * 160, c[2] + sun[2] * 160];
      lookAt(eyeL, c, Math.abs(sun[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0], this.view as Mat4 & Float32Array);
      const lv = this.lvScratch;
      lv.set(this.view);
      lv[12] += Math.round(lv[12] / texel) * texel - lv[12];
      lv[13] += Math.round(lv[13] / texel) * texel - lv[13];
      multiply(ortho(-ext, ext, -ext, ext, 1, 360), lv, out);
    };
    const extFar = casc2 ? this.extent * 1.6 : this.extent;
    // daleka kaskada zmienia się powoli: rysujemy ją co drugą klatkę (macierz zmieniamy razem z obrazem)
    this.frameNo++;
    const refreshFar = !casc2 || !this.farShadowOk || (this.frameNo & 1) === 0;
    if (refreshFar) lightMatrix(extFar, this.lightVp2);
    if (casc2) lightMatrix(Math.min(34, this.extent * 0.4), this.lightVp);
    lookAt(look.eye, look.target, [0, 1, 0], this.view);

    for (const b of this.staticBatches.values()) b.upload(gl);
    for (const b of this.frameBatches.values()) b.upload(gl);
    this.eyePos = look.eye;
    this.extractPlanes();
    this.cullBatches(look.eye);

    // --- cienie ---
    if (this.shadows && light > 0.1) {
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.useProgram(this.depthProg.p);
      this.bindJointTex(this.depthProg);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.5, 4);
      const pass = (fbo: WebGLFramebuffer, vp: Mat4) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(this.depthProg.loc("uVP"), false, vp);
        this.drawBatches(this.staticBatches, false);
        this.drawBatches(this.frameBatches, false);
        this.drawSkinQueue(this.depthProg, true);
        if (this.terrain) this.drawTerrain(this.terrain);
      };
      if (refreshFar) {
        pass(this.shadowFbo, this.lightVp2);
        this.farShadowOk = true;
      }
      if (casc2) pass(this.shadowFbo0, this.lightVp);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else this.farShadowOk = false;

    // --- odbicie w wodzie: scena z lustrzanej kamery do małej tekstury (tylko przy wysokiej jakości) ---
    this.reflActive = false;
    if (this.q.reflections && this.waterY !== null && this.water && this.post && look.eye[1] > this.waterY + 0.2) {
      const wy = this.waterY;
      const rw = Math.max(2, this.width >> 1), rh = Math.max(2, this.height >> 1);
      if (!this.refl || this.refl.w !== rw || this.refl.h !== rh) {
        if (this.refl) {
          gl.deleteFramebuffer(this.refl.fbo);
          gl.deleteTexture(this.refl.tex);
        }
        this.refl = this.makeTarget(rw, rh, true);
      }
      if (this.refl) {
        const mEye: V3 = [look.eye[0], 2 * wy - look.eye[1], look.eye[2]];
        const mTarget: V3 = [look.target[0], 2 * wy - look.target[1], look.target[2]];
        const mView = new Float32Array(16), mVp = new Float32Array(16), mInv = new Float32Array(16);
        lookAt(mEye, mTarget, [0, -1, 0], mView);
        multiply(this.proj, mView, mVp);
        invert(mVp, mInv);
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.refl.fbo);
        gl.viewport(0, 0, rw, rh);
        const fc0 = [sky.fog[0] * (0.12 + 0.88 * Math.min(1, light)), sky.fog[1] * (0.12 + 0.88 * Math.min(1, light)), sky.fog[2] * (0.12 + 0.88 * Math.min(1, light))];
        gl.clearColor(fc0[0], fc0[1], fc0[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        // kamera lustrzana odwraca kolejność wierzchołków: silnik rysuje z frontFace(CW), więc w odbiciu jest CCW
        gl.frontFace(gl.CCW);
        this.drawOpaque(mEye, mVp, mInv, light, fc0, sun, casc2, wy - 0.05);
        gl.frontFace(gl.CW);
        this.reflActive = true;
      }
    }

    // --- scena ---
    const pst = this.bloom && !this.postFailed ? this.post : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, pst ? (pst.ms ?? pst.scene.fbo) : null);
    gl.viewport(0, 0, this.width, this.height);
    const fc = [sky.fog[0] * (0.12 + 0.88 * Math.min(1, light)), sky.fog[1] * (0.12 + 0.88 * Math.min(1, light)), sky.fog[2] * (0.12 + 0.88 * Math.min(1, light))];
    gl.clearColor(fc[0], fc[1], fc[2], this.transparent ? 0 : 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.drawOpaque(look.eye, this.vp, this.invVp, light, fc, sun, casc2, null);
    const p = this.prog;
    gl.useProgram(p.p);
    // przezroczyste
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(p.loc("uBevel"), 0);
    gl.uniform1f(p.loc("uUseTex"), 0);
    gl.uniform1f(p.loc("uReflOn"), this.reflActive ? 1 : 0);
    gl.uniform2f(p.loc("uRes"), this.width, this.height);
    gl.uniform1f(p.loc("uClipY"), -1e9);
    if (this.reflActive && this.refl) {
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this.refl.tex);
      gl.uniform1i(p.loc("uRefl"), 5);
      gl.activeTexture(gl.TEXTURE0);
    }
    if (this.water) this.drawTerrain(this.water);
    this.drawBatches(this.staticBatches, true, p);
    this.drawBatches(this.frameBatches, true, p);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.drawVoxels(["water"], look.eye, fc);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(p.p);
    // naklejki (twarze) i trwałe ślady na świecie
    if (this.decals.length || this.worldDecals.length) {
      const dp = this.decalProg;
      gl.useProgram(dp.p);
      gl.uniformMatrix4fv(dp.loc("uVP"), false, this.vp);
      gl.uniform4f(dp.loc("uTint"), 1, 1, 1, 1);
      gl.uniform1i(dp.loc("uTex"), 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindVertexArray(this.quadVao());
      for (const d of this.decals) {
        gl.bindTexture(gl.TEXTURE_2D, d.tex);
        gl.uniformMatrix4fv(dp.loc("uM"), false, d.m);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, this.quadIndexOffset);
        this.stats.draws++;
      }
      if (this.worldDecals.length) {
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-2, -4);
        const lit = Math.min(1, 0.35 + light * 0.65);
        this.worldDecals = this.worldDecals.filter((d) => this.time - d.born < d.ttl);
        for (const d of this.worldDecals) {
          const age = this.time - d.born;
          const fade = Math.min(1, (d.ttl - age) / 3);
          // plama rośnie przez pierwsze sekundy (kałuża krwi)
          const k = d.grow > 0 ? Math.min(1, 0.25 + (age / d.grow) * 0.75) : 1;
          const m = d.m.slice() as Float32Array;
          for (const i of [0, 1, 2, 4, 5, 6]) m[i] *= k;
          gl.uniform4f(dp.loc("uTint"), lit, lit, lit, fade);
          gl.bindTexture(gl.TEXTURE_2D, d.tex);
          gl.uniformMatrix4fv(dp.loc("uM"), false, m);
          gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, this.quadIndexOffset);
          this.stats.draws++;
        }
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      gl.activeTexture(gl.TEXTURE0);
    }
    this.drawWeather(look.eye, fc);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);

    if (pst) this.applyBloom();

    // czyścimy rzeczy tylko-na-klatkę
    for (const b of this.frameBatches.values()) b.count = 0;
    this.skinQueue.length = 0;
    this.decals.length = 0;
    this.lights.length = 0;
    this.stats.ms = performance.now() - t0;
    void this.pending;
  }

  private quadVaoCache: WebGLVertexArrayObject | null = null;
  private quadIndexOffset = 0;
  /** pojedynczy kwadrat (przednia ściana pudełka +z) dla naklejek */
  private quadVao() {
    if (this.quadVaoCache) return this.quadVaoCache;
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    // twarz patrzy w -z: model awatara ma przód po stronie -z
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0, 0, 0, -1, 0, 0, 0.5, -0.5, 0, 0, 0, -1, 1, 0, 0.5, 0.5, 0, 0, 0, -1, 1, 1, -0.5, 0.5, 0, 0, 0, -1, 0, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return (this.quadVaoCache = vao);
  }

  private drawTerrain(t: GpuGrid) {
    const gl = this.gl;
    gl.bindVertexArray(t.vao);
    gl.drawElements(gl.TRIANGLES, t.n, t.big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    this.stats.draws++;
    this.stats.tris += t.n / 3;
  }

  /** czy kula (środek, promień) jest w kadrze (z poprzedniej klatki) i bliżej niż `maxDist` od kamery - do pomijania rysowania postaci */
  inView(x: number, y: number, z: number, r: number, maxDist: number): boolean {
    const e = this.eyePos;
    if (Math.hypot(x - e[0], y - e[1], z - e[2]) - r > maxDist) return false;
    const pl = this.planes;
    for (let k = 0; k < 6; k++) if (pl[k * 4] * x + pl[k * 4 + 1] * y + pl[k * 4 + 2] * z + pl[k * 4 + 3] < -r) return false;
    return true;
  }
  private eyePos: V3 = [0, 0, 0];

  /** płaszczyzny widoczności z macierzy kamery (lewa, prawa, dół, góra, bliska, daleka) */
  private extractPlanes() {
    const m = this.vp, o = this.planes;
    for (let k = 0; k < 6; k++) {
      const row = k >> 1, sg = k & 1 ? -1 : 1;
      const a = m[3] + sg * m[row], b = m[7] + sg * m[4 + row], c = m[11] + sg * m[8 + row], d = m[15] + sg * m[12 + row];
      const inv = 1 / (Math.hypot(a, b, c) || 1);
      o[k * 4] = a * inv; o[k * 4 + 1] = b * inv; o[k * 4 + 2] = c * inv; o[k * 4 + 3] = d * inv;
    }
  }

  /** duże paczki stałych klocków: rysujemy tylko to, co w kadrze; z daleka małe rzeczy znikają, a kule i walce są uproszczone */
  private cullKey = new Float64Array(32);
  private cullBatches(eye: V3) {
    const gl = this.gl, q = this.q, pl = this.planes, sc = this.shadowCenter;
    const shR = this.extent * 1.8;
    // ten sam widok i te same dane = ten sam wynik: nie przeliczamy
    const key = this.cullKey;
    let same = true;
    const probe = (i: number, v: number) => {
      if (key[i] !== v) {
        key[i] = v;
        same = false;
      }
    };
    probe(0, eye[0]); probe(1, eye[1]); probe(2, eye[2]);
    for (let k = 0; k < 24; k++) probe(3 + k, pl[k]);
    probe(27, sc[0]); probe(28, sc[2]); probe(29, q.drawDist); probe(30, q.lodDist + this.extent);
    const dd = q.drawDist, dd45 = dd * 0.45, dd8 = dd * 0.8, ld = q.lodDist;
    for (const b of this.staticBatches.values()) {
      b.culled = false;
      if (!q.cull || !b.cullable || b.count < 160) continue;
      if (same && b.cullVer === b.ver && b.near) {
        b.culled = true;
        continue;
      }
      b.cullVer = b.ver;
      b.near ??= new InstList(gl, b.mesh);
      b.shadow ??= new InstList(gl, b.mesh);
      if (b.lowMesh) b.far ??= new InstList(gl, b.lowMesh);
      b.near.count = b.shadow.count = 0;
      if (b.far) b.far.count = 0;
      const d = b.data;
      const ex = eye[0], ey = eye[1], ez = eye[2], sx = sc[0], sz = sc[2];
      for (let i = 0, n = b.count; i < n; i++) {
        const o = i * STRIDE;
        const x = d[o + 12], y = d[o + 13], z = d[o + 14];
        const sx2 = d[o + 20], sy2 = d[o + 21], sz2 = d[o + 22];
        const r = 0.5 * Math.sqrt(sx2 * sx2 + sy2 * sy2 + sz2 * sz2);
        const shx = x - sx, shz = z - sz, shl = shR + r;
        if (shx * shx + shz * shz < shl * shl) b.shadow.push(d, i);
        const dx = x - ex, dy = y - ey, dz = z - ez;
        const dist2 = dx * dx + dy * dy + dz * dz;
        const reach = dd + r;
        if (dist2 > reach * reach) continue;
        if (r < 1 && dist2 > dd45 * dd45) continue;
        if (r < 3 && dist2 > dd8 * dd8) continue;
        let out = false;
        for (let k = 0; k < 24; k += 4)
          if (pl[k] * x + pl[k + 1] * y + pl[k + 2] * z + pl[k + 3] < -r) {
            out = true;
            break;
          }
        if (out) continue;
        const lr = ld + r;
        if (b.far && dist2 > lr * lr) b.far.push(d, i);
        else b.near.push(d, i);
      }
      b.near.upload(gl);
      b.shadow.upload(gl);
      b.far?.upload(gl);
      b.culled = true;
    }
  }

  private drawBatches(map: Map<string, Batch>, transparent: boolean, p?: Program) {
    const gl = this.gl;
    for (const [key, b] of map) {
      if (!b.count || key.endsWith("|t") !== transparent) continue;
      if (transparent && !p) continue;
      if (p) {
        gl.uniform1f(p.loc("uBevel"), key.startsWith("box") || key.startsWith("wedge") ? 1 : 0);
        gl.uniform1f(p.loc("uUseTex"), b.tex ? 1 : 0);
        if (b.tex) {
          gl.uniform1f(p.loc("uTile"), b.tile);
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, b.tex);
          gl.activeTexture(gl.TEXTURE0);
        }
      }
      // po ukrywaniu niewidocznych: lista bliska + (uproszczona) daleka; w cieniach osobna lista
      const lists = b.culled ? (p ? [b.near, b.far] : [b.shadow]) : [null];
      for (const L of lists) {
        const cnt = L ? L.count : b.count;
        if (!cnt) continue;
        const mesh = L ? L.mesh : b.mesh;
        gl.bindVertexArray(L ? L.vao : b.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, mesh.n, mesh.type, 0, cnt);
        this.stats.draws++;
        this.stats.instances += cnt;
        this.stats.tris += (mesh.n / 3) * cnt;
      }
    }
  }

  dispose() {
    this.clearVoxels();
    this.freePost();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

function norm3(a: number[]): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
