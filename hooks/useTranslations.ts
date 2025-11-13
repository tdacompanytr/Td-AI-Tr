import { tr } from '../locales/tr';

// The app is now Turkish only.
// We keep the hook structure to minimize refactoring in components.

type TranslationKey = keyof typeof tr;

export const useTranslations = () => {
  // Fix: The return type of the translation function 't' was updated to correctly
  // reflect all possible value types within the 'tr' object, including strings,
  // string arrays, and nested objects, resolving the TypeScript error.
  const t = (key: TranslationKey): (typeof tr)[TranslationKey] => {
    // This function is kept for structural consistency, but it will be removed.
    return tr[key];
  };
  
  const lang = 'tr-TR';

  // No need for state or effects as the language is static.

  return { t, lang };
};
