import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoricalFormPdf } from '../src/utils/historicalFormPdf.js';

test('all official form titles are enlarged and centered inside the page', async () => {
  for (const type of ['IAR', 'PROPERTY CARD', 'RIS', 'ICS', 'PAR', 'PTR', 'PRS', 'RETURNED SUPPLY']) {
    const runs = [];
    await buildHistoricalFormPdf({ type, details: { items: [{ description: 'Printer', quantity: 1 }] } }, undefined, { onDraw: run => runs.push(run) });
    const title = runs.find(run => run.section === 'form title');
    assert.ok(title, type);
    assert.equal(title.size, 16, type);
    assert.ok(Math.abs(title.x + title.width / 2 - (title.bounds.x + title.bounds.width / 2)) < .01, `${type}: centered`);
    assert.ok(title.width < title.bounds.width, `${type}: fits the page`);
  }
});
