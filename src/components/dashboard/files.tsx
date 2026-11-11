import { useRouter } from "@tanstack/react-router";
import { FileIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { toast } from "#/components/ui/toast";
import {
	formatBytes,
	MAX_FILE_BYTES,
	MAX_FILE_LABEL,
	type UploadTicket,
} from "#/lib/files";
import { formatDate } from "#/lib/format";
import type { Outcome } from "#/lib/outcome";

/* Coursework files, as both the console and the student portal show them:
   a button that uploads and a list to download from.

   An upload goes straight from the browser to storage. The server is asked
   first (`start`), and answers with a form signed for this one file; the
   browser posts the file to storage; then the server is told (`finish`),
   checks the file arrived and records it. */

type FileMeta = { name: string; size: number; type: string };

export function UploadButton({
	label,
	start,
	finish,
	variant = "outline",
	multiple = true,
}: {
	label: string;
	start: (file: FileMeta) => Promise<Outcome<UploadTicket>>;
	finish: (file: FileMeta & { key: string }) => Promise<Outcome>;
	variant?: "outline" | "default";
	multiple?: boolean;
}) {
	const router = useRouter();
	const input = useRef<HTMLInputElement>(null);
	const [progress, setProgress] = useState<string | null>(null);

	async function send(file: File): Promise<string | null> {
		if (file.size > MAX_FILE_BYTES) {
			return `Files can be up to ${MAX_FILE_LABEL}.`;
		}
		const meta = { name: file.name, size: file.size, type: file.type };
		const ticket = await start(meta);
		if (!ticket.ok) return ticket.message;
		const form = new FormData();
		for (const [k, v] of Object.entries(ticket.data.fields)) form.append(k, v);
		form.append("file", file);
		const sent = await fetch(ticket.data.url, {
			method: "POST",
			body: form,
		}).catch(() => null);
		if (!sent?.ok) {
			return "The upload didn't go through. Check your connection and try again.";
		}
		const done = await finish({ ...meta, key: ticket.data.key });
		return done.ok ? null : done.message;
	}

	async function onChange(ev: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(ev.currentTarget.files ?? []);
		ev.currentTarget.value = "";
		let uploaded = 0;
		for (const [i, file] of files.entries()) {
			setProgress(
				files.length > 1
					? `Uploading ${i + 1} of ${files.length}…`
					: "Uploading…",
			);
			const problem = await send(file);
			if (problem) {
				toast.add({
					title: `${file.name} was not uploaded`,
					description: problem,
					type: "error",
				});
			} else {
				uploaded++;
			}
		}
		setProgress(null);
		if (uploaded) {
			toast.add({
				title: uploaded === 1 ? "File uploaded" : `${uploaded} files uploaded`,
				type: "success",
			});
			await router.invalidate();
		}
	}

	return (
		<>
			<input
				ref={input}
				type="file"
				multiple={multiple}
				className="sr-only"
				tabIndex={-1}
				aria-label={label}
				onChange={onChange}
			/>
			<Button
				type="button"
				variant={variant}
				size="sm"
				disabled={progress !== null}
				onClick={() => input.current?.click()}
			>
				{progress ? (
					<Spinner data-icon="inline-start" />
				) : (
					<UploadIcon data-icon="inline-start" />
				)}
				{progress ?? label}
			</Button>
		</>
	);
}

export type ListedFile = {
	id: string;
	name: string;
	size_bytes: number;
	created_at: string;
	/* a line under the name, e.g. who added it */
	note?: string;
	href: string;
	onRemove?: () => void;
};

/* Each file is a download link; `onRemove` adds a remove button. */
export function FileList({
	files,
	empty,
}: {
	files: ListedFile[];
	empty: ReactNode;
}) {
	if (!files.length) {
		return <p className="text-sm text-muted-foreground">{empty}</p>;
	}
	return (
		<ul className="flex flex-col divide-y rounded-lg border">
			{files.map((f) => (
				<li key={f.id} className="flex items-center gap-3 px-3 py-2">
					<FileIcon
						aria-hidden
						className="size-4 shrink-0 text-muted-foreground"
					/>
					<span className="flex min-w-0 flex-1 flex-col">
						<a
							href={f.href}
							download
							className="truncate text-sm font-medium underline-offset-4 hover:underline"
						>
							{f.name}
						</a>
						<span className="truncate text-xs text-muted-foreground">
							{formatBytes(f.size_bytes)} · {formatDate(f.created_at)}
							{f.note ? ` · ${f.note}` : ""}
						</span>
					</span>
					{f.onRemove ? (
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={`Remove ${f.name}`}
							onClick={f.onRemove}
						>
							<Trash2Icon />
						</Button>
					) : null}
				</li>
			))}
		</ul>
	);
}
