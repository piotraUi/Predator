// Programowanie bloczkami (Blockly). Bloczki są zamieniane na kod Lua,
// który działa na serwerze tak samo jak skrypty pisane ręcznie.
import * as Blockly from "blockly/core";
import "blockly/blocks";
import { luaGenerator, Order } from "blockly/lua";
import * as Pl from "blockly/msg/pl";
import { SKYBOXES } from "../../../shared/skybox.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Blockly.setLocale(Pl as any);

const EVENT = 35;
const PART = 200;
const PLAYER = 130;
const VALUE = 260;

const COLORS: [string, string][] = [
  ["czerwony", "#e74c3c"],
  ["pomarańczowy", "#f39c12"],
  ["żółty", "#f1c40f"],
  ["zielony", "#2ecc71"],
  ["niebieski", "#3498db"],
  ["fioletowy", "#9b59b6"],
  ["różowy", "#ff66cc"],
  ["biały", "#ffffff"],
  ["szary", "#a3a2a5"],
  ["czarny", "#1b1b1b"],
  ["złoty", "#ffd700"],
  ["brązowy", "#7f5539"],
];

const partField = (name = "PART", text = "Klocek") => ({ type: "field_input", name, text });

Blockly.common.defineBlocksWithJsonArray([
  // ---- zdarzenia ----
  { type: "p_on_start", message0: "gdy gra się zacznie %1 %2", args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT, tooltip: "Uruchamia się raz, gdy startuje serwer gry" },
  { type: "p_on_join", message0: "gdy gracz dołączy %1 %2", args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT },
  { type: "p_on_leave", message0: "gdy gracz wyjdzie %1 %2", args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT },
  { type: "p_on_respawn", message0: "gdy gracz się odrodzi %1 %2", args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT },
  { type: "p_on_touch", message0: "gdy gracz dotknie klocka %1 %2 %3", args0: [partField("PART", "Meta"), { type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT, tooltip: "Klocek wskazujesz po nazwie (z panelu Właściwości)" },
  { type: "p_on_chat", message0: "gdy gracz napisze na czacie %1 %2", args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT },
  { type: "p_on_tool", message0: "gdy gracz użyje narzędzia %1 %2 %3", args0: [partField("TOOL", "Miecz"), { type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT, tooltip: "Nazwa narzędzia z panelu Narzędzia i bronie" },
  { type: "p_on_died", message0: "gdy gracz zginie %1 %2", args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT },
  { type: "p_every", message0: "co %1 sekund %2 %3", args0: [{ type: "field_number", name: "SEC", value: 1, min: 0.05 }, { type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT },
  { type: "p_after", message0: "po %1 sekundach %2 %3", args0: [{ type: "field_number", name: "SEC", value: 3, min: 0 }, { type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT },

  // ---- ogólne ----
  { type: "p_say", message0: "napisz do wszystkich %1", args0: [{ type: "input_value", name: "TEXT" }], previousStatement: null, nextStatement: null, colour: VALUE },
  { type: "p_wait", message0: "czekaj %1 sekund", args0: [{ type: "input_value", name: "SEC", check: "Number" }], previousStatement: null, nextStatement: null, colour: VALUE },
  { type: "p_print", message0: "wypisz w konsoli %1", args0: [{ type: "input_value", name: "TEXT" }], previousStatement: null, nextStatement: null, colour: VALUE },

  // ---- klocki ----
  { type: "p_set_color", message0: "zmień kolor klocka %1 na %2", args0: [partField(), { type: "field_dropdown", name: "COLOR", options: COLORS }], previousStatement: null, nextStatement: null, colour: PART },
  { type: "p_random_color", message0: "zmień kolor klocka %1 na losowy", args0: [partField()], previousStatement: null, nextStatement: null, colour: PART },
  { type: "p_move", message0: "przesuń klocek %1 o x %2 y %3 z %4", args0: [partField(), { type: "field_number", name: "X", value: 0 }, { type: "field_number", name: "Y", value: 1 }, { type: "field_number", name: "Z", value: 0 }], previousStatement: null, nextStatement: null, colour: PART },
  { type: "p_set_pos", message0: "ustaw klocek %1 na x %2 y %3 z %4", args0: [partField(), { type: "input_value", name: "X", check: "Number" }, { type: "input_value", name: "Y", check: "Number" }, { type: "input_value", name: "Z", check: "Number" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: PART },
  { type: "p_visible", message0: "%1 klocek %2", args0: [{ type: "field_dropdown", name: "MODE", options: [["pokaż", "true"], ["ukryj", "false"]] }, partField()], previousStatement: null, nextStatement: null, colour: PART },
  { type: "p_transparency", message0: "ustaw przezroczystość klocka %1 na %2", args0: [partField(), { type: "field_number", name: "T", value: 0.5, min: 0, max: 1 }], previousStatement: null, nextStatement: null, colour: PART },

  // ---- gracz ----
  { type: "p_tell", message0: "napisz do gracza %1", args0: [{ type: "input_value", name: "TEXT" }], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_kill", message0: "zabij gracza", previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_teleport", message0: "teleportuj gracza do x %1 y %2 z %3", args0: [{ type: "input_value", name: "X", check: "Number" }, { type: "input_value", name: "Y", check: "Number" }, { type: "input_value", name: "Z", check: "Number" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_add_score", message0: "dodaj graczowi %1 punktów", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_set_score", message0: "ustaw punkty gracza na %1", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_set_speed", message0: "ustaw prędkość gracza na %1", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: PLAYER, tooltip: "Normalnie 16" },
  { type: "p_set_jump", message0: "ustaw siłę skoku gracza na %1", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: PLAYER, tooltip: "Normalnie 50" },

  { type: "p_give_tool", message0: "daj graczowi narzędzie %1", args0: [partField("TOOL", "Miecz")], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_remove_tool", message0: "zabierz graczowi narzędzie %1", args0: [partField("TOOL", "Miecz")], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_damage", message0: "zadaj graczowi %1 obrażeń", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_heal", message0: "ulecz gracza o %1", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_set_character", message0: "zmień postać gracza na %1", args0: [partField("CHAR", "Zombie")], previousStatement: null, nextStatement: null, colour: PLAYER, tooltip: "Nazwa postaci z panelu Postacie (pusta = własny awatar)" },
  { type: "p_play_anim", message0: "odtwórz animację %1 na graczu", args0: [partField("ANIM", "Taniec")], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_stop_anim", message0: "zatrzymaj animację gracza", previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "p_npc_anim", message0: "NPC %1 niech odtwarza %2", args0: [partField("PART", "NPC"), partField("ANIM", "Machanie")], previousStatement: null, nextStatement: null, colour: PART },
  { type: "p_sky", message0: "zmień kolor nieba na %1", args0: [{ type: "field_dropdown", name: "COLOR", options: [["dzień", "#8ec8ff"], ["zachód słońca", "#ffb57a"], ["noc", "#0b1026"], ["burza", "#4a5160"], ["kosmos", "#000000"]] }], previousStatement: null, nextStatement: null, colour: VALUE },
  { type: "p_skybox", message0: "ustaw niebo %1", args0: [{ type: "field_dropdown", name: "SKY", options: SKYBOXES.map((s) => [s.icon + " " + s.name, s.id]) }], previousStatement: null, nextStatement: null, colour: VALUE },
  { type: "p_killer_score", message0: "dodaj zabójcy %1 punktów", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: PLAYER, tooltip: "Działa w bloczku „gdy gracz zginie”" },

  // ---- wartości ----
  { type: "p_player_name", message0: "nick gracza", output: "String", colour: PLAYER },
  { type: "p_message", message0: "wiadomość z czatu", output: "String", colour: PLAYER },
  { type: "p_score", message0: "punkty gracza", output: "Number", colour: PLAYER },
  { type: "p_health", message0: "zdrowie gracza", output: "Number", colour: PLAYER },
  { type: "p_player_count", message0: "liczba graczy", output: "Number", colour: PLAYER },
]);

const g = luaGenerator;
const q = (s: string) => g.quote_(s);
const stmts = (b: Blockly.Block) => g.statementToCode(b, "DO");
const val = (b: Blockly.Block, name: string, def: string) => g.valueToCode(b, name, Order.NONE) || def;
const num = (b: Blockly.Block, name: string) => Number(b.getFieldValue(name)) || 0;
const part = (b: Blockly.Block) => q(String(b.getFieldValue("PART") ?? ""));

g.forBlock["p_on_start"] = (b) => stmts(b);
g.forBlock["p_on_join"] = (b) => `onPlayerJoin(function(player)\n${stmts(b)}end)\n`;
g.forBlock["p_on_leave"] = (b) => `onPlayerLeave(function(player)\n${stmts(b)}end)\n`;
g.forBlock["p_on_respawn"] = (b) => `onRespawn(function(player)\n${stmts(b)}end)\n`;
g.forBlock["p_on_touch"] = (b) => `onTouch(${part(b)}, function(player)\n${stmts(b)}end)\n`;
g.forBlock["p_on_chat"] = (b) => `onChat(function(player, message)\n${stmts(b)}end)\n`;
g.forBlock["p_on_tool"] = (b) =>
  `onToolUse(function(player, toolName)\n  if toolName == ${q(String(b.getFieldValue("TOOL") ?? ""))} then\n${g.prefixLines(stmts(b), "  ")}  end\nend)\n`;
g.forBlock["p_on_died"] = (b) => `onDied(function(player, killer)\n${stmts(b)}end)\n`;
g.forBlock["p_every"] = (b) => `every(${num(b, "SEC")}, function()\n${stmts(b)}end)\n`;
g.forBlock["p_after"] = (b) => `after(${num(b, "SEC")}, function()\n${stmts(b)}end)\n`;

g.forBlock["p_say"] = (b) => `say(${val(b, "TEXT", '""')})\n`;
g.forBlock["p_wait"] = (b) => `wait(${val(b, "SEC", "1")})\n`;
g.forBlock["p_print"] = (b) => `print(${val(b, "TEXT", '""')})\n`;

g.forBlock["p_set_color"] = (b) => `setColor(${part(b)}, ${q(b.getFieldValue("COLOR"))})\n`;
g.forBlock["p_random_color"] = (b) => `setColor(${part(b)}, string.format("#%06x", math.random(0, 16777215)))\n`;
g.forBlock["p_move"] = (b) => `move(${part(b)}, ${num(b, "X")}, ${num(b, "Y")}, ${num(b, "Z")})\n`;
g.forBlock["p_set_pos"] = (b) => `setPosition(${part(b)}, ${val(b, "X", "0")}, ${val(b, "Y", "0")}, ${val(b, "Z", "0")})\n`;
g.forBlock["p_visible"] = (b) => `setVisible(${part(b)}, ${b.getFieldValue("MODE") === "true" ? "true" : "false"})\n`;
g.forBlock["p_transparency"] = (b) => `setTransparency(${part(b)}, ${num(b, "T")})\n`;

g.forBlock["p_tell"] = (b) => `if player then tell(player, ${val(b, "TEXT", '""')}) end\n`;
g.forBlock["p_kill"] = () => `if player then kill(player) end\n`;
g.forBlock["p_teleport"] = (b) => `if player then teleport(player, ${val(b, "X", "0")}, ${val(b, "Y", "5")}, ${val(b, "Z", "0")}) end\n`;
g.forBlock["p_add_score"] = (b) => `if player then addScore(player, ${val(b, "N", "1")}) end\n`;
g.forBlock["p_set_score"] = (b) => `if player then setScore(player, ${val(b, "N", "0")}) end\n`;
g.forBlock["p_set_speed"] = (b) => `if player then setSpeed(player, ${val(b, "N", "16")}) end\n`;
g.forBlock["p_set_jump"] = (b) => `if player then setJump(player, ${val(b, "N", "50")}) end\n`;

const tool = (b: Blockly.Block) => q(String(b.getFieldValue("TOOL") ?? ""));
g.forBlock["p_give_tool"] = (b) => `if player then giveTool(player, ${tool(b)}) end\n`;
g.forBlock["p_remove_tool"] = (b) => `if player then removeTool(player, ${tool(b)}) end\n`;
g.forBlock["p_damage"] = (b) => `if player then damage(player, ${val(b, "N", "10")}) end\n`;
g.forBlock["p_heal"] = (b) => `if player then heal(player, ${val(b, "N", "10")}) end\n`;
g.forBlock["p_killer_score"] = (b) => `if killer and killer ~= "" then addScore(killer, ${val(b, "N", "1")}) end\n`;
g.forBlock["p_set_character"] = (b) => `if player then setCharacter(player, ${q(String(b.getFieldValue("CHAR") ?? ""))}) end\n`;
g.forBlock["p_play_anim"] = (b) => `if player then playAnimation(player, ${q(String(b.getFieldValue("ANIM") ?? ""))}) end\n`;
g.forBlock["p_stop_anim"] = () => `if player then stopAnimation(player) end\n`;
g.forBlock["p_npc_anim"] = (b) => `npcAnimation(${part(b)}, ${q(String(b.getFieldValue("ANIM") ?? ""))})\n`;
g.forBlock["p_sky"] = (b) => `setSky(${q(b.getFieldValue("COLOR"))})\n`;
g.forBlock["p_skybox"] = (b) => `setSkybox(${q(b.getFieldValue("SKY"))})\n`;
g.forBlock["p_health"] = () => [`(player and getHealth(player) or 0)`, Order.ATOMIC];
g.forBlock["p_player_name"] = () => [`(player and playerName(player) or "")`, Order.ATOMIC];
g.forBlock["p_message"] = () => [`(message or "")`, Order.ATOMIC];
g.forBlock["p_score"] = () => [`(player and getScore(player) or 0)`, Order.ATOMIC];
g.forBlock["p_player_count"] = () => [`#getPlayers()`, Order.UNARY];

// ---------- bloczki gier 2D ----------
const D2 = 175;
const D2OBJ = 30;
const objField = (name = "OBJ", text = "Moneta") => ({ type: "field_input", name, text });
const BG_COLORS: [string, string][] = [
  ["niebo", "#87ceeb"], ["noc", "#0b1026"], ["zachód", "#ff9a5a"], ["jaskinia", "#2a2230"], ["las", "#5c8a4a"], ["czarny", "#000000"], ["biały", "#ffffff"],
];
Blockly.common.defineBlocksWithJsonArray([
  { type: "d2_on_touch", message0: "gdy gracz dotknie obiektu %1 %2 %3", args0: [objField("OBJ", "Moneta"), { type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT, tooltip: "Nazwa obiektu z zakładki Obiekty (albo nazwa postawionej instancji)" },
  { type: "d2_on_level", message0: "gdy gracz wejdzie na poziom %1 %2 %3", args0: [objField("LEVEL", "Poziom 1"), { type: "input_dummy" }, { type: "input_statement", name: "DO" }], colour: EVENT },
  // gracz
  { type: "d2_teleport", message0: "przenieś gracza do x %1 y %2", args0: [{ type: "input_value", name: "X", check: "Number" }, { type: "input_value", name: "Y", check: "Number" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "d2_set_level", message0: "przenieś gracza na poziom %1", args0: [objField("LEVEL", "Poziom 2")], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "d2_jump", message0: "gracz podskakuje", previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "d2_set_speed", message0: "ustaw prędkość biegu gracza na %1", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: PLAYER, tooltip: "Normalnie ok. 200" },
  { type: "d2_set_jump", message0: "ustaw siłę skoku gracza na %1", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: PLAYER, tooltip: "Normalnie ok. 400-500" },
  { type: "d2_auto_walk", message0: "gracz sam idzie %1", args0: [{ type: "field_dropdown", name: "DIR", options: [["w prawo", "1"], ["w lewo", "-1"], ["stop", "0"]] }], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "d2_force", message0: "pchaj gracza w prawo z siłą %1", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: PLAYER, tooltip: "Jak jazda na desce; 0 = koniec" },
  { type: "d2_hide_player", message0: "%1 gracza", args0: [{ type: "field_dropdown", name: "MODE", options: [["schowaj", "true"], ["pokaż", "false"]] }], previousStatement: null, nextStatement: null, colour: PLAYER, tooltip: "Np. gdy przejdzie przez drzwi" },
  { type: "d2_player_anim", message0: "zmień animację gracza %1 na %2", args0: [{ type: "field_dropdown", name: "KIND", options: [["stanie", "idle"], ["chodzenie", "walk"], ["skok", "jump"], ["spadanie", "fall"], ["wspinanie", "climb"]] }, objField("ANIM", "Bieg")], previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "d2_reset_anims", message0: "przywróć animacje gracza", previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "d2_camera", message0: "zatrzymaj kamerę gracza w x %1 y %2", args0: [{ type: "input_value", name: "X", check: "Number" }, { type: "input_value", name: "Y", check: "Number" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "d2_camera_free", message0: "kamera znowu idzie za graczem", previousStatement: null, nextStatement: null, colour: PLAYER },
  { type: "d2_badge", message0: "daj graczowi odznakę %1", args0: [objField("NAME", "Mistrz")], previousStatement: null, nextStatement: null, colour: PLAYER, tooltip: "Nazwa odznaki z Ustawień gry → Odznaki" },
  { type: "d2_character", message0: "zmień postać gracza na %1", args0: [objField("CHAR", "Pies")], previousStatement: null, nextStatement: null, colour: PLAYER, tooltip: "Nazwa z zakładki Postacie (pusta = wybrana przez gracza)" },
  // monety
  { type: "d2_add_coins", message0: "dodaj graczowi %1 monet", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: 45 },
  { type: "d2_set_coins", message0: "ustaw monety gracza na %1", args0: [{ type: "input_value", name: "N", check: "Number" }], previousStatement: null, nextStatement: null, colour: 45 },
  { type: "d2_coins", message0: "monety gracza", output: "Number", colour: 45 },
  { type: "d2_show_for", message0: "przywróć graczowi zebrane %1", args0: [objField("OBJ", "Moneta")], previousStatement: null, nextStatement: null, colour: 45, tooltip: "Zebrane monety / rzeczy znowu są widoczne dla tego gracza" },
  // obiekty i poziom
  { type: "d2_visible", message0: "%1 obiekt %2", args0: [{ type: "field_dropdown", name: "MODE", options: [["schowaj", "hide"], ["pokaż", "show"]] }, objField("OBJ", "Most")], previousStatement: null, nextStatement: null, colour: D2OBJ },
  { type: "d2_set_anim", message0: "animacja obiektu %1 na %2", args0: [objField("OBJ", "Drzwi"), objField("ANIM", "Otwarte")], previousStatement: null, nextStatement: null, colour: D2OBJ },
  { type: "d2_set_text", message0: "zmień napis %1 na %2", args0: [objField("OBJ", "Napis"), { type: "input_value", name: "TEXT" }], previousStatement: null, nextStatement: null, colour: D2OBJ },
  { type: "d2_create", message0: "stwórz %1 w x %2 y %3", args0: [objField("OBJ", "Potwór"), { type: "input_value", name: "X", check: "Number" }, { type: "input_value", name: "Y", check: "Number" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: D2OBJ },
  { type: "d2_delete", message0: "usuń wszystkie %1", args0: [objField("OBJ", "Potwór")], previousStatement: null, nextStatement: null, colour: D2OBJ },
  { type: "d2_count", message0: "ile jest %1 na poziomie gracza", args0: [objField("OBJ", "Moneta")], output: "Number", colour: D2OBJ },
  { type: "d2_restart", message0: "zacznij poziom gracza od nowa", previousStatement: null, nextStatement: null, colour: D2 },
  { type: "d2_level", message0: "poziom gracza", output: "String", colour: D2 },
  { type: "d2_background", message0: "zmień tło na %1", args0: [{ type: "field_dropdown", name: "COLOR", options: BG_COLORS }], previousStatement: null, nextStatement: null, colour: D2 },
  { type: "d2_sound", message0: "zagraj dźwięk %1 %2", args0: [objField("NAME", "skok.mp3"), { type: "field_dropdown", name: "WHO", options: [["graczowi", "p"], ["wszystkim", "all"]] }], previousStatement: null, nextStatement: null, colour: D2, tooltip: "Nazwa dźwięku z zakładki Dźwięki" },
]);
const fld = (b: Blockly.Block, name: string) => q(String(b.getFieldValue(name) ?? ""));
const ifp = (code: string) => `if player then ${code} end\n`;
g.forBlock["d2_on_touch"] = (b) => `onTouch(${fld(b, "OBJ")}, function(player)\n${stmts(b)}end)\n`;
g.forBlock["d2_on_level"] = (b) => `onLevelEnter(function(player, level)\n  if level == ${fld(b, "LEVEL")} then\n${g.prefixLines(stmts(b), "  ")}  end\nend)\n`;
g.forBlock["d2_teleport"] = (b) => ifp(`teleport(player, ${val(b, "X", "0")}, ${val(b, "Y", "0")})`);
g.forBlock["d2_set_level"] = (b) => ifp(`setLevel(player, ${fld(b, "LEVEL")})`);
g.forBlock["d2_jump"] = () => ifp("jump(player)");
g.forBlock["d2_set_speed"] = (b) => ifp(`setSpeed(player, ${val(b, "N", "200")})`);
g.forBlock["d2_set_jump"] = (b) => ifp(`setJump(player, ${val(b, "N", "450")})`);
g.forBlock["d2_auto_walk"] = (b) => ifp(`autoWalk(player, ${Number(b.getFieldValue("DIR")) || 0})`);
g.forBlock["d2_force"] = (b) => ifp(`setForce(player, ${val(b, "N", "0")})`);
g.forBlock["d2_hide_player"] = (b) => ifp(`hidePlayer(player, ${b.getFieldValue("MODE") === "true" ? "true" : "false"})`);
g.forBlock["d2_player_anim"] = (b) => ifp(`setPlayerAnimation(player, ${fld(b, "KIND")}, ${fld(b, "ANIM")})`);
g.forBlock["d2_reset_anims"] = () => ifp("resetPlayerAnimations(player)");
g.forBlock["d2_camera"] = (b) => ifp(`lockCamera(player, ${val(b, "X", "0")}, ${val(b, "Y", "0")})`);
g.forBlock["d2_camera_free"] = () => ifp("unlockCamera(player)");
g.forBlock["d2_badge"] = (b) => ifp(`awardBadge(player, ${fld(b, "NAME")})`);
g.forBlock["d2_character"] = (b) => ifp(`setCharacter(player, ${fld(b, "CHAR")})`);
g.forBlock["d2_add_coins"] = (b) => ifp(`addCoins(player, ${val(b, "N", "1")})`);
g.forBlock["d2_set_coins"] = (b) => ifp(`setCoins(player, ${val(b, "N", "0")})`);
g.forBlock["d2_coins"] = () => [`(player and getCoins(player) or 0)`, Order.ATOMIC];
g.forBlock["d2_show_for"] = (b) => ifp(`showFor(player, ${fld(b, "OBJ")})`);
g.forBlock["d2_visible"] = (b) => `${b.getFieldValue("MODE") === "show" ? "showObject" : "hideObject"}(${fld(b, "OBJ")})\n`;
g.forBlock["d2_set_anim"] = (b) => `setAnimation(${fld(b, "OBJ")}, ${fld(b, "ANIM")})\n`;
g.forBlock["d2_set_text"] = (b) => `setText(${fld(b, "OBJ")}, tostring(${val(b, "TEXT", '""')}))\n`;
g.forBlock["d2_create"] = (b) => `createObject(${fld(b, "OBJ")}, ${val(b, "X", "0")}, ${val(b, "Y", "0")}, player and getLevel(player) or nil)\n`;
g.forBlock["d2_delete"] = (b) => `deleteObject(${fld(b, "OBJ")})\n`;
g.forBlock["d2_count"] = (b) => [`countObjects(${fld(b, "OBJ")}, player and getLevel(player) or nil)`, Order.HIGH];
g.forBlock["d2_restart"] = () => ifp("restartLevel(getLevel(player))");
g.forBlock["d2_level"] = () => [`(player and getLevel(player) or "")`, Order.ATOMIC];
g.forBlock["d2_background"] = (b) => `setBackground(${q(b.getFieldValue("COLOR"))})\n`;
g.forBlock["d2_sound"] = (b) => (b.getFieldValue("WHO") === "all" ? `playSound(${fld(b, "NAME")})\n` : ifp(`playSound(${fld(b, "NAME")}, player)`));

// ---------- zapis postępu (wspólne dla 3D i 2D) ----------
const SAVE = 95;
Blockly.common.defineBlocksWithJsonArray([
  { type: "p_save", message0: "zapisz graczowi %1 = %2", args0: [{ type: "field_input", name: "KEY", text: "monety" }, { type: "input_value", name: "VAL" }], previousStatement: null, nextStatement: null, colour: SAVE, tooltip: "Zostaje zapisane po wyjściu z gry - przy następnym wejściu wczytasz to bloczkiem 'zapisane'" },
  { type: "p_load", message0: "zapisane gracza %1 (gdy brak: %2)", args0: [{ type: "field_input", name: "KEY", text: "monety" }, { type: "input_value", name: "DEF" }], inputsInline: true, output: null, colour: SAVE },
  { type: "p_delete_data", message0: "usuń zapis gracza %1", args0: [{ type: "field_input", name: "KEY", text: "monety" }], previousStatement: null, nextStatement: null, colour: SAVE },
]);
g.forBlock["p_save"] = (b) => `if player then saveData(player, ${q(String(b.getFieldValue("KEY") ?? ""))}, ${val(b, "VAL", "0")}) end\n`;
g.forBlock["p_load"] = (b) => [`(player and loadData(player, ${q(String(b.getFieldValue("KEY") ?? ""))}, ${val(b, "DEF", "0")}) or ${val(b, "DEF", "0")})`, Order.ATOMIC];
g.forBlock["p_delete_data"] = (b) => `if player then deleteData(player, ${q(String(b.getFieldValue("KEY") ?? ""))}) end\n`;

const block = (type: string, extra: Record<string, unknown> = {}) => ({ kind: "block", type, ...extra });
const numShadow = (n: number) => ({ shadow: { type: "math_number", fields: { NUM: n } } });
const textShadow = (t: string) => ({ shadow: { type: "text", fields: { TEXT: t } } });

const TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category", name: "Zdarzenia", colour: EVENT,
      contents: ["p_on_start", "p_on_join", "p_on_leave", "p_on_touch", "p_on_chat", "p_on_respawn", "p_on_tool", "p_on_died", "p_every", "p_after"].map((t) => block(t)),
    },
    {
      kind: "category", name: "Ogólne", colour: VALUE,
      contents: [
        block("p_say", { inputs: { TEXT: textShadow("Cześć!") } }),
        block("p_sky"),
        block("p_skybox"),
        block("p_wait", { inputs: { SEC: numShadow(1) } }),
        block("p_print", { inputs: { TEXT: textShadow("test") } }),
      ],
    },
    {
      kind: "category", name: "Klocki", colour: PART,
      contents: [
        block("p_set_color"), block("p_random_color"), block("p_move"),
        block("p_set_pos", { inputs: { X: numShadow(0), Y: numShadow(5), Z: numShadow(0) } }),
        block("p_visible"), block("p_transparency"),
      ],
    },
    {
      kind: "category", name: "Gracz", colour: PLAYER,
      contents: [
        block("p_tell", { inputs: { TEXT: textShadow("Hej!") } }),
        block("p_kill"),
        block("p_teleport", { inputs: { X: numShadow(0), Y: numShadow(5), Z: numShadow(0) } }),
        block("p_add_score", { inputs: { N: numShadow(1) } }),
        block("p_set_score", { inputs: { N: numShadow(0) } }),
        block("p_set_speed", { inputs: { N: numShadow(32) } }),
        block("p_set_jump", { inputs: { N: numShadow(80) } }),
        block("p_player_name"), block("p_message"), block("p_score"), block("p_player_count"),
      ],
    },
    {
      kind: "category", name: "Postacie i animacje", colour: 290,
      contents: [block("p_set_character"), block("p_play_anim"), block("p_stop_anim"), block("p_npc_anim")],
    },
    {
      kind: "category", name: "Narzędzia i walka", colour: 0,
      contents: [
        block("p_give_tool"), block("p_remove_tool"),
        block("p_damage", { inputs: { N: numShadow(20) } }),
        block("p_heal", { inputs: { N: numShadow(20) } }),
        block("p_killer_score", { inputs: { N: numShadow(1) } }),
        block("p_health"),
      ],
    },
    {
      kind: "category", name: "Logika", categorystyle: "logic_category",
      contents: ["controls_if", "logic_compare", "logic_operation", "logic_negate", "logic_boolean"].map((t) => block(t)),
    },
    {
      kind: "category", name: "Pętle", categorystyle: "loop_category",
      contents: [
        block("controls_repeat_ext", { inputs: { TIMES: numShadow(10) } }),
        block("controls_whileUntil"),
        block("controls_for", { inputs: { FROM: numShadow(1), TO: numShadow(10), BY: numShadow(1) } }),
      ],
    },
    {
      kind: "category", name: "Matematyka", categorystyle: "math_category",
      contents: [
        block("math_number"),
        block("math_arithmetic"),
        block("math_random_int", { inputs: { FROM: numShadow(1), TO: numShadow(100) } }),
      ],
    },
    {
      kind: "category", name: "Tekst", categorystyle: "text_category",
      contents: [block("text"), block("text_join")],
    },
    { kind: "category", name: "Zmienne", categorystyle: "variable_category", custom: "VARIABLE" },
  ],
};

/** wspólne kategorie: logika, pętle, matematyka, tekst, zmienne */
const COMMON = TOOLBOX.contents.slice(-5);
const SAVE_CATEGORY = {
  kind: "category", name: "Zapis postępu", colour: SAVE,
  contents: [
    block("p_save", { inputs: { VAL: { block: { type: "p_score" } } } }),
    block("p_load", { inputs: { DEF: numShadow(0) } }),
    block("p_delete_data"),
  ],
};
TOOLBOX.contents.splice(TOOLBOX.contents.length - 5, 0, SAVE_CATEGORY);
const TOOLBOX_2D = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category", name: "Zdarzenia", colour: EVENT,
      contents: ["p_on_start", "p_on_join", "p_on_leave", "d2_on_touch", "d2_on_level", "p_on_chat", "p_on_died", "p_every", "p_after"].map((t) => block(t)),
    },
    {
      kind: "category", name: "Ogólne", colour: VALUE,
      contents: [
        block("p_say", { inputs: { TEXT: textShadow("Cześć!") } }),
        block("p_wait", { inputs: { SEC: numShadow(1) } }),
        block("d2_sound"),
        block("d2_background"),
        block("p_print", { inputs: { TEXT: textShadow("test") } }),
      ],
    },
    {
      kind: "category", name: "Gracz", colour: PLAYER,
      contents: [
        block("p_tell", { inputs: { TEXT: textShadow("Hej!") } }),
        block("p_kill"),
        block("d2_jump"),
        block("d2_teleport", { inputs: { X: numShadow(100), Y: numShadow(100) } }),
        block("d2_set_level"),
        block("d2_set_speed", { inputs: { N: numShadow(400) } }),
        block("d2_set_jump", { inputs: { N: numShadow(600) } }),
        block("d2_auto_walk"),
        block("d2_force", { inputs: { N: numShadow(500) } }),
        block("d2_hide_player"),
        block("p_add_score", { inputs: { N: numShadow(1) } }),
        block("d2_badge"),
        block("p_player_name"), block("p_message"), block("p_score"), block("p_player_count"), block("d2_level"),
      ],
    },
    {
      kind: "category", name: "Monety", colour: 45,
      contents: [block("d2_add_coins", { inputs: { N: numShadow(1) } }), block("d2_set_coins", { inputs: { N: numShadow(0) } }), block("d2_coins"), block("d2_show_for")],
    },
    {
      kind: "category", name: "Obiekty i poziom", colour: D2OBJ,
      contents: [
        block("d2_visible"), block("d2_set_anim"),
        block("d2_set_text", { inputs: { TEXT: textShadow("Brawo!") } }),
        block("d2_create", { inputs: { X: numShadow(200), Y: numShadow(100) } }),
        block("d2_delete"), block("d2_count"), block("d2_restart"),
      ],
    },
    {
      kind: "category", name: "Postać i kamera", colour: 290,
      contents: [block("d2_character"), block("d2_player_anim"), block("d2_reset_anims"), block("d2_camera", { inputs: { X: numShadow(0), Y: numShadow(0) } }), block("d2_camera_free")],
    },
    SAVE_CATEGORY,
    ...COMMON,
  ],
};

export interface BlocksEditor {
  getState(): unknown;
  getLua(): string;
  onChange(fn: () => void): void;
  resize(): void;
  dispose(): void;
}

export function createBlocksEditor(container: HTMLElement, state: unknown, mode: "3d" | "2d" = "3d"): BlocksEditor {
  const ws = Blockly.inject(container, {
    toolbox: mode === "2d" ? TOOLBOX_2D : TOOLBOX,
    media: "blockly-media/", // lokalnie - działa bez internetu
    sounds: false,
    trashcan: true,
    grid: { spacing: 24, length: 3, colour: "#3a3d45", snap: true },
    zoom: { controls: true, wheel: true, startScale: matchMedia("(pointer: coarse)").matches ? 0.75 : 0.9 },
    move: { scrollbars: true, drag: true, wheel: false },
    theme: Blockly.Theme.defineTheme("predator", {
      name: "predator",
      base: Blockly.Themes.Classic,
      componentStyles: {
        workspaceBackgroundColour: "#1f2127",
        toolboxBackgroundColour: "#26282f",
        toolboxForegroundColour: "#e8e8ea",
        flyoutBackgroundColour: "#2d3038",
        flyoutForegroundColour: "#ddd",
        flyoutOpacity: 0.95,
        scrollbarColour: "#555",
      },
    }),
  });
  // do testów: podgląd przestrzeni bloczków w konsoli (tylko z włączonym predator.debug)
  try {
    if (localStorage.getItem("predator.debug")) (window as unknown as { __blockly: unknown }).__blockly = { ws, Blockly, g };
  } catch {
    /* brak localStorage */
  }
  if (state) {
    try {
      Blockly.serialization.workspaces.load(state as Blockly.serialization.blocks.State, ws);
    } catch (e) {
      console.warn("Nie udało się wczytać bloczków", e);
    }
  }
  return {
    getState: () => Blockly.serialization.workspaces.save(ws),
    getLua: () => "-- Kod wygenerowany z bloczków\n" + g.workspaceToCode(ws),
    onChange: (fn) =>
      ws.addChangeListener((e) => {
        if (!e.isUiEvent) fn();
      }),
    resize: () => Blockly.svgResize(ws),
    dispose: () => ws.dispose(),
  };
}
