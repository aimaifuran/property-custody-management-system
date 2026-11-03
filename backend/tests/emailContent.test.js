const test = require('node:test');
const assert = require('node:assert/strict');
const { emailContent } = require('../src/utils/workflowEmails');

test('workflow email includes reference and separately labeled item details', () => {
  const result = emailContent('ISSUED', { _id: '1', risNumber: 'RIS-001', items: [{ itemName: 'Printer', description: 'Black <EPSON>', quantityIssued: 2, unit: 'PCS', remarks: 'Handle with care' }] });
  assert.match(result.subject, /PAMS of Supply Office Carigara, Leyte/);
  for (const text of ['Reference: RIS-001', 'Item Name: Printer', 'Description: Black <EPSON>', 'Quantity: 2 PCS', 'Remarks: Handle with care']) assert.ok(result.text.includes(text));
  assert.ok(result.html.includes('Black &lt;EPSON&gt;'));
  assert.ok(!result.html.includes('Black <EPSON>'));
  for (const label of ['Item Name', 'Description', 'Quantity', 'Remarks']) assert.ok(result.html.includes(`<th align="left">${label}</th>`));
});

test('sender name overrides old configured branding while keeping the configured mailbox', async t => {
  const nodemailer = require('nodemailer');
  const originalTransport = nodemailer.createTransport;
  const originalFrom = process.env.EMAIL_FROM;
  const modulePath = require.resolve('../src/utils/mailer');
  const originalModule = require.cache[modulePath];
  const sent = [];
  t.after(() => {
    nodemailer.createTransport = originalTransport;
    require.cache[modulePath] = originalModule;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
  });
  process.env.EMAIL_FROM = 'PAIS Supply Office <supply@example.test>';
  nodemailer.createTransport = () => ({ sendMail: async message => { sent.push(message); } });
  delete require.cache[modulePath];
  const mailer = require('../src/utils/mailer');
  await mailer.sendWorkflowEmail({ email: 'recipient@example.test' }, { _id: '1', subject: 'Test', text: 'Details', html: '<p>Details</p>' });
  assert.deepEqual(sent[0].from, { name: 'PAMS of Supply Office Carigara, Leyte', address: 'supply@example.test' });
});
