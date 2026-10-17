// Rejestr budowli: id -> funkcja budująca (wszystkie partie razem).
import * as S1 from "./structures1.ts";
import * as S2 from "./structures2.ts";
import * as S3 from "./structures3.ts";
import type { Builder } from "./structures1.ts";

export interface Def {
  build: Builder;
}
export const REGISTRY: Record<string, Def> = {
  house: { build: S1.house }, tower: { build: S1.tower }, castle: { build: S1.castle }, tree: { build: S1.tree }, bridge: { build: S1.bridge },
  bench: { build: S2.bench }, lamp: { build: S2.lamp }, well: { build: S2.well }, campfire: { build: S2.campfire }, tent: { build: S2.tent },
  fence: { build: S2.fence }, fountain: { build: S2.fountain }, car: { build: S2.car }, boat: { build: S2.boat }, skateboard: { build: S2.skateboard },
  pond: { build: S2.pond }, dock: { build: S2.dock }, swing: { build: S2.swing }, slide: { build: S2.slide }, sandbox: { build: S2.sandbox },
  pyramid: { build: S2.pyramid }, windmill: { build: S2.windmill }, lighthouse: { build: S2.lighthouse }, gazebo: { build: S2.gazebo },
  stairs: { build: S2.stairs }, ramp: { build: S2.ramp }, barn: { build: S2.barn }, stall: { build: S2.stall }, sign: { build: S2.sign },
  rock: { build: S2.rock }, flowers: { build: S2.flowers }, road: { build: S2.road },
  obby: { build: S3.obby }, stairsOfDeath: { build: S3.stairsOfDeath }, spiralTower: { build: S3.spiralTower }, arena: { build: S3.arena },
  maze: { build: S3.maze }, raceTrack: { build: S3.raceTrack }, skyscraper: { build: S3.skyscraper }, island: { build: S3.island },
};
