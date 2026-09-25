// Sklep w grze: skrypt pokazuje okienko zakupu (promptPurchase), sprawdza, co gracz ma (ownsProduct),
// a po udanym zakupie dostaje zdarzenie onPurchase(function(player, productName) ... end).
// Monety pobiera serwer (WorldRoom) - symulacja dostaje tylko wiadomość "kupione".
import type { LuaEngine, LuaValue } from "../scripting/lua.ts";
import type { ProductDef } from "../types.ts";

export class GameShop {
  /** kupione passy każdego gracza (id produktów) */
  private owned = new Map<string, Set<string>>();

  constructor(
    readonly products: ProductDef[],
    private send: (sid: string, type: string, msg: unknown) => void,
  ) {}

  find(nameOrId: string) {
    return this.products.find((p) => p.id === nameOrId) ?? this.products.find((p) => p.name.toLowerCase() === nameOrId.toLowerCase());
  }

  attach(sid: string, owned: string[] = [], isOwner = false) {
    this.owned.set(sid, new Set(owned));
    if (this.products.length) this.send(sid, "shop", { products: this.products, owned, owner: isOwner });
  }

  detach(sid: string) {
    this.owned.delete(sid);
  }

  owns(sid: string, nameOrId: string) {
    const p = this.find(nameOrId);
    return !!p && !!this.owned.get(sid)?.has(p.id);
  }

  /** zakup się udał (serwer już pobrał monety) - zwraca nazwę produktu dla onPurchase */
  purchased(sid: string, id: string): string | null {
    const p = this.find(id);
    if (!p) return null;
    if (p.kind === "pass") this.owned.get(sid)?.add(p.id);
    return p.name;
  }

  register(lua: LuaEngine) {
    const S = (v: LuaValue) => (typeof v === "string" ? v : String(v ?? ""));
    lua.defineFunctions({
      promptPurchase: (player, name) => {
        const p = this.find(S(name));
        if (!p) throw new Error(`nie ma produktu „${S(name)}” (dodaj go w Ustawieniach gry → Sklep)`);
        this.send(S(player), "shopprompt", { id: p.id });
      },
      ownsProduct: (player, name) => this.owns(S(player), S(name)),
      openShop: (player) => this.send(S(player), "shopopen", {}),
    });
  }
}
