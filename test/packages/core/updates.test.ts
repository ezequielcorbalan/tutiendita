import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  type GithubConnection,
  isNewer,
  OFFICIAL_REPO,
  pendingReleases,
  updateKind,
} from "../../../src/packages/core/domain/update";
import type { GithubClient } from "../../../src/packages/core/ports/github";
import {
  applyUpdate,
  connectGithub,
  prepareUpdate,
  registerInstallation,
  type UpdatesDeps,
  updateStatus,
} from "../../../src/packages/core/use-cases/updates";

const CLOCK = { now: () => new Date("2026-10-15T12:00:00.000Z") };

function buildDeps(initial: GithubConnection | null = null, client: Partial<GithubClient> = {}) {
  let saved = initial;
  const calls: string[] = [];
  const deps: UpdatesDeps = {
    connection: {
      get: async () => saved,
      save: async (c) => {
        saved = c;
      },
    },
    github: {
      exchangeManifest: async () => ({ appId: 7, slug: "tiendita-ana", privateKeyPem: "PEM" }),
      installationRepositories: async () => ["ana/tiendita"],
      officialVersion: async () => ({
        version: "0.2.0",
        ref: "v0.2.0",
        releases: [{ version: "0.2.0", title: "v0.2.0", notes: "New: variants" }],
      }),
      prepareUpdate: async (_c, p) => {
        calls.push(`prepare ${p.officialRepo} ${p.ref} ${p.version} ${p.preserve.join(",")}`);
        return { number: 3, url: "https://github.com/ana/tiendita/pull/3", files: 4 };
      },
      applyUpdate: async (_c, n) => {
        calls.push(`apply ${n}`);
      },
      readFile: async () => null,
      writeFile: async () => {},
      ...client,
    },
    clock: CLOCK,
  };
  return { deps, calls, saved: () => saved };
}

const READY: GithubConnection = {
  appId: 7,
  slug: "tiendita-ana",
  privateKeyPem: "PEM",
  installationId: 99,
  repository: "ana/tiendita",
};

describe("isNewer", () => {
  it("compares major, minor and patch as numbers", () => {
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("v1.0.0", "0.99.0")).toBe(true);
    expect(isNewer("0.2.0", "0.2.0")).toBe(false);
    expect(isNewer("0.1.9", "0.2.0")).toBe(false);
  });
});

describe("updateKind and pendingReleases", () => {
  const r = (version: string, notes = "", title = `v${version}`) => ({ version, title, notes });
  const kind = (releases: ReturnType<typeof r>[], current: string, latest: string) =>
    updateKind(pendingReleases(releases, current, latest));

  it("security only when a pending release is marked [security], in its title or notes, any case", () => {
    expect(kind([r("0.4.0", "Fixes [SECURITY] session cookie")], "0.3.0", "0.4.0")).toBe("security");
    expect(kind([r("0.4.0", "", "v0.4.0 [security]")], "0.3.0", "0.4.0")).toBe("security");
    expect(kind([r("0.4.0", "Security improvements")], "0.3.0", "0.4.0")).toBe("feature");
  });

  it("bugfix when a pending release is marked [fix] or is a patch release", () => {
    expect(kind([r("0.4.0", "[fix] cart total")], "0.3.0", "0.4.0")).toBe("bugfix");
    expect(kind([r("0.3.1")], "0.3.0", "0.3.1")).toBe("bugfix");
  });

  it("the most urgent pending release wins, and releases already installed or beyond latest don't count", () => {
    const releases = [
      r("0.5.0", "[security]"),
      r("0.4.0", "new things"),
      r("0.3.1"),
      r("0.3.0", "[security]"),
    ];
    expect(kind(releases, "0.3.0", "0.4.0")).toBe("bugfix");
    expect(kind(releases, "0.3.1", "0.4.0")).toBe("feature");
    expect(kind(releases, "0.3.1", "0.5.0")).toBe("security");
    expect(pendingReleases(releases, "0.3.0", "0.4.0").map((x) => x.version)).toEqual(["0.4.0", "0.3.1"]);
  });

  it("feature without releases to read (version from main)", () => {
    expect(kind([], "0.3.0", "0.4.0")).toBe("feature");
  });
});

describe("cleanTitle", () => {
  it("drops the markers and the spaces they leave", () => {
    expect(cleanTitle("v0.4.1 [security]")).toBe("v0.4.1");
    expect(cleanTitle("[FIX]  Cart total")).toBe("Cart total");
    expect(cleanTitle("v0.4.0")).toBe("v0.4.0");
  });
});

describe("updateStatus", () => {
  it("no app created: not-connected", async () => {
    const { deps } = buildDeps();
    expect(await updateStatus(deps)("0.1.0")).toEqual({
      ok: true,
      value: { status: "not-connected" },
    });
  });

  it("with an app and not installed: not-installed with the slug for the install link", async () => {
    const { deps } = buildDeps({ ...READY, installationId: null, repository: null });
    expect(await updateStatus(deps)("0.1.0")).toEqual({
      ok: true,
      value: { status: "not-installed", slug: "tiendita-ana" },
    });
  });

  it("installed: update-available or up-to-date depending on the official version", async () => {
    const { deps } = buildDeps(READY);
    expect(await updateStatus(deps)("0.1.0")).toEqual({
      ok: true,
      value: {
        status: "update-available",
        current: "0.1.0",
        newVersion: "0.2.0",
        kind: "feature",
        releases: [{ version: "0.2.0", title: "v0.2.0", notes: "New: variants" }],
      },
    });
    expect(await updateStatus(deps)("0.2.0")).toEqual({
      ok: true,
      value: { status: "up-to-date", current: "0.2.0" },
    });
  });

  it("an update with a security release among the pending ones says so", async () => {
    const { deps } = buildDeps(READY, {
      officialVersion: async () => ({
        version: "0.2.0",
        ref: "v0.2.0",
        releases: [
          { version: "0.2.0", title: "v0.2.0", notes: "" },
          { version: "0.1.1", title: "v0.1.1 [security]", notes: "Session cookie" },
        ],
      }),
    });
    const r = await updateStatus(deps)("0.1.0");
    expect(r.ok && r.value.status === "update-available" && r.value.kind).toBe("security");
  });

  it("if GitHub does not respond, returns GITHUB_NOT_RESPONDING instead of breaking the panel", async () => {
    const { deps } = buildDeps(READY, {
      officialVersion: async () => {
        throw new Error("502");
      },
    });
    const r = await updateStatus(deps)("0.1.0");
    expect(r.ok ? null : r.error.code).toBe("GITHUB_NOT_RESPONDING");
  });
});

describe("connect and install", () => {
  it("exchanges the code and saves the app without an installation", async () => {
    const { deps, saved } = buildDeps();
    expect((await connectGithub(deps)("code")).ok).toBe(true);
    expect(saved()).toEqual({ ...READY, installationId: null, repository: null });
  });

  it("registers the installation with its single repo", async () => {
    const { deps, saved } = buildDeps({ ...READY, installationId: null, repository: null });
    expect((await registerInstallation(deps)(99)).ok).toBe(true);
    expect(saved()).toEqual(READY);
  });

  it("without a created app it cannot be installed", async () => {
    const { deps } = buildDeps();
    const r = await registerInstallation(deps)(99);
    expect(r.ok ? null : r.error.code).toBe("GITHUB_NOT_CONNECTED");
  });

  it("if the installation has more than one repo, asks to pick only the store's", async () => {
    const { deps, saved } = buildDeps(
      { ...READY, installationId: null, repository: null },
      { installationRepositories: async () => ["ana/tiendita", "ana/other"] },
    );
    const r = await registerInstallation(deps)(99);
    expect(r.ok ? null : r.error.code).toBe("GITHUB_MULTIPLE_REPOSITORIES");
    expect(saved()?.installationId).toBeNull();
  });
});

describe("prepare and apply", () => {
  it("prepares the PR with the official version, preserving wrangler.jsonc", async () => {
    const { deps, calls } = buildDeps(READY);
    const r = await prepareUpdate(deps)("0.1.0");
    expect(r).toEqual({
      ok: true,
      value: { number: 3, url: "https://github.com/ana/tiendita/pull/3", files: 4, version: "0.2.0" },
    });
    expect(calls).toEqual([`prepare ${OFFICIAL_REPO} v0.2.0 0.2.0 wrangler.jsonc`]);
  });

  it("up to date prepares nothing", async () => {
    const { deps, calls } = buildDeps(READY);
    const r = await prepareUpdate(deps)("0.2.0");
    expect(r.ok ? null : r.error.code).toBe("ALREADY_UP_TO_DATE");
    expect(calls).toEqual([]);
  });

  it("no file changes is also ALREADY_UP_TO_DATE", async () => {
    const { deps } = buildDeps(READY, { prepareUpdate: async () => null });
    const r = await prepareUpdate(deps)("0.1.0");
    expect(r.ok ? null : r.error.code).toBe("ALREADY_UP_TO_DATE");
  });

  it("apply merges the chosen PR; without an installation it does nothing", async () => {
    const { deps, calls } = buildDeps(READY);
    expect((await applyUpdate(deps)(3)).ok).toBe(true);
    expect(calls).toEqual(["apply 3"]);
    const notInstalled = buildDeps({ ...READY, installationId: null, repository: null });
    const r = await applyUpdate(notInstalled.deps)(3);
    expect(r.ok ? null : r.error.code).toBe("GITHUB_NOT_CONNECTED");
  });
});

describe("the store's repository, never the official one", () => {
  it("installing the app on the official repo is rejected", async () => {
    const { deps, saved } = buildDeps(
      { ...READY, installationId: null, repository: null },
      { installationRepositories: async () => [OFFICIAL_REPO] },
    );
    const r = await registerInstallation(deps)(99);
    expect(r.ok ? null : r.error.code).toBe("GITHUB_MULTIPLE_REPOSITORIES");
    expect(saved()?.repository).toBeNull();
  });

  it("the status reports a wrong repository and nothing can be prepared there", async () => {
    const { deps, calls } = buildDeps(
      { ...READY, repository: OFFICIAL_REPO },
      { installationRepositories: async () => [OFFICIAL_REPO] },
    );
    expect(await updateStatus(deps)("0.1.0")).toEqual({
      ok: true,
      value: { status: "wrong-repository", installationId: 99, repositories: [OFFICIAL_REPO] },
    });
    const r = await prepareUpdate(deps)("0.1.0");
    expect(r.ok ? null : r.error.code).toBe("GITHUB_NOT_CONNECTED");
    expect(calls).toEqual([]);
  });

  it("if the repo access changed on GitHub, the status picks up the new store repo", async () => {
    const { deps, saved } = buildDeps(READY, { installationRepositories: async () => ["ana/mi-tienda"] });
    const r = await updateStatus(deps)("0.1.0");
    expect(r.ok && r.value.status).toBe("update-available");
    expect(saved()?.repository).toBe("ana/mi-tienda");
  });
});
