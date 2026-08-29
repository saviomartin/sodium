-- Adds a per-tool day bucket to get_agent_analytics so the dashboard can draw a
-- timeline lane per tool. Additive: every existing key keeps its shape, and a
-- client that predates this migration simply ignores the new 'daily' array.

create or replace function public.get_agent_analytics(
  p_site_id uuid,
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
    select ue.event, ue.data, ue.created_at
    from public.usage_events ue
    cross join bounds b
    where ue.site_id = p_site_id
      and ue.created_at >= b.since_day at time zone 'utc'
  ),
  daily as (
    select
      day::date as date,
      count(e.*) filter (where e.event = 'loader_ready')::integer as agent_visits,
      count(e.*) filter (where e.event = 'tool_invoked')::integer as tool_calls,
      count(e.*) filter (where e.event = 'answer_engine_referral')::integer as answer_engine_visits
    from bounds b
    cross join lateral generate_series(
      b.since_day,
      date_trunc('day', now() at time zone 'utc'),
      interval '1 day'
    ) as day
    left join events e
      on e.created_at >= day at time zone 'utc'
      and e.created_at < (day + interval '1 day') at time zone 'utc'
    group by day
    order by day
  ),
  tool_rows as (
    select
      coalesce(nullif(data ->> 'tool', ''), 'unknown') as tool,
      count(*)::integer as calls,
      count(*) filter (where data ->> 'ok' = 'true')::integer as successful_calls,
      round(avg(
        case when jsonb_typeof(data -> 'ms') = 'number'
          then (data ->> 'ms')::numeric
        end
      ))::integer as average_latency_ms,
      round(percentile_cont(0.95) within group (
        order by case when jsonb_typeof(data -> 'ms') = 'number'
          then (data ->> 'ms')::numeric
        end
      ))::integer as p95_latency_ms,
      max(created_at) as last_used_at
    from events
    where event = 'tool_invoked'
    group by coalesce(nullif(data ->> 'tool', ''), 'unknown')
    order by calls desc, tool
  ),
  tool_daily as (
    select
      coalesce(nullif(data ->> 'tool', ''), 'unknown') as tool,
      (created_at at time zone 'utc')::date as date,
      count(*)::integer as calls
    from events
    where event = 'tool_invoked'
    group by 1, 2
  ),
  engine_rows as (
    select
      coalesce(nullif(data ->> 'engine', ''), 'Unknown') as engine,
      count(*)::integer as visits,
      max(created_at) as last_visit_at
    from events
    where event = 'answer_engine_referral'
    group by coalesce(nullif(data ->> 'engine', ''), 'Unknown')
    order by visits desc, engine
  ),
  summary as (
    select
      count(*) filter (where event = 'loader_ready')::integer as agent_visits,
      count(*) filter (where event = 'tool_invoked')::integer as tool_calls,
      count(*) filter (
        where event = 'tool_invoked' and data ->> 'ok' = 'true'
      )::integer as successful_calls,
      count(*) filter (
        where event = 'tool_invoked' and data ->> 'ok' <> 'true'
      )::integer as failed_calls,
      count(*) filter (where event = 'answer_engine_referral')::integer as answer_engine_visits,
      count(*) filter (where event = 'manifest_fetch_failed')::integer as manifest_fetch_failures,
      count(*) filter (where event = 'manifest_rejected')::integer as manifest_rejections,
      round(avg(
        case when event = 'tool_invoked' and jsonb_typeof(data -> 'ms') = 'number'
          then (data ->> 'ms')::numeric
        end
      ))::integer as average_latency_ms,
      round(percentile_cont(0.95) within group (
        order by case when event = 'tool_invoked' and jsonb_typeof(data -> 'ms') = 'number'
          then (data ->> 'ms')::numeric
        end
      ))::integer as p95_latency_ms
    from events
  )
  select jsonb_build_object(
    'periodDays', (select days from bounds),
    'summary', jsonb_build_object(
      'agentVisits', coalesce(s.agent_visits, 0),
      'toolCalls', coalesce(s.tool_calls, 0),
      'successfulCalls', coalesce(s.successful_calls, 0),
      'failedCalls', coalesce(s.failed_calls, 0),
      'answerEngineVisits', coalesce(s.answer_engine_visits, 0),
      'manifestFetchFailures', coalesce(s.manifest_fetch_failures, 0),
      'manifestRejections', coalesce(s.manifest_rejections, 0),
      'averageLatencyMs', coalesce(s.average_latency_ms, 0),
      'p95LatencyMs', coalesce(s.p95_latency_ms, 0)
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.date,
        'agentVisits', d.agent_visits,
        'toolCalls', d.tool_calls,
        'answerEngineVisits', d.answer_engine_visits
      ) order by d.date)
      from daily d
    ), '[]'::jsonb),
    'tools', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tool', t.tool,
        'calls', t.calls,
        'successfulCalls', t.successful_calls,
        'averageLatencyMs', coalesce(t.average_latency_ms, 0),
        'p95LatencyMs', coalesce(t.p95_latency_ms, 0),
        'lastUsedAt', t.last_used_at,
        'daily', coalesce((
          select jsonb_agg(jsonb_build_object(
            'date', td.date,
            'calls', td.calls
          ) order by td.date)
          from tool_daily td
          where td.tool = t.tool
        ), '[]'::jsonb)
      ) order by t.calls desc, t.tool)
      from tool_rows t
    ), '[]'::jsonb),
    'engines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'engine', er.engine,
        'visits', er.visits,
        'lastVisitAt', er.last_visit_at
      ) order by er.visits desc, er.engine)
      from engine_rows er
    ), '[]'::jsonb)
  )
  from summary s;
$$;

revoke all on function public.get_agent_analytics(uuid, integer) from public, anon;
grant execute on function public.get_agent_analytics(uuid, integer) to authenticated;
