import toast from 'react-hot-toast';
import { getOfficialFormPdf } from './formPdfCache';

export async function exportOfficialFormPdf(type, details, print = false) {
  const popup = print ? window.open('', '_blank') : null;
  if (print && !popup) return toast.error('Allow pop-ups to open the printable form.');
  if (popup) {
    popup.document.title = `${type} - Print`;
    const style = popup.document.createElement('style');
    style.textContent = '@keyframes pulse{50%{opacity:.45}} .print-skeleton{background:#e2e8f0;border-radius:6px;height:24px;margin:16px 0;animation:pulse 1s ease-in-out infinite}';
    popup.document.head.appendChild(style);
    const status = popup.document.createElement('main'); status.id = 'preparing-form';
    status.style.cssText = 'max-width:700px;margin:48px auto;padding:24px';
    status.setAttribute('role', 'status'); status.setAttribute('aria-label', 'Preparing printable form');
    for (const width of ['60%', '100%', '100%']) { const bar = popup.document.createElement('div'); bar.className = 'print-skeleton'; bar.style.width = width; status.appendChild(bar); }
    popup.document.body.appendChild(status);
  }
  try {
    const bytes = await getOfficialFormPdf({ type, details });
    if (print && popup.closed) return;
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (print) {
      popup.document.title = `${type} - Print`;
      const frame = popup.document.createElement('iframe');
      frame.title = `Printable ${type}`;
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
      frame.onload = () => { popup.document.getElementById('preparing-form')?.remove(); try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* PDF toolbar still offers printing. */ } };
      frame.src = url;
      popup.document.body.appendChild(frame);
      popup.addEventListener('beforeunload', () => URL.revokeObjectURL(url), { once: true });
    } else {
      const link = document.createElement('a'); link.href = url;
      link.download = `${type}.pdf`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (error) { popup?.close(); toast.error(error.message || 'Unable to generate the official form PDF'); }
}
