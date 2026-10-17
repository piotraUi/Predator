// Rejestr budowli: id -> funkcja budująca (wszystkie partie razem).
import * as S1 from "./structures1.ts";
import * as S2 from "./structures2.ts";
import * as S3 from "./structures3.ts";
import * as S4 from "./structures4.ts";
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
  scooter: { build: S4.scooter },
  bicycle: { build: S4.bicycle },
  motorcycle: { build: S4.motorcycle },
  airplane: { build: S4.airplane },
  helicopter: { build: S4.helicopter },
  pirateShip: { build: S4.pirateShip },
  train: { build: S4.train },
  bus: { build: S4.bus },
  rocket: { build: S4.rocket },
  tank: { build: S4.tank },
  ufo: { build: S4.ufo },
  sofa: { build: S4.sofa },
  tableChairs: { build: S4.tableChairs },
  bed: { build: S4.bed },
  television: { build: S4.television },
  robot: { build: S4.robot },
  snowman: { build: S4.snowman },
  trampoline: { build: S4.trampoline },
  ferrisWheel: { build: S4.ferrisWheel },
  catapult: { build: S4.catapult },
  treehouse: { build: S4.treehouse },
  church: { build: S4.church },
  school: { build: S4.school },
  shop: { build: S4.shop },
  swimmingPool: { build: S4.swimmingPool },
  garage: { build: S4.garage }, shed: { build: S4.shed },
  footballPitch: { build: S4.footballPitch },
  basketballCourt: { build: S4.basketballCourt },
  igloo: { build: S4.igloo },
  cactus: { build: S4.cactus },
  mushroom: { build: S4.mushroom },
  treasureChest: { build: S4.treasureChest },
  portal: { build: S4.portal },
  obby: { build: S3.obby }, stairsOfDeath: { build: S3.stairsOfDeath }, spiralTower: { build: S3.spiralTower }, arena: { build: S3.arena },
  maze: { build: S3.maze }, raceTrack: { build: S3.raceTrack }, skyscraper: { build: S3.skyscraper }, island: { build: S3.island },
};
