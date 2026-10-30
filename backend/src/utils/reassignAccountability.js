const crypto = require('crypto');
const Card = require('../models/PropertyCard');
const ICS = require('../models/InventoryCustodianSlip');
const PAR = require('../models/PropertyAcknowledgementReceipt');
const Property = require('../models/Property');
const { reserveDocumentNumber } = require('./documentNumber');
const { accountName } = require('./accountLinks');

module.exports = async function reassignAccountability({ row, receiver, report, entry, actor, session, date, acceptedAt }) {
  const remaining = row.quantity - Number(row.returnedQuantity || 0);
  const Model = row.formType === 'ICS' ? ICS : PAR;
  const field = row.formType === 'ICS' ? 'icsNumber' : 'parNumber';
  const number = await reserveDocumentNumber(Model, field, date, session);
  const source = row.issuanceForm ? await Model.findById(row.issuanceForm).session(session) : null;
  const receiverName = accountName(receiver);
  const receiptDate = acceptedAt || date;
  const receivedBy = {
    name: report.receivedBy?.name || receiverName,
    position: report.receivedBy?.designation || receiver.office,
    date: receiptDate,
  };
  const [form] = await Model.create([{
    [field]: number,
    ris: row.ris,
    user: receiver._id,
    entityName: report.entityName || source?.entityName,
    fundCluster: report.fundCluster || source?.fundCluster,
    office: receiver.office,
    acceptedAt: receiptDate,
    acceptedBy: receiver._id,
    remarks: `Transfer ${report.ptrNumber}; previous ${row.formType} ${row.documentNumber}`,
    receivedBy,
    ...(row.formType === 'ICS'
      ? { receivedFrom: { name: row.employee, position: row.office, date } }
      : { issuedBy: { name: accountName(actor), position: actor.office, date } }),
    items: [row.formType === 'ICS' ? {
      inventory: row.inventory._id,
      property: row.inventory.property,
      serialNumber: row.inventory.serialNumber,
      quantity: remaining,
      unit: row.inventory.item?.unit,
      description: entry.description,
      unitCost: row.inventory.unitCost,
      totalCost: remaining * row.inventory.unitCost,
      inventoryItemNo: row.propertyNumber || row.inventory.item?.stockNumber,
    } : {
      inventory: row.inventory._id,
      property: row.inventory.property,
      serialNumber: row.inventory.serialNumber,
      quantity: remaining,
      unit: row.inventory.item?.unit,
      description: entry.description,
      propertyNumber: row.propertyNumber || row.inventory.item?.stockNumber,
      dateAcquired: row.inventory.purchaseDate,
      unitCost: row.inventory.unitCost,
      amount: remaining * row.inventory.unitCost,
    }],
  }], { session });

  row.transferHistory.push({
    from: row.user,
    to: receiver._id,
    ptr: report._id,
    fromDocumentNumber: row.documentNumber,
    toDocumentNumber: number,
    date,
  });
  row.user = receiver._id;
  row.employee = receiverName;
  row.office = receiver.office;
  row.issuanceForm = form._id;
  row.documentNumber = number;
  row.acceptedAt = receiptDate;
  row.acceptedBy = receiver._id;
  row.pendingMovement = undefined;
  row.signatureHash = crypto.createHash('sha256')
    .update(JSON.stringify({ form: String(form._id), user: String(receiver._id), acceptedAt: receiptDate, ptr: String(report._id) }))
    .digest('hex');
  await row.save({ session });

  if (row.inventory.property) {
    await Property.findByIdAndUpdate(row.inventory.property, {
      $set: { status: 'TRANSFERRED', currentCustodian: { name: receiverName, office: receiver.office, assignedDate: date } },
      $push: { events: { action: 'Transferred', status: 'TRANSFERRED', custodian: receiverName, office: receiver.office, remarks: report.ptrNumber } },
    }, { session });
  }
  row.inventory.status = 'TRANSFERRED';
  await row.inventory.save({ session });
  await Card.updateMany({ deleted: false, 'items.inventory': row.inventory._id }, {
    $push: { items: {
      sourceType: 'PTR',
      sourceDocument: report._id,
      sourceDate: report.date,
      sourceRemarks: report.remarks || report.reasonForTransfer,
      inventory: row.inventory._id,
      property: row.inventory.property,
      serialNumber: row.inventory.serialNumber,
      propertyNumber: row.propertyNumber || row.inventory.item?.stockNumber,
      description: entry.description,
      date,
      referenceParNo: number,
      receiptQuantity: 0,
      itdQuantity: entry.returnSlip ? remaining : 0,
      itdOfficeOfficer: receiverName,
      balanceQuantity: row.inventory.item?.quantityOnHand || 0,
      amount: remaining * row.inventory.unitCost,
      remarks: `PTR ${report.ptrNumber}: ${report.fromAccountableOfficer} to ${report.toAccountableOfficer}`,
    } },
  }, { session });
  return form;
};
