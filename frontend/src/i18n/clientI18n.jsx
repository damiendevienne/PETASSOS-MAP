import { createContext, useContext, useMemo, useState } from 'react';
import en from './en.json';
import fr from './fr.json';
import de from './de.json';
import it from './it.json';

const dictionaries = { en, fr, de, it };
const PLACE_LANGUAGES = ['en', 'fr', 'de', 'it'];
const ClientI18nContext = createContext(null);

function readLanguage() {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem('petassos-client-language');
  return dictionaries[saved] ? saved : 'en';
}

function lookup(dictionary, key) {
  return key.split('.').reduce((value, part) => value?.[part], dictionary) ?? key;
}

export function localizePlace(place, language) {
  const translations = place?.translations || {};
  const candidates = [language, 'en', ...PLACE_LANGUAGES].filter((item, index, list) => list.indexOf(item) === index);
  const choose = (field, legacyValue = '') => candidates
    .map((item) => translations[item]?.[field]?.trim())
    .find(Boolean) || legacyValue || '';
  const localized = {
    name: choose('name', place?.name),
    description: choose('description', place?.description),
    practical_info: choose('practical_info', place?.practical_info),
  };
  if (!localized.name && !localized.description && !localized.practical_info) return place;
  return {
    ...place,
    ...localized,
  };
}

export function ClientI18nProvider({ children }) {
  const [language, setLanguageState] = useState(readLanguage);
  const setLanguage = (nextLanguage) => {
    if (!dictionaries[nextLanguage]) return;
    setLanguageState(nextLanguage);
    window.localStorage.setItem('petassos-client-language', nextLanguage);
  };
  const value = useMemo(() => {
    const dictionary = dictionaries[language];
    const t = (key, variables = {}) => Object.entries(variables).reduce(
      (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
      String(lookup(dictionary, key)),
    );
    const translateCategoryName = (name) => t(`categories.${name}`);
    const translateCategoryDescription = (name) => t(`categories.${name}.description`);
    return { language, setLanguage, t, translateCategoryName, translateCategoryDescription };
  }, [language]);
  return <ClientI18nContext.Provider value={value}>{children}</ClientI18nContext.Provider>;
}

export function useClientI18n() {
  return useContext(ClientI18nContext);
}
