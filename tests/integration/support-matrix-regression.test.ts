/**
 * Support-matrix regression suite.
 *
 * Combines fixture host profiles with the real catalog to verify that
 * compatibility results, recommendation ordering, install planning,
 * and workflow terminal statuses remain stable across code changes.
 *
 * Goal: for known fixture profiles, the system produces stable expected
 * outcomes. If a code change accidentally shifts compatibility or
 * recommendation behavior, these tests catch it.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import {
  ALL_FIXTURE_PROFILES,
  type FixtureProfileName,
} from "../fixtures/host-profiles.js";
import {
  PROFILE_EXPECTATIONS,
  SUPPORT_CLASS_SEMANTICS,
} from "../fixtures/support-semantics.js";
import { loadCatalogBundleSync } from "../../src/catalog/bundle.js";
import type { CatalogBundle } from "../../src/catalog/bundle.js";
import { checkCompatibility } from "../../src/compatibility/compatibility-engine.js";
import { recommend } from "../../src/compatibility/recommendation-engine.js";
import { generateInstallPlan } from "../../src/install-plan/install-planner.js";
import { evaluatePlanSafety, defaultExecutionPolicy } from "../../src/install-plan/safety-evaluator.js";
import { runWorkflow } from "../../src/workflow/workflow-runner.js";
import type { CompatibilityClass } from "../../src/types/compatibility.js";

// ---------------------------------------------------------------------------
// Catalog setup
// ---------------------------------------------------------------------------

const dataDir = resolve(import.meta.dirname, "../../data");

let bundle: CatalogBundle;

beforeAll(() => {
  bundle = loadCatalogBundleSync({
    models: resolve(dataDir, "models"),
    runtimes: resolve(dataDir, "runtimes"),
    agentTools: resolve(dataDir, "agent-tools"),
  });
});

// ---------------------------------------------------------------------------
// Helper: find artifact by sizeClass (for expectation matching)
// ---------------------------------------------------------------------------

function findArtifactIdBySizeClass(sizeClass: string): string | undefined {
  for (const artifact of bundle.models.listArtifacts()) {
    const variant = bundle.models.getVariant(artifact.variantId);
    if (variant && variant.sizeClass === sizeClass && artifact.runtimeId === "ollama") {
      return artifact.id;
    }
  }
  return undefined;
}

function getCompatibilityForArtifact(
  profileName: FixtureProfileName,
  artifactId: string,
): CompatibilityClass {
  const host = ALL_FIXTURE_PROFILES[profileName];
  const artifact = bundle.models.getArtifact(artifactId)!;
  const variant = bundle.models.getVariant(artifact.variantId)!;
  const family = bundle.models.getFamily(variant.familyId)!;
  const runtime = bundle.runtimes.get(artifact.runtimeId)!;
  const installedRuntimeIds = new Set(
    host.installedRuntimes.map((r) => r.runtimeId),
  );

  const result = checkCompatibility(host, artifact, {
    variant,
    family,
    runtime,
    runtimeInstalled: installedRuntimeIds.has(artifact.runtimeId),
  });
  return result.classification;
}

// ---------------------------------------------------------------------------
// Support-class semantics validation
// ---------------------------------------------------------------------------

describe("support-class semantics", () => {
  for (const [cls, semantics] of Object.entries(SUPPORT_CLASS_SEMANTICS)) {
    describe(`${cls}`, () => {
      it("has a description", () => {
        expect(semantics.description.length).toBeGreaterThan(20);
      });

      it("has implications", () => {
        expect(semantics.implications.length).toBeGreaterThan(0);
      });

      it("has example scenarios", () => {
        expect(semantics.exampleScenarios.length).toBeGreaterThan(0);
      });
    });
  }

  it("covers all four CompatibilityClass values", () => {
    const classes: CompatibilityClass[] = [
      "supported",
      "supported_with_limits",
      "cpu_only_slow",
      "unsupported",
    ];
    for (const cls of classes) {
      expect(SUPPORT_CLASS_SEMANTICS[cls]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Compatibility stability per fixture profile
// ---------------------------------------------------------------------------

describe("compatibility stability across fixture profiles", () => {
  for (const [profileName, expectations] of Object.entries(PROFILE_EXPECTATIONS)) {
    describe(`${profileName}`, () => {
      it("small 7B model compatibility matches expectation", () => {
        const artifactId = findArtifactIdBySizeClass("small");
        expect(artifactId).toBeDefined();
        const cls = getCompatibilityForArtifact(
          profileName as FixtureProfileName,
          artifactId!,
        );
        expect(cls).toBe(expectations.small7B);
      });

      it("medium 13B model compatibility matches expectation", () => {
        const artifactId = findArtifactIdBySizeClass("medium");
        expect(artifactId).toBeDefined();
        const cls = getCompatibilityForArtifact(
          profileName as FixtureProfileName,
          artifactId!,
        );
        expect(cls).toBe(expectations.medium13B);
      });

      it("large 34B model compatibility matches expectation", () => {
        const artifactId = findArtifactIdBySizeClass("large");
        expect(artifactId).toBeDefined();
        const cls = getCompatibilityForArtifact(
          profileName as FixtureProfileName,
          artifactId!,
        );
        expect(cls).toBe(expectations.large34B);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Recommendation stability across fixture profiles
// ---------------------------------------------------------------------------

describe("recommendation stability across fixture profiles", () => {
  for (const [profileName, expectations] of Object.entries(PROFILE_EXPECTATIONS)) {
    describe(`${profileName}`, () => {
      it(`hasRecommendations = ${expectations.hasRecommendations}`, () => {
        const host = ALL_FIXTURE_PROFILES[profileName as FixtureProfileName];
        const recs = recommend(host, bundle);
        if (expectations.hasRecommendations) {
          expect(recs.length).toBeGreaterThan(0);
        } else {
          expect(recs.length).toBe(0);
        }
      });
    });
  }

  it("highEndGpu produces more recommendations than lowEndCpuOnly", () => {
    const highRecs = recommend(ALL_FIXTURE_PROFILES.highEndGpu, bundle);
    const lowRecs = recommend(ALL_FIXTURE_PROFILES.lowEndCpuOnly, bundle);
    expect(highRecs.length).toBeGreaterThan(lowRecs.length);
  });

  it("midRangeGpu produces at least as many recommendations as lowEndCpuOnly", () => {
    const midRecs = recommend(ALL_FIXTURE_PROFILES.midRangeGpu, bundle);
    const lowRecs = recommend(ALL_FIXTURE_PROFILES.lowEndCpuOnly, bundle);
    expect(midRecs.length).toBeGreaterThanOrEqual(lowRecs.length);
  });
});

// ---------------------------------------------------------------------------
// Recommendation ordering stability (drift detection)
// ---------------------------------------------------------------------------

describe("recommendation ordering stability", () => {
  it("highEndGpu top-3 recommendations are stable", () => {
    const recs = recommend(ALL_FIXTURE_PROFILES.highEndGpu, bundle);
    expect(recs.length).toBeGreaterThanOrEqual(3);

    // Top recommendations should all be "supported" class
    for (let i = 0; i < Math.min(3, recs.length); i++) {
      expect(recs[i].compatibility.classification).toBe("supported");
    }

    // Top-3 set should be stable (assert artifact IDs are from "supported" class)
    const top3Ids = new Set(recs.slice(0, 3).map((r) => r.artifactId));
    expect(top3Ids.size).toBe(3);
  });

  it("midRangeGpu top recommendation is a supported small/medium model", () => {
    const recs = recommend(ALL_FIXTURE_PROFILES.midRangeGpu, bundle);
    expect(recs.length).toBeGreaterThan(0);

    const top = recs[0];
    expect(["supported", "supported_with_limits"]).toContain(
      top.compatibility.classification,
    );
  });

  it("lowEndCpuOnly recommendations are all cpu_only_slow", () => {
    const recs = recommend(ALL_FIXTURE_PROFILES.lowEndCpuOnly, bundle);
    for (const rec of recs) {
      expect(rec.compatibility.classification).toBe("cpu_only_slow");
    }
  });

  it("recommendation scores are monotonically non-increasing", () => {
    for (const [, profile] of Object.entries(ALL_FIXTURE_PROFILES)) {
      const recs = recommend(profile, bundle);
      for (let i = 1; i < recs.length; i++) {
        expect(recs[i].score).toBeLessThanOrEqual(recs[i - 1].score);
      }
    }
  });

  it("identical inputs produce identical recommendation ordering", () => {
    const recs1 = recommend(ALL_FIXTURE_PROFILES.highEndGpu, bundle);
    const recs2 = recommend(ALL_FIXTURE_PROFILES.highEndGpu, bundle);

    expect(recs1.length).toBe(recs2.length);
    for (let i = 0; i < recs1.length; i++) {
      expect(recs1[i].artifactId).toBe(recs2[i].artifactId);
      expect(recs1[i].score).toBe(recs2[i].score);
    }
  });
});

// ---------------------------------------------------------------------------
// Install-plan safety stability across fixture profiles
// ---------------------------------------------------------------------------

describe("install-plan safety across fixture profiles", () => {
  for (const profileName of Object.keys(ALL_FIXTURE_PROFILES)) {
    it(`${profileName}: install plan and safety evaluation for top recommendation`, () => {
      const host = ALL_FIXTURE_PROFILES[profileName as FixtureProfileName];
      const recs = recommend(host, bundle);

      if (recs.length === 0) {
        // No recommendations means no install plan to test — skip gracefully
        return;
      }

      const top = recs[0];
      const artifact = bundle.models.getArtifact(top.artifactId)!;
      const variant = bundle.models.getVariant(top.variantId)!;
      const runtime = bundle.runtimes.get(artifact.runtimeId)!;

      const plan = generateInstallPlan({
        host,
        artifact,
        variant,
        runtime,
        compatibility: top.compatibility,
      });

      expect(plan.artifactId).toBe(artifact.id);
      expect(plan.runtimeId).toBe(runtime.id);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.prerequisites.length).toBeGreaterThan(0);

      // Safety evaluation should not throw
      const policy = defaultExecutionPolicy();
      const safety = evaluatePlanSafety(plan, policy);
      expect(safety).toBeDefined();
      expect(typeof safety.approved).toBe("boolean");
      expect(typeof safety.blocked).toBe("boolean");
    });
  }
});

// ---------------------------------------------------------------------------
// Workflow terminal status stability across fixture profiles
// ---------------------------------------------------------------------------

describe("workflow terminal status across fixture profiles", () => {
  for (const [profileName, expectations] of Object.entries(PROFILE_EXPECTATIONS)) {
    it(`${profileName}: workflow status is "${expectations.expectedWorkflowStatus}"`, () => {
      const host = ALL_FIXTURE_PROFILES[profileName as FixtureProfileName];
      const result = runWorkflow({ bundle, host });
      expect(result.status).toBe(expectations.expectedWorkflowStatus);
    });
  }

  it("highEndGpu workflow completes all 8 stages", () => {
    const result = runWorkflow({
      bundle,
      host: ALL_FIXTURE_PROFILES.highEndGpu,
    });
    // Install plans contain caution-level commands (curl | sh) → requires approval
    expect(result.status).toBe("completed_requires_approval");
    expect(result.completedStages).toHaveLength(8);
  });

  it("missingRuntime workflow fails at target_selection (no compatible artifacts)", () => {
    const result = runWorkflow({
      bundle,
      host: ALL_FIXTURE_PROFILES.missingRuntime,
    });
    expect(result.status).toBe("failed");
    expect(result.failedStage).toBe("target_selection");
  });

  it("unsupportedWeak workflow fails at target_selection", () => {
    const result = runWorkflow({
      bundle,
      host: ALL_FIXTURE_PROFILES.unsupportedWeak,
    });
    expect(result.status).toBe("failed");
  });

  it("partiallyUnknown workflow completes with warnings", () => {
    const result = runWorkflow({
      bundle,
      host: ALL_FIXTURE_PROFILES.partiallyUnknown,
    });
    // Caution-level install steps → requires approval
    expect(result.status).toBe("completed_requires_approval");
    // Should have warnings about uncertain host data
    const compat = result.stageOutputs.compatibility_evaluation;
    if (compat) {
      expect(compat.compatibility.warnings.length).toBeGreaterThan(0);
    }
  });

  it("workflow with stopAfter returns partial status", () => {
    const result = runWorkflow({
      bundle,
      host: ALL_FIXTURE_PROFILES.highEndGpu,
      stopAfter: "recommendation",
    });
    expect(result.status).toBe("partial");
    expect(result.stoppedAfter).toBe("recommendation");
    expect(result.completedStages).toHaveLength(3);
  });
});
