import type { Language } from "@quanyu/shared";
import { useEffect, useRef, useState } from "react";
import { SUPPORTED_LANGUAGES } from "../src/lib/i18n";

type LanguageMenuProps = {
  language: Language;
  label: string;
  onChange: (language: Language) => void;
  onAfterChange?: () => void;
};

const LANGUAGE_OPTIONS: Record<Language, { flag: string; label: string; shortLabel: string }> = {
  zh: {
    flag: "🇨🇳",
    label: "中文",
    shortLabel: "中文",
  },
  ru: {
    flag: "🇷🇺",
    label: "Русский",
    shortLabel: "RU",
  },
  en: {
    flag: "🇬🇧",
    label: "English",
    shortLabel: "EN",
  },
};

export function LanguageMenu({ language, label, onChange, onAfterChange }: LanguageMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = LANGUAGE_OPTIONS[language];

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="site-language-menu" ref={rootRef}>
      <button
        className={`site-language-menu-trigger${open ? " open" : ""}`}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="site-language-flag" aria-hidden="true">
          {current.flag}
        </span>
        <span>{current.shortLabel}</span>
        <span className="site-language-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="site-language-menu-popover" role="menu">
          {SUPPORTED_LANGUAGES.map((item) => {
            const option = LANGUAGE_OPTIONS[item];
            const active = item === language;

            return (
              <button
                key={item}
                className={`site-language-menu-option${active ? " active" : ""}`}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                  onAfterChange?.();
                }}
              >
                <span className="site-language-flag" aria-hidden="true">
                  {option.flag}
                </span>
                <span>{option.label}</span>
                <span className="site-language-code">{item.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
