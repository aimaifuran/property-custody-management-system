import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib';
const name = PDFName.of;
const streamText = stream => Array.from(decodePDFRawStream(stream).decode(), byte => String.fromCharCode(byte)).join('');

// Templates can keep captions inside nested Form XObjects. Walk those resources
// too, keeping all table lines and coordinates while changing font encodings.
export function useTimesNewRomanInTemplate(document, fonts) {
  const mappings = new Map();
  const processed = new Set();
  const fontMapping = resources => {
    if (mappings.has(resources)) return mappings.get(resources);
    const replacements = new Map();
    mappings.set(resources, replacements);
    const dictionary = resources?.lookupMaybe(name('Font'), PDFDict);
    if (!dictionary) return replacements;
    for (const [key, reference] of dictionary.entries()) {
      const original = document.context.lookup(reference);
      if (!(original instanceof PDFDict)) continue;
      const base = original.get(name('BaseFont'))?.toString() || '';
      if (base.includes('TimesNewRoman')) continue;
      const font = /bold|elephant/i.test(base) ? fonts.bold : /italic|oblique/i.test(base) ? fonts.italic : fonts.regular;
      const characters = new Map();
      const unicode = original.lookupMaybe(name('ToUnicode'), PDFRawStream);
      if (unicode) {
        const cmap = streamText(unicode);
        for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
          for (const pair of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) {
            const value = pair[2].match(/.{4}/g)?.map(hex => String.fromCharCode(parseInt(hex, 16))).join('');
            if (value) characters.set(parseInt(pair[1], 16), value);
          }
        }
      }
      replacements.set(key.decodeText(), { font, characters });
      dictionary.set(key, font.ref);
    }
    return replacements;
  };
  const visit = (resources, references) => {
    const replacements = fontMapping(resources);
    for (const reference of references) {
      const stream = document.context.lookup(reference);
      if (!(stream instanceof PDFRawStream) || processed.has(reference.toString())) continue;
      processed.add(reference.toString());
      let current;
      const updated = streamText(stream).replace(/\/([^\s]+)\s+[\d.]+\s+Tf\b|\((?:\\[\s\S]|[^\\()])*\)|<[\da-f\s]+>/gi, (token, fontName) => {
        if (fontName) { current = replacements.get(fontName); return token; }
        if (!current) return token;
        const bytes = token.startsWith('(') ? PDFString.of(token.slice(1, -1)).asBytes() : Uint8Array.from(token.slice(1, -1).replace(/\s/g, '').match(/.{1,2}/g) || [], hex => parseInt(hex, 16));
        const value = Array.from(bytes, byte => current.characters.get(byte) || new TextDecoder('windows-1252').decode(Uint8Array.of(byte))).join('');
        return current.font.encodeText(value).toString();
      });
      const attributes = Object.fromEntries(stream.dict.entries().filter(([key]) => !['/Length', '/Filter', '/DecodeParms'].includes(key.toString())).map(([key, value]) => [key.decodeText(), value]));
      document.context.assign(reference, document.context.flateStream(Uint8Array.from(updated, character => character.charCodeAt(0)), attributes));
    }
    const objects = resources?.lookupMaybe(name('XObject'), PDFDict);
    for (const [, reference] of objects?.entries() || []) {
      const stream = document.context.lookup(reference);
      if (!(stream instanceof PDFRawStream) || stream.dict.get(name('Subtype'))?.toString() !== '/Form' || processed.has(reference.toString())) continue;
      visit(stream.dict.lookupMaybe(name('Resources'), PDFDict) || resources, [reference]);
    }
  };
  for (const page of document.getPages()) {
    const contents = page.node.lookup(name('Contents'));
    visit(page.node.Resources(), contents instanceof PDFArray ? contents.asArray() : contents ? [page.node.get(name('Contents'))] : []);
  }
}
