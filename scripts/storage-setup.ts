/* Prepares a branch's object storage for coursework files: makes the private
   bucket if neon.ts hasn't already, and lets browsers upload to it. Uploads
   go straight from the browser to storage with a link the server signed, so
   the bucket must answer the browser's cross-origin request; the signature
   on the link is what guards it, not the origin. Safe to run again.

     bun scripts/storage-setup.ts

   Reads AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID and
   AWS_SECRET_ACCESS_KEY from the environment (.env). */
import {
	CreateBucketCommand,
	HeadBucketCommand,
	PutBucketCorsCommand,
	S3Client,
} from "@aws-sdk/client-s3";

const BUCKET = "coursework";
if (!process.env.AWS_ENDPOINT_URL_S3 || !process.env.AWS_ACCESS_KEY_ID) {
	throw new Error("AWS_ENDPOINT_URL_S3 and the AWS_* keys are not set");
}
const s3 = new S3Client({ forcePathStyle: true });

try {
	await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
	console.log(`bucket "${BUCKET}" exists`);
} catch {
	await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
	console.log(`created bucket "${BUCKET}"`);
}

await s3.send(
	new PutBucketCorsCommand({
		Bucket: BUCKET,
		CORSConfiguration: {
			CORSRules: [
				{
					AllowedOrigins: ["*"],
					AllowedMethods: ["POST"],
					AllowedHeaders: ["*"],
					MaxAgeSeconds: 3600,
				},
			],
		},
	}),
);
console.log("browsers may upload with a signed link");
