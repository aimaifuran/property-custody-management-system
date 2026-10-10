// Round each row to currency precision before summing document amounts.
const roundAmount = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const lineAmount = (quantity, unitCost) => roundAmount(Number(quantity || 0) * Number(unitCost || 0));
const sumAmounts = values => roundAmount(values.reduce((sum, value) => sum + Number(value || 0), 0));

function installAmountCalculation(schema, field) {
  const calculate = items => {
    for (const item of items || []) {
      // Legacy PAR rows store a complete row amount without a unit cost.
      if (field === 'totalCost' || item.unitCost != null) item[field] = lineAmount(item.quantity, item.unitCost);
    }
  };
  schema.pre('validate', function () { calculate(this.items); });
  schema.pre('findOneAndUpdate', function () {
    const update = this.getUpdate();
    calculate(update.$set?.items || update.items);
  });
}
module.exports = { roundAmount, lineAmount, sumAmounts, installAmountCalculation };
