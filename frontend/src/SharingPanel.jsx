import { useEffect, useMemo, useState } from 'react';
import ZonePanel from './ZonePanel.jsx';
import { categoryIconUrl } from './markerIcons.js';

function expiryValue(value) {
  const date = value ? new Date(value) : new Date();
  if (!value) {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  }
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toggle(values, id) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function previewPlacesFor(places, categoryIds, zones) {
  return places.filter((place) => place.published && categoryIds.includes(place.category_id)).map((place) => ({
    ...place,
    preview_dimmed: !zones.some((zone) => place.latitude >= zone.min_lat && place.latitude <= zone.max_lat &&
      place.longitude >= zone.min_lon && place.longitude <= zone.max_lon),
  }));
}

export default function SharingPanel({ view, editingMap, zones, categories, places, zoneDraft, setZoneDraft, zoneDrawing, mapZoneToggle, onZoneCreated, onPreviewChange, onDirtyChange, onChangeView, onClose, onCancelZone }) {
  const [internalName, setInternalName] = useState('');
  const [publicTitle, setPublicTitle] = useState('');
  const [zoneIds, setZoneIds] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [expiresAt, setExpiresAt] = useState(expiryValue());
  const [maps, setMaps] = useState([]);
  const [archived, setArchived] = useState(false);
  const [selectedMapId, setSelectedMapId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoneError, setZoneError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [version, setVersion] = useState(0);
  const [initial, setInitial] = useState('');

  useEffect(() => {
    if (mapZoneToggle && view !== 'list' && !zoneDraft) setZoneIds((current) => toggle(current, mapZoneToggle.id));
  }, [mapZoneToggle]);

  useEffect(() => {
    const source = view === 'edit' ? editingMap : null;
    const values = {
      internalName: source?.internal_name || '',
      publicTitle: source?.public_title || '',
      zoneIds: source?.zone_ids || [],
      categoryIds: source?.category_ids || categories.map((category) => category.id),
      expiresAt: expiryValue(source?.expires_at),
    };
    setInternalName(values.internalName);
    setPublicTitle(values.publicTitle);
    setZoneIds(values.zoneIds);
    setCategoryIds(values.categoryIds);
    setExpiresAt(values.expiresAt);
    setInitial(JSON.stringify(values));
    setError('');
    setZoneDraft(null);
  }, [view, editingMap, categories, setZoneDraft]);

  const selectedZones = useMemo(() => zones.filter((zone) => zoneIds.includes(zone.id)), [zones, zoneIds]);
  const previewPlaces = useMemo(() => previewPlacesFor(places, categoryIds, selectedZones), [places, categoryIds, selectedZones]);
  const candidateCount = previewPlaces.filter((place) => !place.preview_dimmed).length;

  useEffect(() => {
    if (view !== 'list') onPreviewChange({ zones: selectedZones, places: previewPlaces, categoryIds, zoneIds });
  }, [view, selectedZones, previewPlaces, categoryIds, zoneIds, onPreviewChange]);

  const zoneDirty = Boolean(zoneDraft && (zoneDraft.name.trim() || zoneDraft.min_lat !== null || zoneDrawing));
  const dirty = view !== 'list' && (zoneDirty || JSON.stringify({ internalName, publicTitle, zoneIds, categoryIds, expiresAt }) !== initial);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (view !== 'list') return undefined;
    const controller = new AbortController();
    fetch(`/api/admin/shared-maps?archived=${archived}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error('Could not load shared maps.'); return response.json(); })
      .then((data) => { setMaps(data); setSelectedMapId(data[0]?.id ?? null); setError(''); })
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message); });
    return () => controller.abort();
  }, [view, archived, version]);

  useEffect(() => {
    if (view !== 'list') return;
    const selected = maps.find((item) => item.id === selectedMapId);
    const activeZones = zones.filter((zone) => selected?.zone_ids.includes(zone.id));
    onPreviewChange({ zones: activeZones, places: previewPlacesFor(places, selected?.category_ids || [], activeZones), categoryIds: selected?.category_ids || [], zoneIds: selected?.zone_ids || [] });
  }, [view, maps, selectedMapId, zones, places, onPreviewChange]);

  async function saveZone() {
    if (!zoneDraft) return;
    setZoneError('');
    try {
      const response = await fetch('/api/admin/zones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zoneDraft),
      });
      if (!response.ok) throw new Error(response.status === 409 ? 'A zone with this name already exists.' : 'Could not save the zone.');
      const zone = await response.json();
      onZoneCreated(zone);
      setZoneIds((current) => [...current, zone.id]);
      setZoneDraft(null);
    } catch (failure) { setZoneError(failure.message); }
  }

  async function saveMap(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/shared-maps${view === 'edit' ? `/${editingMap.id}` : ''}`, {
        method: view === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internal_name: internalName, public_title: publicTitle, zone_ids: zoneIds, category_ids: categoryIds, expires_at: new Date(expiresAt).toISOString() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.detail === 'string' ? body.detail : 'Could not save the shared map.');
      }
      onDirtyChange(false);
      onChangeView('list', null, true);
      setVersion((current) => current + 1);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function changeArchive(shared) {
    try {
      const response = await fetch(`/api/admin/shared-maps/${shared.id}/archive`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !shared.archived }),
      });
      if (!response.ok) throw new Error('Could not change archive status.');
      setVersion((current) => current + 1);
    } catch (failure) { setError(failure.message); }
  }

  async function copyLink(shared) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${shared.token}`);
      setCopiedId(shared.id);
    } catch { setError('Could not copy the link.'); }
  }

  return <aside className="work-panel sharing-panel">
    <div className="sharing-heading"><h2>SHARING WORKSPACE</h2></div>
    <div className="mode-tabs sharing-tabs" role="tablist" aria-label="Sharing workspace">
      <button className={view !== 'list' ? 'mode-tab active' : 'mode-tab'} type="button" role="tab" aria-selected={view !== 'list'} onClick={() => onChangeView('create')}>{view === 'edit' ? 'Edit shared map' : 'Create a shared map'}</button>
      <button className={view === 'list' ? 'mode-tab active' : 'mode-tab'} type="button" role="tab" aria-selected={view === 'list'} onClick={() => onChangeView('list')}>Shared maps</button>
    </div>
    <div className="sharing-content">
      {view === 'list' ? <>
        <div className="sharing-intro"><h1>Shared maps</h1><p>Manage the links sent to clients.</p></div>
        <div className="publication-filter" role="group" aria-label="Shared map status">
          <button type="button" aria-pressed={!archived} onClick={() => setArchived(false)}>Current</button>
          <button type="button" aria-pressed={archived} onClick={() => setArchived(true)}>Archived</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="sharing-map-list">{maps.length ? maps.map((shared) => <article className={selectedMapId === shared.id ? 'sharing-map-card selected' : 'sharing-map-card'} key={shared.id}>
          <button className="sharing-map-select" type="button" onClick={() => setSelectedMapId(shared.id)}><strong>{shared.internal_name}</strong><span>{shared.public_title}</span><small>{shared.zone_ids.map((id) => zones.find((zone) => zone.id === id)?.name).filter(Boolean).join(', ')} · {shared.category_ids.map((id) => categories.find((category) => category.id === id)?.name).filter(Boolean).join(', ')}</small><small>{shared.status.toLowerCase()} · until {new Date(shared.expires_at).toLocaleString()}</small></button>
          <div className="sharing-map-actions"><button type="button" onClick={() => copyLink(shared)}>{copiedId === shared.id ? 'Copied!' : 'Copy link'}</button><button type="button" onClick={() => onChangeView('edit', shared)}>Edit</button><button type="button" onClick={() => changeArchive(shared)}>{archived ? 'Unarchive' : 'Archive'}</button></div>
        </article>) : <p className="sharing-empty">No {archived ? 'archived' : 'current'} shared maps.</p>}</div>
      </> : <>
        <div className="sharing-intro"><h1>{view === 'edit' ? 'Edit shared map' : 'Share map with client'}</h1><p>Choose the zones and categories your client may see.</p></div>
        {zoneDraft ? <div className="sharing-zone-draft"><ZonePanel draft={zoneDraft} drawing={zoneDrawing} error={zoneError} onNameChange={(name) => setZoneDraft((current) => ({ ...current, name }))} onSave={saveZone} onCancel={onCancelZone} onRedraw={() => setZoneDraft((current) => ({ ...current, min_lat: null, max_lat: null, min_lon: null, max_lon: null }))} /></div> : <form className="sharing-form" onSubmit={saveMap}>
          <label>Internal name *<input value={internalName} onChange={(event) => setInternalName(event.target.value)} required /></label>
          <label>Title shown to client *<input value={publicTitle} onChange={(event) => setPublicTitle(event.target.value)} required /></label>
          <fieldset><legend>Zones *</legend><div className="sharing-options">{zones.map((zone) => <label key={zone.id}><input type="checkbox" checked={zoneIds.includes(zone.id)} onChange={() => setZoneIds((current) => toggle(current, zone.id))} /><span>{zone.name}</span></label>)}</div><button className="sharing-new-zone" type="button" onClick={() => setZoneDraft({ name: '', min_lat: null, max_lat: null, min_lon: null, max_lon: null })}>+ New zone</button></fieldset>
          <fieldset><legend>Categories *</legend><div className="sharing-options">{categories.map((category) => <label key={category.id}><input type="checkbox" checked={categoryIds.includes(category.id)} onChange={() => setCategoryIds((current) => toggle(current, category.id))} /><span className="category-icon" style={{ background: category.color }}><img src={categoryIconUrl(category.icon)} alt="" /></span><span>{category.name}</span></label>)}</div></fieldset>
          <label>Valid until *<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required /></label>
          <p className="sharing-count">{candidateCount} published place{candidateCount === 1 ? '' : 's'} in selected zones</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="sharing-form-actions"><button type="button" onClick={onClose}>Back</button><button className="primary-button" type="submit" disabled={busy || !zoneIds.length || !categoryIds.length}>{busy ? 'Saving…' : 'Save shared map'}</button></div>
        </form>}
      </>}
    </div>
  </aside>;
}
