import { useState } from 'react';

import { useAuth } from '../contexts/AuthContext';

import { Link, useNavigate } from 'react-router-dom';

import { motion } from 'framer-motion';

import { toast } from 'react-hot-toast';

import LoginIllustration from '../components/LoginIllustration';



export default function LoginPage() {

  const [identifier, setIdentifier] = useState('admin');

  const [password, setPassword] = useState('Admin123!');

  const [rememberMe, setRememberMe] = useState(true);

  const { login } = useAuth();

  const navigate = useNavigate();



  const handleSubmit = async (e) => {

    e.preventDefault();

    try {

      await login(identifier, password, rememberMe);

      navigate('/dashboard');

    } catch (error) {

      toast.error(error.response?.data?.message || 'Login failed');

    }

  };



  return (

    <div className="login-page flex min-h-screen items-center justify-center px-3 py-4 md:px-4 md:py-10 text-white">

      <div className="login-page__wash" aria-hidden="true" />

      <motion.div

        initial={{ opacity: 0, y: 24 }}

        animate={{ opacity: 1, y: 0 }}

        className="login-card-shell w-full max-w-sm md:max-w-4xl"

      >

        <div className="login-card login-card--split w-full overflow-hidden rounded-2xl md:rounded-3xl">

        <div className="login-card__illustration login-illustration" aria-hidden="true">

          <LoginIllustration />

        </div>

        <div className="login-card__form p-5 sm:p-6 md:p-9">

          <div className="mb-4 text-center md:mb-7">

            <img src="/lgu-logo.png" alt="Municipality of Carigara official seal" className="mx-auto mb-3 aspect-square h-16 w-16 rounded-full object-cover shadow-2xl ring-2 ring-white/80 md:mb-5 md:h-28 md:w-28 md:ring-4" />

            <div className="text-2xl font-bold tracking-wide md:text-3xl">PCMS</div>

            <p className="mt-1 text-xs text-white/75 md:mt-2 md:text-sm">Property Accountability Management System</p>

          </div>

          <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">

            <label htmlFor="login-identifier" className="block">

              <span className="mb-1 block text-xs font-semibold text-white/85 md:mb-2 md:text-sm">Username or email</span>

              <input id="login-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="login-input w-full rounded-lg px-3 py-2.5 text-base text-white md:rounded-xl md:px-4 md:py-3" placeholder="Username or email" />

            </label>

            <label htmlFor="login-password" className="block">

              <span className="mb-1 block text-xs font-semibold text-white/85 md:mb-2 md:text-sm">Password</span>

              <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="login-input w-full rounded-lg px-3 py-2.5 text-base text-white md:rounded-xl md:px-4 md:py-3" placeholder="Password" />

            </label>

            <label className="flex min-h-8 items-center gap-2 text-xs text-white/75 md:text-sm">

              <input id="remember-me" type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} /> Remember me

            </label>

            <button type="submit" className="login-button min-h-11 w-full rounded-lg px-3 py-2.5 text-sm font-semibold text-white md:rounded-xl md:px-4 md:py-3 md:text-base">Sign in</button>

          </form>
          <Link to="/forgot-password" className="mt-3 block py-1 text-center text-xs text-white/85 underline md:mt-4 md:py-0 md:text-sm">Forgot your password?</Link>

        </div>

        </div>

      </motion.div>

    </div>

  );

}
