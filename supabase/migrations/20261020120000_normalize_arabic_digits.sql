-- Digits are ASCII everywhere: source, UI copy and stored content. This
-- migration is the write boundary for the last one. `private.normalize_arabic_digits`
-- folds Arabic-Indic (U+0660-U+0669) and Persian (U+06F0-U+06F9) numerals into
-- 0-9; the triggers apply it to user-authored text columns before a row is
-- written, and the backfill rewrites rows written before the trigger existed.
--
-- Deliberately excluded: unique/identifier columns (`slug`, `username`,
-- `reference_code`, `certificate_code`) and emails. Rewriting those could turn
-- two distinct values into a unique-constraint collision; they are generated
-- from ASCII input or validated separately.
--
-- rollback:
--   drop trigger if exists normalize_arabic_digits on public.<table>;  -- for each table below
--   drop function if exists private.normalize_digits_in_text_columns();
--   drop function if exists private.normalize_arabic_digits(text);
--   (the backfill itself is not reversible)

create schema if not exists private;

create or replace function private.normalize_arabic_digits(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select translate(
    value,
    U&'\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9',
    '01234567890123456789'
  );
$$;

create or replace function private.normalize_digits_in_text_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  column_name text;
begin
  foreach column_name in array tg_argv loop
    execute format(
      'new.%1$I := private.normalize_arabic_digits(new.%1$I)',
      column_name
    );
  end loop;
  return new;
end;
$$;

revoke all on function private.normalize_arabic_digits(text) from public, anon, authenticated;
revoke all on function private.normalize_digits_in_text_columns() from public, anon, authenticated;

-- Profile text.
drop trigger if exists normalize_arabic_digits on public.users;
create trigger normalize_arabic_digits
  before insert or update on public.users
  for each row execute function private.normalize_digits_in_text_columns('name', 'bio');

-- Community posts and their taxonomy.
drop trigger if exists normalize_arabic_digits on public.posts;
create trigger normalize_arabic_digits
  before insert or update on public.posts
  for each row execute function private.normalize_digits_in_text_columns(
    'content', 'meta_title', 'meta_desc'
  );

drop trigger if exists normalize_arabic_digits on public.community_categories;
create trigger normalize_arabic_digits
  before insert or update on public.community_categories
  for each row execute function private.normalize_digits_in_text_columns('name');

drop trigger if exists normalize_arabic_digits on public.community_tags;
create trigger normalize_arabic_digits
  before insert or update on public.community_tags
  for each row execute function private.normalize_digits_in_text_columns('name');

-- Project requests and retainers.
drop trigger if exists normalize_arabic_digits on public.project_requests;
create trigger normalize_arabic_digits
  before insert or update on public.project_requests
  for each row execute function private.normalize_digits_in_text_columns(
    'full_name', 'description', 'budget_range', 'timeline', 'existing_url', 'notes',
    'phone_whatsapp'
  );

drop trigger if exists normalize_arabic_digits on public.retainers;
create trigger normalize_arabic_digits
  before insert or update on public.retainers
  for each row execute function private.normalize_digits_in_text_columns(
    'full_name', 'company', 'current_projects', 'needs', 'notes', 'phone_whatsapp'
  );

-- Training.
drop trigger if exists normalize_arabic_digits on public.training_applications;
create trigger normalize_arabic_digits
  before insert or update on public.training_applications
  for each row execute function private.normalize_digits_in_text_columns(
    'full_name', 'goal', 'notes', 'phone_whatsapp'
  );

drop trigger if exists normalize_arabic_digits on public.training_cohorts;
create trigger normalize_arabic_digits
  before insert or update on public.training_cohorts
  for each row execute function private.normalize_digits_in_text_columns('label');

-- Consultations.
drop trigger if exists normalize_arabic_digits on public.consultation_bookings;
create trigger normalize_arabic_digits
  before insert or update on public.consultation_bookings
  for each row execute function private.normalize_digits_in_text_columns(
    'full_name', 'topic_description', 'rejected_reason', 'phone_whatsapp'
  );

drop trigger if exists normalize_arabic_digits on public.consultation_packages;
create trigger normalize_arabic_digits
  before insert or update on public.consultation_packages
  for each row execute function private.normalize_digits_in_text_columns(
    'name', 'description'
  );

-- Certificates.
drop trigger if exists normalize_arabic_digits on public.certificates;
create trigger normalize_arabic_digits
  before insert or update on public.certificates
  for each row execute function private.normalize_digits_in_text_columns(
    'student_name', 'course_name', 'grade_or_status'
  );

-- HabitFlow.
drop trigger if exists normalize_arabic_digits on public.habits;
create trigger normalize_arabic_digits
  before insert or update on public.habits
  for each row execute function private.normalize_digits_in_text_columns('name');

drop trigger if exists normalize_arabic_digits on public.habit_logs;
create trigger normalize_arabic_digits
  before insert or update on public.habit_logs
  for each row execute function private.normalize_digits_in_text_columns('note');

-- SpendTrack.
drop trigger if exists normalize_arabic_digits on public.categories;
create trigger normalize_arabic_digits
  before insert or update on public.categories
  for each row execute function private.normalize_digits_in_text_columns('name');

drop trigger if exists normalize_arabic_digits on public.expenses;
create trigger normalize_arabic_digits
  before insert or update on public.expenses
  for each row execute function private.normalize_digits_in_text_columns('description');

drop trigger if exists normalize_arabic_digits on public.recurring_expenses;
create trigger normalize_arabic_digits
  before insert or update on public.recurring_expenses
  for each row execute function private.normalize_digits_in_text_columns('description');

-- Notifications and downloader labels are admin-authored copy.
drop trigger if exists normalize_arabic_digits on public.notifications;
create trigger normalize_arabic_digits
  before insert or update on public.notifications
  for each row execute function private.normalize_digits_in_text_columns('title', 'body');

drop trigger if exists normalize_arabic_digits on public.download_jobs;
create trigger normalize_arabic_digits
  before insert or update on public.download_jobs
  for each row execute function private.normalize_digits_in_text_columns('file_filename');

-- One-time backfill. Each statement is bounded by a regex so rows already in
-- the target shape are not rewritten. `updated_at` is preserved where the
-- column exists and the table's own trigger does not stamp it.
update public.users
set name = private.normalize_arabic_digits(name),
    bio = private.normalize_arabic_digits(bio)
where name ~ U&'[\0660-\0669\06F0-\06F9]'
   or bio ~ U&'[\0660-\0669\06F0-\06F9]';

update public.posts
set content = private.normalize_arabic_digits(content),
    meta_title = private.normalize_arabic_digits(meta_title),
    meta_desc = private.normalize_arabic_digits(meta_desc)
where content ~ U&'[\0660-\0669\06F0-\06F9]'
   or meta_title ~ U&'[\0660-\0669\06F0-\06F9]'
   or meta_desc ~ U&'[\0660-\0669\06F0-\06F9]';

update public.community_categories
set name = private.normalize_arabic_digits(name)
where name ~ U&'[\0660-\0669\06F0-\06F9]';

update public.community_tags
set name = private.normalize_arabic_digits(name)
where name ~ U&'[\0660-\0669\06F0-\06F9]';

update public.project_requests
set full_name = private.normalize_arabic_digits(full_name),
    description = private.normalize_arabic_digits(description),
    budget_range = private.normalize_arabic_digits(budget_range),
    timeline = private.normalize_arabic_digits(timeline),
    existing_url = private.normalize_arabic_digits(existing_url),
    notes = private.normalize_arabic_digits(notes),
    phone_whatsapp = private.normalize_arabic_digits(phone_whatsapp)
where full_name ~ U&'[\0660-\0669\06F0-\06F9]'
   or description ~ U&'[\0660-\0669\06F0-\06F9]'
   or budget_range ~ U&'[\0660-\0669\06F0-\06F9]'
   or timeline ~ U&'[\0660-\0669\06F0-\06F9]'
   or existing_url ~ U&'[\0660-\0669\06F0-\06F9]'
   or notes ~ U&'[\0660-\0669\06F0-\06F9]'
   or phone_whatsapp ~ U&'[\0660-\0669\06F0-\06F9]';

update public.retainers
set full_name = private.normalize_arabic_digits(full_name),
    company = private.normalize_arabic_digits(company),
    current_projects = private.normalize_arabic_digits(current_projects),
    needs = private.normalize_arabic_digits(needs),
    notes = private.normalize_arabic_digits(notes),
    phone_whatsapp = private.normalize_arabic_digits(phone_whatsapp)
where full_name ~ U&'[\0660-\0669\06F0-\06F9]'
   or company ~ U&'[\0660-\0669\06F0-\06F9]'
   or current_projects ~ U&'[\0660-\0669\06F0-\06F9]'
   or needs ~ U&'[\0660-\0669\06F0-\06F9]'
   or notes ~ U&'[\0660-\0669\06F0-\06F9]'
   or phone_whatsapp ~ U&'[\0660-\0669\06F0-\06F9]';

update public.training_applications
set full_name = private.normalize_arabic_digits(full_name),
    goal = private.normalize_arabic_digits(goal),
    notes = private.normalize_arabic_digits(notes),
    phone_whatsapp = private.normalize_arabic_digits(phone_whatsapp)
where full_name ~ U&'[\0660-\0669\06F0-\06F9]'
   or goal ~ U&'[\0660-\0669\06F0-\06F9]'
   or notes ~ U&'[\0660-\0669\06F0-\06F9]'
   or phone_whatsapp ~ U&'[\0660-\0669\06F0-\06F9]';

update public.training_cohorts
set label = private.normalize_arabic_digits(label)
where label ~ U&'[\0660-\0669\06F0-\06F9]';

update public.consultation_bookings
set full_name = private.normalize_arabic_digits(full_name),
    topic_description = private.normalize_arabic_digits(topic_description),
    rejected_reason = private.normalize_arabic_digits(rejected_reason),
    phone_whatsapp = private.normalize_arabic_digits(phone_whatsapp)
where full_name ~ U&'[\0660-\0669\06F0-\06F9]'
   or topic_description ~ U&'[\0660-\0669\06F0-\06F9]'
   or rejected_reason ~ U&'[\0660-\0669\06F0-\06F9]'
   or phone_whatsapp ~ U&'[\0660-\0669\06F0-\06F9]';

update public.consultation_packages
set name = private.normalize_arabic_digits(name),
    description = private.normalize_arabic_digits(description)
where name ~ U&'[\0660-\0669\06F0-\06F9]'
   or description ~ U&'[\0660-\0669\06F0-\06F9]';

update public.certificates
set student_name = private.normalize_arabic_digits(student_name),
    course_name = private.normalize_arabic_digits(course_name),
    grade_or_status = private.normalize_arabic_digits(grade_or_status)
where student_name ~ U&'[\0660-\0669\06F0-\06F9]'
   or course_name ~ U&'[\0660-\0669\06F0-\06F9]'
   or grade_or_status ~ U&'[\0660-\0669\06F0-\06F9]';

update public.habits
set name = private.normalize_arabic_digits(name)
where name ~ U&'[\0660-\0669\06F0-\06F9]';

update public.habit_logs
set note = private.normalize_arabic_digits(note)
where note ~ U&'[\0660-\0669\06F0-\06F9]';

update public.categories
set name = private.normalize_arabic_digits(name)
where name ~ U&'[\0660-\0669\06F0-\06F9]';

update public.expenses
set description = private.normalize_arabic_digits(description)
where description ~ U&'[\0660-\0669\06F0-\06F9]';

update public.recurring_expenses
set description = private.normalize_arabic_digits(description)
where description ~ U&'[\0660-\0669\06F0-\06F9]';

update public.notifications
set title = private.normalize_arabic_digits(title),
    body = private.normalize_arabic_digits(body)
where title ~ U&'[\0660-\0669\06F0-\06F9]'
   or body ~ U&'[\0660-\0669\06F0-\06F9]';

update public.download_jobs
set file_filename = private.normalize_arabic_digits(file_filename)
where file_filename ~ U&'[\0660-\0669\06F0-\06F9]';
