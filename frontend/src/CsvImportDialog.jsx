import { useState } from 'react';
import { api } from './api.js';

export default function CsvImportDialog({ open, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  if (!open) return null;

  async function importCsv(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const imported = await api.post('/api/admin/places/import', body);
      setResult(imported);
      onImported(imported);
    } catch (failure) {
      setError(failure.detail || failure.message || 'The CSV could not be imported.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="csv-import-overlay" role="presentation" onClick={onClose}>
    <section className="csv-import-dialog" role="dialog" aria-modal="true" aria-labelledby="csv-import-title" onClick={(event) => event.stopPropagation()}>
      <div className="csv-import-heading"><div><h2 id="csv-import-title">Import places from CSV</h2><p>One row creates one new place.</p></div><button type="button" onClick={onClose} aria-label="Close CSV import">×</button></div>
      <form onSubmit={importCsv}>
        <label htmlFor="csv-import-file">CSV file</label>
        <input id="csv-import-file" type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); setError(''); }} />
        <p className="csv-import-hint">Expected columns: name, description, practical_info, category, subcategory, author, link_url, latitude, longitude, published.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {result && <div className="csv-import-result" role="status">
          <strong>{result.created_count} place{result.created_count === 1 ? '' : 's'} imported.</strong>
          {result.errors.length > 0 && <ul>{result.errors.map((item) => <li key={item.line}>Line {item.line}: {item.error}</li>)}</ul>}
        </div>}
        <div className="csv-import-actions"><button type="button" onClick={onClose}>Close</button><button className="primary-button" type="submit" disabled={!file || busy}>{busy ? 'Importing…' : 'Import CSV'}</button></div>
      </form>
    </section>
  </div>;
}
