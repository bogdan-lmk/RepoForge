"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Search", icon: "search" },
  { href: "/trending", label: "Trending", icon: "trending" },
  { href: "/ideas", label: "My Ideas", icon: "ideas" },
];

function NavIcon({ type, active }: { type: string; active: boolean }) {
  const cls = cn("size-[15px]", active ? "text-teal" : "text-fg-muted/60");
  switch (type) {
    case "search":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "trending":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
          <path d="M16 7h6v6" />
        </svg>
      );
    case "ideas":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 12 18.469a3.374 3.374 0 0 0-.986-2.386l-.548-.547Z" />
        </svg>
      );
    default:
      return null;
  }
}

function ForgeLogo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <motion.div
        className="relative flex size-8 items-center justify-center"
        whileHover={{ rotate: -8, scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 500, damping: 22 }}
      >
        <div className="absolute inset-0 rounded-lg bg-teal/10 transition-colors duration-300 group-hover:bg-teal/20" />
        <svg
          className="relative size-[18px] text-teal"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 2h10l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4Z" />
          <path d="M12 18v-6" />
          <path d="M8 18v-2" />
          <path d="M16 18v-4" />
        </svg>
        <span className="absolute -right-0.5 -top-0.5 flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal/70" />
          <span className="relative inline-flex size-2 rounded-full bg-teal" />
        </span>
      </motion.div>

      <div className="flex flex-col">
        <span className="text-[14px] font-semibold leading-tight tracking-tight text-fg transition-colors duration-200 group-hover:text-teal">
          CategoryForge
        </span>
        <span className="text-[9px] font-medium uppercase tracking-[0.15em] text-fg-muted/50 transition-colors duration-200 group-hover:text-fg-muted">
          AI Repo Intelligence
        </span>
      </div>
    </Link>
  );
}

function SlidingIndicator({ activeIndex, containerRef }: { activeIndex: number; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [dims, setDims] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const buttons = container.querySelectorAll("[data-nav-item]");
    const activeBtn = buttons[activeIndex] as HTMLElement;
    if (!activeBtn) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setDims({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    });
  }, [activeIndex, containerRef]);

  return (
    <motion.div
      className="absolute bottom-0 h-[30px] rounded-full bg-teal/10"
      layout
      layoutId="nav-pill"
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      style={{
        left: dims.left,
        width: dims.width,
      }}
    />
  );
}

export function Nav() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false);
  const lastY = useRef(0);

  useEffect(() => { setMounted(true); }, []);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 20);
    if (latest > 200 && latest > lastY.current) {
      setHidden(true);
    } else {
      setHidden(false);
    }
    lastY.current = latest;
  });

  const isHome = pathname === "/";
  const activeIndex = NAV_ITEMS.findIndex((item) => item.href === pathname);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{
        y: hidden ? -80 : 0,
        opacity: hidden ? 0 : 1,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-3 md:pt-4",
      )}
    >
      <motion.nav
        className={cn(
          "flex items-center justify-between rounded-2xl px-4 py-2.5 md:px-6 md:py-3",
          "w-full max-w-[900px]",
          "transition-all duration-500 ease-out",
          scrolled
            ? "bg-surface/80 shadow-lg shadow-black/20 backdrop-blur-xl border border-white/[0.06]"
            : isHome
              ? "bg-transparent"
              : "bg-surface/60 backdrop-blur-md border border-white/[0.04]",
        )}
      >
        <ForgeLogo />

        <div ref={containerRef} className="relative flex items-center gap-1">
          <AnimatePresence>
            {mounted && (
              <SlidingIndicator activeIndex={activeIndex >= 0 ? activeIndex : 0} containerRef={containerRef} />
            )}
          </AnimatePresence>

          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <motion.div
                key={item.href}
                data-nav-item
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
              >
                <Link
                  href={item.href}
                  className={cn(
                    "relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 md:px-3.5",
                    "text-[13px] font-medium transition-colors duration-200",
                    isActive
                      ? "text-teal"
                      : "text-fg-muted hover:text-fg-secondary",
                  )}
                >
                  <NavIcon type={item.icon} active={isActive} />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </motion.nav>
    </motion.header>
  );
}
