import {
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_FILE_BYTES } from "./files";

/* Coursework files: Neon Object Storage, which speaks the S3 API. The bucket
   is private and the server's credential never leaves it. A browser uploads
   and downloads through links this module signs, each good for one file and
   a few minutes, and only after the database has said the caller may have
   that file. The files never pass through this server, whose requests are
   capped at 4.5 MB on Vercel. */

export const BUCKET = "coursework";

let client: S3Client | undefined;

function s3() {
	if (!client) {
		if (!process.env.AWS_ENDPOINT_URL_S3 || !process.env.AWS_ACCESS_KEY_ID) {
			throw new Error(
				"File storage is not set up: AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set",
			);
		}
		// the endpoint, region and keys come from the AWS_* variables; Neon
		// addresses buckets by path, not by host name
		client = new S3Client({ forcePathStyle: true });
	}
	return client;
}

/* A form a browser can POST one file to. The size limit and the key are
   part of what is signed, so the link can't be used for a bigger file or
   another place. */
export async function signUpload(key: string, contentType: string) {
	const { url, fields } = await createPresignedPost(s3(), {
		Bucket: BUCKET,
		Key: key,
		Conditions: [["content-length-range", 1, MAX_FILE_BYTES]],
		Fields: { "Content-Type": contentType },
		Expires: 600,
	});
	return { url, fields };
}

/* A link that downloads the file under the name it was uploaded with. */
export function signDownload(key: string, name: string, contentType: string) {
	const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
	return getSignedUrl(
		s3(),
		new GetObjectCommand({
			Bucket: BUCKET,
			Key: key,
			ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
			ResponseContentType: contentType,
		}),
		{ expiresIn: 300 },
	);
}

/* How big the uploaded file really is, or null when nothing was uploaded. */
export async function storedSize(key: string): Promise<number | null> {
	try {
		const head = await s3().send(
			new HeadObjectCommand({ Bucket: BUCKET, Key: key }),
		);
		return head.ContentLength ?? null;
	} catch (e) {
		const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata
			?.httpStatusCode;
		if (status === 404) return null;
		throw e;
	}
}

/* Deletes files whose rows are already gone. A failure here leaves a stray
   file behind and nothing else, so it is logged rather than raised. */
export async function removeStored(keys: string[]) {
	if (!keys.length) return;
	try {
		await s3().send(
			new DeleteObjectsCommand({
				Bucket: BUCKET,
				Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
			}),
		);
	} catch (e) {
		console.error("could not delete stored files:", keys, e);
	}
}
