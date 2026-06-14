/*
 * Prairie - a desktop GUI client for BisonDB
 * Copyright (C) 2026 Abdullah Masood
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
// One small, consistent motion system. Every preset animates only transform /
// opacity (cheap, 60fps) and is short (<=300ms). MotionConfig reducedMotion
// disables these when the OS asks; index.css handles the CSS side.
import type { Transition, Variants } from 'framer-motion';

// Calm, decelerating ease (Linear-ish), not bouncy.
export const easeOut = [0.16, 1, 0.3, 1] as const;

export const fast: Transition = { duration: 0.15, ease: easeOut };
export const base: Transition = { duration: 0.22, ease: easeOut };

/** Backdrop / cross-fade. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: fast },
  exit: { opacity: 0, transition: fast },
};

/** Modal / popover: fade + a slight scale & lift (no bounce). */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: base },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: fast },
};

/** Toast: slide up + fade. */
export const toastIn: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: base },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: fast },
};

/**
 * Capped list stagger: the first `STAGGER_CAP` items cascade; everything after
 * lands together so a large list never produces a long visible wave.
 */
export const STAGGER_CAP = 8;
export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...base, delay: Math.min(i, STAGGER_CAP) * 0.025 },
  }),
};
