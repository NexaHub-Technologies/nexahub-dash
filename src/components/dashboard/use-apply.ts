import { useRouter } from "@tanstack/react-router";
import { toast } from "#/components/ui/toast";
import type { Outcome } from "#/lib/outcome";

/* Shows the outcome of a change from the console and, when something
   changed, reloads the page's data (and the overview figures with it). */
export function useApply() {
	const router = useRouter();
	return async (outcome: Promise<Outcome>, success: string) => {
		const r = await outcome;
		if (r.ok) {
			toast.add({ title: success, description: r.note, type: "success" });
			await router.invalidate();
		} else {
			toast.add({
				title: "Not changed",
				description: r.message,
				type: "error",
			});
		}
		return r.ok;
	};
}
