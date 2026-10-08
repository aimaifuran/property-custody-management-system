import './FormLoader.css';

// Laptop artwork adapted from Uiverse.io by Ashon-G.
export default function FormLoader({ label = 'Loading form...', fullScreen = false, overlay = false, loginTransition = false, className = '' }) {
  const classes = ['form-loader', fullScreen && 'form-loader--full-screen', overlay && 'form-loader--overlay', loginTransition && 'form-loader--login-transition', className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status" aria-live="polite" aria-atomic="true" aria-busy="true" data-form-loading="true">
      <div className="form-loader__content">
        <div className="form-loader__artwork" aria-hidden="true">
          <div className="form-loader__laptop">
            <div className="form-loader__screen-frame">
              <div className="form-loader__display">
                <div className="form-loader__progress" />
              </div>
            </div>
            <div className="form-loader__base">
              <div className="form-loader__keyboard-frame">
                <div className="form-loader__keyboard">
                  <div className="form-loader__touchbar" />
                  <ul className="form-loader__key-box">
                    {Array.from({ length: 13 }, (_, index) => <li key={index} className={`form-loader__key form-loader__key--${String(index + 1).padStart(2, '0')}`} />)}
                  </ul>
                  <ul className="form-loader__key-box-bottom">
                    {Array.from({ length: 11 }, (_, index) => <li key={index} className={`form-loader__key form-loader__key--${String(index + 14).padStart(2, '0')}`} />)}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="form-loader__label">{label}</p>
      </div>
    </div>
  );
}
