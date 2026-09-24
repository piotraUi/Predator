// Silnik skryptów Lua (fengari) uruchamiany na serwerze dla każdego świata.
// Skrypty są w piaskownicy: brak dostępu do plików, systemu i sieci,
// a każde wywołanie ma limit instrukcji, więc nieskończona pętla nie zawiesi serwera.
// Ten sam kod działa na serwerze (Node) i w przeglądarce (testowanie offline w Studio).
import fengariModule from "fengari";

// fengari nie ma typów TypeScript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fengari: any = fengariModule;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

/** Co skrypt może zrobić ze światem - implementuje to pokój gry. */
export interface ScriptHost {
  say(text: string): void;
  tell(player: string, text: string): void;
  log(text: string, error?: boolean): void;
  setPart(name: string, props: Record<string, unknown>): void;
  movePart(name: string, dx: number, dy: number, dz: number): void;
  getPart(name: string): { x: number; y: number; z: number; sx: number; sy: number; sz: number } | null;
  kill(player: string): void;
  teleport(player: string, x: number, y: number, z: number): void;
  playerName(player: string): string;
  players(): string[];
  playerPosition(player: string): { x: number; y: number; z: number } | null;
  getScore(player: string): number;
  setScore(player: string, value: number): void;
  setSpeed(player: string, speed: number): void;
  setJump(player: string, jump: number): void;
  giveTool(player: string, toolName: string): boolean;
  removeTool(player: string, toolName: string): void;
  hasTool(player: string, toolName: string): boolean;
  damage(player: string, amount: number): void;
  heal(player: string, amount: number): void;
  getHealth(player: string): number;
  setHealth(player: string, hp: number): void;
  setCharacter(player: string, characterName: string): void;
  playAnimation(player: string, animName: string): void;
  stopAnimation(player: string): void;
  npcAnimation(partName: string, animName: string): void;
  setSky(color: string): void;
}

/** Wartość przekazywana między Lua a JS w dodatkowych funkcjach */
export type LuaValue = string | number | boolean | null | undefined | LuaValue[];
export type LuaFn = (...args: LuaValue[]) => LuaValue | void;

/** 1000 instrukcji * 300 = 300 tys. instrukcji na jedno wywołanie */
const HOOK_EVERY = 1000;
const MAX_HOOKS = 300;

const PRELUDE = `
local handlers = { join = {}, leave = {}, chat = {}, touch = {}, respawn = {}, died = {}, tool = {}, level = {}, answer = {} }
local tasks = {}
local now = 0

local function run(co, ...)
  local ok, res = coroutine.resume(co, ...)
  if not ok then
    __error(tostring(res))
    return
  end
  if coroutine.status(co) ~= "dead" then
    tasks[#tasks + 1] = { co = co, wake = now + (tonumber(res) or 0) }
  end
end

function spawn(fn, ...)
  run(coroutine.create(fn), ...)
end

function wait(seconds)
  return coroutine.yield(tonumber(seconds) or 0)
end

function time() return now end

function onPlayerJoin(fn) table.insert(handlers.join, fn) end
function onPlayerLeave(fn) table.insert(handlers.leave, fn) end
function onChat(fn) table.insert(handlers.chat, fn) end
function onRespawn(fn) table.insert(handlers.respawn, fn) end
-- onDied(function(player, killer) ... end) - killer to "" gdy nikt nie zabił (lawa, upadek)
function onDied(fn) table.insert(handlers.died, fn) end
-- onToolUse(function(player, toolName) ... end)
function onToolUse(fn) table.insert(handlers.tool, fn) end
-- onAnswer(function(player, id, text) ... end) - odpowiedź z okienka prompt()
function onAnswer(fn) table.insert(handlers.answer, fn) end
-- gry 2D: onLevelEnter(function(player, levelName) ... end)
function onLevelEnter(fn) table.insert(handlers.level, fn) end
function onTouch(partName, fn)
  local list = handlers.touch[partName]
  if not list then
    list = {}
    handlers.touch[partName] = list
  end
  table.insert(list, fn)
end

function every(seconds, fn)
  spawn(function()
    while true do
      wait(seconds)
      fn()
    end
  end)
end

function after(seconds, fn)
  spawn(function()
    wait(seconds)
    fn()
  end)
end

function __fire(kind, a, b, c)
  for _, fn in ipairs(handlers[kind]) do spawn(fn, a, b, c) end
end

function __fireTouch(partName, player)
  local list = handlers.touch[partName]
  if list then
    for _, fn in ipairs(list) do spawn(fn, player) end
  end
end

function __hasTouch(partName)
  return handlers.touch[partName] ~= nil
end

function __tick(t)
  now = t
  local due, keep = {}, {}
  for _, task in ipairs(tasks) do
    if task.wake <= now then due[#due + 1] = task else keep[#keep + 1] = task end
  end
  tasks = keep
  for _, task in ipairs(due) do run(task.co) end
end

-- zabezpieczenia
local rep = string.rep
string.rep = function(s, n, sep)
  if #s * (tonumber(n) or 0) > 100000 then error("string.rep: za długi tekst") end
  return rep(s, n, sep)
end
os = { time = os.time, clock = os.clock, date = os.date }
io, package, require, dofile, loadfile, load, loadstring, debug, collectgarbage = nil
`;

export class LuaEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private L: any;
  private hooks = 0;
  private startTime = Date.now();
  private closed = false;

  constructor(private host: ScriptHost) {
    const L = (this.L = lauxlib.luaL_newstate());
    lualib.luaL_openlibs(L);
    lua.lua_sethook(
      L,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (T: any) => {
        // T to aktualnie działająca korutyna - błąd trzeba rzucić w niej
        if (++this.hooks > MAX_HOOKS) {
          lauxlib.luaL_error(T, to_luastring("Skrypt działa za długo (nieskończona pętla?) - użyj wait()"));
        }
      },
      lua.LUA_MASKCOUNT,
      HOOK_EVERY,
    );
    this.registerApi();
    if (lauxlib.luaL_dostring(L, to_luastring(PRELUDE)) !== lua.LUA_OK) {
      throw new Error("Błąd preludium Lua: " + this.popString());
    }
  }

  private popString(): string {
    const s = lua.lua_isstring(this.L, -1) ? lua.lua_tojsstring(this.L, -1) : String(lua.lua_type(this.L, -1));
    lua.lua_pop(this.L, 1);
    return s;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private str(L: any, i: number): string {
    return to_jsstring(lauxlib.luaL_checklstring(L, i));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private numOpt(L: any, i: number, def: number): number {
    return lua.lua_isnoneornil(L, i) ? def : lauxlib.luaL_checknumber(L, i);
  }

  private registerApi() {
    const L = this.L;
    const h = this.host;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = (name: string, fn: (L: any) => number) => {
      lua.lua_pushjsfunction(L, fn);
      lua.lua_setglobal(L, to_luastring(name));
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tostr = (L: any, i: number) => to_jsstring(lauxlib.luaL_tolstring(L, i));

    def("__error", (L) => {
      h.log(tostr(L, 1), true);
      return 0;
    });
    def("print", (L) => {
      const n = lua.lua_gettop(L);
      const parts: string[] = [];
      for (let i = 1; i <= n; i++) {
        parts.push(tostr(L, i));
        lua.lua_pop(L, 1);
      }
      h.log(parts.join(" "));
      return 0;
    });
    def("say", (L) => {
      h.say(tostr(L, 1));
      return 0;
    });
    def("tell", (L) => {
      h.tell(this.str(L, 1), tostr(L, 2));
      return 0;
    });
    def("setColor", (L) => {
      h.setPart(this.str(L, 1), { color: this.str(L, 2) });
      return 0;
    });
    def("setTransparency", (L) => {
      h.setPart(this.str(L, 1), { transparency: lauxlib.luaL_checknumber(L, 2) });
      return 0;
    });
    def("setCollide", (L) => {
      h.setPart(this.str(L, 1), { collide: lua.lua_toboolean(L, 2) });
      return 0;
    });
    def("setVisible", (L) => {
      const v = lua.lua_toboolean(L, 2);
      h.setPart(this.str(L, 1), { transparency: v ? 0 : 1, collide: v });
      return 0;
    });
    def("setPosition", (L) => {
      h.setPart(this.str(L, 1), {
        x: lauxlib.luaL_checknumber(L, 2),
        y: lauxlib.luaL_checknumber(L, 3),
        z: lauxlib.luaL_checknumber(L, 4),
      });
      return 0;
    });
    def("setSize", (L) => {
      h.setPart(this.str(L, 1), {
        sx: lauxlib.luaL_checknumber(L, 2),
        sy: lauxlib.luaL_checknumber(L, 3),
        sz: lauxlib.luaL_checknumber(L, 4),
      });
      return 0;
    });
    def("move", (L) => {
      h.movePart(
        this.str(L, 1),
        this.numOpt(L, 2, 0),
        this.numOpt(L, 3, 0),
        this.numOpt(L, 4, 0),
      );
      return 0;
    });
    def("getPosition", (L) => {
      const p = h.getPart(this.str(L, 1));
      if (!p) {
        lua.lua_pushnil(L);
        return 1;
      }
      lua.lua_pushnumber(L, p.x);
      lua.lua_pushnumber(L, p.y);
      lua.lua_pushnumber(L, p.z);
      return 3;
    });
    def("kill", (L) => {
      h.kill(this.str(L, 1));
      return 0;
    });
    def("teleport", (L) => {
      h.teleport(this.str(L, 1), lauxlib.luaL_checknumber(L, 2), lauxlib.luaL_checknumber(L, 3), lauxlib.luaL_checknumber(L, 4));
      return 0;
    });
    def("playerName", (L) => {
      lua.lua_pushstring(L, to_luastring(h.playerName(this.str(L, 1))));
      return 1;
    });
    def("getPlayers", (L) => {
      const list = h.players();
      lua.lua_createtable(L, list.length, 0);
      list.forEach((p, i) => {
        lua.lua_pushstring(L, to_luastring(p));
        lua.lua_rawseti(L, -2, i + 1);
      });
      return 1;
    });
    def("getPlayerPosition", (L) => {
      const p = h.playerPosition(this.str(L, 1));
      if (!p) {
        lua.lua_pushnil(L);
        return 1;
      }
      lua.lua_pushnumber(L, p.x);
      lua.lua_pushnumber(L, p.y);
      lua.lua_pushnumber(L, p.z);
      return 3;
    });
    def("getScore", (L) => {
      lua.lua_pushnumber(L, h.getScore(this.str(L, 1)));
      return 1;
    });
    def("setScore", (L) => {
      h.setScore(this.str(L, 1), lauxlib.luaL_checknumber(L, 2));
      return 0;
    });
    def("addScore", (L) => {
      const p = this.str(L, 1);
      h.setScore(p, h.getScore(p) + this.numOpt(L, 2, 1));
      return 0;
    });
    def("setSpeed", (L) => {
      h.setSpeed(this.str(L, 1), lauxlib.luaL_checknumber(L, 2));
      return 0;
    });
    def("setJump", (L) => {
      h.setJump(this.str(L, 1), lauxlib.luaL_checknumber(L, 2));
      return 0;
    });
    def("giveTool", (L) => {
      lua.lua_pushboolean(L, h.giveTool(this.str(L, 1), this.str(L, 2)));
      return 1;
    });
    def("removeTool", (L) => {
      h.removeTool(this.str(L, 1), this.str(L, 2));
      return 0;
    });
    def("hasTool", (L) => {
      lua.lua_pushboolean(L, h.hasTool(this.str(L, 1), this.str(L, 2)));
      return 1;
    });
    def("damage", (L) => {
      h.damage(this.str(L, 1), lauxlib.luaL_checknumber(L, 2));
      return 0;
    });
    def("heal", (L) => {
      h.heal(this.str(L, 1), lauxlib.luaL_checknumber(L, 2));
      return 0;
    });
    def("getHealth", (L) => {
      lua.lua_pushnumber(L, h.getHealth(this.str(L, 1)));
      return 1;
    });
    def("setCharacter", (L) => {
      h.setCharacter(this.str(L, 1), lua.lua_isnoneornil(L, 2) ? "" : this.str(L, 2));
      return 0;
    });
    def("playAnimation", (L) => {
      h.playAnimation(this.str(L, 1), this.str(L, 2));
      return 0;
    });
    def("stopAnimation", (L) => {
      h.stopAnimation(this.str(L, 1));
      return 0;
    });
    def("npcAnimation", (L) => {
      h.npcAnimation(this.str(L, 1), lua.lua_isnoneornil(L, 2) ? "" : this.str(L, 2));
      return 0;
    });
    def("setSky", (L) => {
      h.setSky(this.str(L, 1));
      return 0;
    });
    def("setHealth", (L) => {
      h.setHealth(this.str(L, 1), lauxlib.luaL_checknumber(L, 2));
      return 0;
    });
  }

  /**
   * Dodatkowe funkcje dla skryptów (np. gry 2D). Argumenty: liczby, teksty, true/false, nil.
   * Tablica jako wynik = tablica Lua (lista).
   */
  defineFunctions(fns: Record<string, LuaFn>) {
    const L = this.L;
    for (const [name, fn] of Object.entries(fns)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lua.lua_pushjsfunction(L, (L: any) => {
        const n = lua.lua_gettop(L);
        const args: LuaValue[] = [];
        for (let i = 1; i <= n; i++) {
          const t = lua.lua_type(L, i);
          if (t === lua.LUA_TNUMBER) args.push(lua.lua_tonumber(L, i));
          else if (t === lua.LUA_TSTRING) args.push(to_jsstring(lua.lua_tostring(L, i)));
          else if (t === lua.LUA_TBOOLEAN) args.push(lua.lua_toboolean(L, i));
          else args.push(null);
        }
        let res: LuaValue | void;
        try {
          res = fn(...args);
        } catch (e) {
          return lauxlib.luaL_error(L, to_luastring(name + ": " + ((e as Error).message ?? e)));
        }
        const push = (v: LuaValue | void) => {
          if (typeof v === "number") lua.lua_pushnumber(L, v);
          else if (typeof v === "string") lua.lua_pushstring(L, to_luastring(v));
          else if (typeof v === "boolean") lua.lua_pushboolean(L, v);
          else lua.lua_pushnil(L);
        };
        if (Array.isArray(res)) {
          // lista jako tablica Lua
          lua.lua_createtable(L, res.length, 0);
          res.forEach((v, i) => {
            push(v as LuaValue);
            lua.lua_rawseti(L, -2, i + 1);
          });
          return 1;
        }
        if (res === undefined) return 0;
        push(res);
        return 1;
      });
      lua.lua_setglobal(L, to_luastring(name));
    }
  }

  /** Wywołuje zdarzenie ze skryptów (np. "level" dla onLevelEnter) */
  fire(kind: string, a: string | number, b: string | number = "") {
    this.call("__fire", kind, a, b);
  }

  /** Wywołuje globalną funkcję Lua z argumentami (tekst lub liczba) z limitem instrukcji. */
  private call(fn: string, ...args: (string | number)[]): unknown {
    if (this.closed) return undefined;
    const L = this.L;
    this.hooks = 0;
    lua.lua_getglobal(L, to_luastring(fn));
    if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) {
      lua.lua_pop(L, 1);
      return undefined;
    }
    for (const a of args) {
      if (typeof a === "number") lua.lua_pushnumber(L, a);
      else lua.lua_pushstring(L, to_luastring(a));
    }
    if (lua.lua_pcall(L, args.length, 1, 0) !== lua.LUA_OK) {
      this.host.log(this.popString(), true);
      return undefined;
    }
    const result = lua.lua_toboolean(L, -1);
    lua.lua_pop(L, 1);
    return result;
  }

  /** Ładuje i uruchamia skrypt (jako korutynę, więc można w nim używać wait()). */
  runScript(name: string, source: string) {
    if (this.closed) return;
    const L = this.L;
    this.hooks = 0;
    if (lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring("=" + name)) !== lua.LUA_OK) {
      this.host.log(this.popString(), true);
      return;
    }
    lua.lua_getglobal(L, to_luastring("spawn"));
    lua.lua_insert(L, -2);
    if (lua.lua_pcall(L, 1, 0, 0) !== lua.LUA_OK) this.host.log(this.popString(), true);
  }

  playerJoined(player: string) {
    this.call("__fire", "join", player);
  }
  playerLeft(player: string) {
    this.call("__fire", "leave", player);
  }
  playerRespawned(player: string) {
    this.call("__fire", "respawn", player);
  }
  died(player: string, killer: string) {
    this.call("__fire", "died", player, killer);
  }
  toolUsed(player: string, toolName: string) {
    this.call("__fire", "tool", player, toolName);
  }
  answered(player: string, id: string, text: string) {
    this.call("__fire", "answer", player, id, text);
  }
  chat(player: string, text: string) {
    this.call("__fire", "chat", player, text);
  }
  touched(partName: string, player: string) {
    this.call("__fireTouch", partName, player);
  }
  hasTouchHandler(partName: string): boolean {
    return this.call("__hasTouch", partName) === true;
  }
  tick() {
    this.call("__tick", (Date.now() - this.startTime) / 1000);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    lua.lua_close(this.L);
  }
}
