// Otwieranie i zapisywanie plików - w aplikacji .exe przez okna systemowe (z zapisem do tego samego pliku),
// w przeglądarce przez wybór pliku i pobieranie.

export interface OpenedFile {
  name: string;
  /** pełna ścieżka na dysku (tylko w aplikacji .exe) */
  path?: string;
  text: string;
}

/** API wystawione przez aplikację na komputer (desktop/preload.js) */
interface DesktopApi {
  openFile(filters: { name: string; extensions: string[] }[]): Promise<OpenedFile | null>;
  saveFile(opts: { path?: string; name: string; text: string; ext: string }): Promise<string | null>;
  getOpenedFile(): Promise<OpenedFile | null>;
  onFileOpened(cb: (f: OpenedFile) => void): void;
  setDirty(dirty: boolean): void;
}

export const desktop: DesktopApi | undefined = (window as unknown as { predator?: DesktopApi }).predator;

/** Wybór pliku z dysku */
export async function pickFile(ext: string[], label: string): Promise<OpenedFile | null> {
  if (desktop) return desktop.openFile([{ name: label, extensions: ext.map((e) => e.replace(/^\./, "")) }]);
  const f = await pickBrowserFile(ext);
  return f ? { name: f.name, text: await f.text() } : null;
}

/** Wybór pliku binarnego (np. model .glb) - zwraca data URL */
export async function pickDataUrl(ext: string[]): Promise<{ name: string; dataUrl: string; size: number } | null> {
  const f = await pickBrowserFile(ext);
  if (!f) return null;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
  return { name: f.name, dataUrl, size: f.size };
}

function pickBrowserFile(ext: string[]): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ext.join(",");
    input.style.display = "none";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    // anulowanie wyboru
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

/**
 * Zapisuje plik. W aplikacji .exe: do podanej ścieżki (albo pyta gdzie). W przeglądarce: pobieranie.
 * Zwraca ścieżkę zapisanego pliku (w .exe) albo nazwę.
 */
export async function saveTextFile(name: string, text: string, ext: string, path?: string): Promise<string | null> {
  if (desktop) return desktop.saveFile({ path, name, text, ext: ext.replace(/^\./, "") });
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return name;
}

/** Plik, z którym uruchomiono grę (dwuklik na .pgame) */
export async function launchFile(): Promise<OpenedFile | null> {
  if (desktop) return desktop.getOpenedFile();
  // zainstalowana aplikacja w Chrome/Edge (PWA) może dostać plik przez "Otwórz za pomocą"
  const lq = (window as unknown as { launchQueue?: { setConsumer(cb: (p: { files: FileSystemFileHandle[] }) => void): void } })
    .launchQueue;
  if (!lq) return null;
  return new Promise((resolve) => {
    let done = false;
    lq.setConsumer(async (params) => {
      if (done || !params.files?.length) return;
      done = true;
      const f = await params.files[0].getFile();
      resolve({ name: f.name, text: await f.text() });
    });
    setTimeout(() => !done && ((done = true), resolve(null)), 300);
  });
}
