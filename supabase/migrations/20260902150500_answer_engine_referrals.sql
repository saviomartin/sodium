alter table public.usage_events
  drop constraint if exists usage_events_event_check;

alter table public.usage_events
  add column session_id uuid,
  add column answer_engine text,
  add column attribution_method text,
  add constraint usage_events_event_check check (event in (
    'sdk_ready',
    'answer_engine_referral',
    'tool_registered',
    'tool_register_failed',
    'tool_started',
    'tool_succeeded',
    'tool_failed',
    'confirmation_denied'
  )),
  add constraint usage_events_answer_engine_check check (
    answer_engine is null or answer_engine in (
      'ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Copilot',
      'Grok', 'DeepSeek', 'Mistral', 'You.com'
    )
  ),
  add constraint usage_events_attribution_method_check check (
    attribution_method is null or attribution_method in ('referrer', 'campaign')
  ),
  add constraint usage_events_referral_shape_check check (
    (
      event = 'answer_engine_referral'
      and session_id is not null
      and answer_engine is not null
      and attribution_method is not null
      and tool_id is null
      and tool_name is null
      and invocation_id is null
      and duration_ms is null
      and error_code is null
    )
    or (
      event <> 'answer_engine_referral'
      and answer_engine is null
      and attribution_method is null
    )
  );

create index usage_events_project_session_time_idx
  on public.usage_events (project_id, session_id, received_at)
  where session_id is not null;

create index usage_events_project_engine_time_idx
  on public.usage_events (project_id, answer_engine, received_at desc)
  where event = 'answer_engine_referral';

create unique index usage_events_referral_session_idx
  on public.usage_events (project_id, session_id, event)
  where event = 'answer_engine_referral';

create or replace function public.get_project_agent_analytics(
  p_project_id text,
  p_days integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select greatest(7, least(coalesce(p_days, 30), 90))::integer as days
  ),
  bounds as (
    select
      days,
      date_trunc('day', now() at time zone 'utc')
        - make_interval(days => days - 1) as since_day
    from params
  ),
  events as materialized (
    select
      ue.event,
      ue.tool_id,
      ue.tool_name,
      ue.session_id,
      ue.duration_ms,
      ue.answer_engine,
      ue.attribution_method,
      ue.received_at
    from public.usage_events ue
    cross join bounds b
    where ue.project_id = p_project_id
      and ue.received_at >= b.since_day at time zone 'utc'
  ),
  daily as (
    select
      day::date as date,
      count(e.*) filter (where e.event = 'tool_started')::integer as calls,
      count(e.*) filter (where e.event = 'tool_succeeded')::integer as successes,
      count(e.*) filter (where e.event = 'tool_failed')::integer as failures,
      count(e.*) filter (where e.event = 'confirmation_denied')::integer as denied,
      count(e.*) filter (where e.event = 'sdk_ready')::integer as sdk_sessions,
      count(e.*) filter (where e.event = 'answer_engine_referral')::integer
        as answer_engine_visits,
      percentile_disc(0.95) within group (order by e.duration_ms)
        filter (
          where e.event in ('tool_succeeded', 'tool_failed', 'confirmation_denied')
            and e.duration_ms is not null
        )::integer as p95_ms
    from bounds b
    cross join lateral generate_series(
      b.since_day,
      date_trunc('day', now() at time zone 'utc'),
      interval '1 day'
    ) as day
    left join events e
      on e.received_at >= day at time zone 'utc'
      and e.received_at < (day + interval '1 day') at time zone 'utc'
    group by day
    order by day
  ),
  tool_rows as (
    select
      e.tool_id as id,
      e.tool_name as name,
      count(*) filter (where e.event = 'tool_started')::integer as calls,
      count(*) filter (where e.event = 'tool_succeeded')::integer as successes,
      count(*) filter (where e.event = 'tool_failed')::integer as failures,
      count(*) filter (where e.event = 'confirmation_denied')::integer as denied,
      percentile_disc(0.95) within group (order by e.duration_ms)
        filter (
          where e.event in ('tool_succeeded', 'tool_failed', 'confirmation_denied')
            and e.duration_ms is not null
        )::integer as p95_ms
    from events e
    where e.tool_id is not null and e.tool_name is not null
    group by e.tool_id, e.tool_name
  ),
  tool_daily as (
    select
      e.tool_id as id,
      (e.received_at at time zone 'utc')::date as date,
      count(*)::integer as calls
    from events e
    where e.event = 'tool_started' and e.tool_id is not null
    group by e.tool_id, (e.received_at at time zone 'utc')::date
  ),
  referrals as (
    select
      e.answer_engine,
      e.session_id,
      e.attribution_method,
      min(e.received_at) as referred_at
    from events e
    where e.event = 'answer_engine_referral'
      and e.answer_engine is not null
      and e.session_id is not null
    group by e.answer_engine, e.session_id, e.attribution_method
  ),
  engine_rows as (
    select
      r.answer_engine as name,
      count(*)::integer as visits,
      count(distinct r.session_id)::integer as sessions,
      max(r.referred_at) as last_seen_at
    from referrals r
    group by r.answer_engine
  ),
  engine_tool_rows as (
    select
      r.answer_engine as name,
      count(e.*) filter (where e.event = 'tool_started')::integer as tool_calls,
      count(e.*) filter (where e.event = 'tool_succeeded')::integer as successes
    from referrals r
    left join events e
      on e.session_id = r.session_id
      and e.received_at >= r.referred_at
      and e.event in ('tool_started', 'tool_succeeded')
    group by r.answer_engine
  ),
  engine_methods as (
    select
      r.answer_engine as name,
      count(*) filter (where r.attribution_method = 'referrer')::integer
        as referrer_visits,
      count(*) filter (where r.attribution_method = 'campaign')::integer
        as campaign_visits
    from referrals r
    group by r.answer_engine
  ),
  summary as (
    select
      count(*) filter (where event = 'tool_started')::integer as calls,
      count(*) filter (where event = 'tool_succeeded')::integer as successes,
      count(*) filter (where event = 'tool_failed')::integer as failures,
      count(*) filter (where event = 'confirmation_denied')::integer as denied,
      count(*) filter (where event = 'sdk_ready')::integer as sdk_sessions,
      count(*) filter (where event = 'tool_registered')::integer as registrations,
      count(*) filter (where event = 'tool_register_failed')::integer
        as registration_failures,
      count(*) filter (where event = 'answer_engine_referral')::integer
        as answer_engine_visits,
      max(received_at) as last_seen_at,
      percentile_disc(0.95) within group (order by duration_ms)
        filter (
          where event in ('tool_succeeded', 'tool_failed', 'confirmation_denied')
            and duration_ms is not null
        )::integer as p95_ms
    from events
  )
  select jsonb_build_object(
    'periodDays', (select days from bounds),
    'calls', s.calls,
    'successes', s.successes,
    'failures', s.failures,
    'denied', s.denied,
    'sdkSessions', s.sdk_sessions,
    'registrations', s.registrations,
    'registrationFailures', s.registration_failures,
    'successRate', case
      when s.successes + s.failures > 0
      then s.successes::double precision / (s.successes + s.failures)
      else null
    end,
    'p95Ms', s.p95_ms,
    'lastSeenAt', s.last_seen_at,
    'answerEngineVisits', s.answer_engine_visits,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.date,
        'calls', d.calls,
        'successes', d.successes,
        'failures', d.failures,
        'denied', d.denied,
        'sdkSessions', d.sdk_sessions,
        'answerEngineVisits', d.answer_engine_visits,
        'p95Ms', d.p95_ms
      ) order by d.date)
      from daily d
    ), '[]'::jsonb),
    'tools', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'calls', t.calls,
        'successes', t.successes,
        'failures', t.failures,
        'denied', t.denied,
        'successRate', case
          when t.successes + t.failures > 0
          then t.successes::double precision / (t.successes + t.failures)
          else null
        end,
        'p95Ms', t.p95_ms,
        'daily', coalesce((
          select jsonb_agg(jsonb_build_object(
            'date', td.date,
            'calls', td.calls
          ) order by td.date)
          from tool_daily td
          where td.id = t.id
        ), '[]'::jsonb)
      ) order by t.calls desc, t.name)
      from tool_rows t
    ), '[]'::jsonb),
    'engines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', er.name,
        'visits', er.visits,
        'sessions', er.sessions,
        'toolCalls', coalesce(et.tool_calls, 0),
        'successes', coalesce(et.successes, 0),
        'referrerVisits', em.referrer_visits,
        'campaignVisits', em.campaign_visits,
        'lastSeenAt', er.last_seen_at
      ) order by er.visits desc, er.name)
      from engine_rows er
      join engine_methods em using (name)
      left join engine_tool_rows et using (name)
    ), '[]'::jsonb)
  )
  from summary s;
$$;

revoke all on function public.get_project_agent_analytics(text, integer)
  from public, anon;
grant execute on function public.get_project_agent_analytics(text, integer)
  to authenticated;
