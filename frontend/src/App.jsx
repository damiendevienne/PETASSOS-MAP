import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import petassosLogo from './assets/petassos-logo-animated.svg';
import MapView from './MapView.jsx';
import ZonePanel from './ZonePanel.jsx';
import SharingPanel from './SharingPanel.jsx';
import TravellerPage from './TravellerPage.jsx';
import RecordCard, { recordInViewport } from './RecordCard.jsx';
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

function useAdminSession(publicRoute = false) {
  const [session, setSession] = useState({ state: 'checking', username: '' });

  useEffect(() => {
    if (publicRoute) return undefined;
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
  }, [publicRoute]);

  useEffect(() => {
    if (publicRoute || session.state === 'checking') return;
    const path = session.state === 'admin' ? '/admin' : '/admin/login';
    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  }, [session.state, publicRoute]);

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

function AdminHeader({ onLogout, logoutError, sharing, onShare, onSharedMaps, onBack }) {
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
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onSharedMaps(); }}>Shared maps</button>
              <button type="button" role="menuitem" disabled>Import CSV</button>
              <button className="mobile-share-item" type="button" role="menuitem" onClick={() => { setMenuOpen(false); sharing ? onBack() : onShare(); }}>
                {sharing ? 'Map administration' : 'Share map with client'}
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
  const [images, setImages] = useState(record ? null : []);
  const [imageError, setImageError] = useState('');
  const imageUrlsRef = useRef([]);
  const initialImageIdsRef = useRef([]);
  const initialRecordIdRef = useRef(record?.id ?? null);
  const initialLocationRef = useRef(location);
  const initialCategoryIdRef = useRef(categoryId);

  useEffect(() => {
    if (!initialRecordIdRef.current) return undefined;
    const controller = new AbortController();
    const collection = isNote ? 'notes' : 'places';
    fetch(`/api/admin/${collection}/${initialRecordIdRef.current}/images`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load images');
        return response.json();
      })
      .then((loaded) => {
        initialImageIdsRef.current = loaded.map((image) => image.id);
        setImages(loaded.map((image) => ({ ...image, originalCaption: image.caption })));
      })
      .catch((failure) => { if (failure.name !== 'AbortError') setImageError('Images could not be loaded.'); });
    return () => controller.abort();
  }, [isNote]);

  useEffect(() => () => imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const imagesDirty = Boolean(images && (
    images.length !== initialImageIdsRef.current.length ||
    images.some((image, index) => image.file || image.id !== initialImageIdsRef.current[index] || image.caption !== image.originalCaption)
  ));

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
  const formDirty = isDirty || imagesDirty;

  useEffect(() => {
    onDirtyChange(formDirty);
  }, [formDirty, onDirtyChange]);

  function addImages(event) {
    const selected = Array.from(event.target.files || []).map((file) => {
      const url = URL.createObjectURL(file);
      imageUrlsRef.current.push(url);
      return { file, url, caption: '' };
    });
    setImages((current) => [...current, ...selected]);
    event.target.value = '';
  }

  function moveImage(index, direction) {
    setImages((current) => {
      const reordered = [...current];
      [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
      return reordered;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!images || imageError) return;
    setSaving(true);
    setError('');
    try {
      const newFiles = [];
      const manifest = images.map((image) => {
        if (!image.file) return { id: image.id, caption: image.caption };
        newFiles.push(image.file);
        return { new_index: newFiles.length - 1, caption: image.caption };
      });
      await onSave({
        name, category_id: isNote ? null : Number(categoryId), description, author,
        published: isNote ? false : published,
        latitude: location.latitude, longitude: location.longitude,
      }, {
        manifest,
        newFiles,
        dirty: imagesDirty,
      });
    } catch (failure) {
      setError(failure.message || `The ${isNote ? 'note' : 'place'} could not be saved. Please try again.`);
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
      <div className="record-images">
        <span className="field-label">Images <span className="optional-label">(optional)</span></span>
        {images?.length > 1 && <p className="image-hint">The first image appears on the card.</p>}
        {imageError && <p className="form-error" role="alert">{imageError}</p>}
        {images === null && !imageError && <p className="image-hint">Loading images…</p>}
        {images?.map((image, index) => (
          <div className="record-image" key={image.id ?? image.url}>
            <img src={image.url} alt={image.caption || `Image ${index + 1}`} />
            <div>
              <input aria-label={`Caption for image ${index + 1} (optional)`} placeholder="Caption (optional)" value={image.caption} disabled={saving} onChange={(event) => setImages((current) => current.map((item) => item === image ? { ...item, caption: event.target.value } : item))} />
              <div className="record-image-actions">
                <button type="button" aria-label={`Move image ${index + 1} up`} title="Move up" disabled={saving || index === 0} onClick={() => moveImage(index, -1)}>↑</button>
                <button type="button" aria-label={`Move image ${index + 1} down`} title="Move down" disabled={saving || index === images.length - 1} onClick={() => moveImage(index, 1)}>↓</button>
                <button type="button" disabled={saving} onClick={() => setImages((current) => current.filter((item) => item !== image))}>Remove</button>
              </div>
            </div>
          </div>
        ))}
        <label className="add-image-button" htmlFor="record-image-upload">Add images</label>
        <input id="record-image-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={saving || images === null} onChange={addImages} />
      </div>
      {(error || actionError) && <p className="form-error" role="alert">{error || actionError}</p>}
      <div className="place-form-actions">
        <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="primary-button" type="submit" disabled={saving || images === null || Boolean(imageError)}>{saving ? 'Saving…' : `Save ${isNote ? 'note' : 'place'}`}</button>
      </div>
      {record && <button className="delete-record-button" type="button" onClick={onDelete} disabled={saving}>Delete {isNote ? 'note' : 'place'}</button>}
    </form>
  );
}

function WorkPanel({ mode, categories, places, searchPlaces, notes, zones, selectedZoneId, zoneDraft, zoneDrawing, editingZone, zoneError, viewport, loadError, picking, draftKind, draftLocation, editingRecord, editorError, selectedRecord, publicationFilter, onPublicationFilterChange, onShowAll, onSearchSelect, onModeChange, onStartPick, onCancelDraft, onPreviewCategory, onDirtyChange, onSaveRecord, onDeleteRecord, onSelectRecord, onEditRecord, onStartZone, onSelectZone, onEditZone, onFocusZone, onDeleteZone, onSaveZone, onCancelZone, onZoneNameChange, onRedrawZone }) {
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
  const visibleRecords = records.filter((record) => recordInViewport(record, viewport));
  const displayedRecords = searching ? searchResults : visibleRecords;

  useEffect(() => { setSearchQuery(''); }, [mode]);
  useEffect(() => { listScrollRef.current?.scrollTo(0, 0); }, [searchQuery, mode]);
  useEffect(() => { selectedCardRef.current?.scrollIntoView({ block: 'nearest' }); }, [selectedRecord, viewport, mode, searching, expanded]);
  useEffect(() => { if (selectedRecord || selectedZoneId) setExpanded(true); }, [selectedRecord, selectedZoneId]);

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
            onClick={() => { onModeChange(item); setExpanded(true); }}
          >
            <span>{item}</span>
            <span className="mobile-tab-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <div
        className={`work-panel-content${!draftLocation && !picking && !zoneDraft ? ' work-panel-list-mode' : ''}`}
        id="admin-work-content"
        role="tabpanel"
        aria-labelledby={`tab-${mode.toLowerCase()}`}
      >
        {mode === 'Zones' ? <ZonePanel
          zones={zones}
          selectedId={selectedZoneId}
          draft={zoneDraft}
          drawing={zoneDrawing}
          editing={editingZone}
          error={zoneError || loadError}
          onNameChange={onZoneNameChange}
          onSelect={onSelectZone}
          onEdit={onEditZone}
          onFocus={onFocusZone}
          onDelete={onDeleteZone}
          onSave={onSaveZone}
          onCancel={onCancelZone}
          onRedraw={onRedrawZone}
        /> : draftLocation ? (
          <>
            <div className="work-panel-heading"><h1>{editingRecord ? 'Edit' : 'New'} {(editingRecord?.kind ?? draftKind) === 'NOTE' ? 'note' : 'place'}</h1></div>
            <RecordForm
              key={draftKind ? `new-${draftKind}` : `${editingRecord.kind}-${editingRecord.id}`}
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
                    <RecordCard
                      key={`${record.kind}-${record.id}`}
                      record={record}
                      selected={selected}
                      selectedRef={selectedCardRef}
                      coverUrl={record.cover_image_id ? `/api/admin/images/${record.cover_image_id}/file` : null}
                      showPublication
                      onSelect={() => {
                        if (searching) {
                          setSearchQuery('');
                          onSearchSelect(record);
                        } else {
                          onSelectRecord(selected ? null : { kind: record.kind, id: record.id });
                        }
                      }}
                      onEdit={() => onEditRecord(record)}
                      onFocus={() => onSearchSelect(record)}
                    />
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
      {!draftLocation && !picking && !zoneDraft && <div className="work-panel-footer">
        <button className="primary-button" type="button" disabled={mode === 'Places' && categories.length === 0} onClick={() => mode === 'Zones' ? onStartZone() : onStartPick(mode === 'Notes' ? 'NOTE' : 'PLACE')}>
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
  const [zones, setZones] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [zoneDraft, setZoneDraft] = useState(null);
  const [zoneDrawing, setZoneDrawing] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [zoneError, setZoneError] = useState('');
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
  const [sharingView, setSharingView] = useState(null);
  const [editingSharedMap, setEditingSharedMap] = useState(null);
  const [sharingDirty, setSharingDirty] = useState(false);
  const [shareZoneDraft, setShareZoneDraft] = useState(null);
  const [shareZoneDrawing, setShareZoneDrawing] = useState(false);
  const [sharePreview, setSharePreview] = useState({ zones: [], places: [], categoryIds: [], zoneIds: [] });
  const [mapZoneToggle, setMapZoneToggle] = useState(null);
  const sharing = Boolean(sharingView);

  useEffect(() => { if (!shareZoneDraft) setShareZoneDrawing(false); }, [shareZoneDraft]);
  const discardDialogRef = useRef(null);
  const discardActionRef = useRef(null);
  const picking = Boolean(draftKind && !draftLocation);
  const activeKind = editingRecord?.kind ?? draftKind ?? (zoneDraft ? 'ZONE' : null);
  const zoneDirty = Boolean(zoneDraft && (editingZone
    ? zoneDraft.name !== editingZone.name || ['min_lat', 'max_lat', 'min_lon', 'max_lon'].some((key) => zoneDraft[key] !== editingZone[key])
    : zoneDraft.name.trim() || zoneDraft.min_lat !== null));
  const activeDirty = zoneDraft ? zoneDirty : editingDirty;
  const visiblePlaces = useMemo(
    () => places.filter((place) => !hiddenCategoryIds.includes(place.category_id) && (
      publicationFilter === 'All' || Boolean(place.published) === (publicationFilter === 'Published')
    )),
    [places, hiddenCategoryIds, publicationFilter],
  );

  const updateSharePreview = useCallback((preview) => {
    setSharePreview(preview);
    setMapAction(preview.zones.length ? { type: 'zones', zones: preview.zones } : null);
  }, []);

  function enterSharing(view) {
    if (sharing && sharingView === view) return;
    setMapAction(null);
    setEditingSharedMap(null);
    setSharingView(view);
  }

  function exitSharing() {
    const leave = () => {
      setSharingDirty(false);
      setShareZoneDraft(null);
      setSharingView(null);
      setMapAction(null);
      fetch('/api/admin/zones').then((response) => response.ok ? response.json() : null).then((data) => { if (data) setZones(data); }).catch(() => {});
    };
    if (sharingDirty) {
      discardActionRef.current = leave;
      setConfirmation({ title: 'Discard changes to this shared map?', message: 'Your unfinished changes will be lost.', action: 'Discard', cancel: 'Keep editing' });
    } else leave();
  }

  function changeSharingView(view, shared = null, force = false) {
    const change = () => {
      setSharingDirty(false);
      setShareZoneDraft(null);
      setEditingSharedMap(shared);
      setSharingView(view);
    };
    if (sharingDirty && !force) {
      discardActionRef.current = change;
      setConfirmation({ title: 'Discard changes to this shared map?', message: 'Your unfinished changes will be lost.', action: 'Discard', cancel: 'Keep editing' });
    } else change();
  }

  function cancelShareZone() {
    const cancel = () => setShareZoneDraft(null);
    if (shareZoneDraft?.name.trim() || shareZoneDraft?.min_lat !== null || shareZoneDrawing) {
      discardActionRef.current = cancel;
      setConfirmation({ title: 'Discard this unfinished zone?', message: 'Your changes will be lost.', action: 'Discard', cancel: 'Keep editing' });
    } else cancel();
  }

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
      fetch('/api/admin/zones', { signal: controller.signal }),
    ]).then(async ([categoriesResponse, placesResponse, notesResponse, zonesResponse]) => {
      if (!categoriesResponse.ok || !placesResponse.ok || !notesResponse.ok || !zonesResponse.ok) throw new Error('Load failed');
      const [nextCategories, nextPlaces, nextNotes, nextZones] = await Promise.all([
        categoriesResponse.json(), placesResponse.json(), notesResponse.json(), zonesResponse.json(),
      ]);
      setCategories(nextCategories);
      setPlaces(nextPlaces);
      setNotes(nextNotes);
      setZones(nextZones);
    }).catch((error) => {
      if (error.name !== 'AbortError') setLoadError('Map data could not be loaded.');
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!activeDirty) return undefined;
    const warnOnLeave = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnOnLeave);
    return () => window.removeEventListener('beforeunload', warnOnLeave);
  }, [activeDirty]);

  function clearDraft() {
    setDraftKind(null);
    setDraftLocation(null);
    setEditingRecord(null);
    setPreviewCategoryId(null);
    setEditingDirty(false);
    setEditorError('');
    setZoneDraft(null);
    setZoneDrawing(false);
    setEditingZone(null);
    setZoneError('');
  }

  function requestDiscard(action) {
    if (!activeKind || !activeDirty) {
      action();
      return;
    }
    discardActionRef.current = action;
    setConfirmation({
      title: `Discard this unfinished ${activeKind === 'ZONE' ? 'zone' : activeKind === 'NOTE' ? 'note' : 'place'}?`,
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
      setSelectedZoneId(null);
      setMode(nextMode);
    });
  }

  function deselectRecord() {
    if (!activeKind) setSelectedRecord(null);
  }

  function handleOutsideClick(event) {
    if (sharing || (!selectedRecord && !selectedZoneId) || activeKind || confirmation) return;
    if (event.target.closest('.place-card-row, .maplibregl-canvas')) return;
    setSelectedRecord(null);
    setSelectedZoneId(null);
  }

  function selectRecord(record) {
    requestDiscard(() => {
      clearDraft();
      setSelectedRecord(record);
      setSelectedZoneId(null);
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
    setSelectedZoneId(null);
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
      setSelectedZoneId(null);
    });
  }

  async function saveRecord(record, imageChanges) {
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
    if (!editingRecord) setEditingRecord(savedRecord);
    if (imageChanges.dirty) {
      const body = new FormData();
      body.append('manifest', JSON.stringify(imageChanges.manifest));
      imageChanges.newFiles.forEach((file) => body.append('files', file));
      const imageResponse = await fetch(`/api/admin/${collection}/${savedRecord.id}/images`, {
        method: 'PUT', body,
      });
      if (!imageResponse.ok) {
        const detail = await imageResponse.json().catch(() => ({}));
        throw new Error(`The record was saved, but its images were not: ${detail.detail || 'please try again.'}`);
      }
      const savedImages = await imageResponse.json();
      const withCover = { ...savedRecord, cover_image_id: savedImages[0]?.id ?? null };
      if (kind === 'NOTE') setNotes((current) => current.map((item) => item.id === withCover.id ? withCover : item));
      else setPlaces((current) => current.map((item) => item.id === withCover.id ? withCover : item));
    }
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

  function startZone() {
    requestDiscard(() => {
      clearDraft();
      setSelectedRecord(null);
      setSelectedZoneId(null);
      setZoneDraft({ name: '', min_lat: null, max_lat: null, min_lon: null, max_lon: null });
    });
  }

  function focusZone(zone) {
    setMapAction({ type: 'zone', zone });
  }

  function selectZone(zone) {
    requestDiscard(() => {
      clearDraft();
      setSelectedRecord(null);
      setSelectedZoneId(zone?.id ?? null);
      setMode('Zones');
    });
  }

  function editZone(zone) {
    requestDiscard(() => {
      clearDraft();
      setSelectedRecord(null);
      setSelectedZoneId(zone.id);
      setEditingZone(zone);
      setZoneDraft({ ...zone });
      focusZone(zone);
    });
  }

  async function persistZone() {
    if (!zoneDraft) return;
    setZoneError('');
    const payload = {
      name: zoneDraft.name,
      min_lat: zoneDraft.min_lat, max_lat: zoneDraft.max_lat,
      min_lon: zoneDraft.min_lon, max_lon: zoneDraft.max_lon,
    };
    try {
      const response = await fetch(`/api/admin/zones${editingZone ? `/${editingZone.id}` : ''}`, {
        method: editingZone ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        if (response.status === 409) throw new Error('A zone with this name already exists.');
        throw new Error('The zone could not be saved. Please try again.');
      }
      const saved = await response.json();
      setZones((current) => (editingZone
        ? current.map((zone) => zone.id === saved.id ? saved : zone)
        : [...current, saved]
      ).sort((left, right) => left.name.localeCompare(right.name)));
      setSelectedZoneId(saved.id);
      clearDraft();
    } catch (error) {
      setZoneError(error.message || 'The zone could not be saved. Please try again.');
    }
  }

  function saveZone() {
    if (!zoneDraft?.name.trim() || zoneDraft.min_lat === null || zoneDrawing) return;
    const geometryChanged = editingZone && ['min_lat', 'max_lat', 'min_lon', 'max_lon'].some((key) => zoneDraft[key] !== editingZone[key]);
    if (geometryChanged && editingZone.used_by_count > 0) {
      discardActionRef.current = persistZone;
      setConfirmation({
        title: 'Change zone boundaries?',
        message: `This zone is used by ${editingZone.used_by_count} shared map${editingZone.used_by_count === 1 ? '' : 's'}. Their visible places will change immediately.`,
        action: 'Save zone',
        cancel: 'Keep editing',
      });
    } else persistZone();
  }

  function deleteZone(zone) {
    if (!zone.can_delete) {
      setZoneError(`This zone is used by ${zone.used_by_count} shared maps. Edit those maps before deleting it.`);
      return;
    }
    discardActionRef.current = async () => {
      try {
        const response = await fetch(`/api/admin/zones/${zone.id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setZones((current) => current.filter((item) => item.id !== zone.id));
        setSelectedZoneId(null);
        setZoneError('');
      } catch {
        setZoneError('The zone could not be deleted. It may be used by a shared map.');
      }
    };
    setConfirmation({ title: `Delete ${zone.name}?`, message: 'This cannot be undone.', action: 'Delete', cancel: 'Keep' });
  }

  return (
    <div className="admin-page" onClickCapture={handleOutsideClick}>
      <AdminHeader onLogout={() => {
        const logOut = () => requestDiscard(() => { clearDraft(); onLogout(); });
        if (sharingDirty) {
          discardActionRef.current = logOut;
          setConfirmation({ title: 'Discard changes to this shared map?', message: 'Your unfinished changes will be lost.', action: 'Discard', cancel: 'Keep editing' });
        } else logOut();
      }} logoutError={logoutError} sharing={sharing} onShare={() => enterSharing('create')} onSharedMaps={() => sharing ? changeSharingView('list') : enterSharing('list')} onBack={exitSharing} />
      <main className={`admin-main${sharing ? ' sharing-mode' : ''}`}>
        <MapView
          sharing={sharing}
          mapAction={mapAction}
          mode={sharing ? 'Sharing' : mode}
          places={sharing ? sharePreview.places : visiblePlaces}
          notes={sharing ? [] : notesVisible ? notes : []}
          zones={zones}
          selectedZoneId={sharing ? sharePreview.zoneIds : selectedZoneId}
          zoneDraft={sharing ? shareZoneDraft : zoneDraft}
          onZoneDrawingChange={sharing ? setShareZoneDrawing : setZoneDrawing}
          categories={categories}
          hiddenCategoryIds={hiddenCategoryIds}
          notesVisible={notesVisible}
          onToggleCategory={toggleCategory}
          onToggleNotes={() => setNotesVisible((visible) => !visible)}
          onShowAll={showAllMarkers}
          onHideAll={hideAllMarkers}
          picking={sharing ? false : picking}
          draftKind={sharing ? null : draftKind}
          draftLocation={sharing ? null : draftLocation}
          editingRecord={sharing ? null : editingRecord}
          editingCategory={categories.find((category) => category.id === previewCategoryId)}
          selectedRecord={sharing ? null : selectedRecord}
          onPickLocation={setDraftLocation}
          onMoveDraftLocation={setDraftLocation}
          onSelectRecord={sharing ? () => {} : selectRecord}
          onDeselectRecord={sharing ? () => {} : deselectRecord}
          onSelectZone={sharing ? (zoneId) => setMapZoneToggle({ id: zoneId, at: Date.now() }) : (zoneId) => selectZone(zones.find((zone) => zone.id === zoneId))}
          onDeselectZone={sharing ? () => {} : () => { if (!zoneDraft) setSelectedZoneId(null); }}
          onZoneBoundsChange={sharing ? (bounds) => setShareZoneDraft((current) => current ? { ...current, ...bounds } : current) : (bounds) => setZoneDraft((current) => current ? { ...current, ...bounds } : current)}
          onViewportChange={sharing ? () => {} : setViewport}
        />
        <div className={sharing ? 'admin-panel-hidden' : 'admin-panel-visible'} inert={sharing ? '' : undefined}><WorkPanel
          mode={mode}
          categories={categories}
          places={visiblePlaces}
          searchPlaces={places}
          notes={notes}
          zones={zones}
          selectedZoneId={selectedZoneId}
          zoneDraft={zoneDraft}
          zoneDrawing={zoneDrawing}
          editingZone={editingZone}
          zoneError={zoneError}
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
          onStartZone={startZone}
          onSelectZone={selectZone}
          onEditZone={editZone}
          onFocusZone={focusZone}
          onDeleteZone={deleteZone}
          onSaveZone={saveZone}
          onCancelZone={() => requestDiscard(clearDraft)}
          onZoneNameChange={(name) => setZoneDraft((current) => ({ ...current, name }))}
          onRedrawZone={() => setZoneDraft((current) => ({ ...current, min_lat: null, max_lat: null, min_lon: null, max_lon: null }))}
        /></div>
        {sharing && <SharingPanel view={sharingView} editingMap={editingSharedMap} zones={zones} categories={categories} places={places} zoneDraft={shareZoneDraft} setZoneDraft={setShareZoneDraft} zoneDrawing={shareZoneDrawing} mapZoneToggle={mapZoneToggle} onZoneCreated={(zone) => setZones((current) => [...current, zone].sort((a, b) => a.name.localeCompare(b.name)))} onPreviewChange={updateSharePreview} onDirtyChange={setSharingDirty} onChangeView={changeSharingView} onClose={exitSharing} onCancelZone={cancelShareZone} />}
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
  const token = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/)?.[1];
  const [session, setSession] = useAdminSession(Boolean(token));
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

  if (token) return <TravellerPage token={token} />;

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
