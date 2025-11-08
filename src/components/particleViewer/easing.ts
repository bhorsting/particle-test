/**
 * Easing functions for animations
 */

export const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export const easeOutExponential = (t: number): number => {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

