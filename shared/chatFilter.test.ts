import assert from "node:assert/strict";
import { test } from "node:test";
import { filterChat, hasProfanity } from "./chatFilter.ts";

const blocked = (t: string) => assert.ok(filterChat(t).includes("#"), `powinno zablokować: "${t}" -> "${filterChat(t)}"`);
const allowed = (t: string) => assert.equal(filterChat(t), t, `nie powinno ruszać: "${t}"`);

test("filtr czatu: podstawy", () => {
  assert.equal(filterChat("siema wszystkim"), "siema wszystkim");
  assert.equal(filterChat("ty kurwo"), "ty #####");
  assert.equal(filterChat("sh1t happens"), "#### happens");
  assert.equal(filterChat("a".repeat(500)).length, 200);
  assert.equal(filterChat("  \u0007hej  "), "hej");
});

test("filtr czatu: kombinowane wersje przekleństw", () => {
  for (const t of [
    "kurwa", "KURWA", "KuRwA", "kurw4", "kurv4", "qrwa", "kurva", "k.u.r.w.a", "k-u-r-w-a", "k_u_r_w_a", "kuuuurwaaaa", "kurwaaa!!!",
    "k u r w a", "ku rw a", "kur wa", "k*u*r*w*a", "ķùřŵá", "кurwa", "kυrwa", "ｋｕｒｗａ", "ku​rwa",
    "chuj", "ch*j", "chujowy", "huj", "hujowo", "c h u j",
    "jebać", "jebac", "j3bac", "zajebisty", "pojeb", "wyjebane", "spierdalaj", "sp13rdalaj", "pierdolę", "japierdole", "pi3rd0l3",
    "pizda", "p1zd4", "kutas", "k u t a s", "cipa", "dupa", "dupek", "d.u.p.a",
    "skurwysyn", "sk*rwysyn", "sukinsyn", "dziwka", "dz1wk4", "szmata", "suka", "ciota", "cwel", "debil", "idiota", "kretyn",
    "gówno", "g0wn0", "gowniarz", "srać", "zesrał", "chwdp", "hwdp", "czarnuch", "ruchać",
    "fuck", "FUCK", "fck", "f u c k", "fuk", "fvck", "phuck", "fu*k", "f*ck", "fuuuuck", "motherfucker", "fucking",
    "shit", "sh!t", "$hit", "bullshit", "bitch", "b1tch", "biatch", "cunt", "c*nt", "pussy", "puss1", "asshole", "a$$hole",
    "bastard", "whore", "slut", "retard", "nigga", "n1gg4", "nigger", "faggot", "wanker", "twat", "porn", "p0rn", "pornhub",
    "dick", "cock", "sex", "s3x", "seks", "kys", "stfu", "blyat", "cyka", "scheisse",
  ])
    blocked(t);
});

test("filtr czatu: zwroty", () => {
  for (const t of ["zabij się", "zabij sie", "kill yourself", "k i l l yourself", "twoja stara"]) blocked(t);
});

test("filtr czatu: zwykłe słowa zostają", () => {
  for (const t of [
    "cześć, gramy?", "super gra!", "mam sukces", "moja ciotka", "dupleks", "duplikat", "szmatka", "pedały roweru", "ruch",
    "krwawy potwór", "kurczak", "kurs", "kurtka", "kurier", "dziwne", "pizza", "potrzebuję pomocy", "szmaragd", "srebro",
    "idiom", "debiut", "cockpit", "cocktail", "assess", "classic", "glass", "Sussex", "principal", "cipher", "japonia",
    "tytuł", "title", "kasztan", "Hubert", "kurde", "cholera", "jak urwać gałąź", "ma kota", "to jest ok", "hej ho",
    "1 2 3 4 5", "gg", "xd", "lol", "noob", "pro gracz", "w8", "ez", "Niger", "Nigeria", "Dickens",
  ])
    allowed(t);
});

test("hasProfanity (nicki, nazwy)", () => {
  assert.ok(hasProfanity("xXkurwaXx"));
  assert.ok(hasProfanity("Fuck3r"));
  assert.ok(!hasProfanity("Piotrek53"));
  assert.ok(!hasProfanity("SuperGracz"));
});
