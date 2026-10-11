// Apex: minimalny "graf sceny" o kształcie API Babylona (TransformNode / Mesh / MeshBuilder), żeby ten sam kod czapek, pleców
// i szyi (wearables.ts) budował bryły dla obu silników. Nic się tu nie rysuje - wynik to drzewo brył do narysowania przez ApexRenderer.

export class Color3 {}
export class Scene {}

export class StandardMaterial {
  alpha = 1;
  constructor(readonly color: string, readonly emissive = false) {}
}

class Vec {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number) {
    this.x = x; this.y = y; this.z = z;
  }
}

export class TransformNode {
  position = new Vec();
  rotation = new Vec();
  scaling = new Vec(1, 1, 1);
  readonly children: TransformNode[] = [];
  private par: TransformNode | null = null;
  constructor(public name = "", _scene?: Scene) {
    void _scene;
  }
  get parent() {
    return this.par;
  }
  set parent(p: TransformNode | null) {
    if (this.par) this.par.children.splice(this.par.children.indexOf(this), 1);
    this.par = p;
    p?.children.push(this);
  }
}

export type MeshKind = "box" | "sphere" | "cylinder" | "torus" | "plane";
export class Mesh extends TransformNode {
  material: StandardMaterial | null = null;
  isPickable = true;
  static readonly DOUBLESIDE = 2;
  constructor(readonly kind: MeshKind, readonly o: Record<string, number>) {
    super(kind);
  }
}

export const MeshBuilder = {
  CreateBox: (_n: string, o: { width: number; height: number; depth: number }, _s?: Scene) => new Mesh("box", o),
  CreateSphere: (_n: string, o: { diameter: number; slice?: number; segments?: number }, _s?: Scene) => new Mesh("sphere", { diameter: o.diameter, slice: o.slice ?? 1 }),
  CreateCylinder: (_n: string, o: { diameterTop: number; diameterBottom: number; height: number; tessellation?: number }, _s?: Scene) =>
    new Mesh("cylinder", { top: o.diameterTop, bottom: o.diameterBottom, height: o.height, seg: o.tessellation ?? 24 }),
  CreateTorus: (_n: string, o: { diameter: number; thickness: number; tessellation?: number }, _s?: Scene) => new Mesh("torus", o),
  CreatePlane: (_n: string, o: { width: number; height: number; sideOrientation?: number }, _s?: Scene) => new Mesh("plane", o),
};
