// Ikony liniowe (SVG) do menu - zamiast emotek, żeby wyglądało jak prawdziwa aplikacja.

const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  fire: "M12 22c4 0 7-2.8 7-7 0-3.5-2.3-6-4-8 0 2.5-1.5 4-3 4 .5-3-1-6-4-9 0 4-4 7-4 12 0 4.2 3.5 8 8 8z",
  chat: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  menu: "M4 7h16M4 12h16M4 17h16",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  userPlus: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M19 8v6M16 11h6",
  users: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 4a4 4 0 0 1 0 8M18 15a5 5 0 0 1 4 5v1",
  build: "M4 14h7v7H4zM13 14h7v7h-7zM8.5 3h7v7h-7z",
  folder: "M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.9 7.9 0 0 0 0-2l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15 3.5h-4L10.7 6a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.9 7.9 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.3 2.5h4l.3-2.5a8 8 0 0 0 1.7-1l2.4 1 2-3.4z",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H3",
  play: "M7 4.5v15a.5.5 0 0 0 .8.4l11-7.5a.5.5 0 0 0 0-.8l-11-7.5a.5.5 0 0 0-.8.4z",
  thumbUp: "M7 21H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3zM7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 21H7",
  thumbDown: "M17 3h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3zM17 13l-4 8a2 2 0 0 1-2-2v-4H5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.2 3H17",
  person: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM4 21a8 8 0 0 1 16 0",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  send: "M4 12 20 4l-4 16-4-6zM12 14l8-10",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  offline: "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2-1.5M2 9.5a14 14 0 0 1 4-2.6M22 9.5A14 14 0 0 0 11 6",
  star: "M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
};

/** Moneta Predatora - kolorowa, nie liniowa */
const COIN = `<circle cx="12" cy="12" r="9" fill="#f5b400"/><circle cx="12" cy="12" r="6.3" fill="none" stroke="#fff3" stroke-width="1.6"/><path d="M10 8h3a2.5 2.5 0 0 1 0 5h-3v3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

export function icon(name: keyof typeof PATHS | "coin", size = 24, cls = "ic"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  if (name === "coin") svg.innerHTML = COIN;
  else {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = `<path d="${PATHS[name]}"/>`;
  }
  return svg;
}
