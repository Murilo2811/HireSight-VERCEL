import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

type Language = 'en' | 'pt';
type Translations = { [key: string]: string };

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const getInitialLanguage = (): Language => {
    if (typeof navigator !== 'undefined' && navigator.language) {
        const browserLang = navigator.language.toLowerCase();
        if (browserLang.startsWith('pt')) {
            return 'pt';
        }
    }
    return 'en';
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(getInitialLanguage());
  const [translations, setTranslations] = useState<{ en: Translations, pt: Translations }>({ en: {}, pt: {} });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTranslations = async () => {
      try {
        const [enResponse, ptResponse] = await Promise.all([
          fetch('/locales/en.json'),
          fetch('/locales/pt.json')
        ]);
        if (!enResponse.ok || !ptResponse.ok) {
            throw new Error('Failed to load translation files.');
        }
        const enData = await enResponse.json();
        const ptData = await ptResponse.json();
        setTranslations({ en: enData, pt: ptData });
      } catch (error) {
        console.error("Failed to fetch translations:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTranslations();
  }, []);

  const t = (key: string): string => {
    const langTranslations = translations[language];
    return langTranslations?.[key] || key;
  };
  
  if (isLoading) {
    return (
        <div className="flex justify-center items-center h-screen bg-gray-900">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400"></div>
        </div>
    );
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslations = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useTranslations must be used within a LanguageProvider');
  }
  return context;
};