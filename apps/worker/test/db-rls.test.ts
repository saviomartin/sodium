import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "dotenv";
import postgres from "postgres";

/**
 * Database security tests against the real (hosted) project:
 *  - cross-tenant isolation between two organizations
 *  - permission differences between members and owners/admins
 *  - immutability triggers on candidates, contract versions and manifests
 *  - RPC authorization (definer functions re-check membership)
 *
 * The suite seeds NOTHING durable: every test provisions its own users,
 * organizations and repositories inside a transaction that is always rolled
 * back, so the database is left untouched and no demo accounts exist.
 * Requires SUPABASE_DB_URL (skipped otherwise).
 */

const DB_URL = process.env.SUPABASE_DB_URL
  ? parse(`SUPABASE_DB_URL=${process.env.SUPABASE_DB_URL}`).SUPABASE_DB_URL
  : undefined;

type Tx = postgres.TransactionSql;

const sqlRef: { sql: postgres.Sql | null } = { sql: null };

class Rollback extends Error {}

const atomicAvailabilityMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260829012000_atomic_tool_availability.sql",
    import.meta.url,
  ),
  "utf8",
);

/** Runs `fn` in a transaction that is ALWAYS rolled back. */
async function withRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
  await sqlRef
    .sql!.begin(async (tx) => {
      await fn(tx as Tx);
      throw new Rollback();
    })
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

/** Impersonates an authenticated user for the rest of the transaction. */
async function actAs(tx: Tx, userId: string): Promise<void> {
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
  await tx`set local role authenticated`;
}

/** Back to the privileged connection role (service-side code path). */
async function actAsService(tx: Tx): Promise<void> {
  await tx`reset role`;
}

async function ensureAtomicAvailabilityFunction(tx: Tx): Promise<void> {
  const [existing] = await tx<{ exists: boolean }[]>`
    select to_regprocedure(
      'public.set_candidates_enabled(uuid[],uuid,boolean)'
    ) is not null as exists
  `;
  if (!existing?.exists) await tx.unsafe(atomicAvailabilityMigration);
}

/**
 * Asserts a statement fails WITHOUT aborting the outer test transaction:
 * the statement runs inside a savepoint that rolls back on error.
 */
async function expectError(
  tx: Tx,
  pattern: RegExp,
  fn: (t: Tx) => Promise<unknown>,
): Promise<void> {
  await expect(tx.savepoint((t) => fn(t as unknown as Tx))).rejects.toThrow(
    pattern,
  );
}

interface Tenants {
  alice: string; // acme owner
  carol: string; // acme member
  bob: string; // globex owner
  acmeOrg: string;
  globexOrg: string;
  acmeRepo: string;
  githubRepoId: number;
  installationId: number;
  acmeSite: string;
  publicSiteId: string;
}

let uniq = 0;

/** Provisions two tenants entirely inside the rolled-back transaction. */
async function seedTenants(tx: Tx): Promise<Tenants> {
  const alice = randomUUID();
  const carol = randomUUID();
  const bob = randomUUID();
  const suffix = `${Date.now().toString(36)}${(uniq++).toString(36)}`;

  for (const [id, name] of [
    [alice, "alice"],
    [carol, "carol"],
    [bob, "bob"],
  ] as const) {
    await tx`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated',
        ${`${name}-${id}@rls.invalid`}, '', now(),
        '{"provider":"github","providers":["github"]}', '{}', now(), now(), '', '', '', ''
      )
    `;
  }

  const [acme] = await tx<{ id: string }[]>`
    select id from organizations where created_by = ${alice}
  `;
  const [globex] = await tx<{ id: string }[]>`
    select id from organizations where created_by = ${bob}
  `;
  await tx`insert into org_memberships (org_id, user_id, role)
    values (${acme!.id}, ${carol}, 'member')`;

  const installationId = Math.floor(Math.random() * 2_000_000_000) + 1;
  const [installation] = await tx<{ id: string }[]>`
    insert into github_installations (org_id, installation_id, account_login, account_type, created_by)
    values (${acme!.id}, ${installationId}, 'foundative', 'Organization', ${alice}) returning id
  `;
  const [repo] = await tx<{ id: string }[]>`
    insert into repositories (org_id, installation_id, github_repo_id, owner, name, full_name, default_branch)
    values (${acme!.id}, ${installation!.id}, 10001, 'foundative', 'test-shop', 'foundative/test-shop', 'main')
    returning id
  `;
  const publicSiteId = `site_${suffix.padEnd(8, "0").slice(0, 16)}`;
  const [site] = await tx<{ id: string }[]>`
    insert into sites (org_id, repository_id, site_id, allowed_origins)
    values (${acme!.id}, ${repo!.id}, ${publicSiteId}, '{http://localhost:4000}') returning id
  `;

  return {
    alice,
    carol,
    bob,
    acmeOrg: acme!.id,
    globexOrg: globex!.id,
    acmeRepo: repo!.id,
    githubRepoId: 10001,
    installationId,
    acmeSite: site!.id,
    publicSiteId,
  };
}

async function seedCandidate(tx: Tx, tenants: Tenants): Promise<string> {
  const [commit] = await tx<{ id: string }[]>`
    insert into repository_commits (repository_id, org_id, sha)
    values (${tenants.acmeRepo}, ${tenants.acmeOrg}, ${"c".repeat(40)})
    returning id
  `;
  const [run] = await tx<{ id: string }[]>`
    insert into analysis_runs (repository_id, org_id, commit_id)
    values (${tenants.acmeRepo}, ${tenants.acmeOrg}, ${commit!.id})
    returning id
  `;
  const [candidate] = await tx<{ id: string }[]>`
    insert into action_candidates
      (run_id, org_id, action_id, name, title, description, contract, risk_level, confirmation, confidence)
    values
      (${run!.id}, ${tenants.acmeOrg}, 'act_0123456789abcdef', 'list_products', 'List products',
       'Reads the product catalog.', '{"contractVersion":1}'::jsonb, 'read_only', 'none', 0.8)
    returning id
  `;
  return candidate!.id;
}

describe.skipIf(!DB_URL)("RLS and database security", () => {
  beforeAll(() => {
    sqlRef.sql = postgres(DB_URL!, { max: 1, onnotice: () => {} });
  });

  afterAll(async () => {
    await sqlRef.sql?.end();
  });

  it("isolates organizations between tenants", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      await actAs(tx, t.alice);
      const aliceOrgs = await tx<
        { id: string }[]
      >`select id from organizations order by id`;
      expect(aliceOrgs.map((row) => row.id)).toEqual([t.acmeOrg]);

      await actAs(tx, t.bob);
      const bobOrgs = await tx<
        { id: string }[]
      >`select id from organizations order by id`;
      expect(bobOrgs.map((row) => row.id)).toEqual([t.globexOrg]);
    });
  });

  it("hides other tenants' repositories, runs and candidates", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      const candidateId = await seedCandidate(tx, t);

      await actAs(tx, t.bob);
      expect(
        await tx`select id from repositories where id = ${t.acmeRepo}`,
      ).toHaveLength(0);
      expect(
        await tx`select id from action_candidates where id = ${candidateId}`,
      ).toHaveLength(0);
      expect(
        await tx`select id from analysis_runs where org_id = ${t.acmeOrg}`,
      ).toHaveLength(0);

      await actAs(tx, t.alice);
      expect(
        await tx`select id from action_candidates where id = ${candidateId}`,
      ).toHaveLength(1);
    });
  });

  it("lets members read but not administer repositories", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      await actAs(tx, t.carol);
      expect(
        await tx`select id from repositories where org_id = ${t.acmeOrg}`,
      ).toHaveLength(1);
      expect(
        await tx`update repositories set name = 'blocked' where id = ${t.acmeRepo} returning id`,
      ).toHaveLength(0);
    });
  });

  it("lets admins update review fields but never contract lineage", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      const candidateId = await seedCandidate(tx, t);

      // Member cannot review.
      await actAs(tx, t.carol);
      await expect(
        tx`update action_candidates set status = 'rejected', review_note = 'nope' where id = ${candidateId}`,
      ).resolves.toHaveLength(0); // RLS: zero rows updated

      // Owner can review…
      await actAs(tx, t.alice);
      await tx`update action_candidates set status = 'rejected', review_note = 'not useful' where id = ${candidateId}`;
      const [after] = await tx<{ status: string }[]>`
        select status from action_candidates where id = ${candidateId}
      `;
      expect(after!.status).toBe("rejected");

      // …but cannot rewrite the contract, its lineage, or publish directly.
      await expectError(
        tx,
        /immutable/,
        (x) =>
          x`update action_candidates set contract = '{"evil":true}'::jsonb where id = ${candidateId}`,
      );
      await expectError(
        tx,
        /manifest publication/,
        (x) =>
          x`update action_candidates set status = 'published' where id = ${candidateId}`,
      );
    });
  });

  it("keeps contract versions immutable; only privileged paths may delete history", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      const candidateId = await seedCandidate(tx, t);
      await actAs(tx, t.alice);
      const [versionId] = await tx<{ approve_candidate: string }[]>`
        select public.approve_candidate(${candidateId}, ${t.acmeSite})
      `;
      expect(versionId!.approve_candidate).toBeTruthy();

      // Client roles cannot rewrite a version: RLS matches zero rows (no
      // update policy exists), so nothing changes and no error is needed.
      const clientUpdate = await tx`
        update contract_versions set contract = '{}'::jsonb
        where id = ${versionId!.approve_candidate} returning id
      `;
      expect(clientUpdate).toHaveLength(0);
      // Client roles cannot delete history either: same zero-row outcome.
      const clientDelete = await tx`
        delete from contract_versions where id = ${versionId!.approve_candidate} returning id
      `;
      expect(clientDelete).toHaveLength(0);
      expect(
        await tx`select id from contract_versions where id = ${versionId!.approve_candidate}`,
      ).toHaveLength(1);
      await actAsService(tx);
      await expectError(
        tx,
        /immutable/,
        (x) =>
          x`update contract_versions set contract = '{}'::jsonb where id = ${versionId!.approve_candidate}`,
      );
      // …but tenant offboarding (privileged cascade) can remove it.
      await tx`update tool_contracts set latest_version_id = null where latest_version_id = ${versionId!.approve_candidate}`;
      const deleted =
        await tx`delete from contract_versions where id = ${versionId!.approve_candidate} returning id`;
      expect(deleted).toHaveLength(1);
    });
  });

  it("blocks members from approving candidates", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      const candidateId = await seedCandidate(tx, t);
      await actAs(tx, t.carol);
      await expectError(
        tx,
        /owner or admin/,
        (x) =>
          x`select public.approve_candidate(${candidateId}, ${t.acmeSite})`,
      );
    });
  });

  it("blocks cross-tenant approval even for owners", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      const candidateId = await seedCandidate(tx, t);
      await actAs(tx, t.bob);
      await expectError(
        tx,
        /not found|owner or admin/,
        (x) =>
          x`select public.approve_candidate(${candidateId}, ${t.acmeSite})`,
      );
    });
  });

  it("atomically disables and re-enables an approved tool without rejecting it", async () => {
    await withRollback(async (tx) => {
      await ensureAtomicAvailabilityFunction(tx);
      const t = await seedTenants(tx);
      const candidateId = await seedCandidate(tx, t);
      await actAs(tx, t.alice);

      await tx`select public.set_candidates_enabled(
        array[${candidateId}]::uuid[], ${t.acmeSite}, true
      )`;
      await tx`select public.set_candidates_enabled(
        array[${candidateId}]::uuid[], ${t.acmeSite}, false
      )`;
      const [disabled] = await tx<
        { candidate_status: string; contract_status: string }[]
      >`
        select candidate.status::text as candidate_status,
               contract.status::text as contract_status
        from action_candidates candidate
        join tool_contracts contract on contract.action_id = candidate.action_id
        where candidate.id = ${candidateId} and contract.site_id = ${t.acmeSite}
      `;
      expect(disabled).toEqual({
        candidate_status: "approved",
        contract_status: "retired",
      });

      await tx`select public.set_candidates_enabled(
        array[${candidateId}]::uuid[], ${t.acmeSite}, true
      )`;
      const [enabled] = await tx<{ status: string }[]>`
        select status::text as status from tool_contracts
        where site_id = ${t.acmeSite}
      `;
      expect(enabled?.status).toBe("active");
    });
  });

  it("denies webhook ledger and privileged RPCs to authenticated users", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      await actAs(tx, t.alice);
      expect(await tx`select delivery_id from webhook_deliveries`).toHaveLength(
        0,
      );
      await expectError(
        tx,
        /row-level security|permission denied/,
        (x) =>
          x`insert into webhook_deliveries (delivery_id, event) values ('d1', 'push')`,
      );
      await expectError(
        tx,
        /permission denied/,
        (x) =>
          x`select public.publish_manifest(${t.acmeSite}, '{}'::jsonb, '{}'::jsonb, ${t.alice})`,
      );
      await expectError(
        tx,
        /permission denied/,
        (x) => x`select public.enqueue_job('{}'::jsonb)`,
      );
      await expectError(
        tx,
        /permission denied/,
        (x) =>
          x`select public.request_push_analysis('delivery-auth', ${t.githubRepoId}, ${t.installationId}, ${"a".repeat(40)}, 'refs/heads/main')`,
      );
    });
  });

  it("atomically deduplicates main pushes and enqueues full analysis", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      const sha = "e".repeat(40);

      const [first] = await tx<
        { request_push_analysis: Record<string, unknown> }[]
      >`
        select public.request_push_analysis(
          'delivery-main-1', ${t.githubRepoId}, ${t.installationId}, ${sha}, 'refs/heads/main'
        )
      `;
      const firstResult = first!.request_push_analysis;
      expect(firstResult.ok).toBe(true);
      expect(firstResult.runId).toBeTruthy();
      expect(firstResult.enqueued).toEqual(["analysis.stage", "sync.compare"]);

      const [duplicateDelivery] = await tx<
        { request_push_analysis: Record<string, unknown> }[]
      >`
        select public.request_push_analysis(
          'delivery-main-1', ${t.githubRepoId}, ${t.installationId}, ${sha}, 'refs/heads/main'
        )
      `;
      expect(duplicateDelivery!.request_push_analysis.duplicate).toBe(true);

      const [sameCommit] = await tx<
        { request_push_analysis: Record<string, unknown> }[]
      >`
        select public.request_push_analysis(
          'delivery-main-2', ${t.githubRepoId}, ${t.installationId}, ${sha}, 'refs/heads/main'
        )
      `;
      expect(sameCommit!.request_push_analysis.existing).toBe(true);
      expect(sameCommit!.request_push_analysis.runId).toBe(firstResult.runId);

      const runs = await tx<
        { id: string; stage_statuses: Record<string, unknown> }[]
      >`
        select r.id, r.stage_statuses
        from analysis_runs r
        join repository_commits c on c.id = r.commit_id
        where r.repository_id = ${t.acmeRepo} and c.sha = ${sha}
      `;
      expect(runs).toHaveLength(1);
      expect(runs[0]!.stage_statuses).toMatchObject({
        clone: { status: "queued" },
      });

      const messages = await tx<{ message: { type: string } }[]>`
        select message
        from pgmq.q_sodium_jobs
        where message ->> 'runId' = ${firstResult.runId as string}
           or message ->> 'commitSha' = ${sha}
      `;
      expect(messages.map((row) => row.message.type).sort()).toEqual([
        "analysis.stage",
        "sync.compare",
      ]);
      expect(
        await tx`select delivery_id from webhook_deliveries where delivery_id like 'delivery-main-%'`,
      ).toHaveLength(2);
    });
  });

  it("ignores non-main, deleted, unknown, and suspended pushes", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      const sha = "f".repeat(40);

      const cases = [
        ["delivery-feature", t.installationId, sha, "refs/heads/feature"],
        [
          "delivery-deleted",
          t.installationId,
          "0".repeat(40),
          "refs/heads/main",
        ],
        ["delivery-unknown", t.installationId + 1, sha, "refs/heads/main"],
      ] as const;
      for (const [delivery, installation, commit, ref] of cases) {
        const [row] = await tx<
          { request_push_analysis: { ignored?: string } }[]
        >`
          select public.request_push_analysis(
            ${delivery}, ${t.githubRepoId}, ${installation}, ${commit}, ${ref}
          )
        `;
        expect(row!.request_push_analysis.ignored).toBeTruthy();
      }

      await tx`
        update github_installations
        set suspended_at = now()
        where installation_id = ${t.installationId}
      `;
      const [suspended] = await tx<
        { request_push_analysis: { ignored?: string } }[]
      >`
        select public.request_push_analysis(
          'delivery-suspended', ${t.githubRepoId}, ${t.installationId}, ${sha}, 'refs/heads/main'
        )
      `;
      expect(suspended!.request_push_analysis.ignored).toBeTruthy();
      expect(
        await tx`select id from analysis_runs where repository_id = ${t.acmeRepo}`,
      ).toHaveLength(0);
    });
  });

  it("request_analysis enforces membership and enqueues one stage job", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      await actAs(tx, t.bob);
      await expectError(
        tx,
        /repository not found/,
        (x) =>
          x`select public.request_analysis(${t.acmeRepo}, ${"d".repeat(40)})`,
      );

      await actAs(tx, t.carol); // any member may request analysis
      const [row] = await tx<{ request_analysis: string }[]>`
        select public.request_analysis(${t.acmeRepo}, ${"d".repeat(40)})
      `;
      const runId = row!.request_analysis;
      expect(runId).toBeTruthy();

      await actAsService(tx);
      const messages = await tx<
        { message: { runId: string; stage: string } }[]
      >`
        select message from pgmq.q_sodium_jobs where message ->> 'runId' = ${runId}
      `;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.message.stage).toBe("clone");
    });
  });

  it("publish_manifest (service path) flips the site atomically and keeps history", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      const manifest = {
        manifestVersion: 1,
        siteId: t.publicSiteId,
        tools: [],
      };
      const [first] = await tx<{ publish_manifest: string }[]>`
        select public.publish_manifest(${t.acmeSite}, ${tx.json(manifest as never)}, '{"sig":"a"}'::jsonb, ${t.alice})
      `;
      const [second] = await tx<{ publish_manifest: string }[]>`
        select public.publish_manifest(${t.acmeSite}, ${tx.json(manifest as never)}, '{"sig":"b"}'::jsonb, ${t.alice}, 'rollback', ${first!.publish_manifest})
      `;
      const [site] = await tx<{ current_manifest_id: string }[]>`
        select current_manifest_id from sites where id = ${t.acmeSite}
      `;
      expect(site!.current_manifest_id).toBe(second!.publish_manifest);
      const statuses = await tx<{ id: string; status: string }[]>`
        select id, status from manifests
        where id in (${first!.publish_manifest}, ${second!.publish_manifest})
        order by version
      `;
      expect(statuses.map((row) => row.status)).toEqual([
        "superseded",
        "published",
      ]);
      const deployments = await tx<{ action: string }[]>`
        select action from manifest_deployments
        where manifest_id in (${first!.publish_manifest}, ${second!.publish_manifest})
        order by created_at
      `;
      expect(deployments.map((row) => row.action)).toEqual([
        "publish",
        "rollback",
      ]);

      // Signed content is immutable even for the service role.
      await expectError(
        tx,
        /immutable/,
        (x) =>
          x`update manifests set manifest = '{}'::jsonb where id = ${first!.publish_manifest}`,
      );
    });
  });

  it("tenant offboarding: deleting an organization cascades cleanly", async () => {
    await withRollback(async (tx) => {
      const t = await seedTenants(tx);
      const candidateId = await seedCandidate(tx, t);
      await actAs(tx, t.alice);
      await tx`select public.approve_candidate(${candidateId}, ${t.acmeSite})`;

      await actAsService(tx);
      await tx`select public.publish_manifest(${t.acmeSite}, '{"manifestVersion":1}'::jsonb, '{"sig":"a"}'::jsonb, ${t.alice})`;
      await tx`update sites set current_manifest_id = null where org_id = ${t.acmeOrg}`;
      await tx`delete from organizations where id = ${t.acmeOrg}`;
      expect(
        await tx`select id from repositories where org_id = ${t.acmeOrg}`,
      ).toHaveLength(0);
      expect(
        await tx`select id from contract_versions where org_id = ${t.acmeOrg}`,
      ).toHaveLength(0);
      expect(
        await tx`select id from manifests where org_id = ${t.acmeOrg}`,
      ).toHaveLength(0);
    });
  });
});
