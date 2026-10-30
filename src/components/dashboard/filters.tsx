import { SearchIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";

/* Search and course filter for a list page. A plain GET form, so it works
   before the JavaScript loads and the filters live in the URL; the current
   tab rides along as a hidden field. */
export function Filters({
	action,
	status,
	q,
	course,
	courses,
	placeholder,
}: {
	action: string;
	status?: string;
	q?: string;
	course?: string;
	courses: { slug: string; title: string }[];
	placeholder: string;
}) {
	return (
		<search>
			<form
				method="get"
				action={action}
				className="flex flex-wrap items-center gap-2"
			>
				{status ? <input type="hidden" name="status" value={status} /> : null}
				<div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
					<SearchIcon
						aria-hidden
						className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						name="q"
						type="search"
						defaultValue={q}
						placeholder={placeholder}
						aria-label={placeholder}
						className="pl-8"
					/>
				</div>
				<Select
					name="course"
					defaultValue={course ?? ""}
					items={[
						{ label: "All courses", value: "" },
						...courses.map((c) => ({ label: c.title, value: c.slug })),
					]}
				>
					<SelectTrigger aria-label="Course" className="max-w-56">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="">All courses</SelectItem>
							{courses.map((c) => (
								<SelectItem key={c.slug} value={c.slug}>
									{c.title}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Button type="submit" variant="outline">
					Filter
				</Button>
			</form>
		</search>
	);
}
