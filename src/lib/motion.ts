import { type Variants } from "framer-motion";

export const buttonSpring = {
  whileHover: { scale: 1.03, transition: { type: "spring", stiffness: 400, damping: 20 } },
  whileTap: { scale: 0.96, transition: { type: "spring", stiffness: 500, damping: 25 } },
} as const;

export const cardHover = {
  whileHover: {
    y: -3,
    scale: 1.01,
    borderColor: "rgba(20, 184, 166, 0.25)",
    transition: { type: "spring", stiffness: 350, damping: 22 },
  },
  whileTap: {
    scale: 0.985,
    transition: { type: "spring", stiffness: 500, damping: 25 },
  },
} as const;

export const linkHover = {
  whileHover: {
    color: "#14B8A6",
    x: 2,
    transition: { type: "spring", stiffness: 400, damping: 20 },
  },
  whileTap: { scale: 0.97 },
} as const;

export const iconBounce = {
  whileHover: {
    scale: 1.2,
    rotate: -8,
    transition: { type: "spring", stiffness: 500, damping: 15 },
  },
  whileTap: { scale: 0.85 },
} as const;

export const saveButton = {
  whileHover: {
    scale: 1.08,
    color: "#14B8A6",
    transition: { type: "spring", stiffness: 450, damping: 18 },
  },
  whileTap: {
    scale: 0.88,
    transition: { type: "spring", stiffness: 600, damping: 20 },
  },
} as const;

export const ctaGlow: Variants = {
  idle: {
    boxShadow: "0 0 0 0 rgba(20, 184, 166, 0)",
  },
  hover: {
    boxShadow: "0 0 20px 4px rgba(20, 184, 166, 0.25), 0 0 40px 8px rgba(20, 184, 166, 0.1)",
    transition: { duration: 0.3 },
  },
  tap: {
    boxShadow: "0 0 8px 2px rgba(20, 184, 166, 0.15)",
  },
};

export const arrowSlide = {
  whileHover: {
    x: 3,
    transition: { type: "spring", stiffness: 400, damping: 18 },
  },
} as const;

export const navLink: Variants = {
  idle: { color: "#71717A" },
  hover: { color: "#EDEDEF", transition: { duration: 0.2 } },
  active: { color: "#14B8A6" },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 20 },
  },
};
