-- Add profile fields to candidate_users so they can be saved to the database instead of localStorage

alter table candidate_users 
  add column if not exists role text,
  add column if not exists location text,
  add column if not exists bio text,
  add column if not exists notice_period text,
  add column if not exists open_to text[],
  add column if not exists resume_path text,
  add column if not exists links jsonb default '{}'::jsonb,
  add column if not exists profile_updated_at timestamptz;

-- Create a storage bucket for resumes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  5242880, -- 5MB limit
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set 
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
