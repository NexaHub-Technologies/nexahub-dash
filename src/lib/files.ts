/* What the console accepts as a coursework file, shared by the browser
   (which checks before uploading) and the server (which signs the limit
   into the upload link; the database enforces it once more). */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILE_LABEL = "25 MB";

/* "1.4 MB", "320 KB" */
export function formatBytes(n: number) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* A file's name as it is stored and shown: no path, no control characters,
   at most 200 characters with the extension kept. */
export function cleanFileName(raw: string) {
	const base = raw
		.split(/[\\/]/)
		.pop()
		// control characters: a file name is one printable line
		?.replace(/\p{Cc}/gu, "")
		.trim();
	if (!base) return "file";
	if (base.length <= 200) return base;
	const dot = base.lastIndexOf(".");
	const ext = dot > 0 && base.length - dot <= 12 ? base.slice(dot) : "";
	return base.slice(0, 200 - ext.length) + ext;
}

/* The name as part of a storage key: plain ASCII, so it signs the same
   everywhere. The real name is kept in the database. */
export const keyName = (name: string) =>
	name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "file";

/* What the server hands a browser to upload one file with: a form to POST
   to storage, and the key the file will be stored under. */
export type UploadTicket = {
	url: string;
	fields: Record<string, string>;
	key: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* a request to upload, as the server reads it: where to, and the file's
   name, size and type as the browser reported them */
export function uploadRequest(d: unknown) {
	const o = (d ?? {}) as Record<string, unknown>;
	const size = Number(o.size);
	return {
		id: UUID.test(String(o.id ?? "")) ? String(o.id) : "",
		name: cleanFileName(String(o.name ?? "")),
		size: Number.isInteger(size) ? size : 0,
		type:
			String(o.type ?? "")
				.trim()
				.slice(0, 200) || "application/octet-stream",
	};
}

export function sizeProblem(size: number) {
	if (size < 1) return "That file is empty.";
	if (size > MAX_FILE_BYTES) return `Files can be up to ${MAX_FILE_LABEL}.`;
	return null;
}
