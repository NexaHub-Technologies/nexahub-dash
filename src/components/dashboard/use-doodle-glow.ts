import { useEffect, useRef } from "react";
import { followPointerGlow } from "#/lib/pointer-glow";

/* The glow that follows the mouse over a page's code doodles (styles.css,
   "the code doodles behind a page's opening"). Put the ref on the shell
   that holds the pages: the doodles are either the shell's own
   (.doodle-top) or the current page's heading (.page-opening), which is
   looked up on every move, since after a click through it is a different
   element. The glow only shows while the pointer is over the pattern. */
export function useDoodleGlow<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	useEffect(() => {
		const area = ref.current;
		if (!area) return;
		const doodles = () =>
			area.classList.contains("doodle-top")
				? area
				: area.querySelector<HTMLElement>(".page-opening");
		// how far the pattern reaches out to each side of its element, in px
		const bleed = (el: HTMLElement) =>
			Number.parseFloat(
				getComputedStyle(el).getPropertyValue("--doodle-bleed"),
			) || 0;
		return followPointerGlow({
			area,
			layers: [
				{
					el: doodles,
					origin: (box) => {
						const el = doodles();
						const b = el ? bleed(el) : 0;
						return { left: box.left - b, top: box.top };
					},
				},
			],
			isInside: (x, y) => {
				const el = doodles();
				if (!el) return false;
				const box = el.getBoundingClientRect();
				const b = bleed(el);
				const height =
					Number.parseFloat(getComputedStyle(el, "::before").height) || 0;
				return (
					x >= box.left - b &&
					x <= box.right + b &&
					y >= box.top &&
					y <= box.top + height
				);
			},
		});
	}, []);
	return ref;
}
