import {
	Document,
	Image,
	Page,
	renderToBuffer,
	StyleSheet,
	Text,
	View,
} from "@react-pdf/renderer";
import logo from "../../public/logo-main.png?inline";
import { formatCount, formatDate } from "./format";
import { isStatus, STATUS_LABEL } from "./status";
import type { StudentDetail } from "./students";

/* A student's registry record as a PDF: who they are, what they applied
   with, their courses and statuses, what they've paid and owe, and how their
   status has changed. Built on the server from the same data as their page,
   in the NexaHubTech palette. */

const INK = "#311049";
const MUTE = "#6f627b";
const LINE = "#e4dbe6";
const VIOLET = "#6a2cad";

const s = StyleSheet.create({
	page: { padding: 40, fontSize: 9.5, color: INK, fontFamily: "Helvetica" },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingBottom: 14,
		borderBottomWidth: 1,
		borderBottomColor: LINE,
	},
	brand: { flexDirection: "row", alignItems: "center", gap: 10 },
	logo: { width: 28, height: 28 },
	brandName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
	muted: { color: MUTE },
	title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 18 },
	section: { marginTop: 18 },
	sectionTitle: {
		fontSize: 10.5,
		fontFamily: "Helvetica-Bold",
		color: VIOLET,
		marginBottom: 6,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	row: { flexDirection: "row", paddingVertical: 3 },
	label: { width: 150, color: MUTE },
	value: { flex: 1 },
	table: { borderWidth: 1, borderColor: LINE, borderRadius: 4 },
	tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE },
	trLast: { flexDirection: "row" },
	th: { padding: 5, fontFamily: "Helvetica-Bold", color: MUTE, fontSize: 8.5 },
	td: { padding: 5 },
	right: { textAlign: "right" },
	footer: {
		position: "absolute",
		bottom: 24,
		left: 40,
		right: 40,
		flexDirection: "row",
		justifyContent: "space-between",
		color: MUTE,
		fontSize: 8,
	},
});

const status = (v: string) => (isStatus(v) ? STATUS_LABEL[v] : v);

/* The PDF's built-in Helvetica has no naira sign, so amounts are written the
   way Nigerian bank documents write them. */
const formatNaira = (kobo: number) =>
	`NGN ${formatCount(Math.round(kobo / 100))}`;
const yesNo = (v: string | boolean) =>
	typeof v === "boolean" ? (v ? "Yes" : "No") : v;

function Rows({ rows }: { rows: [string, string | null | undefined][] }) {
	return (
		<View>
			{rows.map(([label, value]) => (
				<View key={label} style={s.row} wrap={false}>
					<Text style={s.label}>{label}</Text>
					<Text style={s.value}>{value || "—"}</Text>
				</View>
			))}
		</View>
	);
}

function Table({
	columns,
	rows,
}: {
	columns: { label: string; width: string; right?: boolean }[];
	rows: string[][];
}) {
	return (
		<View style={s.table}>
			<View style={s.tr} fixed>
				{columns.map((c) => (
					<Text
						key={c.label}
						style={[s.th, { width: c.width }, c.right ? s.right : {}]}
					>
						{c.label}
					</Text>
				))}
			</View>
			{rows.map((r, i) => (
				<View
					key={r.join("|")}
					style={i === rows.length - 1 ? s.trLast : s.tr}
					wrap={false}
				>
					{r.map((cell, j) => (
						<Text
							key={columns[j]?.label}
							style={[
								s.td,
								{ width: columns[j]?.width },
								columns[j]?.right ? s.right : {},
							]}
						>
							{cell}
						</Text>
					))}
				</View>
			))}
		</View>
	);
}

function StudentRecord({
	student: st,
	generatedAt,
}: {
	student: StudentDetail;
	generatedAt: string;
}) {
	const courseTitle = (slug: string) =>
		st.enrolments.find((e) => e.course_slug === slug)?.course ?? slug;
	const owed = st.invoices.reduce(
		(n, i) => n + (i.status === "open" ? Math.max(i.balance_kobo, 0) : 0),
		0,
	);
	const a = st.application;

	return (
		<Document
			title={`${st.full_name} — registry record`}
			author="NexaHubTech"
			subject="Student registry record"
		>
			<Page size="A4" style={s.page}>
				<View style={s.header} fixed>
					<View style={s.brand}>
						<Image src={logo} style={s.logo} />
						<View>
							<Text style={s.brandName}>NexaHubTech</Text>
							<Text style={s.muted}>Student registry record</Text>
						</View>
					</View>
					<Text style={s.muted}>Generated {generatedAt}</Text>
				</View>

				<Text style={s.title}>{st.full_name}</Text>
				<Text style={[s.muted, { marginTop: 3 }]}>
					Student since {formatDate(st.created_at)} · Ref{" "}
					{st.id.slice(0, 8).toUpperCase()}
				</Text>

				<View style={s.section}>
					<Text style={s.sectionTitle}>Personal details</Text>
					<Rows
						rows={[
							["Email", st.email],
							["Phone", st.phone],
							["Gender", st.gender],
							["Employment", st.employment],
							[
								"Date of birth",
								st.date_of_birth ? formatDate(st.date_of_birth) : null,
							],
							["Address", st.address],
						]}
					/>
				</View>

				<View style={s.section}>
					<Text style={s.sectionTitle}>Courses</Text>
					<Table
						columns={[
							{ label: "Course", width: "50%" },
							{ label: "Status", width: "25%" },
							{ label: "Starts", width: "25%", right: true },
						]}
						rows={st.enrolments.map((e) => [
							e.course,
							status(e.status),
							e.starts_on ? formatDate(e.starts_on) : "—",
						])}
					/>
				</View>

				<View style={s.section}>
					<Text style={s.sectionTitle}>
						Fees ·{" "}
						{owed > 0
							? `${formatNaira(owed)} outstanding`
							: "nothing outstanding"}
					</Text>
					{st.invoices.length ? (
						<Table
							columns={[
								{ label: "Invoice", width: "40%" },
								{ label: "Due", width: "15%" },
								{ label: "Amount", width: "15%", right: true },
								{ label: "Paid", width: "15%", right: true },
								{ label: "Balance", width: "15%", right: true },
							]}
							rows={st.invoices.map((i) => [
								i.description,
								formatDate(i.due_on),
								formatNaira(i.amount_kobo),
								formatNaira(i.paid_kobo),
								formatNaira(Math.max(i.balance_kobo, 0)),
							])}
						/>
					) : (
						<Text style={s.muted}>No invoices.</Text>
					)}
					{st.payments.length ? (
						<View style={{ marginTop: 8 }}>
							<Table
								columns={[
									{ label: "Paid on", width: "20%" },
									{ label: "Method", width: "15%" },
									{ label: "Reference", width: "30%" },
									{ label: "Recorded by", width: "20%" },
									{ label: "Amount", width: "15%", right: true },
								]}
								rows={st.payments.map((p) => [
									formatDate(p.paid_at),
									p.method === "cash"
										? "Cash"
										: p.method === "transfer"
											? "Transfer"
											: "Paystack",
									p.reference,
									p.recorded_by ?? "—",
									formatNaira(p.amount_kobo),
								])}
							/>
						</View>
					) : null}
				</View>

				{st.history.length ? (
					<View style={s.section}>
						<Text style={s.sectionTitle}>Status history</Text>
						<Table
							columns={[
								{ label: "Date", width: "18%" },
								{ label: "Course", width: "32%" },
								{ label: "Change", width: "32%" },
								{ label: "By", width: "18%" },
							]}
							rows={st.history.map((h) => [
								formatDate(h.at),
								courseTitle(h.course_slug),
								h.from_status
									? `${status(h.from_status)} to ${status(h.to_status)}`
									: `Enrolled as ${status(h.to_status)}`,
								h.actor_name ?? "—",
							])}
						/>
					</View>
				) : null}

				{a ? (
					<View style={s.section}>
						<Text style={s.sectionTitle}>Application</Text>
						<Rows
							rows={[
								["Applied", formatDate(String(a.applied))],
								["Training mode", String(a.mode)],
								["Has experience", yesNo(a.has_experience)],
								["Experience", String(a.experience_detail)],
								["Has a laptop", yesNo(a.has_laptop)],
								["Heard about us from", String(a.heard_from)],
								["Can commit", yesNo(a.can_commit)],
								["Updates by email and SMS", yesNo(a.notify_consent)],
								["Comments", String(a.comments)],
							]}
						/>
					</View>
				) : null}

				<View style={s.footer} fixed>
					<Text>NexaHubTech · nexahubtech.company · Confidential</Text>
					<Text
						render={({ pageNumber, totalPages }) =>
							`Page ${pageNumber} of ${totalPages}`
						}
					/>
				</View>
			</Page>
		</Document>
	);
}

const generated = new Intl.DateTimeFormat("en-NG", {
	timeZone: "Africa/Lagos",
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "numeric",
	minute: "2-digit",
	hour12: true,
});

export function renderStudentRecord(student: StudentDetail) {
	return renderToBuffer(
		<StudentRecord
			student={student}
			generatedAt={generated.format(new Date())}
		/>,
	);
}
