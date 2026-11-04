import './SpeedLoader.css';

// Animation adapted from Uiverse.io by anand_4957.
export default function SpeedLoader() {
  return <span className="signin-speed" aria-hidden="true">
    <span className="signin-speed__scene">
      <span className="signin-speed__rider"><span className="signin-speed__trail"><span /><span /><span /><span /></span><span className="signin-speed__base"><span /><span className="signin-speed__face" /></span></span>
      <span className="signin-speed__lines"><span /><span /><span /><span /></span>
    </span>
  </span>;
}
