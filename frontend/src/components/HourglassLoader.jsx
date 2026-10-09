import './HourglassLoader.css';

// From Uiverse.io by SouravBandyopadhyay; scaled to fit the sign-in button.
export default function HourglassLoader() {
  return <span className="login-hourglass" aria-hidden="true">
    <span className="hourglassBackground">
      <span className="hourglassContainer">
        <span className="hourglassCurves" />
        <span className="hourglassCapTop" />
        <span className="hourglassGlassTop" />
        <span className="hourglassSand" />
        <span className="hourglassSandStream" />
        <span className="hourglassCapBottom" />
        <span className="hourglassGlass" />
      </span>
    </span>
  </span>;
}
