import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpenIcon } from "lucide-react";
import { Section } from "#/components/dashboard/section";
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
import { listCourses } from "#/lib/catalogue";
import { formatCount, formatNaira, timeAgo } from "#/lib/format";

export const Route = createFileRoute("/_app/courses/")({
	loader: () => listCourses(),
	component: Courses,
});

function Courses() {
	const courses = Route.useLoaderData();
	return (
		<Section
			title="Courses"
			description="Copied from the website, where the curriculum is written. Change a course there, then run its sync-courses script."
		>
			{courses.length ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Course</TableHead>
							<TableHead className="text-right">Modules</TableHead>
							<TableHead className="text-right">Fee</TableHead>
							<TableHead className="text-right">Active cohorts</TableHead>
							<TableHead className="hidden text-right md:table-cell">
								Synced
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{courses.map((c) => (
							<TableRow key={c.slug}>
								<TableCell>
									<Link
										to="/courses/$slug"
										params={{ slug: c.slug }}
										className="font-medium hover:underline"
									>
										{c.title}
									</Link>
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatCount(c.modules)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatNaira(c.feeKobo)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatCount(c.activeCohorts)}
								</TableCell>
								<TableCell className="hidden text-right text-muted-foreground md:table-cell">
									{timeAgo(c.updatedAt)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BookOpenIcon />
						</EmptyMedia>
						<EmptyTitle>No courses yet</EmptyTitle>
						<EmptyDescription>
							Run <code>bun run sync-courses</code> in the website repo to copy
							them here.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</Section>
	);
}
