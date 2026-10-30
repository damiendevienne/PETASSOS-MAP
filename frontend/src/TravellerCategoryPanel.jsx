import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MobileSheetHandle from './MobileSheetHandle.jsx';
import RecordCard from './RecordCard.jsx';
import { categoryIconUrl } from './markerIcons.js';
import { distanceInKm } from './geoDistance.js';

export default function TravellerCategoryPanel({ group, places, clientPosition, snap, onSnapChange, onClose, onSelectPlace, onFocus, t, translateCategoryName, translateCategoryDescription }) {
  const sheetRef = useRef(null);
  const dragRef = useRef(null);
  const suppressHandleClickRef = useRef(false);
  const categoryTitleRef = useRef(null);
  const [dragHeight, setDragHeight] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return places;
    return places.filter((place) => `${place.name} ${place.description || ''} ${place.category_name || ''}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [places, query]);

  function toggleCategorySearch() {
    if (snap === 'peek') onSnapChange('half');
    setSearchOpen((current) => !current);
  }

  useLayoutEffect(() => {
    const title = categoryTitleRef.current;
    const container = title?.parentElement;
    if (!title || !container) return undefined;
    const fitTitle = () => {
      title.style.fontSize = '';
      let size = parseFloat(window.getComputedStyle(title).fontSize);
      while (title.scrollWidth > container.clientWidth && size > 13) {
        size -= 0.5;
        title.style.fontSize = `${size}px`;
      }
    };
    const observer = new ResizeObserver(fitTitle);
    observer.observe(container);
    fitTitle();
    return () => observer.disconnect();
  }, [group.name]);

  function toggleSnap() {
    if (suppressHandleClickRef.current) {
      suppressHandleClickRef.current = false;
      return;
    }
    onSnapChange(snap === 'full' ? 'half' : snap === 'half' ? 'full' : 'half');
  }

  function startDrag(event) {
    const sheet = sheetRef.current;
    if (!sheet) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { startY: event.clientY, startHeight: sheet.offsetHeight, didDrag: false };
  }

  function dragSheet(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = drag.startY - event.clientY;
    if (Math.abs(delta) > 6) {
      drag.didDrag = true;
      setDragging(true);
    }
    if (!drag.didDrag) return;
    const availableHeight = window.innerHeight - 64;
    const nextHeight = Math.max(availableHeight * 0.2, Math.min(availableHeight * 0.9, drag.startHeight + delta));
    setDragHeight(nextHeight);
  }

  function finishDrag(event) {
    const drag = dragRef.current;
    if (!drag) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (drag.didDrag) {
      suppressHandleClickRef.current = true;
      const availableHeight = window.innerHeight - 64;
      const ratio = (drag.startHeight + (drag.startY - event.clientY)) / availableHeight;
      onSnapChange(ratio > 0.7 ? 'full' : ratio < 0.35 ? 'peek' : 'half');
      setDragHeight(null);
    }
    setDragging(false);
    window.setTimeout(() => { if (dragRef.current) dragRef.current.didDrag = false; }, 0);
    dragRef.current = null;
  }

  return (
    <aside ref={sheetRef} className={`traveller-place-detail-panel traveller-category-panel${dragging ? ' is-dragging' : ''}`} data-snap={snap} style={dragHeight ? { height: `${dragHeight}px` } : undefined} aria-label={`${translateCategoryName(group.name)} ${t('category.places')}`}>
      <MobileSheetHandle expanded onToggle={toggleSnap} className="traveller-place-detail-handle" onPointerDown={startDrag} onPointerMove={dragSheet} onPointerUp={finishDrag} t={t} />
      <div className="traveller-place-detail-scroll">
        <div className="traveller-category-heading">
          <div className="traveller-place-detail-title">
            <span className="traveller-category-heading-icon" style={{ backgroundColor: group.color }}><img src={categoryIconUrl(group.icon)} alt="" /></span>
            <div><small>{t('category.category')}</small><h2 ref={categoryTitleRef}>{translateCategoryName(group.name)}</h2></div>
          </div>
          <div className="traveller-place-detail-heading-actions">
            <button className="traveller-place-detail-focus" type="button" onClick={onFocus} aria-label={t('category.center')} title={t('category.center')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="6.5" />
                <circle cx="12" cy="12" r="2" />
                <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
              </svg>
            </button>
            <button className="traveller-category-search-button" type="button" onClick={toggleCategorySearch} aria-label={searchOpen ? t('category.closeSearch') : t('category.search')} title={searchOpen ? t('category.closeSearch') : t('category.search')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
            </button>
            <button className="traveller-place-detail-close" type="button" onClick={onClose} aria-label={t('category.close')} title={t('category.close')}>×</button>
          </div>
        </div>
        {searchOpen && <input className="traveller-category-search" type="search" autoFocus aria-label={`${t('category.search')} ${translateCategoryName(group.name)}`} placeholder={t('category.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} />}
        <div className="traveller-category-peek-summary" aria-label={`${places.length} ${t(places.length === 1 ? 'category.place' : 'category.places')} ${translateCategoryName(group.name)}`}>
          <strong>{places.length} {t(places.length === 1 ? 'category.place' : 'category.places')}</strong>
          <p>{translateCategoryDescription(group.name)}</p>
        </div>
        <div className="traveller-category-list">
          {filteredPlaces.map((place) => <RecordCard
            key={place.id}
            record={place}
            selected={false}
            coverUrl={place.images?.[0]?.url}
            coverAlt={place.images?.[0]?.caption || ''}
            categoryLabel={translateCategoryName(place.category_name)}
            onSelect={() => onSelectPlace(place)}
            distanceKm={clientPosition ? distanceInKm(clientPosition, place) : null}
          />)}
        </div>
      </div>
    </aside>
  );
}
