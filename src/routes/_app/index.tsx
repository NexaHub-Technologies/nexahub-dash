import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
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
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				{tiles.map((t) => (
					<Card key={t.label}>
						<CardHeader>
							<CardDescription>{t.label}</CardDescription>
							<CardTitle className="text-3xl tabular-nums">{t.value}</CardTitle>
						</CardHeader>
					</Card>
				))}
			</div>
		</>
	);
}
