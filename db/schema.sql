create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table private.allowed_admins (email text primary key,user_id uuid unique references auth.users(id));
alter table private.allowed_admins enable row level security;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from auth.users u join private.allowed_admins a on (u.id=a.user_id or (a.user_id is null and lower(u.email)=a.email))
 where u.id=auth.uid() and u.email_confirmed_at is not null
 );
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;
create table public.companies(
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 2 and 200),
 phone text check(phone is null or phone ~ '^[0-9]{10,15}$'),
 cnpj text check(cnpj is null or cnpj ~ '^[0-9]{14}$'),
 email text, website text, city text not null default '', neighborhood text not null default '',
 category text not null default '', address text not null default '', notes text not null default '',
 source text not null default 'Manual',
 status text not null default 'Nova empresa' check(status in ('Nova empresa','Aguardando autorização','Autorizada para contato','Contato realizado','Respondeu','Interessada','Em negociação','Cliente fechado','Sem interesse')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index companies_phone_unique on public.companies(phone) where phone is not null;
create unique index companies_cnpj_unique on public.companies(cnpj) where cnpj is not null;
create index companies_created_at_idx on public.companies(created_at desc);
create table public.consents(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 granted boolean not null, evidence text not null check(length(evidence) between 5 and 2000),
 recorded_by uuid default auth.uid() references auth.users(id),created_at timestamptz not null default now()
);
create index consents_company_idx on public.consents(company_id,created_at desc);
create table public.interactions(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 body text not null check(length(body) between 1 and 4000),created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index interactions_company_idx on public.interactions(company_id,created_at desc);
create table public.templates(
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 2 and 200),
 body text not null check(length(body) between 1 and 4000),category text not null default '',
 created_at timestamptz not null default now()
);
create table public.audit_log(
 id bigint generated always as identity primary key,actor uuid,action text not null,entity text not null,entity_id uuid,created_at timestamptz not null default now()
);
alter table public.companies enable row level security;
alter table public.consents enable row level security;
alter table public.interactions enable row level security;
alter table public.templates enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.companies,public.consents,public.interactions,public.templates,public.audit_log from anon,authenticated;
grant select,insert,update,delete on public.companies,public.templates to authenticated;
grant select,insert on public.consents,public.interactions to authenticated;
grant select on public.audit_log to authenticated;
create policy admin_companies on public.companies for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy admin_templates on public.templates for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy admin_consents_read on public.consents for select to authenticated using((select private.is_admin()));
create policy admin_consents_add on public.consents for insert to authenticated with check((select private.is_admin()) and recorded_by=(select auth.uid()));
create policy admin_interactions_read on public.interactions for select to authenticated using((select private.is_admin()));
create policy admin_interactions_add on public.interactions for insert to authenticated with check((select private.is_admin()) and created_by=(select auth.uid()));
create policy admin_audit_read on public.audit_log for select to authenticated using((select private.is_admin()));
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' and (auth.uid() is null or not private.is_admin()) then raise exception 'Access denied'; end if;
 insert into public.audit_log(actor,action,entity,entity_id) values(auth.uid(),TG_OP,TG_TABLE_NAME,case when TG_OP='DELETE' then OLD.id else NEW.id end);
 if TG_OP='DELETE' then return OLD; end if;
 if TG_TABLE_NAME='companies' then NEW.updated_at=now(); end if;
 return NEW;
end;
$$;
revoke all on function private.audit_change() from public,anon,authenticated;
create trigger companies_audit before insert or update or delete on public.companies for each row execute function private.audit_change();
create trigger templates_audit before insert or update or delete on public.templates for each row execute function private.audit_change();
create trigger consents_audit before insert on public.consents for each row execute function private.audit_change();
create trigger interactions_audit before insert on public.interactions for each row execute function private.audit_change();
create function public.check_admin() returns boolean language sql stable security invoker set search_path='' as $$ select private.is_admin(); $$;
revoke all on function public.check_admin() from public,anon;
grant execute on function public.check_admin() to authenticated;

create function public.bind_admin() returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_admin() then return false; end if;
 update private.allowed_admins set user_id=auth.uid() where user_id is null and email=(select lower(email) from auth.users where id=auth.uid() and email_confirmed_at is not null);
 return true;
end; $$;
revoke all on function public.bind_admin() from public,anon;
grant execute on function public.bind_admin() to authenticated;
create table public.campaigns(id uuid primary key default gen_random_uuid(),name text not null,template_name text not null,language text not null,body text not null,created_at timestamptz not null default now());
create table public.messages(id uuid primary key default gen_random_uuid(),campaign_id uuid references public.campaigns(id),company_id uuid references public.companies(id),phone text not null,body text not null,direction text not null check(direction in ('in','out')),status text not null default 'pending',provider_id text unique,error text,created_at timestamptz not null default now(),unique(campaign_id,company_id));
create index messages_company_idx on public.messages(company_id,created_at desc);
create index messages_campaign_idx on public.messages(campaign_id);
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;
revoke all on public.campaigns,public.messages from anon,authenticated;
grant select,insert,update on public.campaigns,public.messages to authenticated;
create policy admin_campaigns on public.campaigns for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy admin_messages on public.messages for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create function public.claim_message(message_id uuid) returns setof public.messages language sql security invoker set search_path='' as $$
 update public.messages m set status='sending'
 where m.id=message_id and m.status='pending' and m.direction='out'
 and (select c.granted from public.consents c where c.company_id=m.company_id order by c.created_at desc,c.id desc limit 1)=true
 returning m.*;
$$;
revoke all on function public.claim_message(uuid) from public,anon;
grant execute on function public.claim_message(uuid) to authenticated;
create table private.rate_limits(bucket text primary key,started_at timestamptz not null default now(),hits integer not null default 1);
alter table private.rate_limits enable row level security;
create function public.check_rate(bucket_name text,max_hits integer,window_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare k text; allowed boolean;
begin
 if auth.uid() is null or not private.is_admin() then return false; end if;
 k=auth.uid()::text||':'||left(bucket_name,30);
 insert into private.rate_limits(bucket) values(k) on conflict(bucket) do update
 set hits=case when private.rate_limits.started_at<now()-make_interval(secs=>greatest(window_seconds,60)) then 1 else private.rate_limits.hits+1 end,
 started_at=case when private.rate_limits.started_at<now()-make_interval(secs=>greatest(window_seconds,60)) then now() else private.rate_limits.started_at end
 returning hits<=least(max_hits,100) into allowed;
 return allowed;
end; $$;
revoke all on function public.check_rate(text,integer,integer) from public,anon;
grant execute on function public.check_rate(text,integer,integer) to authenticated;

create function public.dashboard_stats() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'companies',(select count(*) from public.companies),
 'authorized',(select count(*) from public.companies co where (select c.granted from public.consents c where c.company_id=co.id order by c.created_at desc,c.id desc limit 1)=true),
 'sent',(select count(*) from public.messages where direction='out' and status in ('sent','delivered','read')),
 'replies',(select count(*) from public.messages where direction='in'),
 'opportunities',(select count(*) from public.companies where status in ('Interessada','Em negociação')),
 'found',(select count(*) from public.companies where source like 'OpenStreetMap%'),
 'pipeline',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (select status,count(*) n from public.companies group by status) s)
 ); $$;
revoke all on function public.dashboard_stats() from public,anon;
grant execute on function public.dashboard_stats() to authenticated;
