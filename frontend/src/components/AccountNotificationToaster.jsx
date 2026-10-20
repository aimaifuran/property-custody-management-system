import { useLayoutEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';

export default function AccountNotificationToaster({ toasterId = 'account-feedback' }) {
  const [position, setPosition] = useState({ top: 96, right: 16 });
  useLayoutEffect(() => {
    const trigger = document.querySelector('[aria-controls="header-account-menu"]');
    const update = () => {
      const bounds = trigger?.getBoundingClientRect();
      if (bounds) setPosition({ top: bounds.bottom + 12, right: Math.max(12, window.innerWidth - bounds.right) });
    };
    update();
    const observer = new ResizeObserver(update);
    if (trigger) observer.observe(trigger.closest('header') || trigger);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  return <Toaster toasterId={toasterId} position="top-right" containerStyle={{ position: 'fixed', ...position, left: 'auto', bottom: 'auto', width: 'min(380px, calc(100vw - 32px))', background: 'transparent', border: 0, boxShadow: 'none', pointerEvents: 'none', zIndex: 10000 }} toastOptions={{ style: { maxWidth: 'min(380px, calc(100vw - 32px))' } }} />;
}
