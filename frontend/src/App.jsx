import { useEffect, useMemo, useRef, useState } from 'react';
import petassosLogo from './assets/petassos-logo-animated.svg';
import MapView from './MapView.jsx';
import { categoryIconUrl } from './markerIcons.js';

const MODES = {
  Places: {
    empty: 'Places in the current map view will appear here.',
    action: 'Add a new place',
  },
  Notes: {
    empty: 'Internal notes will appear here.',
    action: 'Add NOTE',
  },
  Zones: {
    empty: 'Saved zones will appear here.',
    action: 'New zone',
  },
};

function useAdminSession() {
  const [session, setSession] = useState({ state: 'checking', username: '' });

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/admin/session', { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setSession({ state: 'guest', username: '' });
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setSession({ state: 'admin', username: data.username });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setSession({ state: 'guest', username: '' });
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (session.state === 'checking') return;
    const path = session.state === 'admin' ? '/admin' : '/admin/login';
    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  }, [session.state]);

  return [session, setSession];
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (response.status === 401) {
        setError('Incorrect username or password.');
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPassword('');
      onLogin(data.username);
    } catch {
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
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <label htmlFor="admin-password">Password *</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
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

function AdminHeader({ onLogout, logoutError }) {
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
        <button className="share-button" type="button" disabled>
          Share map with client
        </button>
        <div className="admin-menu-wrap" ref={menuRef}>
          <button
            className="admin-menu-trigger"
            type="button"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="menu-bars" aria-hidden="true"><i /><i /><i /></span>
            <span>Admin</span>
            <span className="menu-chevron" aria-hidden="true">⌄</span>
          </button>
          {menuOpen && (
            <div className="admin-menu" role="menu">
              <button type="button" role="menuitem" disabled>Manage categories</button>
              <button type="button" role="menuitem" disabled>Shared maps</button>
              <button type="button" role="menuitem" disabled>Import CSV</button>
              <button className="mobile-share-item" type="button" role="menuitem" disabled>
                Share map with client
              </button>
              <div className="menu-divider" />
              <button type="button" role="menuitem" onClick={onLogout}>Log out</button>
            </div>
          )}
        </div>
      </div>
      {logoutError && <div className="header-error" role="alert">{logoutError}</div>}
    </header>
  );
}

function CategoryPicker({ categories, value, onChange }) {
  const pickerRef = useRef(null);
  const selected = categories.find((category) => category.id === Number(value));

  function choose(category) {
    onChange(category.id);
    pickerRef.current.open = false;
  }

  return (
    <details className="category-picker" ref={pickerRef}>
      <summary>
        {selected && <span className="category-icon" style={{ background: selected.color }}><img src={categoryIconUrl(selected.icon)} alt="" /></span>}
        {selected?.name ?? 'Choose a category'}
      </summary>
      <div className="category-options">
        {categories.map((category) => (
          <button key={category.id} type="button" onClick={() => choose(category)}>
            <span className="category-icon" style={{ background: category.color }}><img src={categoryIconUrl(category.icon)} alt="" /></span>
            {category.name}
          </button>
        ))}
      </div>
    </details>
  );
}

function RecordForm({ kind, record, location, categories, onCategoryChange, onDirtyChange, onSave, onCancel, onDelete, error: actionError }) {
  const isNote = kind === 'NOTE';
  const [name, setName] = useState(record?.name ?? '');
  const [categoryId, setCategoryId] = useState(record?.category_id ?? categories[0]?.id ?? '');
  const [description, setDescription] = useState(record?.description ?? '');
  const [author, setAuthor] = useState(record?.author ?? '');
  const [published, setPublished] = useState(isNote ? false : Boolean(record?.published ?? true));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const initialLocationRef = useRef(location);
  const initialCategoryIdRef = useRef(categoryId);

  const isDirty = record ? (
    name !== record.name ||
    (!isNote && Number(categoryId) !== record.category_id) ||
    description !== (record.description ?? '') ||
    author !== (record.author ?? '') ||
    published !== Boolean(record.published) ||
    location.latitude !== record.latitude || location.longitude !== record.longitude
  ) : (
    name !== '' || description !== '' || author !== '' || (!isNote && !published) ||
    (!isNote && categoryId !== initialCategoryIdRef.current) ||
    location.latitude !== initialLocationRef.current.latitude ||
    location.longitude !== initialLocationRef.current.longitude
  );

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        name, category_id: isNote ? null : Number(categoryId), description, author,
        published: isNote ? false : published,
        latitude: location.latitude, longitude: location.longitude,
      });
    } catch {
      setError(`The ${isNote ? 'note' : 'place'} could not be saved. Please try again.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={`place-form${isNote ? ' note-form' : ''}`} onSubmit={handleSubmit}>
      <p className="place-form-position">Drag the map marker to adjust its position.</p>
      {isNote && <p className="note-hint">Internal note — never shared</p>}
      <label htmlFor="place-name">Name *</label>
      <input id="place-name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
      {!isNote && <>
        <span className="field-label">Category *</span>
        <CategoryPicker categories={categories} value={categoryId} onChange={(id) => { setCategoryId(id); onCategoryChange(id); }} />
      </>}
      <label htmlFor="place-description">Description <span className="optional-label">(optional)</span></label>
      <textarea id="place-description" value={description} onChange={(event) => setDescription(event.target.value)} rows="4" />
      <div className="coordinate-fields">
        <label htmlFor="place-latitude">Latitude *
          <input id="place-latitude" type="text" value={location.latitude.toFixed(5)} disabled />
        </label>
        <label htmlFor="place-longitude">Longitude *
          <input id="place-longitude" type="text" value={location.longitude.toFixed(5)} disabled />
        </label>
      </div>
      <label htmlFor="place-author">Author <span className="optional-label">(optional)</span></label>
      <input id="place-author" value={author} onChange={(event) => setAuthor(event.target.value)} />
      {!isNote && <>
        <span className="field-label">Status *</span>
        <div className="publication-filter publication-choice" role="group" aria-label="Publication status">
          <button type="button" aria-pressed={published} onClick={() => setPublished(true)}>Published</button>
          <button type="button" aria-pressed={!published} onClick={() => setPublished(false)}>Draft</button>
        </div>
      </>}
      {(error || actionError) && <p className="form-error" role="alert">{error || actionError}</p>}
      <div className="place-form-actions">
        <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : `Save ${isNote ? 'note' : 'place'}`}</button>
      </div>
      {record && <button className="delete-record-button" type="button" onClick={onDelete} disabled={saving}>Delete {isNote ? 'note' : 'place'}</button>}
    </form>
  );
}

function WorkPanel({ mode, categories, places, searchPlaces, notes, viewport, loadError, picking, draftKind, draftLocation, editingRecord, editorError, selectedRecord, publicationFilter, onPublicationFilterChange, onShowAll, onSearchSelect, onModeChange, onStartPick, onCancelDraft, onPreviewCategory, onDirtyChange, onSaveRecord, onDeleteRecord, onSelectRecord, onEditRecord }) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const selectedCardRef = useRef(null);
  const listScrollRef = useRef(null);
  const content = MODES[mode];
  const records = mode === 'Places' ? places : mode === 'Notes' ? notes : [];
  const searchRecords = mode === 'Places' ? searchPlaces : mode === 'Notes' ? notes : [];
  const searchResults = searchQuery.trim() ? searchRecords.filter((record) => (
    record.name.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())
  )) : [];
  const searching = mode !== 'Zones' && Boolean(searchQuery.trim());
  const visibleRecords = records.filter((record) => !viewport || (
    record.latitude >= viewport.south && record.latitude <= viewport.north &&
    record.longitude >= viewport.west && record.longitude <= viewport.east
  ));
  const displayedRecords = searching ? searchResults : visibleRecords;

  useEffect(() => { setSearchQuery(''); }, [mode]);
  useEffect(() => { listScrollRef.current?.scrollTo(0, 0); }, [searchQuery, mode]);
  useEffect(() => { selectedCardRef.current?.scrollIntoView({ block: 'nearest' }); }, [selectedRecord, viewport, mode, searching]);

  return (
    <aside className={`work-panel${expanded ? ' work-panel-expanded' : ''}`}>
      <button
        className="sheet-handle"
        type="button"
        aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
        onClick={() => setExpanded((value) => !value)}
      >
        <span />
      </button>
      <div className="mode-tabs" role="tablist" aria-label="Admin map mode">
        {Object.keys(MODES).map((item) => (
          <button
            key={item}
            id={`tab-${item.toLowerCase()}`}
            className={mode === item ? 'mode-tab active' : 'mode-tab'}
            type="button"
            role="tab"
            aria-selected={mode === item}
            aria-controls="admin-work-content"
            onClick={() => onModeChange(item)}
          >
            <span>{item}</span>
            <span className="mobile-tab-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <div
        className={`work-panel-content${!draftLocation && !picking ? ' work-panel-list-mode' : ''}`}
        id="admin-work-content"
        role="tabpanel"
        aria-labelledby={`tab-${mode.toLowerCase()}`}
      >
        {draftLocation ? (
          <>
            <div className="work-panel-heading"><h1>{editingRecord ? 'Edit' : 'New'} {(editingRecord?.kind ?? draftKind) === 'NOTE' ? 'note' : 'place'}</h1></div>
            <RecordForm
              key={editingRecord ? `${editingRecord.kind}-${editingRecord.id}` : `new-${draftKind}`}
              kind={editingRecord?.kind ?? draftKind}
              record={editingRecord}
              location={draftLocation}
              categories={categories}
              onCategoryChange={onPreviewCategory}
              onDirtyChange={onDirtyChange}
              onSave={onSaveRecord}
              onCancel={onCancelDraft}
              onDelete={onDeleteRecord}
              error={editorError}
            />
          </>
        ) : picking ? (
          <div className="empty-state">
            <span className="empty-state-mark" aria-hidden="true">⌖</span>
            <p>Click the map where you want to add the {draftKind === 'NOTE' ? 'note' : 'place'}.</p>
            <button type="button" onClick={onCancelDraft}>Cancel</button>
          </div>
        ) : (
          <>
            <div className="work-panel-heading">
              <h1>{mode}</h1>
              {!searching && <div className="work-panel-heading-actions">
                <span className="item-count" aria-label={`${visibleRecords.length} of ${searchRecords.length} ${mode.toLowerCase()} in the current view`}>
                  {visibleRecords.length} of {searchRecords.length}
                </span>
                {mode === 'Places' && <button className="show-all-button" type="button" disabled={!places.length} onClick={onShowAll}>Show all</button>}
              </div>}
            </div>
            {loadError && mode !== 'Zones' && <p className="form-error" role="alert">{loadError}</p>}
            {mode !== 'Zones' && <>
              <div className="record-search-field">
                <input
                  className="record-search"
                  type="search"
                  aria-label={`Search ${mode.toLowerCase()}`}
                  placeholder={mode === 'Places' ? `Search among ${searchPlaces.length} places…` : 'Search notes…'}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery && <button className="record-search-clear" type="button" aria-label="Clear search" onClick={() => setSearchQuery('')}>×</button>}
              </div>
              <p className="current-view-label">{searching ? `SEARCH RESULTS IN ALL ${mode.toUpperCase()} (${searchResults.length})` : `${mode.toUpperCase()} IN CURRENT VIEW`}</p>
              {!searching && mode === 'Places' && <div className="place-list-controls">
                <div className="publication-filter" aria-label="Publication status">
                  {['All', 'Published', 'Draft'].map((filter) => (
                    <button key={filter} type="button" aria-pressed={publicationFilter === filter} onClick={() => onPublicationFilterChange(filter)}>{filter}</button>
                  ))}
                </div>
              </div>}
            </>}
            <div className="place-list-scroll" ref={listScrollRef}>
            {displayedRecords.length > 0 ? (
              <div className="place-list">
                {displayedRecords.map((record) => {
                  const selected = !searching && selectedRecord?.kind === record.kind && selectedRecord.id === record.id;
                  return (
                    <div className={`place-card-row${selected ? ' expanded' : ''}${record.kind === 'NOTE' ? ' note-row' : ''}`} key={`${record.kind}-${record.id}`} ref={selected ? selectedCardRef : null}>
                      <button
                        className={`place-card${record.kind === 'NOTE' ? ' note-card' : ''}${selected ? ' selected' : ''}`}
                        type="button"
                        aria-expanded={selected}
                        onClick={() => {
                          if (searching) {
                            setSearchQuery('');
                            onSearchSelect(record);
                          } else {
                            onSelectRecord(selected ? null : { kind: record.kind, id: record.id });
                          }
                        }}
                      >
                        <span className="place-card-dot" style={{ background: record.kind === 'NOTE' ? '#e2a93b' : record.category_color }} />
                        <span className="place-card-text"><strong>{record.name}</strong><small>{record.kind === 'NOTE' ? 'Internal note' : record.category_name}</small></span>
                        {record.kind === 'PLACE' && <span className={`place-card-status ${record.published ? 'published' : 'draft'}`}>{record.published ? 'Published' : 'Draft'}</span>}
                      </button>
                      {selected && <div className="place-card-details">
                        {record.description && <p>{record.description}</p>}
                        {record.author && <small>By {record.author}</small>}
                        <div className="place-card-actions">
                          <button className="place-card-edit" type="button" onClick={() => onEditRecord(record)} aria-label={`Edit ${record.name}`}>Edit</button>
                          <button className="place-card-edit place-card-focus" type="button" onClick={() => onSearchSelect(record)} aria-label={`Center map on ${record.name}`} title="Center map on this point">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="7" />
                              <circle cx="12" cy="12" r="2" />
                              <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                            </svg>
                          </button>
                        </div>
                      </div>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-state-mark" aria-hidden="true">⌖</span>
                <p>{searching ? `No matching ${mode.toLowerCase()}.` : records.length > 0 ? `No ${mode.toLowerCase()} in the current map view.` : content.empty}</p>
              </div>
            )}
            </div>
          </>
        )}
      </div>
      {!draftLocation && !picking && <div className="work-panel-footer">
        <button className="primary-button" type="button" disabled={mode === 'Zones' || (mode === 'Places' && categories.length === 0)} onClick={() => onStartPick(mode === 'Notes' ? 'NOTE' : 'PLACE')}>
          <span aria-hidden="true">＋</span> {content.action}
        </button>
      </div>}
    </aside>
  );
}

function AdminPage({ onLogout, logoutError }) {
  const [mode, setMode] = useState('Places');
  const [categories, setCategories] = useState([]);
  const [places, setPlaces] = useState([]);
  const [notes, setNotes] = useState([]);
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState([]);
  const [notesVisible, setNotesVisible] = useState(true);
  const [publicationFilter, setPublicationFilter] = useState('All');
  const [mapAction, setMapAction] = useState(null);
  const [viewport, setViewport] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [draftKind, setDraftKind] = useState(null);
  const [draftLocation, setDraftLocation] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [previewCategoryId, setPreviewCategoryId] = useState(null);
  const [editingDirty, setEditingDirty] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const discardDialogRef = useRef(null);
  const discardActionRef = useRef(null);
  const picking = Boolean(draftKind && !draftLocation);
  const activeKind = editingRecord?.kind ?? draftKind;
  const visiblePlaces = useMemo(
    () => places.filter((place) => !hiddenCategoryIds.includes(place.category_id) && (
      publicationFilter === 'All' || Boolean(place.published) === (publicationFilter === 'Published')
    )),
    [places, hiddenCategoryIds, publicationFilter],
  );

  function toggleCategory(categoryId) {
    setHiddenCategoryIds((current) => current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId]);
  }

  function showAllMarkers() {
    setHiddenCategoryIds([]);
    setNotesVisible(true);
  }

  function hideAllMarkers() {
    setHiddenCategoryIds(categories.map((category) => category.id));
    setNotesVisible(false);
  }

  useEffect(() => {
    if (confirmation) {
      if (!discardDialogRef.current?.open) discardDialogRef.current?.showModal();
    } else if (discardDialogRef.current?.open) {
      discardDialogRef.current.close();
    }
  }, [confirmation]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/admin/categories', { signal: controller.signal }),
      fetch('/api/admin/places', { signal: controller.signal }),
      fetch('/api/admin/notes', { signal: controller.signal }),
    ]).then(async ([categoriesResponse, placesResponse, notesResponse]) => {
      if (!categoriesResponse.ok || !placesResponse.ok || !notesResponse.ok) throw new Error('Load failed');
      const [nextCategories, nextPlaces, nextNotes] = await Promise.all([
        categoriesResponse.json(), placesResponse.json(), notesResponse.json(),
      ]);
      setCategories(nextCategories);
      setPlaces(nextPlaces);
      setNotes(nextNotes);
    }).catch((error) => {
      if (error.name !== 'AbortError') setLoadError('Places and notes could not be loaded.');
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!editingDirty) return undefined;
    const warnOnLeave = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnOnLeave);
    return () => window.removeEventListener('beforeunload', warnOnLeave);
  }, [editingDirty]);

  function clearDraft() {
    setDraftKind(null);
    setDraftLocation(null);
    setEditingRecord(null);
    setPreviewCategoryId(null);
    setEditingDirty(false);
    setEditorError('');
  }

  function requestDiscard(action) {
    if (!activeKind || !editingDirty) {
      action();
      return;
    }
    discardActionRef.current = action;
    setConfirmation({
      title: `Discard this unfinished ${activeKind === 'NOTE' ? 'note' : 'place'}?`,
      message: 'Your changes will be lost.',
      action: 'Discard',
      cancel: 'Keep editing',
    });
  }

  function confirmDiscard() {
    const action = discardActionRef.current;
    discardActionRef.current = null;
    setConfirmation(null);
    action?.();
  }

  function cancelDraft() {
    requestDiscard(clearDraft);
  }

  function changeMode(nextMode) {
    if (nextMode === mode) return;
    requestDiscard(() => {
      clearDraft();
      setSelectedRecord(null);
      setMode(nextMode);
    });
  }

  function deselectRecord() {
    if (!activeKind) setSelectedRecord(null);
  }

  function handleOutsideClick(event) {
    if (!selectedRecord || activeKind || confirmation) return;
    if (event.target.closest('.place-card-row, .maplibregl-canvas')) return;
    setSelectedRecord(null);
  }

  function selectRecord(record) {
    requestDiscard(() => {
      clearDraft();
      setSelectedRecord(record);
      if (record) setMode(record.kind === 'NOTE' ? 'Notes' : 'Places');
    });
  }

  function selectSearchRecord(record) {
    if (record.kind === 'NOTE') {
      setNotesVisible(true);
    } else {
      setHiddenCategoryIds((current) => current.filter((id) => id !== record.category_id));
      if (publicationFilter !== 'All' && Boolean(record.published) !== (publicationFilter === 'Published')) {
        setPublicationFilter('All');
      }
    }
    setSelectedRecord({ kind: record.kind, id: record.id });
    setMode(record.kind === 'NOTE' ? 'Notes' : 'Places');
    setMapAction({ type: 'focus', record });
  }

  function editRecord(record) {
    requestDiscard(() => {
      clearDraft();
      setEditingRecord(record);
      setPreviewCategoryId(record.category_id);
      setDraftLocation({ latitude: record.latitude, longitude: record.longitude });
      setSelectedRecord({ kind: record.kind, id: record.id });
    });
  }

  async function saveRecord(record) {
    const kind = activeKind;
    const collection = kind === 'NOTE' ? 'notes' : 'places';
    const response = await fetch(`/api/admin/${collection}${editingRecord ? `/${editingRecord.id}` : ''}`, {
      method: editingRecord ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const savedRecord = await response.json();
    const updateList = (current) => editingRecord
      ? current.map((item) => item.id === savedRecord.id ? savedRecord : item)
      : [savedRecord, ...current];
    if (kind === 'NOTE') setNotes(updateList);
    else setPlaces(updateList);
    setSelectedRecord({ kind: savedRecord.kind, id: savedRecord.id });
    clearDraft();
  }

  function deleteRecord() {
    if (!editingRecord) return;
    const record = editingRecord;
    discardActionRef.current = async () => {
      try {
        const collection = record.kind === 'NOTE' ? 'notes' : 'places';
        const response = await fetch(`/api/admin/${collection}/${record.id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (record.kind === 'NOTE') setNotes((current) => current.filter((item) => item.id !== record.id));
        else setPlaces((current) => current.filter((item) => item.id !== record.id));
        setSelectedRecord(null);
        clearDraft();
      } catch {
        setEditorError(`The ${record.kind === 'NOTE' ? 'note' : 'place'} could not be deleted. Please try again.`);
      }
    };
    setConfirmation({
      title: `Delete ${record.name}?`,
      message: 'This cannot be undone.',
      action: 'Delete',
      cancel: 'Keep',
    });
  }

  return (
    <div className="admin-page" onClickCapture={handleOutsideClick}>
      <AdminHeader onLogout={() => requestDiscard(() => { clearDraft(); onLogout(); })} logoutError={logoutError} />
      <main className="admin-main">
        <MapView
          mapAction={mapAction}
          places={visiblePlaces}
          notes={notesVisible ? notes : []}
          categories={categories}
          hiddenCategoryIds={hiddenCategoryIds}
          notesVisible={notesVisible}
          onToggleCategory={toggleCategory}
          onToggleNotes={() => setNotesVisible((visible) => !visible)}
          onShowAll={showAllMarkers}
          onHideAll={hideAllMarkers}
          picking={picking}
          draftKind={draftKind}
          draftLocation={draftLocation}
          editingRecord={editingRecord}
          editingCategory={categories.find((category) => category.id === previewCategoryId)}
          selectedRecord={selectedRecord}
          onPickLocation={setDraftLocation}
          onMoveDraftLocation={setDraftLocation}
          onSelectRecord={selectRecord}
          onDeselectRecord={deselectRecord}
          onViewportChange={setViewport}
        />
        <WorkPanel
          mode={mode}
          categories={categories}
          places={visiblePlaces}
          searchPlaces={places}
          notes={notes}
          publicationFilter={publicationFilter}
          onPublicationFilterChange={setPublicationFilter}
          onShowAll={() => setMapAction({ type: 'fit', records: visiblePlaces })}
          onSearchSelect={selectSearchRecord}
          viewport={viewport}
          loadError={loadError}
          picking={picking}
          draftKind={draftKind}
          draftLocation={draftLocation}
          editingRecord={editingRecord}
          editorError={editorError}
          selectedRecord={selectedRecord}
          onModeChange={changeMode}
          onStartPick={(kind) => { setSelectedRecord(null); setDraftKind(kind); }}
          onCancelDraft={cancelDraft}
          onPreviewCategory={setPreviewCategoryId}
          onDirtyChange={setEditingDirty}
          onSaveRecord={saveRecord}
          onDeleteRecord={deleteRecord}
          onSelectRecord={selectRecord}
          onEditRecord={editRecord}
        />
      </main>
      <dialog
        className="discard-dialog"
        ref={discardDialogRef}
        aria-labelledby="discard-title"
        onCancel={() => { discardActionRef.current = null; setConfirmation(null); }}
      >
        <h2 id="discard-title">{confirmation?.title}</h2>
        <p>{confirmation?.message}</p>
        <div className="discard-dialog-actions">
          <button type="button" onClick={() => { discardActionRef.current = null; setConfirmation(null); }}>{confirmation?.cancel}</button>
          <button className="primary-button" type="button" onClick={confirmDiscard}>{confirmation?.action}</button>
        </div>
      </dialog>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useAdminSession();
  const [logoutError, setLogoutError] = useState('');

  async function handleLogout() {
    setLogoutError('');
    try {
      const response = await fetch('/api/admin/logout', { method: 'POST' });
      if (!response.ok && response.status !== 401) throw new Error(`HTTP ${response.status}`);
      setSession({ state: 'guest', username: '' });
    } catch {
      setLogoutError('Could not log out. Please try again.');
    }
  }

  if (session.state === 'checking') {
    return (
      <main className="session-loading">
        <img src={petassosLogo} alt="Petassos Travel" />
        <p>Opening your workspace…</p>
      </main>
    );
  }

  if (session.state === 'guest') {
    return <LoginPage onLogin={(username) => setSession({ state: 'admin', username })} />;
  }

  return <AdminPage onLogout={handleLogout} logoutError={logoutError} />;
}
