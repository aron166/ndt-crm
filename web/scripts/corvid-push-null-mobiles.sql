\set ON_ERROR_STOP on
-- Null the Hungarian mobile numbers corvid-push wrote into persons.phone and contacts.phone (Vanda, PR #155 P1).
-- NOT RUN. Aron decides whether this runs against prod. Tenant 1 (Controllabor).
-- Part 1 is read-only. Part 2 ends in ROLLBACK: check the counts it prints, then change ROLLBACK to COMMIT to apply.
--
-- Scope:
--   persons  created by corvid-push (audit_log action create, actor_agent_id corvid-push). Matched persons only got
--            a notes append, never a phone.
--   contacts created by corvid-push. The first push did not audit contact inserts, so a contact is identified by the
--            email_draft corvid-push inserted in the same transaction: same person, same company, and created_at equal
--            to the draft's (now() is the transaction start time, shared by every insert of one push).
-- Mobile: +36 20/30/31/50/70 in 0036, +36, bare 36 (more than 9 digits), 06 or national form; mirror of isMobile().

-- Part 1: list the affected rows (read-only)
with pushed_person as (
  select entity_id as id from audit_log
  where tenant_id = 1 and actor_agent_id = 'corvid-push' and action = 'create' and entity_type = 'person'
    and not exists (select 1 from audit_log u where u.tenant_id = 1 and u.entity_type = 'person'
      and u.entity_id = audit_log.entity_id and u.action = 'update'
      and u.actor_agent_id is distinct from 'corvid-push')  -- skip persons a human edited after the push
), pushed_draft as (
  select d.person_id, d.company_id, d.created_at from email_drafts d
  join audit_log a on a.tenant_id = d.tenant_id and a.entity_type = 'email_draft' and a.entity_id = d.id
   and a.actor_agent_id = 'corvid-push' and a.action = 'create'
  where d.tenant_id = 1
), hu as (
  select 'person' as kind, p.id, p.phone, p.created_at, p.updated_at, null::int as person_id, null::int as company_id
  from persons p join pushed_person pp on pp.id = p.id where p.tenant_id = 1 and p.phone is not null
  union all
  select 'contact', c.id, c.phone, c.created_at, null, c.person_id, c.company_id
  from contacts c join pushed_draft pd on pd.person_id = c.person_id and pd.company_id = c.company_id and pd.created_at = c.created_at
  where c.tenant_id = 1 and c.phone is not null
), norm as (
  select *, regexp_replace(phone, '\D', '', 'g') as d from hu
)
select kind, id, person_id, company_id, phone, created_at, updated_at from norm
where left(case when d like '0036%' then substr(d, 5)
                when d like '06%' then substr(d, 3)
                when d like '36%' and length(d) > 9 then substr(d, 3)
                else d end, 2) in ('20', '30', '31', '50', '70')
order by kind, id;

-- Part 2: null them and write one audit row per change (one transaction)
begin;

create temp table corvid_mobiles on commit drop as
with pushed_person as (
  select entity_id as id from audit_log
  where tenant_id = 1 and actor_agent_id = 'corvid-push' and action = 'create' and entity_type = 'person'
    and not exists (select 1 from audit_log u where u.tenant_id = 1 and u.entity_type = 'person'
      and u.entity_id = audit_log.entity_id and u.action = 'update'
      and u.actor_agent_id is distinct from 'corvid-push')  -- skip persons a human edited after the push
), pushed_draft as (
  select d.person_id, d.company_id, d.created_at from email_drafts d
  join audit_log a on a.tenant_id = d.tenant_id and a.entity_type = 'email_draft' and a.entity_id = d.id
   and a.actor_agent_id = 'corvid-push' and a.action = 'create'
  where d.tenant_id = 1
), hu as (
  select 'person' as kind, p.id, p.phone from persons p join pushed_person pp on pp.id = p.id
  where p.tenant_id = 1 and p.phone is not null
  union all
  select 'contact', c.id, c.phone from contacts c
  join pushed_draft pd on pd.person_id = c.person_id and pd.company_id = c.company_id and pd.created_at = c.created_at
  where c.tenant_id = 1 and c.phone is not null
), norm as (
  select *, regexp_replace(phone, '\D', '', 'g') as d from hu
)
select kind, id, phone from norm
where left(case when d like '0036%' then substr(d, 5)
                when d like '06%' then substr(d, 3)
                when d like '36%' and length(d) > 9 then substr(d, 3)
                else d end, 2) in ('20', '30', '31', '50', '70');

select kind, count(*) from corvid_mobiles group by kind;  -- expected from the review: 9 numbers across both kinds

update persons p set phone = null, updated_at = now()
from corvid_mobiles m where m.kind = 'person' and m.id = p.id and p.tenant_id = 1 and p.phone = m.phone;

update contacts c set phone = null
from corvid_mobiles m where m.kind = 'contact' and m.id = c.id and c.tenant_id = 1 and c.phone = m.phone;

insert into audit_log (tenant_id, actor_agent_id, action, entity_type, entity_id, changes, occurred_at)
select 1, 'corvid-push', 'update', m.kind, m.id,
       jsonb_build_object('before', jsonb_build_object('phone', m.phone), 'after', jsonb_build_object('phone', null),
                          'reason', 'named person mobile removed (PR #155 review)'),
       now()
from corvid_mobiles m;

rollback;  -- change to COMMIT once the counts above are right
