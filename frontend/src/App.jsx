import { useEffect, useState } from 'react';

export default function App() {
  const [apiStatus, setApiStatus] = useState('Checking backend…');

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => setApiStatus(data.status === 'ok' ? 'Connected' : 'Unexpected response'))
      .catch((error) => {
        if (error.name !== 'AbortError') setApiStatus('Backend unavailable');
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="foundation">
      <header className="foundation-header">
        <span className="brand-mark" aria-hidden="true">◡</span>
        <strong>Petassos Travel</strong>
        <span className="header-context">Map administration</span>
      </header>
      <section className="foundation-card">
        <span className="eyebrow">DEVELOPMENT · STEP 1</span>
        <h1>Application foundation</h1>
        <p>The React frontend is running. The next step is Admin authentication and the first map screen.</p>
        <div className="status-row">
          <span>FastAPI connection</span>
          <strong aria-live="polite">{apiStatus}</strong>
        </div>
      </section>
    </main>
  );
}
