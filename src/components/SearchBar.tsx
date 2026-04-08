"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PLACEHOLDERS = [
  "AI code assistant for Rust...",
  "Open-source Stripe alternative...",
  "Real-time collaboration tool...",
  "Developer portfolio generator...",
  "Serverless database for edge...",
  "CLI tool for API mocking...",
];

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  variant?: "hero" | "compact";
  defaultValue?: string;
}

export function SearchBar({
  onSearch,
  loading,
  variant = "hero",
  defaultValue,
}: SearchBarProps) {
  const [query, setQuery] = useState(defaultValue ?? "");
  const [focused, setFocused] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [placeholderText, setPlaceholderText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isHero = variant === "hero";
  const placeholderIdxRef = useRef(0);
  const typingRef = useRef(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || focused || query) return;

    const current = PLACEHOLDERS[placeholderIdxRef.current];

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

    placeholderIdxRef.current = (placeholderIdxRef.current + 1) % PLACEHOLDERS.length;
    typingRef.current = true;
    const next = PLACEHOLDERS[placeholderIdxRef.current];
    const t = setTimeout(() => setPlaceholderText(next.slice(0, 1)), 55);
    return () => clearTimeout(t);
  }, [placeholderText, focused, query, hydrated]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) onSearch(trimmed);
  };

  const formHeight = isHero ? "h-[58px] md:h-[62px]" : "h-[52px]";
  const iconSize = isHero ? "size-9 md:size-10" : "size-8";
  const svgSize = isHero ? 16 : 14;
  const fontSize = isHero ? "text-base md:text-[17px]" : "text-[15px]";
  const btnSize = isHero ? "h-10 px-6 text-[14px] md:h-11 md:px-7" : "h-9 px-5 text-[13px]";
  const wrapperClass = isHero ? "items-center" : "";
  const maxW = isHero ? "max-w-[640px]" : "max-w-[1200px]";

  return (
    <div className={`flex w-full flex-col gap-3 ${wrapperClass}`}>
      <form
        onSubmit={handleSubmit}
        className={`relative flex w-full ${maxW} items-center gap-3 rounded-2xl border border-border/60 bg-surface-elevated/70 backdrop-blur-xl px-3 transition-all duration-300 hover:border-border ${formHeight} ${focused ? "!border-teal/30 !shadow-[0_0_0_1px_rgba(20,184,166,0.1),0_0_40px_-8px_rgba(20,184,166,0.12)]" : ""}`}
      >
        <div className={`flex shrink-0 items-center justify-center rounded-xl bg-teal/10 ${iconSize}`}>
          <svg
            className="text-teal"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            width={svgSize}
            height={svgSize}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>

        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={hydrated && !query && !focused ? "" : "Describe what you want to build..."}
            className={`w-full bg-transparent text-fg placeholder:text-fg-muted/50 focus:outline-none ${fontSize}`}
          />
          {hydrated && !query && !focused && placeholderText && (
            <span className={`pointer-events-none absolute inset-0 flex items-center text-fg-muted/40 ${fontSize}`} aria-hidden>
              {placeholderText}
              <span className="ml-[1px] animate-pulse text-teal/60">|</span>
            </span>
          )}
        </div>

        <kbd className="mr-1 hidden items-center gap-0.5 rounded-md border border-border/50 bg-surface/50 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted/40 lg:flex">
          ⌘K
        </kbd>

        <motion.button
          type="submit"
          disabled={loading || !query.trim()}
          whileHover={{
            scale: 1.05,
            boxShadow: "0 0 24px 8px rgba(20, 184, 166, 0.2)",
          }}
          whileTap={{ scale: 0.95 }}
          className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-teal to-[#2DD4BF] font-semibold text-[#0A0A0A] transition-all disabled:opacity-30 disabled:pointer-events-none ${btnSize}`}
        >
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.span
                key="loading"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2"
              >
                <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M12 3v3m6.366-.366l-2.12 2.12M21 12h-3m.366 6.366l-2.12-2.12M12 21v-3m-6.366.366l2.12-2.12M3 12h3m-.366-6.366l2.12 2.12" />
                </svg>
                Forging
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
              >
                Forge →
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </form>
    </div>
  );
}
