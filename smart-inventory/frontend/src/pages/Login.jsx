import { useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { Field } from '../components/ui';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');          // 'login' | 'setup'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Client-side validation gives instant feedback; the server validates again (never trust the client).
  function validate() {
    const e = {};
    if (mode === 'setup' && form.name.trim().length < 2) e.name = 'Enter your name (at least 2 characters).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (mode === 'login' ? !form.password : !(form.password.length >= 8 && /[A-Za-z]/.test(form.password) && /\d/.test(form.password)))
      e.password = mode === 'login' ? 'Enter your password.' : 'Use at least 8 characters with a letter and a number.';
    return e;
  }

  async function submit(ev) {
    ev.preventDefault();
    const e = validate(); setErrors(e); setFormError('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email.trim(), form.password);
      else await register(form.name.trim(), form.email.trim(), form.password);
    } catch (err) {
      setFormError(err.message);
      if (err.details) setErrors(err.details);
    } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <section className="login-side">
        <div className="brand px-0"><span className="brand-mark">SI</span><span>Smart Inventory</span></div>
        <h1>Know what you have, what sells, and what to reorder.</h1>
        <p className="opacity-75 mt-3" style={{ maxWidth: '42ch' }}>Track stock, record sales and see revenue, gross profit and slow-moving items in one place.</p>
      </section>
      <section className="login-form">
        <form onSubmit={submit} noValidate style={{ width: '100%', maxWidth: 380 }}>
          <h2 className="h4 mb-1">{mode === 'login' ? 'Log in' : 'Create the first admin'}</h2>
          <p className="text-secondary mb-4">{mode === 'login' ? 'Use your admin account to continue.' : 'Only available before any admin exists.'}</p>
          {formError && <div className="alert alert-danger py-2" role="alert">{formError}</div>}
          {mode === 'setup' && (
            <Field id="name" label="Name" error={errors.name}>
              <input id="name" className={`form-control ${errors.name ? 'is-invalid' : ''}`} value={form.name} onChange={set('name')} autoComplete="name" />
            </Field>)}
          <Field id="email" label="Email" error={errors.email}>
            <input id="email" type="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} value={form.email} onChange={set('email')} autoComplete="username" autoFocus />
          </Field>
          <Field id="password" label="Password" error={errors.password}>
            <input id="password" type="password" className={`form-control ${errors.password ? 'is-invalid' : ''}`} value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          <button className="btn btn-primary w-100" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
          <button type="button" className="btn btn-link w-100 mt-2" onClick={() => { setMode(mode === 'login' ? 'setup' : 'login'); setErrors({}); setFormError(''); }}>
            {mode === 'login' ? 'First time here? Set up the admin account' : 'Back to log in'}
          </button>
        </form>
      </section>
    </div>
  );
}
