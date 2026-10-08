import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFArray, PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib';
import { buildHistoricalFormPdf } from '../src/utils/historicalFormPdf.js';

const loadTemplate = path => readFile(new URL(`../public${path}`, import.meta.url));
const sample = {
  entityName: 'LGU Carigara', iarNumber: '001', inspectedBy: 'Dion Mark Bolido', acceptedBy: 'Catherine Lagera',
  items: [{ stockNumber: '003', description: 'Printer', unit: 'Pieces', quantity: 2 }],
};
const streamText = stream => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
function pageDrawing(document, page) {
  const contents = page.node.lookup(PDFName.of('Contents'));
  const references = contents instanceof PDFArray ? contents.asArray() : [contents];
  return references.map(reference => streamText(document.context.lookup(reference))).join('\n');
}
function boxes(content) {
  return Array.from(content.matchAll(/0\.65 w\s+\[\] 0 d\s+1 0 0 1 ([\d.]+) ([\d.]+) cm\s+(?:1 0 0 1 0 0 cm\s+){2}0 0 m\s+0 11 l\s+11 11 l\s+11 0 l\s+h\s+S/g), match => ({ x: Number(match[1]), y: Number(match[2]), width: 11, height: 11 }));
}
function marks(content) {
  return Array.from(content.matchAll(/\b1 w\s+\[\] 0 d\s+([\d.]+) ([\d.]+) m\s+\1 \2 m\s+([\d.]+) ([\d.]+) l\s+S/g), match => ({ start: { x: Number(match[1]), y: Number(match[2]) }, end: { x: Number(match[3]), y: Number(match[4]) } }));
}
const make = async (details, options) => PDFDocument.load(await buildHistoricalFormPdf({ type: 'IAR', details: { ...sample, ...details } }, loadTemplate, options));

test('IAR PDF aligns all three boxes with the first line of their official captions', async () => {
  const runs = [];
  const document = await make({ acceptanceStatus: 'Complete' }, { onDraw: run => runs.push(run) });
  assert.deepEqual(document.getPage(0).getSize(), { width: 595.28, height: 841.89 });
  assert.equal(document.getForm().getFields().length, 0);
  const aligned = boxes(pageDrawing(document, document.getPage(0)));
  assert.equal(aligned.length, 3);
  for (const [index, section] of ['inspection', 'Complete', 'Partial'].entries()) {
    const caption = runs.find(run => run.section === section);
    assert.ok(caption, `${section}: official caption preserved`);
    const center = caption.y + caption.ascent - caption.height / 2;
    const box = aligned[index];
    assert.ok(Math.abs(box.y + box.height / 2 - center) < 0.001, 'box and printed text share a vertical center');
    assert.ok(caption.x - box.x - box.width >= 7.99, 'box has a clear gap before the text');
  }
});

test('IAR marks only the saved acceptance choice and keeps blank choices empty', async () => {
  for (const status of ['Complete', 'Partial', '']) {
    const document = await make({ acceptanceStatus: status });
    const content = pageDrawing(document, document.getPage(0));
    const selected = marks(content);
    assert.equal(selected.length, status ? 2 : 0, status);
    if (!status) continue;
    const box = boxes(content)[status === 'Complete' ? 1 : 2];
    for (const line of selected) for (const point of [line.start, line.end]) {
      assert.ok(point.x > box.x && point.x < box.x + box.width);
      assert.ok(point.y > box.y && point.y < box.y + box.height, 'checkmark stays inside its selected checkbox');
    }
  }
});

test('IAR continuation pages retain aligned acceptance boxes and the saved choice', async () => {
  const document = await make({ acceptanceStatus: 'Partial', items: Array.from({ length: 32 }, (_, index) => ({ stockNumber: `0${index}`, description: `Item ${index}`, quantity: 1 })) });
  assert.equal(document.getPageCount(), 2);
  const firstBoxes = boxes(pageDrawing(document, document.getPage(0)));
  for (const page of document.getPages()) {
    const content = pageDrawing(document, page);
    assert.deepEqual(boxes(content), firstBoxes);
    const selected = marks(content);
    assert.equal(selected.length, 2);
    assert.ok(selected.every(line => line.start.y > firstBoxes[2].y && line.start.y < firstBoxes[2].y + firstBoxes[2].height));
  }
});
