import { Link } from 'react-router-dom';
import { BookOpen, CircleHelp, ClipboardCheck, FileCheck2, FileText, KeyRound, LifeBuoy, PackageCheck, Printer, RotateCcw, Search, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Section = ({ id, title, icon: Icon, children }) => (
  <section id={id} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-800"><Icon size={20} className="text-emerald-700" aria-hidden="true" />{title}</h2>
    <div className="space-y-3 text-sm leading-6 text-slate-700">{children}</div>
  </section>
);

const Steps = ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>;

export default function UserManualPage() {
  const { user } = useAuth();
  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="rounded-2xl bg-emerald-950 p-6 text-white shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <BookOpen size={28} className="mt-1 shrink-0 text-emerald-200" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-200">Help and reference</p>
          <h1 className="mt-1 text-3xl font-bold">PAMS User Manual</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/85">Use this guide to navigate the Property Accountability Management System, complete the available forms, understand common actions, and resolve frequent issues. Menu items and actions depend on your account role and permissions.</p>
        </div>
      </div>
    </header>

    <nav aria-label="User manual sections" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-800">Jump to a topic</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ['navigation', 'Navigation'], ['buttons', 'Buttons and records'], ['forms', 'Forms and workflows'],
          ['reports', 'Reports'], ['troubleshooting', 'Troubleshooting'], ['password', 'Forgot password'],
        ].map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-lg border border-emerald-200 px-3 py-1.5 font-medium text-emerald-800 hover:bg-emerald-50">{label}</a>)}
      </div>
    </nav>

    <Section id="navigation" title="Navigation and accounts" icon={Search}>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Dashboard:</strong> administrators with access can review system summaries, charts, and recent activity.</li>
        <li><strong>Issue:</strong> opens the forms used for incoming deliveries, stock/property history, requisitions, and accountability receipts: IAR, Property Card, RIS, ICS, and PAR.</li>
        <li><strong>Property Transfer Report (PTR):</strong> records or processes a transfer of an accountable item between custodians.</li>
        <li><strong>Property Return Slip (PRS):</strong> lets authorized staff record and confirm returned items and their condition.</li>
        <li><strong>Reports:</strong> includes List of PPEs and Monthly Reports. Administrators may also see Historical Records, depending on permissions.</li>
        <li><strong>User Manual:</strong> opens this guide. It is available to signed-in administrators.</li>
        <li><strong>User menu:</strong> use the menu in the top bar to open My Profile, User Management or System Settings (where permitted), or to log out.</li>
        <li><strong>User accounts:</strong> users can see their Issued Items and Returned Items in the navigation. These pages show account-specific information and available actions.</li>
      </ul>
      <p>On a narrow screen, open or close the sidebar with the menu button. A section with a chevron expands or collapses its submenu.</p>
    </Section>

    <Section id="buttons" title="Common buttons and saved records" icon={FileText}>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>New / Add row:</strong> starts a new record or adds an item row to a form. Complete all required fields in each populated row.</li>
        <li><strong>Save / Submit:</strong> validates and saves the form. Wait for the success message before leaving the page.</li>
        <li><strong>Close / Cancel:</strong> closes the editor. Unsaved changes may be lost.</li>
        <li><strong>Delete row:</strong> removes that item row from the form; it does not delete a previously saved record.</li>
        <li><strong>Search and page controls:</strong> filter saved records, change the number shown when available, and move between result pages. Clear the search to see all records again.</li>
        <li><strong>Edit / View Form:</strong> Edit opens a record for permitted corrections. View Form opens the displayed form; some fields or actions may be read-only when the record is linked to stock, issued to a custodian, or already accepted.</li>
        <li><strong>PDF / Print:</strong> prepares the official-form output. Print opens the browser print dialog; choose a printer or save to PDF there.</li>
        <li><strong>Refresh / Retry:</strong> reloads current records after a network or loading problem.</li>
        <li><strong>Required fields:</strong> a red asterisk marks required information. Browser validation may move focus to the first field that needs attention.</li>
      </ul>
    </Section>

    <Section id="forms" title="Forms and workflows" icon={ClipboardCheck}>
      <div className="space-y-4">
        <article>
          <h3 className="font-semibold text-slate-800"><FileCheck2 size={16} className="mr-2 inline text-emerald-700" aria-hidden="true" />Inspection and Acceptance Report (IAR)</h3>
          <p>Administrators record a delivery after inspection: supplier, PO/JO and invoice references, dates, stock/property number, item name, description, serial number when applicable, unit, quantity, and cost. For partial acceptance, enter accepted quantities as requested by the form. Saving an accepted IAR records received stock. Use the row controls to add or remove delivery rows.</p>
        </article>
        <article>
          <h3 className="font-semibold text-slate-800"><PackageCheck size={16} className="mr-2 inline text-emerald-700" aria-hidden="true" />Property Card</h3>
          <p>Use the Property Card to find an item and review its receipt and movement history. Search or filter the stock list, select View Property Card, and review dated transactions such as receipt, issuance, return, or transfer. The ledger is a history view; correct the source transaction through its workflow rather than editing the ledger.</p>
        </article>
        <article>
          <h3 className="font-semibold text-slate-800"><ClipboardCheck size={16} className="mr-2 inline text-emerald-700" aria-hidden="true" />Requisition and Issue Slip (RIS)</h3>
          <p>A requester selects available stock, enters requested quantities and purpose, and submits the request. Authorized staff review it, adjust or approve it according to the workflow, and issue approved quantities. Users can track request status in Issued Items; an approved request is not yet an issued item until issuance is completed.</p>
        </article>
        <article>
          <h3 className="font-semibold text-slate-800"><PackageCheck size={16} className="mr-2 inline text-emerald-700" aria-hidden="true" />Inventory Custodian Slip (ICS) and Property Acknowledgement Receipt (PAR)</h3>
          <p>These forms record accountable property issued to a custodian. Check the recipient, document number, item identity, quantity, cost, and signatories. A user must accept the receipt before the item is available for custody actions. In an ICS View Form, Estimated Useful Life can be corrected and saved; other fields remain read-only in that view.</p>
        </article>
        <article>
          <h3 className="font-semibold text-slate-800"><RotateCcw size={16} className="mr-2 inline text-emerald-700" aria-hidden="true" />Property Transfer Report (PTR)</h3>
          <p>Users select an available item already accepted under their account, choose a receiving custodian, provide a reason, and submit the transfer request. The receiving user confirms physical receipt; authorized staff complete approval. An item with a pending movement cannot be transferred again. Administrators can use the PTR form to record or update permitted transfer details.</p>
        </article>
        <article>
          <h3 className="font-semibold text-slate-800"><RotateCcw size={16} className="mr-2 inline text-emerald-700" aria-hidden="true" />Property Return Slip (PRS) and return requests</h3>
          <p>Users can request a return from Issued Items. The item remains assigned until an administrator records and confirms the return. When processing a return, select the received quantity and condition. Serviceable items return to available stock; unserviceable items remain in return history and are not available for reuse. Check Returned Items or the user account’s View Records to track confirmed returns.</p>
        </article>
        <article>
          <h3 className="font-semibold text-slate-800"><Users size={16} className="mr-2 inline text-emerald-700" aria-hidden="true" />User Management and My Profile</h3>
          <p>Administrators use User Management to review accounts, registration requests, user records, and password recovery requests. Users can view their account details in My Profile. Administrators can edit their own profile and upload a profile picture where those controls are available.</p>
        </article>
        <article>
          <h3 className="font-semibold text-slate-800"><Users size={16} className="mr-2 inline text-emerald-700" aria-hidden="true" />Administrator tools</h3>
          <p>Where enabled, Suppliers stores vendor contact details; Offline Records stores recipients who do not have a login account and lets staff request stock or view their issued/returned records. System Settings lets administrators maintain names and designations used as signatories on new forms. User Management includes account creation/editing, registration review, account record viewing, and password-reset request review.</p>
        </article>
      </div>
      <p className="rounded-lg bg-amber-50 p-3 text-amber-900"><strong>Important:</strong> the application may lock stock identity, quantities, costs, or document numbers after issuance or acceptance. Use the relevant stock, return, or transfer workflow for movements; do not try to bypass a read-only field.</p>
    </Section>

    <Section id="reports" title="Reports and downloads" icon={Printer}>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>List of PPEs:</strong> view the PPE list for the selected reporting context and use the page’s available filters or download controls.</li>
        <li><strong>Monthly Reports:</strong> choose the reporting month and review or export the month’s recorded items using the controls shown on the page.</li>
        <li><strong>Historical Records:</strong> administrators with access can search historical forms, open a record preview, inspect related transaction history, and download a PDF.</li>
        <li><strong>PDF and Print:</strong> if the output does not appear, allow pop-ups for the site, check browser downloads, or use the print dialog’s “Save as PDF” option.</li>
      </ul>
    </Section>

    <Section id="troubleshooting" title="Troubleshooting" icon={LifeBuoy}>
      <div className="space-y-3">
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer font-semibold text-slate-800">A button or page is missing or disabled</summary>
          <p className="mt-2">Available menus depend on role and permissions. Some actions also require a record to be selected or a workflow to reach the right status. Ask an administrator to verify your account role and permissions; do not use another person’s account.</p>
        </details>
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer font-semibold text-slate-800">I cannot save a form</summary>
          <p className="mt-2">Complete every required field and populated item row. Check that quantities and costs are valid, required choices are selected, and the item is still available. Read the validation message, correct the highlighted field, then try Save again. If the record is already issued or accepted, some details may intentionally be locked.</p>
        </details>
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer font-semibold text-slate-800">An item, report, or recent update is not showing</summary>
          <p className="mt-2">Clear the search, check other result pages, and use Refresh. Confirm the item was saved or issued and that you are viewing the correct account. User pages show only records associated with that user; pending requests are not the same as issued items.</p>
        </details>
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer font-semibold text-slate-800">A transfer or return is still pending</summary>
          <p className="mt-2">Transfers may need the receiving user to confirm and an administrator to approve. A return request stays pending until an administrator records receipt and condition. Refresh the relevant Issued Items, Returned Items, or User Management record view to check its latest status.</p>
        </details>
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer font-semibold text-slate-800">A report or PDF will not load</summary>
          <p className="mt-2">Use Retry or Refresh, check your network connection, and try again. For printing or PDF output, allow the browser to open the print window and check the browser’s downloads. If the error continues, note the page, action, and error message and contact an administrator.</p>
        </details>
      </div>
    </Section>

    <Section id="password" title="Forgot your password?" icon={KeyRound}>
      <Steps>
        <li>On the sign-in page, choose <strong>Forgot Password</strong>.</li>
        <li>Enter the email address registered to your account and request a verification code.</li>
        <li>Check your inbox and spam/junk folder. Enter the six-digit code before it expires (10 minutes).</li>
        <li>Enter and confirm a new password of at least eight characters, then choose Verify Code and Update Password.</li>
        <li>If needed, choose Send a new code. A new code replaces the previous one. You can also choose Use a different email.</li>
      </Steps>
      <p>If no email arrives, verify that you used the registered email and check spam. Ask an administrator to confirm your account email or help with delivery. Recovery does not unlock accounts locked by an administrator or inactivity; contact an administrator for those locks.</p>
      <p>New users can choose Register on the sign-in page and submit their details for administrator approval. If registration is still pending, contact the administrator before trying to sign in.</p>
      <p className="rounded-lg bg-sky-50 p-3 text-sky-900"><ShieldCheck size={16} className="mr-2 inline" aria-hidden="true" />Never share your password or verification code with anyone, including people claiming to provide support.</p>
    </Section>

    <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
      <span><CircleHelp size={16} className="mr-2 inline text-emerald-700" aria-hidden="true" />Still need help? Contact your system administrator and include the page name and exact error message.</span>
      <Link to={user?.role === 'admin' ? '/dashboard' : '/my-issued-items'} className="font-semibold text-emerald-800 hover:underline">{user?.role === 'admin' ? 'Back to dashboard' : 'Back to issued items'}</Link>
    </footer>
  </div>;
}
