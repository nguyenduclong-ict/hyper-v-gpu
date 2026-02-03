import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import vi from "./locales/vi.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ru from "./locales/ru.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    vi: { translation: vi },
    zh: { translation: zh },
    ja: { translation: ja },
    ru: { translation: ru },
  },
  lng: "en", // Force default language to English
  fallbackLng: "en",
  debug: true,
  keySeparator: false, // Allow using dots in keys (sentences)
  nsSeparator: false, // Allow using colons in keys
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
