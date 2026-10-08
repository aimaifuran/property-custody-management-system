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
const documentFonts = new WeakMap();
const measuredWidths = new WeakMap();
const WIDTH_CACHE_LIMIT = 4096;
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
  if (!documentFonts.has(document)) {
    document.registerFontkit({ create: bytes => parsedFonts.get(bytes) || fontkit.create(bytes) });
    documentFonts.set(document, new Map());
  }
  const embedded = documentFonts.get(document);
  const entries = await Promise.all(styles.map(async style => {
    if (!embedded.has(style)) {
      const pending = (async () => {
        const bytes = await loadFont(urls[style]);
        const font = await document.embedFont(bytes, { subset: true });
        if (!measuredWidths.has(bytes)) measuredWidths.set(bytes, new Map());
        const widths = measuredWidths.get(bytes);
        const measure = font.widthOfTextAtSize.bind(font);
        // Wrapping repeatedly measures the same captions, words and prefixes.
        // Widths belong to the immutable font data, so they can be reused by
        // separate documents without sharing their subset glyph encodings.
        font.widthOfTextAtSize = (value, size) => {
          if (typeof value !== 'string' || typeof size !== 'number' || !Number.isFinite(size)) return measure(value, size);
          const key = `${size}\u0000${value}`;
          if (widths.has(key)) {
            const width = widths.get(key);
            widths.delete(key); widths.set(key, width);
            return width;
          }
          const width = measure(value, size);
          widths.set(key, width);
          if (widths.size > WIDTH_CACHE_LIMIT) widths.delete(widths.keys().next().value);
          return width;
        };
        return font;
      })().catch(error => { embedded.delete(style); throw error; });
      embedded.set(style, pending);
    }
    return [style, await embedded.get(style)];
  }));
  return Object.fromEntries(entries);
}
