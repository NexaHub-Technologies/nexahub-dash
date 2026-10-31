import type { ReactNode } from "react";
import { Card } from "#/components/ui/card";

/* A page's main card, as the DistressNow console's admin panel: a title
   and toolbar row, then the content (usually a table). */
export function Section({
	title,
	description,
	toolbar,
	children,
}: {
	title: string;
	description?: ReactNode;
	toolbar?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Card className="gap-4 p-4 sm:p-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="text-3xl font-extrabold">{title}</h1>
					{description ? (
						<p className="text-sm text-muted-foreground">{description}</p>
					) : null}
				</div>
				{toolbar ? (
					<div className="flex flex-wrap items-center gap-3">{toolbar}</div>
				) : null}
			</div>
			{children}
		</Card>
	);
}
