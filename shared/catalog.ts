// Katalog sklepu - czapki i twarze, które można kupić za monety.

export interface CatalogItem {
  id: string;
  name: string;
  type: "hat" | "face";
  price: number;
}

export const CATALOG: CatalogItem[] = [
  { id: "none", name: "Brak", type: "hat", price: 0 },
  { id: "cap", name: "Czapka z daszkiem", type: "hat", price: 0 },
  { id: "party", name: "Czapka imprezowa", type: "hat", price: 25 },
  { id: "tophat", name: "Cylinder", type: "hat", price: 60 },
  { id: "horns", name: "Rogi", type: "hat", price: 90 },
  { id: "halo", name: "Aureola", type: "hat", price: 150 },
  { id: "crown", name: "Korona", type: "hat", price: 300 },
  { id: "smile", name: "Uśmiech", type: "face", price: 0 },
  { id: "grin", name: "Szeroki uśmiech", type: "face", price: 20 },
  { id: "cool", name: "Okulary", type: "face", price: 50 },
  { id: "wow", name: "Zdziwiony", type: "face", price: 30 },
  { id: "angry", name: "Zły", type: "face", price: 30 },
];

export const FREE_ITEMS = CATALOG.filter((i) => i.price === 0).map((i) => i.id);

export const DEFAULT_AVATAR = {
  head: "#f5cd30",
  torso: "#0d69ac",
  arms: "#f5cd30",
  legs: "#a4bd47",
  hat: "none",
  face: "smile",
};

export const findItem = (id: string) => CATALOG.find((i) => i.id === id);
