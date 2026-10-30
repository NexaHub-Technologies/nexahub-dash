import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/* Joins class names, letting later Tailwind utilities win over earlier ones.
   The shadcn CLI now imports this from its `cn` package; scripts/ui-add.sh
   points added components here instead, so no extra dependency is needed. */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
