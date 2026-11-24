/* Which of a course's two fees an applicant's chosen training mode pays.
   The website's enrol form offers "Online training", "In-home training" and
   "Hybrid — online and in-home" (nexahubtech src/lib/enrolment.ts). Any
   in-person teaching takes the in-person fee, so hybrid does too; anything
   unrecognised falls back to the online fee, which the admin can change
   before approving. */
export type FeeWay = "online" | "in person";

export function feeWay(mode: string): FeeWay {
	return /in-home|in person|in-person|hybrid/i.test(mode)
		? "in person"
		: "online";
}
