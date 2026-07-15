import { motion } from 'framer-motion';

export default function WorkflowPlaceholderPage({ title, description }) {
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
        <p className="text-slate-600">This workflow page is available in the navigation and will be expanded next.</p>
      </motion.div>
    </div>
  );
}
