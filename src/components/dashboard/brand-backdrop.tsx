import { useEffect, useRef } from "react";
import { followPointerGlow } from "#/lib/pointer-glow";

/* The NHT mark, drawn as the outline from the brand's code-doodle pack (the
   logo's own geometry), set large and faint behind the sign-in card, as on
   the website's front page. A brighter copy sits on top, seen only in a
   soft circle around the mouse, so the lines near the pointer light up.
   The parent carries the moving halo (styles.css, .login-page). It is
   decoration: hidden from screen readers and behind the content. */
const MARK_PATH =
	"M0,0L385.6,0L385.6,100L100,100L100,578.4L0,578.4ZM485.6,1156.8L771.2,1156.8L771.2,1256.8L485.6,1256.8ZM1256.8,1253.2L871.2,1253.2L871.2,1153.2L1156.8,1153.2L1156.8,674.8L1256.8,674.8ZM1256.8,3.6L1256.8,582L1156.8,582L1156.8,103.6L871.2,103.6L871.2,3.6ZM485.6,0L771.2,0L771.2,100L485.6,100ZM100,678.4L100,1156.8L385.6,1156.8L385.6,1256.8L0,1256.8L0,678.4ZM192.8,192.8H1064V1064H192.8Z";

function Mark() {
	return (
		<svg viewBox="-40 -40 1337 1337" focusable="false" aria-hidden="true">
			<path className="brand-backdrop-glow" d={MARK_PATH} />
			<path className="brand-backdrop-line" d={MARK_PATH} />
		</svg>
	);
}

export function BrandBackdrop() {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const mark = ref.current;
		const area = mark?.parentElement;
		if (!mark || !area) return;
		return followPointerGlow({ area, layers: [{ el: area }, { el: mark }] });
	}, []);
	return (
		<div ref={ref} className="brand-backdrop" aria-hidden="true">
			<Mark />
			<div className="brand-backdrop-spot">
				<Mark />
			</div>
		</div>
	);
}
