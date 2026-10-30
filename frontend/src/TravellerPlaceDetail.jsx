import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MobileSheetHandle from './MobileSheetHandle.jsx';
import { placeMarkerUrl } from './markerIcons.js';
import { distanceInKm } from './geoDistance.js';

function isAppleDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function navigationAppName() {
  if (isAppleDevice()) return 'Apple Maps';
  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) return 'Google Maps';
  return 'Google Maps';
}

function directionsUrl(destination, origin) {
  if (isAppleDevice()) {
    const params = new URLSearchParams({ daddr: `${destination.latitude},${destination.longitude}`, dirflg: 'd' });
    if (origin) params.set('saddr', `${origin.latitude},${origin.longitude}`);
    return `https://maps.apple.com/?${params}`;
  }
  const params = new URLSearchParams({ api: '1', destination: `${destination.latitude},${destination.longitude}` });
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params}`;
}

export default function TravellerPlaceDetail({ place, routeStart, clientPosition, onClose, onBack, onSetRouteStart, onFocus, snap, onSnapChange }) {
  const previousPlaceIdRef = useRef(place?.id ?? null);
  const sheetRef = useRef(null);
  const dragRef = useRef(null);
  const suppressHandleClickRef = useRef(false);
  const [reopening, setReopening] = useState(false);
  const [dragHeight, setDragHeight] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [routeChoiceOpen, setRouteChoiceOpen] = useState(false);

  useLayoutEffect(() => {
    if (!place || previousPlaceIdRef.current === null || previousPlaceIdRef.current === place.id) {
      previousPlaceIdRef.current = place?.id ?? null;
      return undefined;
    }
    previousPlaceIdRef.current = place.id;
    onSnapChange('half');
    setDragHeight(null);
    setGalleryIndex(0);
    setReopening(true);
    const timer = window.setTimeout(() => setReopening(false), 160);
    return () => window.clearTimeout(timer);
  }, [place?.id, onSnapChange]);

  function toggleSnap() {
    if (suppressHandleClickRef.current) {
      suppressHandleClickRef.current = false;
      return;
    }
    if (dragRef.current?.didDrag) return;
    onSnapChange(snap === 'full' ? 'half' : snap === 'half' ? 'full' : 'half');
  }

  function startDrag(event) {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const fromHandle = event.currentTarget.classList.contains('traveller-place-detail-handle');
    const fromContent = event.currentTarget.classList.contains('traveller-place-detail-scroll');
    if (fromContent && snap === 'full') return;
    if (fromHandle) event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startHeight: sheet.offsetHeight,
      startScrollTop: event.currentTarget.scrollTop || 0,
      didDrag: false,
      axis: fromHandle ? 'vertical' : null,
      source: fromContent ? 'content' : 'handle',
      forceFull: false,
      target: event.currentTarget,
      pointerId: event.pointerId,
    };
  }

  function dragSheet(event) {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.axis) {
      const deltaX = event.clientX - drag.startX;
      const deltaY = drag.startY - event.clientY;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= 6) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        dragRef.current = null;
        return;
      }
      if (drag.source === 'content' && deltaY <= 0) {
        dragRef.current = null;
        return;
      }
      drag.axis = 'vertical';
      drag.target.setPointerCapture?.(drag.pointerId);
    }
    const delta = drag.startY - event.clientY;
    if (Math.abs(delta) > 6) {
      drag.didDrag = true;
      if (drag.source === 'content' && delta > 0) drag.forceFull = true;
      setDragging(true);
    }
    if (!drag.didDrag) return;
    event.preventDefault();
    const availableHeight = window.innerHeight - 64;
    const maxHeight = availableHeight * 0.9;
    const nextHeight = Math.max(availableHeight * 0.2, Math.min(maxHeight, drag.startHeight + delta));
    setDragHeight(nextHeight);
    if (drag.source === 'content' && delta > maxHeight - drag.startHeight) {
      drag.target.scrollTop = drag.startScrollTop + delta - (maxHeight - drag.startHeight);
    }
  }

  function finishDrag(event) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.target.hasPointerCapture?.(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
    if (drag.didDrag) {
      suppressHandleClickRef.current = true;
      const availableHeight = window.innerHeight - 64;
      const ratio = (drag.startHeight + (drag.startY - event.clientY)) / availableHeight;
      onSnapChange(drag.forceFull || ratio > 0.7 ? 'full' : ratio < 0.35 ? 'peek' : 'half');
      setDragHeight(null);
    }
    setDragging(false);
    window.setTimeout(() => { if (dragRef.current) dragRef.current.didDrag = false; }, 0);
    dragRef.current = null;
  }

  if (!place) return <aside className="traveller-place-detail-panel" aria-hidden="true" />;

  const alternateStartingPoint = routeStart && routeStart.id !== place.id;
  const currentDistance = clientPosition ? distanceInKm(clientPosition, place).toFixed(1) : null;

  return (
    <aside ref={sheetRef} className={`traveller-place-detail-panel${reopening ? ' is-reopening' : ''}${dragging ? ' is-dragging' : ''}`} data-snap={snap} style={dragHeight ? { height: `${dragHeight}px` } : undefined} aria-label={`${place.name} details`}>
      <MobileSheetHandle expanded onToggle={toggleSnap} className="traveller-place-detail-handle" onPointerDown={startDrag} onPointerMove={dragSheet} onPointerUp={finishDrag} onPointerCancel={finishDrag} />
      <div className="traveller-place-detail-scroll" onPointerDown={startDrag} onPointerMove={dragSheet} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        <div className="traveller-place-detail-heading">
          <div className={`traveller-place-detail-title${onBack ? ' has-back' : ''}`}>
            {onBack && <button className="traveller-place-detail-back" type="button" onClick={onBack} aria-label="Back to category places" title={`Back to ${place.category_name}`}>‹</button>}
            <img src={placeMarkerUrl(place.category_icon, place.category_color, place.category_marker_style)} alt="" />
            <div>
              <small>{place.category_name}</small>
              <h2>{place.name}</h2>
            </div>
          </div>
          <div className="traveller-place-detail-heading-actions">
            <button className="traveller-place-detail-focus" type="button" onClick={() => onFocus(place)} aria-label="Center and zoom on this place" title="Center and zoom on this place">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="6.5" />
                <circle cx="12" cy="12" r="2" />
                <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
              </svg>
            </button>
            <button className="traveller-place-detail-close" type="button" onClick={onClose} aria-label="Back to places" title="Back to places">×</button>
          </div>
        </div>

        {place.images?.length > 0 && <>
          <div className="traveller-place-detail-gallery traveller-place-detail-gallery-desktop">
            <button type="button" className="traveller-gallery-arrow traveller-gallery-prev" onClick={() => setGalleryIndex((current) => (current - 1 + place.images.length) % place.images.length)} aria-label="Previous picture">‹</button>
            <img src={place.images[galleryIndex].url} alt={place.images[galleryIndex].caption || place.name} />
            <button type="button" className="traveller-gallery-arrow traveller-gallery-next" onClick={() => setGalleryIndex((current) => (current + 1) % place.images.length)} aria-label="Next picture">›</button>
          </div>
          <div className="traveller-place-detail-gallery traveller-place-detail-gallery-mobile">
            {place.images.map((image) => <figure key={image.id}>
              <img src={image.url} alt={image.caption || place.name} draggable="false" />
              {image.caption && <figcaption>{image.caption}</figcaption>}
            </figure>)}
          </div>
        </>}

        {place.link_url && <a className="traveller-place-detail-link" href={place.link_url} target="_blank" rel="noopener noreferrer"><span>Visit website</span><span aria-hidden="true">↗</span></a>}
        {place.description && <p className="traveller-place-detail-description">{place.description}</p>}
        {place.practical_info && <p className="traveller-place-detail-practical-info">{place.practical_info}</p>}
        <div className="traveller-place-detail-actions">
          {alternateStartingPoint ? <button className="primary-button" type="button" onClick={() => setRouteChoiceOpen(true)}><svg className="route-itinerary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 4 16 7-7 2-2 7L4 4Z" /><path d="m4 4 9 9" /></svg><span className="route-button-copy"><strong>Go there{currentDistance && <span className="route-distance"> (~ {currentDistance} km)</span>}</strong><small>Opens in {navigationAppName()}</small></span></button> : <a className="primary-button" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer"><svg className="route-itinerary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 4 16 7-7 2-2 7L4 4Z" /><path d="m4 4 9 9" /></svg><span className="route-button-copy"><strong>Go there{currentDistance && <span className="route-distance"> (~ {currentDistance} km)</span>}</strong><small>Opens in {navigationAppName()}</small></span></a>}
          <button className="secondary-button route-start" type="button" disabled={routeStart?.id === place.id} onClick={() => onSetRouteStart(place.id)}>{routeStart?.id === place.id ? 'Starting point' : 'Set start point'}</button>
        </div>

        {routeChoiceOpen && createPortal(<div className="route-choice-overlay" role="presentation" onClick={() => setRouteChoiceOpen(false)}>
          <div className="route-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="route-choice-title" onClick={(event) => event.stopPropagation()}>
            <div className="route-choice-heading"><h3 id="route-choice-title">Open in Google Maps</h3><button type="button" onClick={() => setRouteChoiceOpen(false)} aria-label="Close route choices">×</button></div>
            <a className="primary-button" href={directionsUrl(place, routeStart)} target="_blank" rel="noopener noreferrer" onClick={() => setRouteChoiceOpen(false)}>From starting point: {routeStart.name} ↗</a>
            <a className="secondary-button" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer" onClick={() => setRouteChoiceOpen(false)}>From current location ↗</a>
          </div>
        </div>, document.body)}
      </div>
    </aside>
  );
}
