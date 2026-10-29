export const MODES = Object.freeze({
  PLACES: 'Places',
  NOTES: 'Notes',
  ZONES: 'Zones',
  SHARING: 'Sharing',
});

export const MODE_CONFIG = {
  [MODES.PLACES]: {
    empty: 'Places in the current map view will appear here.',
    action: 'Add a new place',
  },
  [MODES.NOTES]: {
    empty: 'Internal notes will appear here.',
    action: 'Add NOTE',
  },
  [MODES.ZONES]: {
    empty: 'Saved zones will appear here.',
    action: 'New zone',
  },
};

export const RECORD_KINDS = Object.freeze({
  PLACE: 'PLACE',
  NOTE: 'NOTE',
  ZONE: 'ZONE',
});

export const COLLECTIONS = Object.freeze({
  PLACES: 'places',
  NOTES: 'notes',
  ZONES: 'zones',
});

export const ADMIN_COLLECTIONS = Object.freeze(Object.values(COLLECTIONS));

export function collectionForKind(kind) {
  return kind === RECORD_KINDS.NOTE ? COLLECTIONS.NOTES : COLLECTIONS.PLACES;
}

export function modeForKind(kind) {
  return kind === RECORD_KINDS.NOTE ? MODES.NOTES : MODES.PLACES;
}
