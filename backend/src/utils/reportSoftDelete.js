// Reports also participate in the reversible sample-data reset.
module.exports = function reportSoftDelete(schema) {
  schema.add({ deleted: { type: Boolean, default: false } });
  schema.pre(/^find/, function () {
    if (this.getFilter().deleted === undefined) this.where({ deleted: { $ne: true } });
  });
};
