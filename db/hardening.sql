alter function public.bind_admin() set schema private;
alter function public.check_rate(text,integer,integer) set schema private;
create function public.bind_admin() returns boolean language sql security invoker set search_path='' as $$ select private.bind_admin(); $$;
create function public.check_rate(bucket_name text,max_hits integer,window_seconds integer) returns boolean language sql security invoker set search_path='' as $$ select private.check_rate(bucket_name,max_hits,window_seconds); $$;
revoke all on function public.bind_admin(),public.check_rate(text,integer,integer) from public,anon;
grant execute on function public.bind_admin(),public.check_rate(text,integer,integer) to authenticated;
grant all on public.companies,public.consents,public.interactions,public.templates,public.audit_log,public.campaigns,public.messages to service_role;
grant usage,select on sequence public.audit_log_id_seq to service_role;
