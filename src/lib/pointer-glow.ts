/* A soft glow that follows the mouse across a decorative background: the
   front page's NHT mark and the Academy's doodle pattern.

   It writes the pointer position into CSS custom properties (--gx, --gy, in
   px) on each layer, measured from that layer's own top-left corner (or from
   the origin a layer gives, for a pseudo-element that is wider than its
   element), and puts `is-lit` on the area while the pointer is over it. CSS
   does the drawing; this only moves the point.

   The glow eases after the pointer rather than snapping to it, and the
   animation frame loop only runs while it is still catching up. Nothing
   happens on touch screens or for anyone who has asked their system for
   reduced motion. Returns a function that removes the listeners. */

export type GlowLayer = {
	/* the element, or a way to find it, for a layer that changes from page
	   to page (looked up again on every move, so it is never a stale one) */
	el: HTMLElement | (() => HTMLElement | null | undefined);
	/* where the layer's drawing starts, in viewport px; defaults to the
	   element's own box */
	origin?: (box: DOMRect) => { left: number; top: number };
};

export type GlowOptions = {
	/* the element whose pointer movement is followed; gets `is-lit` */
	area: HTMLElement;
	layers: GlowLayer[];
	/* narrower than the area: only glow while this returns true */
	isInside?: (clientX: number, clientY: number) => boolean;
	/* how far the glow closes the gap to the pointer each frame (0–1) */
	ease?: number;
};

const ALLOWED =
	"(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

export function followPointerGlow({
	area,
	layers,
	isInside,
	ease = 0.08,
}: GlowOptions): () => void {
	if (typeof window === "undefined" || !window.matchMedia(ALLOWED).matches) {
		return () => {};
	}

	// x and y are viewport coordinates; each layer's origin is taken away
	// when the position is written
	let x = 0;
	let y = 0;
	let targetX = 0;
	let targetY = 0;
	let frame = 0;
	let placed = false;
	// the layers' elements and origins, as found on the latest move
	let found: { el: HTMLElement; left: number; top: number }[] = [];

	const write = () => {
		for (const { el, left, top } of found) {
			el.style.setProperty("--gx", `${(x - left).toFixed(1)}px`);
			el.style.setProperty("--gy", `${(y - top).toFixed(1)}px`);
		}
	};

	const tick = () => {
		x += (targetX - x) * ease;
		y += (targetY - y) * ease;
		write();
		const settled = Math.abs(targetX - x) < 0.3 && Math.abs(targetY - y) < 0.3;
		frame = settled ? 0 : requestAnimationFrame(tick);
	};

	const dim = () => {
		area.classList.remove("is-lit");
		placed = false;
	};

	const onMove = (e: PointerEvent) => {
		if (e.pointerType !== "mouse") return;
		if (isInside && !isInside(e.clientX, e.clientY)) {
			dim();
			return;
		}
		found = [];
		for (const layer of layers) {
			const el = typeof layer.el === "function" ? layer.el() : layer.el;
			if (!el) continue;
			const box = el.getBoundingClientRect();
			const at = layer.origin
				? layer.origin(box)
				: { left: box.left, top: box.top };
			found.push({ el, ...at });
		}
		targetX = e.clientX;
		targetY = e.clientY;
		if (!placed) {
			// start where the pointer came in, rather than sliding in from a corner
			x = targetX;
			y = targetY;
			placed = true;
		}
		area.classList.add("is-lit");
		if (!frame) frame = requestAnimationFrame(tick);
	};

	area.addEventListener("pointermove", onMove, { passive: true });
	area.addEventListener("pointerleave", dim);
	return () => {
		area.removeEventListener("pointermove", onMove);
		area.removeEventListener("pointerleave", dim);
		cancelAnimationFrame(frame);
		dim();
	};
}

/* the origin of a full-bleed pseudo-element (inset 0 calc(50% - 50vw)):
   it is as wide as the viewport and centred on its element */
export function fullBleedOrigin(box: DOMRect) {
	return {
		left: box.left + box.width / 2 - window.innerWidth / 2,
		top: box.top,
	};
}
