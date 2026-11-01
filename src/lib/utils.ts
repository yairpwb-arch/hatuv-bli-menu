import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the design-system type scale (tailwind.config.ts
// fontSize). Without this it reads e.g. `text-label` as a text *colour* and
// drops it whenever a real colour like `text-muted-foreground` follows.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["screen-title", "card-title", "stat", "stat-lg", "body", "label"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
