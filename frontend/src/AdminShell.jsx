import { useEffect, useRef, useState } from 'react';
import petassosLogo from './assets/petassos-logo-animated.svg';
import { api } from './api.js';

export function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const data = await api.post('/api/admin/login', { username, password });
      setPassword('');
      onLogin(data);
    } catch (error) {
      if (error.status === 401) {
        setError('Incorrect username or password.');
        return;
      }
      setError('Could not connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-content">
        <img className="login-logo" src={petassosLogo} alt="Petassos Travel" />
        <section className="login-card" aria-labelledby="login-title">
          <span className="login-eyebrow">PRIVATE WORKSPACE</span>
          <h1 id="login-title">Map administration</h1>
          <p>Sign in to manage places, notes and zones.</p>
          <form onSubmit={handleSubmit}>
            <label htmlFor="admin-username">Username *</label>
            <input id="admin-username" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
            <label htmlFor="admin-password">Password *</label>
            <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button login-submit" type="submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export function AdminHeader({ onLogout, logoutError, role, sharing, onShare, onSharedMaps, archiveOpen, onArchive, onBack, onImportCsv }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function closeOnOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <header className="admin-header">
      <div className="header-identity">
        <img src={petassosLogo} alt="Petassos Travel" />
        <span className="header-context">Map administration</span>
      </div>
      <div className="header-actions">
        <button className="share-button" type="button" onClick={sharing ? onBack : onShare}>
          {sharing ? '← Map administration' : 'Share map with client'}
        </button>
        <div className="admin-menu-wrap" ref={menuRef}>
          <button className="admin-menu-trigger" type="button" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((open) => !open)}>
            <span className="menu-bars" aria-hidden="true"><i /><i /><i /></span>
            <span>{role === 'superadmin' ? 'Superadmin' : 'Admin'}</span>
            <span className="menu-chevron" aria-hidden="true">⌄</span>
          </button>
          {menuOpen && <div className="admin-menu" role="menu">
            <button type="button" role="menuitem" disabled>Manage categories</button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onSharedMaps(); }}>Shared maps</button>
            <button type="button" role="menuitemcheckbox" aria-checked={archiveOpen} onClick={() => { setMenuOpen(false); onArchive(); }}>Archive {archiveOpen ? '✓' : ''}</button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onImportCsv(); }}>Import CSV</button>
            <button className="mobile-share-item" type="button" role="menuitem" onClick={() => { setMenuOpen(false); sharing ? onBack() : onShare(); }}>{sharing ? 'Map administration' : 'Share map with clients'}</button>
            <div className="menu-divider" />
            <button type="button" role="menuitem" onClick={onLogout}>Log out</button>
          </div>}
        </div>
      </div>
      {logoutError && <div className="header-error" role="alert">{logoutError}</div>}
    </header>
  );
}
