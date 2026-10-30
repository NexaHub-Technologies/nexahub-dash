import { createFileRoute } from "@tanstack/react-router";
import { getOverview } from "../../lib/overview";

export const Route = createFileRoute("/_app/")({
	loader: () => getOverview(),
	component: Overview,
});

function Overview() {
	const { staff } = Route.useRouteContext();
	const o = Route.useLoaderData();
	const tiles = [
		...(staff.role === "admin"
			? [{ label: "New applications", value: o.newApplications }]
			: []),
		{ label: "Students", value: o.students },
		{
			label: staff.role === "admin" ? "Cohorts" : "Your cohorts",
			value: o.cohorts,
		},
	];
	return (
		<>
			<h1 className="text-3xl font-bold">
				Good to see you, {staff.full_name.split(" ")[0]}.
			</h1>
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
				{tiles.map((t) => (
					<div key={t.label} className="panel p-5">
						<p className="text-sm text-mute font-semibold">{t.label}</p>
						<p className="font-display text-3xl font-bold mt-1">{t.value}</p>
					</div>
				))}
			</div>
		</>
	);
}
