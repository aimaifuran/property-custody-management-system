import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await axios.get('/inventory');
      setInventory(data.data || []);
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Property Card</h1>
        <p className="text-sm text-slate-500">Overview of all inventory and property records.</p>
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-3">
          {inventory.map((item) => (
            <div key={item._id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{item.item?.description || 'Inventory item'}</div>
                  <div className="text-sm text-slate-500">{item.propertyNumber || 'No property number'} · {item.status}</div>
                </div>
                <div className="text-sm text-slate-500">Qty {item.quantity}</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
