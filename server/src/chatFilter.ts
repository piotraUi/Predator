// Prosty filtr wulgaryzmów w czacie (PL + EN). Zamienia słowa na ###.

const BAD_WORDS = [
  "kurw", "chuj", "huj", "pierdol", "jeb", "pizd", "skurwiel", "cipa", "dziwk", "szmat", "pedał", "debil",
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "nigg", "fag", "whore", "slut", "retard",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

const normalize = (w: string) =>
  w
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("")
    .replace(/[^a-ząćęłńóśźż]/g, "");

export function filterChat(text: string): string {
  const clean = text.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
  return clean
    .split(/(\s+)/)
    .map((word) => {
      const n = normalize(word);
      return n && BAD_WORDS.some((b) => n.includes(b)) ? "#".repeat(word.length) : word;
    })
    .join("");
}
