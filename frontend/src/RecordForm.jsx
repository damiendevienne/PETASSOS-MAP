import { useEffect, useRef, useState } from 'react';
import { categoryIconUrl } from './markerIcons.js';
import { categoryGroups } from './categories.js';
import { api } from './api.js';
import { RECORD_KINDS, collectionForKind } from './constants.js';

const PLACE_LANGUAGES = ['en', 'fr', 'de', 'it'];

function emptyTranslations(record) {
  return PLACE_LANGUAGES.reduce((result, language) => {
    const stored = record?.translations?.[language];
    result[language] = {
      name: stored?.name ?? (language === 'en' ? record?.name ?? '' : ''),
      description: stored?.description ?? (language === 'en' ? record?.description ?? '' : ''),
      practical_info: stored?.practical_info ?? (language === 'en' ? record?.practical_info ?? '' : ''),
    };
    return result;
  }, {});
}

function LanguageTabs({ language, onChange, label, translations, field }) {
  return <div className="place-form-language-tabs" role="tablist" aria-label={`${label} language`}>
    {PLACE_LANGUAGES.map((item) => {
      const hasContent = Boolean(translations[item]?.[field]?.trim());
      return <button key={item} type="button" role="tab" aria-selected={language === item} className={language === item ? 'active' : ''} onClick={() => onChange(item)} title={`${item.toUpperCase()} ${hasContent ? 'filled' : 'empty'}`}><span>{item.toUpperCase()}</span><i className={`place-form-language-status${hasContent ? ' filled' : ''}`} aria-hidden="true" /></button>;
    })}
  </div>;
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

export default function RecordForm({ kind, record, location, categories, onCategoryChange, onDirtyChange, onSave, onCancel, onArchive, error: actionError }) {
  const isNote = kind === RECORD_KINDS.NOTE;
  const [name, setName] = useState(record?.name ?? '');
  const [categoryId, setCategoryId] = useState(record?.category_id ?? categories[0]?.id ?? '');
  const groups = categoryGroups(categories);
  const selectedCategory = categories.find((category) => category.id === Number(categoryId));
  const selectedGroup = groups.find((group) => group.id === (selectedCategory?.parent_id ?? selectedCategory?.id));
  const [description, setDescription] = useState(record?.description ?? '');
  const [practicalInfo, setPracticalInfo] = useState(record?.practical_info ?? '');
  const [language, setLanguage] = useState('en');
  const [translations, setTranslations] = useState(() => emptyTranslations(record));
  const [author, setAuthor] = useState(record?.author ?? '');
  const [linkUrl, setLinkUrl] = useState(record?.link_url ?? '');
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
  const initialTranslationsRef = useRef(emptyTranslations(record));

  const activeTranslation = translations[language];

  function updateTranslation(field, value) {
    setTranslations((current) => ({
      ...current,
      [language]: { ...current[language], [field]: value },
    }));
  }

  useEffect(() => {
    if (!initialRecordIdRef.current) return undefined;
    const controller = new AbortController();
    const collection = collectionForKind(kind);
    api.get(`/api/admin/${collection}/${initialRecordIdRef.current}/images`, { signal: controller.signal })
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
  const translationsDirty = !isNote && JSON.stringify(translations) !== JSON.stringify(initialTranslationsRef.current);
  const isDirty = record ? (
    (isNote ? name !== record.name : translationsDirty) || (!isNote && Number(categoryId) !== record.category_id) ||
    (isNote && (description !== (record.description ?? '') || practicalInfo !== (record.practical_info ?? ''))) || author !== (record.author ?? '') ||
    linkUrl !== (record.link_url ?? '') || published !== Boolean(record.published) ||
    location.latitude !== record.latitude || location.longitude !== record.longitude
  ) : (
    (isNote ? name !== '' || description !== '' || practicalInfo !== '' : translationsDirty) || author !== '' || linkUrl !== '' || (!isNote && !published) ||
    (!isNote && categoryId !== initialCategoryIdRef.current) ||
    location.latitude !== initialLocationRef.current.latitude || location.longitude !== initialLocationRef.current.longitude
  );
  const formDirty = isDirty || imagesDirty;

  useEffect(() => { onDirtyChange(formDirty); }, [formDirty, onDirtyChange]);

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
      const primaryTranslation = PLACE_LANGUAGES.map((item) => translations[item]).find((item) => item.name.trim()) ?? translations.en;
      const newFiles = [];
      const manifest = images.map((image) => {
        if (!image.file) return { id: image.id, caption: image.caption };
        newFiles.push(image.file);
        return { new_index: newFiles.length - 1, caption: image.caption };
      });
      await onSave({
        name: isNote ? name : primaryTranslation.name,
        category_id: isNote ? null : Number(categoryId),
        description: isNote ? description : primaryTranslation.description,
        practical_info: isNote ? practicalInfo : primaryTranslation.practical_info,
        ...(isNote ? {} : { translations }),
        author,
        link_url: linkUrl.trim() || null, published: isNote ? false : published,
        latitude: location.latitude, longitude: location.longitude,
      }, { manifest, newFiles, dirty: imagesDirty });
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
      {isNote ? <>
        <label htmlFor="place-name">Name *</label>
        <input id="place-name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
      </> : <div className="localized-form-field">
        <label htmlFor="place-name">Name <span className="optional-label">(at least one language required)</span></label>
        <LanguageTabs language={language} onChange={setLanguage} label="Name" translations={translations} field="name" />
        <input id="place-name" value={activeTranslation.name} onChange={(event) => updateTranslation('name', event.target.value)} autoFocus />
      </div>}
      {!isNote && <>
        <span className="field-label">Category *</span>
        <CategoryPicker categories={groups} value={selectedGroup?.id} onChange={(id) => {
          const first = groups.find((group) => group.id === id)?.categories[0];
          if (first) { setCategoryId(first.id); onCategoryChange(first.id); }
        }} />
        {selectedGroup?.categories.length > 1 && <>
          <span className="field-label">Subcategory *</span>
          <CategoryPicker categories={selectedGroup.categories} value={categoryId} onChange={(id) => { setCategoryId(id); onCategoryChange(id); }} />
        </>}
      </>}
      <div className={isNote ? undefined : 'localized-form-field'}>
        {isNote ? <label htmlFor="place-description">Description <span className="optional-label">(optional)</span></label> : <>
          <label htmlFor="place-description">Description <span className="optional-label">(optional)</span></label>
          <LanguageTabs language={language} onChange={setLanguage} label="Description" translations={translations} field="description" />
        </>}
        <textarea id="place-description" value={isNote ? description : activeTranslation.description} onChange={(event) => isNote ? setDescription(event.target.value) : updateTranslation('description', event.target.value)} rows="4" />
      </div>
      {!isNote && <div className="localized-form-field">
        <label htmlFor="place-practical-info">Practical information <span className="optional-label">(optional)</span></label>
        <LanguageTabs language={language} onChange={setLanguage} label="Practical information" translations={translations} field="practical_info" />
        <textarea id="place-practical-info" placeholder="Duration, format, departure point, inclusions…" value={activeTranslation.practical_info} onChange={(event) => updateTranslation('practical_info', event.target.value)} rows="3" />
      </div>}
      <div className="coordinate-fields">
        <label htmlFor="place-latitude">Latitude *<input id="place-latitude" type="text" value={location.latitude.toFixed(5)} disabled /></label>
        <label htmlFor="place-longitude">Longitude *<input id="place-longitude" type="text" value={location.longitude.toFixed(5)} disabled /></label>
      </div>
      <label htmlFor="place-author">Author <span className="optional-label">(optional)</span></label>
      <input id="place-author" value={author} onChange={(event) => setAuthor(event.target.value)} />
      <label htmlFor="place-link">Link <span className="optional-label">(optional)</span></label>
      <input id="place-link" type="url" placeholder="https://example.com" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} />
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
      {record && <button className="archive-record-button" type="button" onClick={onArchive} disabled={saving}>Archive {isNote ? 'note' : 'place'}</button>}
    </form>
  );
}
