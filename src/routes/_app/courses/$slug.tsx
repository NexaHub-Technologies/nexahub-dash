import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { Section } from "#/components/dashboard/section";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { getCourse } from "#/lib/catalogue";
import { formatCount, formatNaira } from "#/lib/format";

export const Route = createFileRoute("/_app/courses/$slug")({
	loader: async ({ params }) => {
		const course = await getCourse({ data: params.slug });
		if (!course) throw notFound();
		return course;
	},
	component: Course,
});

function Course() {
	const c = Route.useLoaderData();
	return (
		<Section
			title={c.title}
			description={
				<span className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">{formatNaira(c.feeKobo)}</Badge>
					<Badge variant="outline">
						{formatCount(c.moduleList.length)} modules
					</Badge>
					<Badge variant="outline">
						{formatCount(c.activeCohorts)} active cohorts
					</Badge>
				</span>
			}
			toolbar={
				<Button
					variant="ghost"
					size="sm"
					nativeButton={false}
					render={<Link to="/courses" />}
				>
					<ArrowLeftIcon data-icon="inline-start" />
					All courses
				</Button>
			}
		>
			<ol className="flex flex-col divide-y rounded-lg border">
				{c.moduleList.map((m) => (
					<li key={m.n} className="flex items-baseline gap-4 px-4 py-3">
						<span className="w-8 shrink-0 font-heading text-sm font-semibold text-muted-foreground tabular-nums">
							{String(m.n).padStart(2, "0")}
						</span>
						<span className="text-sm">{m.title}</span>
					</li>
				))}
			</ol>
		</Section>
	);
}
