-- Two more enrolment statuses, for enrolling straight into a course
-- (20261101090100_course_enrolments.sql):
--
--   awaiting_payment  approved, no payment yet; the first payment makes it active
--   paused            on hold, e.g. travelling; an admin sets it and lifts it
--
-- On their own in this migration because Postgres won't use a new enum value
-- in the transaction that added it.

alter type public.enrolment_status add value if not exists 'awaiting_payment' before 'active';
alter type public.enrolment_status add value if not exists 'paused' after 'active';
