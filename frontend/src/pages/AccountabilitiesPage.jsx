import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';

export default function AccountabilitiesPage({ title, description, formType }) {
  const [records, setRecords] = useState([]);

  const load = async () => {
    const { data } = await axios.get(`/accountabilities?formType=${formType}`);
    setRecords(data.data || []);
  };

  useEffect(() => {
    load();
  }, [formType]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-3">
          {records.map((record) => (
            <div key={record._id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{record.documentNumber}</div>
                  <div className="text-sm text-slate-500">{record.employee}</div>
                  <div className="text-sm text-slate-500">{record.office}</div>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {record.formType}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                <div>Inventory: {record.inventory?.item?.stockNumber || 'N/A'}</div>
                <div>Status: {record.active ? 'Active' : 'Closed'}</div>
                <div>Issue Date: {record.issueDate ? new Date(record.issueDate).toLocaleDateString() : 'N/A'}</div>
                <div>Property No.: {record.propertyNumber || 'N/A'}</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
