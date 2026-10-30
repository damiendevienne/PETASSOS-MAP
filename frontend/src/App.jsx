import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import petassosLogo from './assets/petassos-logo-animated.svg';
import { AdminHeader, LoginPage } from './AdminShell.jsx';
import MapView from './MapView.jsx';
import ZonePanel from './ZonePanel.jsx';
import SharingPanel from './SharingPanel.jsx';
import TravellerPage from './TravellerPage.jsx';
import RecordCard, { recordInViewport } from './RecordCard.jsx';
import ArchivePanel from './ArchivePanel.jsx';
import MobileSheetHandle from './MobileSheetHandle.jsx';
import RecordForm from './RecordForm.jsx';
import CsvImportDialog from './CsvImportDialog.jsx';
import { api } from './api.js';
import { ADMIN_COLLECTIONS, COLLECTIONS, MODE_CONFIG, MODES, RECORD_KINDS, collectionForKind, modeForKind } from './constants.js';

function useAdminSession(publicRoute = false) {
  const [session, setSession] = useState({ state: 'checking', username: '', role: '' });

  useEffect(() => {
    if (publicRoute) return undefined;
    const controller = new AbortController();

    api.get('/api/admin/session', { signal: controller.signal })
      .then((data) => {
        setSession({ state: 'admin', username: data.username, role: data.role });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setSession({ state: 'guest', username: '', role: '' });
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

async function loadAdminCollection(collection, signal) {
  return Promise.all([
    api.get(`/api/admin/${collection}`, { signal }),
    api.get(`/api/admin/${collection}?archived=true`, { signal }),
  ]);
}


function WorkPanel({ mode, categories, places, searchPlaces, notes, zones, selectedZoneId, zoneDraft, zoneDrawing, editingZone, zoneError, viewport, loadError, picking, draftKind, draftLocation, editingRecord, editorError, selectedRecord, publicationFilter, onPublicationFilterChange, onShowAll, onSearchSelect, onModeChange, onStartPick, onCancelDraft, onPreviewCategory, onDirtyChange, onSaveRecord, onArchiveRecord, onSelectRecord, onEditRecord, onStartZone, onSelectZone, onEditZone, onFocusZone, onArchiveZone, onSaveZone, onCancelZone, onZoneNameChange, onZoneAboutTitleChange, onZoneAboutTextChange, onZoneLockChange, onRedrawZone, archiveOpen, archiveItems, archiveError, role, onRestoreArchived, onDeleteArchived, onCloseArchive }) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const selectedCardRef = useRef(null);
  const listScrollRef = useRef(null);
  const content = MODE_CONFIG[mode];
  const records = mode === MODES.PLACES ? places : mode === MODES.NOTES ? notes : [];
  const searchRecords = mode === MODES.PLACES ? searchPlaces : mode === MODES.NOTES ? notes : [];
  const searchResults = searchQuery.trim() ? searchRecords.filter((record) => (
    record.name.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())
  )) : [];
  const searching = mode !== MODES.ZONES && Boolean(searchQuery.trim());
  const visibleRecords = records.filter((record) => recordInViewport(record, viewport));
  const displayedRecords = searching ? searchResults : visibleRecords;

  useEffect(() => { setSearchQuery(''); }, [mode]);
  useEffect(() => { listScrollRef.current?.scrollTo(0, 0); }, [searchQuery, mode]);
  useEffect(() => { selectedCardRef.current?.scrollIntoView({ block: 'nearest' }); }, [selectedRecord, viewport, mode, searching, expanded]);
  useEffect(() => { if (selectedRecord || selectedZoneId) setExpanded(true); }, [selectedRecord, selectedZoneId]);

  if (archiveOpen) return <aside className="work-panel work-panel-expanded">
    <ArchivePanel items={archiveItems} role={role} error={archiveError} onRestore={onRestoreArchived} onDelete={onDeleteArchived} onClose={onCloseArchive} />
  </aside>;

  return (
    <aside className={`work-panel${expanded ? ' work-panel-expanded' : ''}`}>
      <MobileSheetHandle expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
      <div className="mode-tabs" role="tablist" aria-label="Admin map mode">
        {Object.values(MODES).filter((item) => item !== MODES.SHARING).map((item) => (
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
        {mode === MODES.ZONES ? <ZonePanel
          zones={zones}
          selectedId={selectedZoneId}
          draft={zoneDraft}
          drawing={zoneDrawing}
          editing={editingZone}
          error={zoneError || loadError}
          role={role}
          onNameChange={onZoneNameChange}
          onAboutTitleChange={onZoneAboutTitleChange}
          onAboutTextChange={onZoneAboutTextChange}
          onLockChange={onZoneLockChange}
          onSelect={onSelectZone}
          onEdit={onEditZone}
          onFocus={onFocusZone}
          onArchive={onArchiveZone}
          onSave={onSaveZone}
          onCancel={onCancelZone}
          onRedraw={onRedrawZone}
        /> : draftLocation ? (
          <>
            <div className="work-panel-heading"><h1>{editingRecord ? 'Edit' : 'New'} {(editingRecord?.kind ?? draftKind) === RECORD_KINDS.NOTE ? 'note' : 'place'}</h1></div>
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
              onArchive={onArchiveRecord}
              error={editorError}
            />
          </>
        ) : picking ? (
          <div className="empty-state">
            <span className="empty-state-mark" aria-hidden="true">⌖</span>
            <p>Click the map where you want to add the {draftKind === RECORD_KINDS.NOTE ? 'note' : 'place'}.</p>
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
                {(mode === MODES.PLACES || mode === MODES.NOTES) && <button className="show-all-button" type="button" disabled={mode === MODES.PLACES ? !places.length : !notes.length} onClick={onShowAll}>Show all</button>}
              </div>}
            </div>
            {loadError && mode !== MODES.ZONES && <p className="form-error" role="alert">{loadError}</p>}
            {mode !== MODES.ZONES && <>
              <div className="record-search-field">
                <input
                  className="record-search"
                  type="search"
                  aria-label={`Search ${mode.toLowerCase()}`}
                  placeholder={mode === MODES.PLACES ? `Search among ${searchPlaces.length} places…` : 'Search notes…'}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery && <button className="record-search-clear" type="button" aria-label="Clear search" onClick={() => setSearchQuery('')}>×</button>}
              </div>
              <p className="current-view-label">{searching ? `SEARCH RESULTS IN ALL ${mode.toUpperCase()} (${searchResults.length})` : `${mode.toUpperCase()} IN CURRENT VIEW`}</p>
              {!searching && mode === MODES.PLACES && <div className="place-list-controls">
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
        <button className="primary-button" type="button" disabled={mode === MODES.PLACES && categories.length === 0} onClick={() => mode === MODES.ZONES ? onStartZone() : onStartPick(mode === MODES.NOTES ? RECORD_KINDS.NOTE : RECORD_KINDS.PLACE)}>
          <span aria-hidden="true">＋</span> {content.action}
        </button>
      </div>}
    </aside>
  );
}

function AdminPage({ onLogout, logoutError, role }) {
  const [sketchTheme, setSketchTheme] = useState(false);
  const [mode, setMode] = useState(MODES.PLACES);
  const [categories, setCategories] = useState([]);
  const [places, setPlaces] = useState([]);
  const [notes, setNotes] = useState([]);
  const [zones, setZones] = useState([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveItems, setArchiveItems] = useState({ places: [], notes: [], zones: [] });
  const [archiveError, setArchiveError] = useState('');
  const [csvImportOpen, setCsvImportOpen] = useState(false);
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
    ? zoneDraft.name !== editingZone.name || zoneDraft.about_title !== editingZone.about_title || zoneDraft.about_text !== editingZone.about_text || Boolean(zoneDraft.locked) !== Boolean(editingZone.locked) || ['min_lat', 'max_lat', 'min_lon', 'max_lon'].some((key) => zoneDraft[key] !== editingZone[key])
    : zoneDraft.name.trim() || zoneDraft.about_title.trim() || zoneDraft.about_text.trim() || zoneDraft.locked || zoneDraft.min_lat !== null));
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

  async function refreshCollection(collection) {
    const [active, archived] = await loadAdminCollection(collection);
    if (collection === COLLECTIONS.PLACES) setPlaces(active);
    if (collection === COLLECTIONS.NOTES) setNotes(active);
    if (collection === COLLECTIONS.ZONES) setZones(active);
    setArchiveItems((current) => ({ ...current, [collection]: archived }));
  }

  async function changeArchive(collection, id, archived) {
    await api.patch(`/api/admin/${collection}/${id}/archive`, { archived });
    await refreshCollection(collection);
  }

  function openArchive() {
    const open = () => {
      clearDraft();
      setSharingDirty(false);
      setShareZoneDraft(null);
      setSharingView(null);
      setMapAction(null);
      setArchiveOpen(true);
      setArchiveError('');
      Promise.all(ADMIN_COLLECTIONS.map(refreshCollection))
        .catch(() => setArchiveError('Could not load the archive.'));
    };
    if (sharingDirty || activeDirty) {
      discardActionRef.current = open;
      setConfirmation({ title: 'Leave current work?', message: 'Your unfinished changes will be lost.', action: 'Continue to archive', cancel: 'Keep editing' });
    } else open();
  }

  function enterSharing(view) {
    if (sharing && sharingView === view) return;
    setMapAction(null);
    setArchiveOpen(false);
    setEditingSharedMap(null);
    setSharingView(view);
  }

  function exitSharing() {
    const leave = () => {
      setSharingDirty(false);
      setShareZoneDraft(null);
      setSharingView(null);
      setMapAction(null);
      api.get('/api/admin/zones').then(setZones).catch(() => {});
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
    const ids = Array.isArray(categoryId) ? categoryId : [categoryId];
    setHiddenCategoryIds((current) => ids.every((id) => !current.includes(id))
      ? [...current, ...ids]
      : current.filter((id) => !ids.includes(id)));
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
      api.get('/api/admin/categories', { signal: controller.signal }),
      api.get('/api/admin/places', { signal: controller.signal }),
      api.get('/api/admin/notes', { signal: controller.signal }),
      api.get('/api/admin/zones', { signal: controller.signal }),
    ]).then(([nextCategories, nextPlaces, nextNotes, nextZones]) => {
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
      title: `Discard this unfinished ${activeKind === RECORD_KINDS.ZONE ? 'zone' : activeKind === RECORD_KINDS.NOTE ? 'note' : 'place'}?`,
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
      if (record) setMode(modeForKind(record.kind));
    });
  }

  function selectSearchRecord(record) {
    if (record.kind === RECORD_KINDS.NOTE) {
      setNotesVisible(true);
    } else {
      setHiddenCategoryIds((current) => current.filter((id) => id !== record.category_id));
      if (publicationFilter !== 'All' && Boolean(record.published) !== (publicationFilter === 'Published')) {
        setPublicationFilter('All');
      }
    }
    setSelectedRecord({ kind: record.kind, id: record.id });
    setSelectedZoneId(null);
    setMode(modeForKind(record.kind));
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
    const collection = collectionForKind(kind);
    const savedRecord = editingRecord
      ? await api.put(`/api/admin/${collection}/${editingRecord.id}`, record)
      : await api.post(`/api/admin/${collection}`, record);
    const updateList = (current) => editingRecord
      ? current.map((item) => item.id === savedRecord.id ? savedRecord : item)
      : [savedRecord, ...current];
    if (kind === RECORD_KINDS.NOTE) setNotes(updateList);
    else setPlaces(updateList);
    setSelectedRecord({ kind: savedRecord.kind, id: savedRecord.id });
    if (!editingRecord) setEditingRecord(savedRecord);
    if (imageChanges.dirty) {
      const body = new FormData();
      body.append('manifest', JSON.stringify(imageChanges.manifest));
      imageChanges.newFiles.forEach((file) => body.append('files', file));
      let savedImages;
      try {
        savedImages = await api.put(`/api/admin/${collection}/${savedRecord.id}/images`, body);
      } catch (error) {
        throw new Error(`The record was saved, but its images were not: ${error.detail || 'please try again.'}`);
      }
      const withCover = { ...savedRecord, cover_image_id: savedImages[0]?.id ?? null };
      if (kind === RECORD_KINDS.NOTE) setNotes((current) => current.map((item) => item.id === withCover.id ? withCover : item));
      else setPlaces((current) => current.map((item) => item.id === withCover.id ? withCover : item));
    }
    clearDraft();
  }

  function archiveRecord() {
    if (!editingRecord) return;
    const record = editingRecord;
    discardActionRef.current = async () => {
      try {
        const collection = collectionForKind(record.kind);
        await changeArchive(collection, record.id, true);
        setSelectedRecord(null);
        clearDraft();
      } catch {
        setEditorError(`The ${record.kind === RECORD_KINDS.NOTE ? 'note' : 'place'} could not be archived. Please try again.`);
      }
    };
    setConfirmation({
      title: `Archive ${record.name}?`,
      message: editingDirty ? 'Unsaved edits will be lost. You can restore the saved item later from the Archive menu.' : 'You can restore it later from the Archive menu.',
      action: 'Archive',
      cancel: 'Keep',
    });
  }

  function startZone() {
    requestDiscard(() => {
      clearDraft();
      setSelectedRecord(null);
      setSelectedZoneId(null);
      setZoneDraft({ name: '', about_title: '', about_text: '', locked: false, min_lat: null, max_lat: null, min_lon: null, max_lon: null });
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
      setMode(MODES.ZONES);
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
      about_title: zoneDraft.about_title,
      about_text: zoneDraft.about_text,
      locked: Boolean(zoneDraft.locked),
      min_lat: zoneDraft.min_lat, max_lat: zoneDraft.max_lat,
      min_lon: zoneDraft.min_lon, max_lon: zoneDraft.max_lon,
    };
    try {
      let saved;
      try {
        saved = editingZone
          ? await api.put(`/api/admin/zones/${editingZone.id}`, payload)
          : await api.post('/api/admin/zones', payload);
      } catch (error) {
        if (error.status === 409) throw new Error('A zone with this name already exists.');
        throw new Error('The zone could not be saved. Please try again.');
      }
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
    if (!zoneDraft?.name.trim() || zoneDraft.min_lat === null || zoneDrawing || Boolean(zoneDraft.about_title?.trim()) !== Boolean(zoneDraft.about_text?.trim())) return;
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

  function archiveZone(zone) {
    if (!zone.can_archive) {
      setZoneError(`This zone is used by ${zone.used_by_count} shared maps. Edit those maps before archiving it.`);
      return;
    }
    discardActionRef.current = async () => {
      try {
        await changeArchive(COLLECTIONS.ZONES, zone.id, true);
        setSelectedZoneId(null);
        if (editingZone?.id === zone.id) clearDraft();
        setZoneError('');
      } catch {
        setZoneError('The zone could not be archived. It may be used by a shared map.');
      }
    };
    setConfirmation({ title: `Archive ${zone.name}?`, message: zoneDirty ? 'Unsaved edits will be lost. You can restore the saved zone later from the Archive menu.' : 'You can restore it later from the Archive menu.', action: 'Archive', cancel: 'Keep' });
  }

  function restoreArchived(collection, item) {
    const effect = collection === COLLECTIONS.PLACES
      ? 'It will return to the working map and may be visible to clients again if it is published and shared.'
      : collection === COLLECTIONS.NOTES
        ? 'It will return to the admin map. Notes remain internal and are not shown to clients.'
        : 'It will return to the zone list and its outline will appear on the admin map.';
    discardActionRef.current = async () => {
      setArchiveError('');
      try {
        await changeArchive(collection, item.id, false);
      } catch (error) {
        setArchiveError(error.message || 'Could not restore this item.');
      }
    };
    setConfirmation({
      title: `Unarchive ${item.name}?`,
      message: effect,
      action: 'Unarchive',
      cancel: 'Keep archived',
    });
  }

  function deleteArchived(collection, item) {
    if (role !== 'superadmin') return;
    discardActionRef.current = async () => {
      try {
        await api.delete(`/api/admin/${collection}/${item.id}`);
        await refreshCollection(collection);
        setArchiveError('');
      } catch (error) {
        setArchiveError(error.message || 'Could not delete this item.');
      }
    };
    const message = collection === COLLECTIONS.ZONES
      ? 'This permanently deletes the archived zone, including its boundaries and About information. It cannot be restored.'
      : 'This removes the item from Petassos permanently. It cannot be restored.';
    setConfirmation({ title: `Delete ${item.name} permanently?`, message, action: 'Delete permanently', cancel: 'Keep archived' });
  }

  return (
    <div className={`admin-page${sketchTheme ? ' sketch-theme' : ''}`} onClickCapture={handleOutsideClick}>
      <AdminHeader onLogout={() => {
        const logOut = () => requestDiscard(() => { clearDraft(); onLogout(); });
        if (sharingDirty) {
          discardActionRef.current = logOut;
          setConfirmation({ title: 'Discard changes to this shared map?', message: 'Your unfinished changes will be lost.', action: 'Discard', cancel: 'Keep editing' });
        } else logOut();
      }} logoutError={logoutError} role={role} sharing={sharing} onShare={() => enterSharing('create')} onSharedMaps={() => sharing ? changeSharingView('list') : enterSharing('list')} archiveOpen={archiveOpen} onArchive={() => archiveOpen ? setArchiveOpen(false) : openArchive()} onBack={exitSharing} onImportCsv={() => setCsvImportOpen(true)} sketchTheme={sketchTheme} onToggleSketchTheme={() => setSketchTheme((current) => !current)} />
      <main className={`admin-main${sharing ? ' sharing-mode' : ''}`}>
        <MapView
          sharing={sharing}
          mapAction={mapAction}
          mode={sharing ? MODES.SHARING : mode}
          places={sharing ? sharePreview.places : visiblePlaces}
          notes={sharing ? [] : notesVisible ? notes : []}
          zones={zones}
          selectedZoneId={sharing ? sharePreview.zoneIds : selectedZoneId}
          zoneDraft={sharing ? shareZoneDraft : zoneDraft}
          zoneBoundsLocked={!sharing && Boolean(editingZone?.locked) && role !== 'superadmin'}
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
          onSelectRecord={sharing ? () => {} : (record) => { setArchiveOpen(false); selectRecord(record); }}
          onDeselectRecord={sharing ? () => {} : deselectRecord}
          onSelectZone={sharing ? (zoneId) => setMapZoneToggle({ id: zoneId, at: Date.now() }) : (zoneId) => { setArchiveOpen(false); selectZone(zones.find((zone) => zone.id === zoneId)); }}
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
          onShowAll={() => setMapAction({ type: 'fit', records: mode === MODES.NOTES ? notes : visiblePlaces })}
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
          onArchiveRecord={archiveRecord}
          onSelectRecord={selectRecord}
          onEditRecord={editRecord}
          onStartZone={startZone}
          onSelectZone={selectZone}
          onEditZone={editZone}
          onFocusZone={focusZone}
          onArchiveZone={archiveZone}
          onSaveZone={saveZone}
          onCancelZone={() => requestDiscard(clearDraft)}
          onZoneNameChange={(name) => setZoneDraft((current) => ({ ...current, name }))}
          onZoneAboutTitleChange={(about_title) => setZoneDraft((current) => ({ ...current, about_title }))}
          onZoneAboutTextChange={(about_text) => setZoneDraft((current) => ({ ...current, about_text }))}
          onZoneLockChange={(locked) => setZoneDraft((current) => ({ ...current, locked }))}
          onRedrawZone={() => setZoneDraft((current) => ({ ...current, min_lat: null, max_lat: null, min_lon: null, max_lon: null }))}
          archiveOpen={archiveOpen}
          archiveItems={archiveItems}
          archiveError={archiveError}
          role={role}
          onRestoreArchived={restoreArchived}
          onDeleteArchived={deleteArchived}
          onCloseArchive={() => setArchiveOpen(false)}
        /></div>
        {sharing && <SharingPanel view={sharingView} editingMap={editingSharedMap} zones={zones} categories={categories} places={places} role={role} zoneDraft={shareZoneDraft} setZoneDraft={setShareZoneDraft} zoneDrawing={shareZoneDrawing} mapZoneToggle={mapZoneToggle} onZoneCreated={(zone) => setZones((current) => [...current, zone].sort((a, b) => a.name.localeCompare(b.name)))} onPreviewChange={updateSharePreview} onDirtyChange={setSharingDirty} onChangeView={changeSharingView} onClose={exitSharing} onCancelZone={cancelShareZone} onConfirm={(details, action) => { discardActionRef.current = action; setConfirmation(details); }} />}
      </main>
      <CsvImportDialog open={csvImportOpen} onClose={() => setCsvImportOpen(false)} onImported={() => { refreshCollection(COLLECTIONS.PLACES).catch(() => setLoadError('Places could not be refreshed after import.')); setMode(MODES.PLACES); }} />
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
      await api.post('/api/admin/logout');
      setSession({ state: 'guest', username: '', role: '' });
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
    return <LoginPage onLogin={(data) => setSession({ state: 'admin', username: data.username, role: data.role })} />;
  }

  return <AdminPage onLogout={handleLogout} logoutError={logoutError} role={session.role} />;
}
