import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { Filters } from "#/components/dashboard/filters";
import { LinkTabs } from "#/components/dashboard/link-tabs";
import { Section } from "#/components/dashboard/section";
import { Badge } from "#/components/ui/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { type ApplicationStatus, listApplications } from "#/lib/applications";
import { timeAgo } from "#/lib/format";

type Search = {
	status?: ApplicationStatus | "all";
	q?: string;
	course?: string;
};

export const Route = createFileRoute("/_app/applications/")({
	beforeLoad: ({ context }) => {
		if (context.staff.role !== "admin") throw redirect({ to: "/" });
	},
	validateSearch: (s: Record<string, unknown>): Search => ({
		...(["new", "approved", "declined", "all"].includes(String(s.status))
			? { status: s.status as Search["status"] }
			: {}),
		...(typeof s.q === "string" && s.q ? { q: s.q } : {}),
		...(typeof s.course === "string" && s.course ? { course: s.course } : {}),
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) =>
		listApplications({
			data: {
				status: deps.status === "all" ? undefined : (deps.status ?? "new"),
				q: deps.q,
				course: deps.course,
			},
		}),
	component: Applications,
});

export const APPLICATION_TONE: Record<
	ApplicationStatus,
	"secondary" | "outline" | "destructive"
> = { new: "secondary", approved: "outline", declined: "destructive" };

const TABS: { key: Search["status"]; label: string }[] = [
	{ key: "new", label: "New" },
	{ key: "approved", label: "Approved" },
	{ key: "declined", label: "Declined" },
	{ key: "all", label: "All" },
];

/* Applications from the website's enrol form, newest first. New ones wait
   for review; approving one enrols the applicant and invoices the fee. */
function Applications() {
	const { rows, counts, courses } = Route.useLoaderData();
	const search = Route.useSearch();
	const tab = search.status ?? "new";
	const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);

	return (
		<Section
			title="Applications"
			description="Sent from the enrol form on nexahubtech.company. Review each one, then approve or decline it."
			toolbar={
				<Filters
					action="/applications"
					status={search.status}
					q={search.q}
					course={search.course}
					courses={courses}
					placeholder="Search name or email"
				/>
			}
		>
			<LinkTabs
				label="Application status"
				tabs={TABS.map((t) => ({
					key: String(t.key),
					label: t.label,
					to: "/applications",
					search: { ...search, status: t.key === "new" ? undefined : t.key },
					count:
						t.key === "all" ? total : (counts[t.key as ApplicationStatus] ?? 0),
					active: tab === t.key,
				}))}
			/>
			{rows.length ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Applicant</TableHead>
							<TableHead>Course</TableHead>
							<TableHead className="hidden md:table-cell">Mode</TableHead>
							<TableHead>Applied</TableHead>
							<TableHead className="text-right">Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((a) => (
							<TableRow key={a.id}>
								<TableCell>
									<Link
										to="/applications/$id"
										params={{ id: a.id }}
										className="flex flex-col"
									>
										<span className="font-medium hover:underline">
											{a.full_name}
										</span>
										<span className="text-xs text-muted-foreground">
											{a.email}
										</span>
									</Link>
								</TableCell>
								<TableCell>{a.course}</TableCell>
								<TableCell className="hidden text-muted-foreground md:table-cell">
									{a.mode}
								</TableCell>
								<TableCell className="whitespace-nowrap text-muted-foreground">
									{timeAgo(a.created_at)}
								</TableCell>
								<TableCell className="text-right">
									<Badge
										variant={APPLICATION_TONE[a.status]}
										className="capitalize"
									>
										{a.status}
									</Badge>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<InboxIcon />
						</EmptyMedia>
						<EmptyTitle>
							{search.q || search.course
								? "No matching applications"
								: "Nothing here"}
						</EmptyTitle>
						<EmptyDescription>
							{tab === "new"
								? "New applications from the website's enrol form arrive here."
								: "Try another tab or clear the filters."}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</Section>
	);
}
