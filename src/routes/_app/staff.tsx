import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { UserPlusIcon } from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { toast } from "#/components/ui/toast";
import {
	inviteStaff,
	listStaff,
	type Outcome,
	type Role,
	type StaffMember,
	updateStaff,
} from "../../lib/staff";

/* Admins only. The database refuses instructors anyway (RLS and the
   functions' own checks); this keeps them from landing on a dead screen. */
export const Route = createFileRoute("/_app/staff")({
	beforeLoad: ({ context }) => {
		if (context.staff.role !== "admin") throw redirect({ to: "/" });
	},
	loader: () => listStaff(),
	component: StaffScreen,
});

const ROLES: { label: string; value: Role }[] = [
	{ label: "Instructor", value: "instructor" },
	{ label: "Admin", value: "admin" },
];

/* shows the outcome and, when something changed, reloads the list */
function useApply() {
	const router = useRouter();
	return async (outcome: Promise<Outcome>, success: string) => {
		const r = await outcome;
		if (r.ok) {
			toast.add({ title: success, description: r.note, type: "success" });
			await router.invalidate();
		} else {
			toast.add({
				title: "Not changed",
				description: r.message,
				type: "error",
			});
		}
		return r.ok;
	};
}

function StaffScreen() {
	const staff = Route.useLoaderData();
	const { staff: me } = Route.useRouteContext();
	return (
		<Card>
			<CardHeader>
				<CardTitle>Staff</CardTitle>
				<CardDescription>
					Admins manage everything; instructors see only the cohorts they teach.
				</CardDescription>
				<CardAction>
					<InviteDialog />
				</CardAction>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="text-right">
								<span className="sr-only">Actions</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{staff.map((s) => (
							<StaffRow key={s.id} member={s} isMe={s.id === me.id} />
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

function StaffRow({ member, isMe }: { member: StaffMember; isMe: boolean }) {
	const apply = useApply();
	return (
		<TableRow className={member.active ? undefined : "text-muted-foreground"}>
			<TableCell>
				<div className="flex flex-col">
					<span className="font-medium text-foreground">
						{member.full_name}
						{isMe && " (you)"}
					</span>
					<span className="text-muted-foreground">{member.email}</span>
				</div>
			</TableCell>
			<TableCell>
				<Select
					items={ROLES}
					value={member.role}
					disabled={isMe || !member.active}
					onValueChange={(role) =>
						role &&
						apply(
							updateStaff({ data: { id: member.id, role } }),
							`${member.full_name} is now ${role === "admin" ? "an admin" : "an instructor"}`,
						)
					}
				>
					<SelectTrigger size="sm" aria-label={`Role for ${member.full_name}`}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{ROLES.map((r) => (
								<SelectItem key={r.value} value={r.value}>
									{r.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</TableCell>
			<TableCell>
				<Badge variant={member.active ? "secondary" : "outline"}>
					{member.active ? "Active" : "Deactivated"}
				</Badge>
			</TableCell>
			<TableCell className="text-right">
				{isMe ? null : member.active ? (
					<DeactivateButton member={member} />
				) : (
					<Button
						variant="ghost"
						size="sm"
						onClick={() =>
							apply(
								updateStaff({ data: { id: member.id, active: true } }),
								`${member.full_name} can sign in again`,
							)
						}
					>
						Reactivate
					</Button>
				)}
			</TableCell>
		</TableRow>
	);
}

function DeactivateButton({ member }: { member: StaffMember }) {
	const apply = useApply();
	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={
					<Button variant="ghost" size="sm">
						Deactivate
					</Button>
				}
			/>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Deactivate {member.full_name}?</AlertDialogTitle>
					<AlertDialogDescription>
						They lose access on their next click. Their records stay, and you
						can reactivate them at any time.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						onClick={() =>
							apply(
								updateStaff({ data: { id: member.id, active: false } }),
								`${member.full_name} has been deactivated`,
							)
						}
					>
						Deactivate
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function InviteDialog() {
	const apply = useApply();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = new FormData(e.currentTarget);
		const full_name = String(form.get("full_name") ?? "");
		setPending(true);
		const ok = await apply(
			inviteStaff({
				data: {
					full_name,
					email: String(form.get("email") ?? ""),
					role: String(form.get("role") ?? "instructor"),
				},
			}),
			`${full_name.trim()} has been invited`,
		);
		setPending(false);
		if (ok) setOpen(false);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button>
						<UserPlusIcon data-icon="inline-start" />
						Invite
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={onSubmit} className="flex flex-col gap-6">
					<DialogHeader>
						<DialogTitle>Invite a member of staff</DialogTitle>
						<DialogDescription>
							They'll get an email with a link to sign in. Nobody can sign up on
							their own.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="invite-name">Full name</FieldLabel>
							<Input
								id="invite-name"
								name="full_name"
								required
								maxLength={120}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="invite-email">Work email</FieldLabel>
							<Input
								id="invite-email"
								name="email"
								type="email"
								required
								autoComplete="off"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="invite-role">Role</FieldLabel>
							<Select items={ROLES} name="role" defaultValue="instructor">
								<SelectTrigger id="invite-role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{ROLES.map((r) => (
											<SelectItem key={r.value} value={r.value}>
												{r.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<DialogClose render={<Button variant="ghost">Cancel</Button>} />
						<Button type="submit" disabled={pending}>
							{pending && <Spinner data-icon="inline-start" />}
							Send invitation
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
