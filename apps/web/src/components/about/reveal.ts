// Fade-and-rise as an element scrolls into view (matches the original page's entrance motion).
export const reveal = (delay = 0, { y = 20, amount = 0.2 }: { y?: number; amount?: number } = {}) => ({
  initial: { opacity: 0, y },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount },
  transition: { duration: 0.6, delay, ease: "easeOut" as const },
});
