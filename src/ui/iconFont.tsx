/**
 * Availability of the Automate icon font.
 *
 * The font is LlamaLab's and is not redistributed, so a hosted build usually
 * does not have it. Its glyphs live in the Unicode Private Use Area, which
 * renders as blank space rather than a visible fallback character — so the
 * editor has to know whether the font actually loaded and draw initials
 * instead when it did not.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const IconFontContext = createContext(false);

/** True when the real icon font is loaded and usable. */
export function useIconFont(): boolean {
  return useContext(IconFontContext);
}

async function detect(): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return false;
  try {
    // `load` resolves whether or not the face was found; `check` is the answer.
    await document.fonts.load('16px AutomateIcons');
    await document.fonts.ready;
    return document.fonts.check('16px AutomateIcons');
  } catch {
    return false;
  }
}

export function IconFontProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void detect().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <IconFontContext.Provider value={available}>{children}</IconFontContext.Provider>;
}

/** Two-letter stand-in drawn when the icon font is unavailable. */
export function initials(name: string): string {
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
