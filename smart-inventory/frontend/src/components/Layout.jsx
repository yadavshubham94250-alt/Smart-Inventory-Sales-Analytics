import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useEffect } from 'react';

const NAV = [
  ['/', 'Dashboard', '▦'], ['/products', 'Products', '▤'], ['/inventory', 'Inventory', '⇅'],
  ['/sales', 'Sales', '₹'], ['/analytics', 'Analytics', '◔'], ['/reports', 'Reports', '⬇'],
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);      // mobile menu state
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);   // close the menu after navigating

  return (
    <div className="shell">
      <header className="topbar">
        <button className="btn btn-sm btn-outline-light" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
        <strong>Smart Inventory</strong>
      </header>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand"><span className="brand-mark">SI</span><span>Smart Inventory<br /><small className="fw-normal opacity-75">& Sales Analytics</small></span></div>
        {NAV.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link-x ${isActive ? 'active' : ''}`}>
            <span aria-hidden="true" style={{ width: 18, textAlign: 'center' }}>{icon}</span>{label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div className="text-white">{user?.name}</div>
          <div className="opacity-75 mb-2 text-truncate">{user?.email}</div>
          <button className="btn btn-sm btn-outline-light w-100" onClick={logout}>Log out</button>
        </div>
      </nav>
      <main className="content"><Outlet /></main>
    </div>
  );
}
