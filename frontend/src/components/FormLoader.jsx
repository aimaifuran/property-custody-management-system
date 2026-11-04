import './FormLoader.css';

// Responsive-device animation adapted from Uiverse.io by Nawsome.
export default function FormLoader({ label = 'Loading...', fullScreen = false, overlay = false, loginTransition = false, className = '' }) {
  const classes = ['form-loader', fullScreen && 'form-loader--full-screen', overlay && 'form-loader--overlay', loginTransition && 'form-loader--login-transition', className].filter(Boolean).join(' ');
  return <div className={classes} role="status" aria-live="polite" aria-label={label} aria-busy="true" data-form-loading="true">
    <div className="device-loader" aria-hidden="true"><div /><div /><div /></div>
    <span className="sr-only">{label}</span>
  </div>;
}
