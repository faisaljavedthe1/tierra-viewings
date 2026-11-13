-- Job title (e.g. "Accountant", "Personal Assistant") is separate from the app role (agent/manager/driver/admin).
alter table public.profiles add column job_title text check (length(job_title) <= 80);
