import { useState, useEffect, useRef } from "react";

export function useTypewriterPlaceholder(
  phrases: string[],
  opts: { enabled: boolean },
): string {
  const { enabled } = opts;
  const [placeholderText, setPlaceholderText] = useState("");
  const placeholderIdxRef = useRef(0);
  const typingRef = useRef(true);

  useEffect(() => {
    if (!enabled) {
      setPlaceholderText("");
      return;
    }

    const current = phrases[placeholderIdxRef.current];

    if (typingRef.current) {
      if (placeholderText.length < current.length) {
        const t = setTimeout(
          () => setPlaceholderText(current.slice(0, placeholderText.length + 1)),
          55,
        );
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => {
        typingRef.current = false;
        setPlaceholderText((prev) => prev.slice(0, -1));
      }, 2000);
      return () => clearTimeout(t);
    }

    if (placeholderText.length > 0) {
      const t = setTimeout(
        () => setPlaceholderText((prev) => prev.slice(0, -1)),
        30,
      );
      return () => clearTimeout(t);
    }

    placeholderIdxRef.current = (placeholderIdxRef.current + 1) % phrases.length;
    typingRef.current = true;
    const next = phrases[placeholderIdxRef.current];
    const t = setTimeout(() => setPlaceholderText(next.slice(0, 1)), 55);
    return () => clearTimeout(t);
  }, [placeholderText, enabled, phrases]);

  return placeholderText;
}
