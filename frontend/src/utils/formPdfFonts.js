const urls = {
  regular: new URL('../assets/fonts/times.ttf', import.meta.url).href,
  bold: new URL('../assets/fonts/times-bold.ttf', import.meta.url).href,
  italic: new URL('../assets/fonts/times-italic.ttf', import.meta.url).href,
};
const cached = new Map();
async function loadFont(url) {
  if (!cached.has(url)) cached.set(url, (async () => {
    if (url.startsWith('file:')) {
      const { readFile } = await import(/* @vite-ignore */ 'node:fs/promises');
      return readFile(new URL(url));
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Unable to load Times New Roman for this form');
    return new Uint8Array(await response.arrayBuffer());
  })().catch(error => { cached.delete(url); throw error; }));
  return cached.get(url);
}
const parsedFonts = new WeakMap();
let fontkitPromise;
async function getFontkit() {
  if (!fontkitPromise) fontkitPromise = import('@pdf-lib/fontkit').then(module => module.default).catch(error => { fontkitPromise = undefined; throw error; });
  return fontkitPromise;
}
export async function preloadFormFonts(styles = ['regular', 'bold', 'italic']) {
  const [fontkit, ...data] = await Promise.all([getFontkit(), ...styles.map(style => loadFont(urls[style]))]);
  data.forEach(bytes => { if (!parsedFonts.has(bytes)) parsedFonts.set(bytes, fontkit.create(bytes)); });
}
export async function embedFormFonts(document, styles = ['regular', 'bold', 'italic']) {
  await preloadFormFonts(styles);
  const fontkit = await getFontkit();
  document.registerFontkit({ create: bytes => parsedFonts.get(bytes) || fontkit.create(bytes) });
  const entries = await Promise.all(styles.map(async style => [style, await document.embedFont(await loadFont(urls[style]), { subset: true })]));
  return Object.fromEntries(entries);
}
