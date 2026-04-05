/**
 * CLI module barrel export.
 */

export { main } from "./main.js";
export { CliError, usageError, inputError, EXIT_OK, EXIT_USAGE, EXIT_INPUT, EXIT_RUNTIME } from "./errors.js";
export { printOutput, printError, formatKeyValue } from "./format.js";
export { loadHostProfile, validateHostProfile } from "./host-loader.js";

// Command runners
export { runDetectHost, type DetectHostArgs } from "./commands/detect-host.js";
export { runListModels, type ListModelsArgs } from "./commands/list-models.js";
export { runRecommendModels, type RecommendModelsArgs } from "./commands/recommend-models.js";
export { runCheckCompatibility, type CheckCompatibilityArgs } from "./commands/check-compatibility.js";
export { runPlanInstall, type PlanInstallArgs, type PlanInstallResult } from "./commands/plan-install.js";
export { runRenderPlan, type RenderPlanArgs, type RenderPlanResult } from "./commands/render-plan.js";
