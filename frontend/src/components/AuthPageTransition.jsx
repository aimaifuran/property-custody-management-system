import { Outlet } from 'react-router-dom';

export default function AuthPageTransition() {
  return <div className="auth-transition-layout">
    <Outlet />
  </div>;
}
