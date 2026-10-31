import { useEffect, useMemo, useRef, useState } from 'react';
import ZonePanel, { LockIcon } from './ZonePanel.jsx';
import { categoryIconUrl } from './markerIcons.js';
import { categoryGroups } from './categories.js';
import { api } from './api.js';

const ZONE_LANGUAGES = ['en', 'fr', 'de', 'it'];

function newZoneTranslations() {
  return Object.fromEntries(ZONE_LANGUAGES.map((language) => [language, { about_title: '', about_text: '' }]));
}

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

function toggleGroup(values, categories) {
  const ids = categories.map((category) => category.id);
  return ids.every((id) => values.includes(id))
    ? values.filter((id) => !ids.includes(id))
    : [...values, ...ids.filter((id) => !values.includes(id))];
}

function previewPlacesFor(places, categoryIds, zones) {
  return places.filter((place) => place.published && categoryIds.includes(place.category_id)).map((place) => ({
    ...place,
    preview_dimmed: !zones.some((zone) => place.latitude >= zone.min_lat && place.latitude <= zone.max_lat &&
      place.longitude >= zone.min_lon && place.longitude <= zone.max_lon),
  }));
}

function datePeriod(value) {
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return null;
  const end = match[3] ? new Date(year, month - 1, day + 1)
    : match[2] ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
  return { start, end };
}

function matchesMap(shared, name, period, zoneId) {
  const normalize = (value) => value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (!name.trim() || normalize(`${shared.internal_name} ${shared.public_title}`).includes(normalize(name.trim())))
    && (!period || new Date(shared.created_at) < period.end && new Date(shared.expires_at) > period.start)
    && (!zoneId || shared.zone_ids.includes(Number(zoneId)));
}

export default function SharingPanel({ view, editingMap, zones, categories, places, role, zoneDraft, setZoneDraft, zoneDrawing, mapZoneToggle, onZoneCreated, onPreviewChange, onDirtyChange, onChangeView, onClose, onCancelZone, onConfirm }) {
  const [internalName, setInternalName] = useState('');
  const [publicTitle, setPublicTitle] = useState('');
  const [zoneIds, setZoneIds] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [expiresAt, setExpiresAt] = useState(expiryValue());
  const [allMaps, setAllMaps] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [searchOpen, setSearchOpen] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [selectedMapId, setSelectedMapId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoneError, setZoneError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [sharingCollapsed, setSharingCollapsed] = useState(false);
  const copyResetTimerRef = useRef(null);
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
  const hasFilters = Boolean(nameFilter.trim() || dateFilter || zoneFilter);
  const period = dateFilter.trim() ? datePeriod(dateFilter) : null;
  const invalidDate = Boolean(dateFilter.trim() && !period);
  const maps = useMemo(() => allMaps.filter((shared) => hasFilters
    ? !invalidDate && matchesMap(shared, nameFilter, period, zoneFilter)
    : shared.status === (statusFilter === 'INACTIVE' ? 'EXPIRED' : statusFilter)
  ), [allMaps, hasFilters, invalidDate, nameFilter, dateFilter, zoneFilter, statusFilter]);

  useEffect(() => {
    if (view !== 'list') onPreviewChange({ zones: selectedZones, places: previewPlaces, categoryIds, zoneIds });
  }, [view, selectedZones, previewPlaces, categoryIds, zoneIds, onPreviewChange]);

  const zoneDirty = Boolean(zoneDraft && (zoneDraft.name.trim() || zoneDraft.about_title?.trim() || zoneDraft.about_text?.trim() || zoneDraft.locked || zoneDraft.min_lat !== null || zoneDrawing));
  const dirty = view !== 'list' && (zoneDirty || JSON.stringify({ internalName, publicTitle, zoneIds, categoryIds, expiresAt }) !== initial);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (view !== 'list') return undefined;
    const controller = new AbortController();
    Promise.all([false, true].map((archived) => api.get(`/api/admin/shared-maps?archived=${archived}`, { signal: controller.signal })))
      .then(([current, archived]) => {
        setAllMaps([...current, ...archived].sort((left, right) => right.id - left.id));
        setError('');
      })
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message); });
    return () => controller.abort();
  }, [view, version]);

  useEffect(() => {
    if (view === 'list') setSelectedMapId((current) => maps.some((shared) => shared.id === current) ? current : maps[0]?.id ?? null);
  }, [view, maps]);

  useEffect(() => {
    const resetCopiedState = () => setCopiedId(null);
    window.addEventListener('blur', resetCopiedState);
    document.addEventListener('visibilitychange', resetCopiedState);
    return () => {
      window.removeEventListener('blur', resetCopiedState);
      document.removeEventListener('visibilitychange', resetCopiedState);
      if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
    };
  }, []);

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
      const zone = await api.post('/api/admin/zones', zoneDraft);
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
      const payload = { internal_name: internalName, public_title: publicTitle, zone_ids: zoneIds, category_ids: categoryIds, expires_at: new Date(expiresAt).toISOString() };
      if (view === 'edit') await api.put(`/api/admin/shared-maps/${editingMap.id}`, payload);
      else await api.post('/api/admin/shared-maps', payload);
      onDirtyChange(false);
      setNameFilter('');
      setDateFilter('');
      setZoneFilter('');
      setStatusFilter(editingMap?.archived ? 'ARCHIVED' : new Date(expiresAt) > new Date() ? 'ACTIVE' : 'INACTIVE');
      onChangeView('list', null, true);
      setVersion((current) => current + 1);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function changeArchive(shared) {
    try {
      await api.patch(`/api/admin/shared-maps/${shared.id}/archive`, { archived: !shared.archived });
      setVersion((current) => current + 1);
    } catch (failure) { setError(failure.message); }
  }

  function requestArchiveChange(shared) {
    const archived = !shared.archived;
    onConfirm({
      title: `${archived ? 'Archive' : 'Unarchive'} ${shared.internal_name}?`,
      message: archived
        ? 'This shared map will be hidden from the active list and its link will no longer be available to clients.'
        : 'This shared map will return to the active list and its link may be available to clients again.',
      action: archived ? 'Archive' : 'Unarchive',
      cancel: archived ? 'Keep active' : 'Keep archived',
    }, () => changeArchive(shared));
  }

  async function copyLink(shared) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${shared.token}`);
      setCopiedId(shared.id);
      if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = window.setTimeout(() => setCopiedId(null), 2500);
    } catch { setError('Could not copy the link.'); }
  }

  return <aside className={`work-panel sharing-panel${sharingCollapsed ? ' sharing-panel-collapsed' : ''}`}>
    <div className="sharing-heading">
      <button
        className="sharing-collapse-button"
        type="button"
        aria-label={sharingCollapsed ? 'Expand sharing workspace' : 'Collapse sharing workspace'}
        aria-expanded={!sharingCollapsed}
        onClick={() => setSharingCollapsed((collapsed) => !collapsed)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <h2>SHARING WORKSPACE</h2>
    </div>
    <div className="mode-tabs sharing-tabs" role="tablist" aria-label="Sharing workspace">
      <button className={view !== 'list' ? 'mode-tab active' : 'mode-tab'} type="button" role="tab" aria-selected={view !== 'list'} onClick={() => onChangeView('create')}>{view === 'edit' ? 'Edit shared map' : 'Create a shared map'}</button>
      <button className={view === 'list' ? 'mode-tab active' : 'mode-tab'} type="button" role="tab" aria-selected={view === 'list'} onClick={() => onChangeView('list')}>Shared maps</button>
    </div>
    <div className="sharing-content">
      {view === 'list' ? <>
        <div className="sharing-intro"><div className="sharing-intro-heading"><h1>Shared maps</h1><button className="sharing-search-toggle" type="button" aria-label={hasFilters ? 'Search shared maps, filters active' : 'Search shared maps'} title="Search shared maps" aria-expanded={searchOpen} data-active={hasFilters} onClick={() => setSearchOpen((open) => !open)}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button></div><p>Manage the links sent to clients.</p></div>
        {searchOpen && <div className="sharing-filters">
          <div className="sharing-filters-heading"><strong>Search</strong>{hasFilters && <button type="button" onClick={() => { setNameFilter(''); setDateFilter(''); setZoneFilter(''); }}>Clear</button>}</div>
          <label>Name<input type="search" value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder="Internal or client name" autoFocus /></label>
          <div className="sharing-filter-row">
            <label>Date<input type="text" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} placeholder="YYYY[-MM[-DD]]" aria-invalid={invalidDate} /></label>
            <label>Zone<select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}><option value="">All zones</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
          </div>
          <small>{invalidDate ? 'Use YYYY, YYYY-MM or YYYY-MM-DD.' : 'Find maps whose creation–expiry period overlaps this year, month or day.'}</small>
        </div>}
        {hasFilters ? <p className="sharing-search-summary">{maps.length} result{maps.length === 1 ? '' : 's'} across all statuses</p> : <div className="publication-filter" role="group" aria-label="Shared map status">
          {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((status) => <button key={status} type="button" aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>{status[0] + status.slice(1).toLowerCase()}</button>)}
        </div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="sharing-map-list">{maps.length ? maps.map((shared) => <article className={selectedMapId === shared.id ? 'sharing-map-card selected' : 'sharing-map-card'} key={shared.id}>
          <button className="sharing-map-select" type="button" onClick={() => setSelectedMapId(shared.id)}><strong>{shared.internal_name}</strong><span>{shared.public_title}</span><small>{shared.zone_ids.map((id) => zones.find((zone) => zone.id === id)?.name).filter(Boolean).join(', ')} · {shared.category_ids.map((id) => categories.find((category) => category.id === id)?.name).filter(Boolean).join(', ')}</small><small>{shared.status === 'EXPIRED' ? 'inactive (expired)' : shared.status.toLowerCase()} · created {new Date(shared.created_at).toLocaleDateString()} · until {new Date(shared.expires_at).toLocaleString()}</small></button>
          <div className="sharing-map-actions"><button type="button" onClick={() => copyLink(shared)}>{copiedId === shared.id ? 'Copied!' : 'Copy link'}</button><button type="button" onClick={() => onChangeView('edit', shared)}>Edit</button><button type="button" onClick={() => requestArchiveChange(shared)}>{shared.archived ? 'Unarchive' : 'Archive'}</button></div>
        </article>) : <p className="sharing-empty">{hasFilters ? 'No shared maps match these filters.' : `No ${statusFilter.toLowerCase()} shared maps.`}</p>}</div>
      </> : <>
        <div className="sharing-intro"><h1>{view === 'edit' ? 'Edit shared map' : 'Share map with client'}</h1><p>Choose the zones and categories your client may see.</p></div>
        {zoneDraft ? <div className="sharing-zone-draft"><ZonePanel draft={zoneDraft} drawing={zoneDrawing} error={zoneError} role={role} onNameChange={(name) => setZoneDraft((current) => ({ ...current, name }))} onAboutTitleChange={(about_title) => setZoneDraft((current) => ({ ...current, about_title }))} onAboutTextChange={(about_text) => setZoneDraft((current) => ({ ...current, about_text }))} onTranslationChange={(field, language, value) => setZoneDraft((current) => ({ ...current, ...(language === 'en' ? { [field === 'name' ? 'name' : field]: value } : {}), translations: { ...(current.translations || newZoneTranslations()), [language]: { ...(current.translations?.[language] || {}), [field]: value } } }))} onLockChange={(locked) => setZoneDraft((current) => ({ ...current, locked }))} onSave={saveZone} onCancel={onCancelZone} onRedraw={() => setZoneDraft((current) => ({ ...current, min_lat: null, max_lat: null, min_lon: null, max_lon: null }))} /></div> : <form className="sharing-form" onSubmit={saveMap}>
          <label>Internal name *<input value={internalName} onChange={(event) => setInternalName(event.target.value)} required /></label>
          <label>Title shown to client *<input value={publicTitle} onChange={(event) => setPublicTitle(event.target.value)} required /></label>
          <fieldset><legend>Zones *</legend><div className="sharing-options">{zones.map((zone) => <label key={zone.id}><input type="checkbox" checked={zoneIds.includes(zone.id)} onChange={() => setZoneIds((current) => toggle(current, zone.id))} /><span>{zone.name}</span>{Boolean(zone.locked) && <span className="zone-lock-icon" title="Locked zone"><LockIcon /></span>}</label>)}</div><button className="sharing-new-zone" type="button" onClick={() => setZoneDraft({ name: '', about_title: '', about_text: '', translations: newZoneTranslations(), locked: false, min_lat: null, max_lat: null, min_lon: null, max_lon: null })}>+ New zone</button></fieldset>
          <fieldset><legend>Categories *</legend><div className="sharing-options">{categoryGroups(categories).map((group) => <div className="sharing-category-group" key={group.id}>
            <label><input type="checkbox" checked={group.categories.every((category) => categoryIds.includes(category.id))} onChange={() => setCategoryIds((current) => toggleGroup(current, group.categories))} /><span className="category-icon" style={{ background: group.color }}><img src={categoryIconUrl(group.icon)} alt="" /></span><strong>{group.name}</strong></label>
            {group.categories.length > 1 && group.categories.map((category) => <label className="sharing-subcategory" key={category.id}><input type="checkbox" checked={categoryIds.includes(category.id)} onChange={() => setCategoryIds((current) => toggle(current, category.id))} /><span className="category-icon" style={{ background: category.color }}><img src={categoryIconUrl(category.icon)} alt="" /></span><span>{category.name}</span></label>)}
          </div>)}</div></fieldset>
          <label>Valid until *<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required /></label>
          <p className="sharing-count">{candidateCount} published place{candidateCount === 1 ? '' : 's'} in selected zones</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="sharing-form-actions"><button type="button" onClick={onClose}>Back</button><button className="primary-button" type="submit" disabled={busy || !zoneIds.length || !categoryIds.length}>{busy ? 'Saving…' : 'Save shared map'}</button></div>
        </form>}
      </>}
    </div>
  </aside>;
}
