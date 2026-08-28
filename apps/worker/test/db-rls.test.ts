import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

/**
 * Database security tests against the real (hosted) project:
 *  - cross-tenant isolation between two seeded organizations
 *  - permission differences between members and owners/admins
 *  - immutability triggers on candidates, contract versions and manifests
 *  - RPC authorization (definer functions re-check membership)
 * Every test runs inside a rolled-back transaction, so the database is left
 * untouched. Requires SUPABASE_DB_URL (skipped otherwise).
 */

const DB_URL = process.env.SUPABASE_DB_URL;

const ALICE = "11111111-1111-1111-1111-111111111111"; // acme owner
const CAROL = "22222222-2222-2222-2222-222222222222"; // acme member
const BOB = "33333333-3333-3333-3333-333333333333"; // globex owner
const ACME = "aaaaaaaa-0000-0000-0000-000000000001";
const GLOBEX = "bbbbbbbb-0000-0000-0000-000000000001";
const ACME_REPO = "dddddddd-0000-0000-0000-000000000001";
const ACME_SITE = "ffffffff-0000-0000-0000-000000000001";

type Tx = postgres.TransactionSql;

const sqlRef: { sql: postgres.Sql | null } = { sql: null };

class Rollback extends Error {}

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

async function seedCandidate(
  tx: Tx,
  orgId: string,
  repositoryId: string,
): Promise<string> {
  const [commit] = await tx<{ id: string }[]>`
    insert into repository_commits (repository_id, org_id, sha)
    values (${repositoryId}, ${orgId}, ${"c".repeat(40)})
    on conflict (repository_id, sha) do update set ref = repository_commits.ref
    returning id
  `;
  const [run] = await tx<{ id: string }[]>`
    insert into analysis_runs (repository_id, org_id, commit_id)
    values (${repositoryId}, ${orgId}, ${commit!.id})
    returning id
  `;
  const [candidate] = await tx<{ id: string }[]>`
    insert into action_candidates
      (run_id, org_id, action_id, name, title, description, contract, risk_level, confirmation, confidence)
    values
      (${run!.id}, ${orgId}, 'act_0123456789abcdef', 'list_products', 'List products',
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
      await actAs(tx, ALICE);
      const aliceOrgs = await tx<
        { id: string }[]
      >`select id from organizations order by id`;
      expect(aliceOrgs.map((row) => row.id)).toEqual([ACME]);

      await actAs(tx, BOB);
      const bobOrgs = await tx<
        { id: string }[]
      >`select id from organizations order by id`;
      expect(bobOrgs.map((row) => row.id)).toEqual([GLOBEX]);
    });
  });

  it("hides other tenants' repositories, runs and candidates", async () => {
    await withRollback(async (tx) => {
      const candidateId = await seedCandidate(tx, ACME, ACME_REPO);

      await actAs(tx, BOB);
      expect(
        await tx`select id from repositories where id = ${ACME_REPO}`,
      ).toHaveLength(0);
      expect(
        await tx`select id from action_candidates where id = ${candidateId}`,
      ).toHaveLength(0);
      expect(await tx`select id from analysis_runs`).toHaveLength(0);

      await actAs(tx, ALICE);
      expect(
        await tx`select id from action_candidates where id = ${candidateId}`,
      ).toHaveLength(1);
    });
  });

  it("lets members read but not administer", async () => {
    await withRollback(async (tx) => {
      await actAs(tx, CAROL);
      expect(
        await tx`select id from repositories where org_id = ${ACME}`,
      ).toHaveLength(1);
      await expectError(
        tx,
        /row-level security/,
        (t) =>
          t`insert into environments (repository_id, org_id, base_url) values (${ACME_REPO}, ${ACME}, 'https://x.test')`,
      );
    });
  });

  it("lets admins update review fields but never contract lineage", async () => {
    await withRollback(async (tx) => {
      const candidateId = await seedCandidate(tx, ACME, ACME_REPO);

      // Member cannot review.
      await actAs(tx, CAROL);
      await expect(
        tx`update action_candidates set status = 'rejected', review_note = 'nope' where id = ${candidateId}`,
      ).resolves.toHaveLength(0); // RLS: zero rows updated

      // Owner can review…
      await actAs(tx, ALICE);
      await tx`update action_candidates set status = 'rejected', review_note = 'not useful' where id = ${candidateId}`;
      const [after] = await tx<
        { status: string }[]
      >`select status from action_candidates where id = ${candidateId}`;
      expect(after!.status).toBe("rejected");

      // …but cannot rewrite the contract, its lineage, or publish directly.
      await expectError(
        tx,
        /immutable/,
        (t) =>
          t`update action_candidates set contract = '{"evil":true}'::jsonb where id = ${candidateId}`,
      );
      await expectError(
        tx,
        /manifest publication/,
        (t) =>
          t`update action_candidates set status = 'published' where id = ${candidateId}`,
      );
    });
  });

  it("keeps contract versions immutable for every role", async () => {
    await withRollback(async (tx) => {
      const candidateId = await seedCandidate(tx, ACME, ACME_REPO);
      await actAs(tx, ALICE);
      const [versionId] = await tx<{ approve_candidate: string }[]>`
        select public.approve_candidate(${candidateId}, ${ACME_SITE})
      `;
      expect(versionId!.approve_candidate).toBeTruthy();

      await actAsService(tx);
      await expectError(
        tx,
        /immutable/,
        (t) =>
          t`update contract_versions set contract = '{}'::jsonb where id = ${versionId!.approve_candidate}`,
      );
      await expectError(
        tx,
        /immutable/,
        (t) =>
          t`delete from contract_versions where id = ${versionId!.approve_candidate}`,
      );
    });
  });

  it("blocks members from approving candidates", async () => {
    await withRollback(async (tx) => {
      const candidateId = await seedCandidate(tx, ACME, ACME_REPO);
      await actAs(tx, CAROL);
      await expectError(
        tx,
        /owner or admin/,
        (t) => t`select public.approve_candidate(${candidateId}, ${ACME_SITE})`,
      );
    });
  });

  it("blocks cross-tenant approval even for owners", async () => {
    await withRollback(async (tx) => {
      const candidateId = await seedCandidate(tx, ACME, ACME_REPO);
      await actAs(tx, BOB);
      await expectError(
        tx,
        /not found|owner or admin/,
        (t) => t`select public.approve_candidate(${candidateId}, ${ACME_SITE})`,
      );
    });
  });

  it("denies webhook ledger and privileged RPCs to authenticated users", async () => {
    await withRollback(async (tx) => {
      await actAs(tx, ALICE);
      expect(await tx`select delivery_id from webhook_deliveries`).toHaveLength(
        0,
      );
      await expectError(
        tx,
        /row-level security|permission denied/,
        (t) =>
          t`insert into webhook_deliveries (delivery_id, event) values ('d1', 'push')`,
      );
      await expectError(
        tx,
        /permission denied/,
        (t) =>
          t`select public.publish_manifest(${ACME_SITE}, '{}'::jsonb, '{}'::jsonb, ${ALICE})`,
      );
      await expectError(
        tx,
        /permission denied/,
        (t) => t`select public.enqueue_job('{}'::jsonb)`,
      );
    });
  });

  it("request_analysis enforces membership and enqueues one stage job", async () => {
    await withRollback(async (tx) => {
      await actAs(tx, BOB);
      await expectError(
        tx,
        /repository not found/,
        (t) =>
          t`select public.request_analysis(${ACME_REPO}, ${"d".repeat(40)})`,
      );

      await actAs(tx, CAROL); // any member may request analysis
      const [row] = await tx<{ request_analysis: string }[]>`
        select public.request_analysis(${ACME_REPO}, ${"d".repeat(40)})
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
      const manifest = {
        manifestVersion: 1,
        siteId: "site_fixtureshop01",
        tools: [],
      };
      const [first] = await tx<{ publish_manifest: string }[]>`
        select public.publish_manifest(${ACME_SITE}, ${tx.json(manifest as never)}, '{"sig":"a"}'::jsonb, ${ALICE})
      `;
      const [second] = await tx<{ publish_manifest: string }[]>`
        select public.publish_manifest(${ACME_SITE}, ${tx.json(manifest as never)}, '{"sig":"b"}'::jsonb, ${ALICE}, 'rollback', ${first!.publish_manifest})
      `;
      const [site] = await tx<{ current_manifest_id: string }[]>`
        select current_manifest_id from sites where id = ${ACME_SITE}
      `;
      expect(site!.current_manifest_id).toBe(second!.publish_manifest);
      // Assert on the two versions this test created (the seeded site may
      // carry real manifests from browser-test runs).
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
      await expect(
        tx`update manifests set manifest = '{}'::jsonb where id = ${first!.publish_manifest}`,
      ).rejects.toThrow(/immutable/);
    });
  });
});
