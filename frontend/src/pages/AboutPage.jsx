import { Archive, ArrowLeftRight, ClipboardCheck, Info, ShieldCheck, Users } from 'lucide-react';
import './UsersPage.css';
import DeveloperProfiles from '../components/DeveloperProfiles';

const developers = [
  'Cherie Mae Francisco',
  'Catherine L. Lagera',
  'Ivy B. Peñaranda',
  'Nicole Jeremiah Acuin',
  'Dion Mark L. Balida',
];

const features = [
  { icon: Archive, title: 'Property records', text: 'Organize property and supply records, including item descriptions, quantities, and accountability documents.' },
  { icon: ClipboardCheck, title: 'Issuance and accountability', text: 'Record issued items through Requisition and Issue Slips (RIS), Inventory Custodian Slips (ICS), and Property Acknowledgement Receipts (PAR).' },
  { icon: ArrowLeftRight, title: 'Transfers and returns', text: 'Track changes in custody and returned items through Property Transfer Reports (PTR), Property Return Slips (PRS), and returned supply records.' },
  { icon: Users, title: 'Account access', text: 'Administrators manage records and user accounts. Office users can view their issued items, track their return records, and submit return requests.' },
];

export default function AboutPage() {
  return <div className="user-management-page space-y-6">
    <header className="user-management-header">
      <div className="user-management-heading"><span className="user-management-eyebrow"><Info size={14} aria-hidden="true" />ABOUT THE SYSTEM</span><h1>About PAMS</h1><p>Property Accountability Management System</p></div>
    </header>
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm" aria-labelledby="about-overview">
      <h2 id="about-overview" className="text-xl font-semibold text-emerald-950">What is PAMS?</h2>
      <p className="mt-3 leading-relaxed text-slate-600">PAMS is a property accountability management system for the Supply Office of the Local Government Unit of Carigara. It brings property, supply, issuance, transfer, and return records together so administrators and office users can follow the items assigned to each account.</p>
      <dl className="mt-4 border-t border-emerald-100 pt-4"><dt className="text-sm text-slate-500">Year Created</dt><dd className="mt-1 font-semibold text-emerald-950">2026</dd></dl>
    </section>
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm" aria-labelledby="about-purpose">
      <h2 id="about-purpose" className="flex items-center gap-2 text-xl font-semibold text-emerald-950"><ShieldCheck size={22} aria-hidden="true" />Purpose</h2>
      <p className="mt-3 leading-relaxed text-slate-600">The system aims to keep property records organized, make accountability easier to trace, and help the Supply Office monitor issued, transferred, and returned items. Keeping these records in one place supports accurate reporting and helps staff review who holds an item and what has happened to it.</p>
    </section>
    <section aria-labelledby="about-features"><h2 id="about-features" className="mb-4 text-xl font-semibold text-emerald-950">Main functions</h2><div className="grid gap-4 md:grid-cols-2">{features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm"><Icon size={24} className="mb-3 text-emerald-700" aria-hidden="true" /><h3 className="font-semibold text-emerald-950">{title}</h3><p className="mt-2 leading-relaxed text-slate-600">{text}</p></article>)}</div></section>
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm" aria-labelledby="about-developers">
      <h2 id="about-developers" className="flex items-center gap-2 text-xl font-semibold text-emerald-950"><Users size={22} aria-hidden="true" />Developers</h2>
      <p className="mt-2 text-slate-600">The team behind the Property Accountability Management System.</p>
      <DeveloperProfiles developers={developers} />
    </section>
  </div>;
}
