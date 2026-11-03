const Email = require('../models/WorkflowEmail');
const User = require('../models/User');
const mailer = require('./mailer');

const messages = {
  REQUESTED: ['Item request submitted', 'Your item request has been submitted for administrator review.'],
  ISSUED: ['Item request approved and issued', 'The administrator has approved and issued your item request.'],
  RETURNED: ['Item return confirmed', 'The administrator has confirmed receipt of your returned items and updated your remaining accountability.'],
};

function emailContent(event, record) {
  const [title, description] = messages[event];
  const reference = record.risNumber || record.prsNumber || String(record._id);
  const rows = (record.items || []).map(row => ({
    name: row.itemName || row.propertyPlantAndEquipment || 'Item',
    description: row.description || row.item || '?',
    quantity: `${(event === 'REQUESTED' ? row.quantityRequested : event === 'ISSUED' ? row.quantityIssued : row.quantity) ?? 0} ${row.unit || 'unit(s)'}`,
    remarks: row.remarks || record.remarks || record.note || (event === 'RETURNED' ? row.condition || 'Serviceable' : '?'),
  }));
  const page = event === 'RETURNED' ? '/my-returns' : '/my-issued-items';
  const base = String(process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://pais-v1.vercel.app' : 'http://localhost:5173')).replace(/\/$/, '');
  const url = `${base}${page}`;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const brand = 'PAMS of Supply Office Carigara, Leyte';
  const text = [brand, description, `Reference: ${reference}`, ...rows.map(row => `Item Name: ${row.name}\nDescription: ${row.description}\nQuantity: ${row.quantity}\nRemarks: ${row.remarks}`), `View your records: ${url}`].join('\n\n');
  const html = `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><h2 style="color:#0f5132">${brand}</h2><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p><p><strong>Reference:</strong> ${escapeHtml(reference)}</p>${rows.length ? `<table style="width:100%;border-collapse:collapse" border="1" cellpadding="8"><thead><tr>${['Item Name', 'Description', 'Quantity', 'Remarks'].map(label => `<th align="left">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${[row.name, row.description, row.quantity, row.remarks].map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Open ${event === 'RETURNED' ? 'Returned Items' : 'Issued Items'}</a></p><p>Sign in to PAMS to view your account records.</p></div>`;
  return { subject: `${brand}: ${title} (${reference})`, text, html };
}

async function queueWorkflowEmail(event, record, session) {
  if (event === 'REQUESTED' && !['DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'REVIEWED'].includes(record.status)) return;
  const userId = event === 'RETURNED'
    ? record.returnedBy?.user || record.submittedBy
    : record.requestedBy?.user || (!record.requestedBy?.offlineRecipient && record.receivedBy?.user);
  // Offline recipients never receive account email, even when names match.
  if (!userId || record.requestedBy?.offlineRecipient || record.returnedBy?.offlineRecipient) return;
  const user = await User.findOne({ _id: userId, role: 'user', deleted: false }).session(session || null);
  if (!user?.email) return;
  const plain = record.toObject ? record.toObject() : record;
  const RIS = require('../models/RequisitionIssueSlip');
  const Item = require('../models/Item');
  const sources = event === 'RETURNED' ? await RIS.find({ _id: { $in: (plain.items || []).map(row => row.ris).filter(Boolean) } }).session(session || null).lean() : [];
  const sourceRows = (plain.items || []).map(row => {
    const ris = sources.find(source => String(source._id) === String(row.ris));
    const issued = ris?.items.find(item => String(item._id) === String(row.risItem));
    return { ...row, itemName: row.itemName || issued?.itemName, stockNumber: row.stockNumber || issued?.stockNumber, remarks: row.remarks || issued?.remarks };
  });
  const stocks = await Item.find({ stockNumber: { $in: sourceRows.map(row => row.stockNumber).filter(Boolean) } }).session(session || null).lean();
  const content = emailContent(event, { ...plain, items: sourceRows.map(row => {
    const stock = stocks.find(item => item.stockNumber === row.stockNumber);
    return { ...row, itemName: row.itemName || stock?.name || (stock?.category !== 'General' ? stock?.category : '') || row.description || 'Item' };
  }) });
  await Email.updateOne({ eventKey: `${event}:${record._id}` }, {
    $setOnInsert: { eventKey: `${event}:${record._id}`, user: user._id, ...content, status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
  }, { upsert: true, session });
}

let running = false;
async function deliverWorkflowEmails() {
  if (running || !process.env.SMTP_HOST) return;
  running = true;
  try {
    for (let count = 0; count < 3; count++) {
      const now = new Date();
      const email = await Email.findOneAndUpdate({ $or: [
        { status: 'PENDING', nextAttemptAt: { $lte: now } },
        { status: 'SENDING', leaseUntil: { $lte: now } },
      ] }, { $set: { status: 'SENDING', leaseUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { returnDocument: 'after', sort: { createdAt: 1 } });
      if (!email) break;
      try {
        const user = await User.findOne({ _id: email.user, role: 'user', deleted: false });
        if (!user?.email) {
          await Email.updateOne({ _id: email._id }, { $set: { status: 'SKIPPED' }, $unset: { leaseUntil: 1 } });
          continue;
        }
        await mailer.sendWorkflowEmail(user, email);
        await Email.updateOne({ _id: email._id }, { $set: { status: 'SENT', sentAt: new Date() }, $unset: { leaseUntil: 1, lastError: 1 } });
      } catch (error) {
        await Email.updateOne({ _id: email._id }, { $set: { status: 'PENDING', nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(email.attempts - 1, 6))), lastError: String(error.code || 'EMAIL_DELIVERY_FAILED') }, $unset: { leaseUntil: 1 } });
      }
    }
  } catch (error) {
    // Email transport/storage failure must not turn a committed movement into an API failure.
    console.error('Workflow email delivery failed:', error.code || 'EMAIL_QUEUE_ERROR');
  } finally { running = false; }
}

module.exports = { queueWorkflowEmail, deliverWorkflowEmails, emailContent };
