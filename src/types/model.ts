/**
 * Model type contracts.
 *
 * Models are decomposed into a hierarchy:
 *   ModelFamily → ModelVariant → ModelArtifact
 *
 * A family (e.g. "DeepSeek Coder V2") has multiple variants
 * (e.g. "16B", "236B"), each of which has multiple artifacts
 * (a concrete distributable: a specific quantization packaged
 * for a specific runtime).
 */

// ---------------------------------------------------------------------------
// Enums / literals
// ---------------------------------------------------------------------------

/** Coarse parameter-count bucket. */
export type SizeClass =
  | "tiny"    // ≤ 3 B
  | "small"   // 3–7 B
  | "medium"  // 7–20 B
  | "large"   // 20–70 B
  | "xlarge"; // > 70 B

/** Quantization format. */
export type QuantizationType =
  | "f16"
  | "q8_0"
  | "q6_k"
  | "q5_k_m"
  | "q4_k_m"
  | "q4_0"
  | "q3_k_m"
  | "q2_k"
  | "gguf"
  | "gptq"
  | "awq"
  | "exl2"
  | "none"
  | string; // allow future formats

/** Lifecycle status of any catalog entry. */
export type CatalogStatus = "supported" | "experimental" | "deprecated";

/** Capability flags describing what a model can do. */
export interface ModelCapabilities {
  coding: boolean;
  agenticToolUse: boolean;
  autocomplete: boolean;
  longContext: boolean;
}

// ---------------------------------------------------------------------------
// Model family
// ---------------------------------------------------------------------------

/**
 * A model family groups all variants of a logical model line.
 * Example: "DeepSeek Coder V2", "Qwen 2.5 Coder", "CodeLlama".
 */
export interface ModelFamily {
  /** Unique slug, e.g. "deepseek-coder-v2". */
  id: string;
  displayName: string;
  /** Upstream provider / org, e.g. "deepseek-ai". */
  provider: string;
  /** URL for upstream docs or model card. */
  url?: string;
  description?: string;
  /** Default capabilities shared by variants unless overridden. */
  capabilities: ModelCapabilities;
  status: CatalogStatus;
}

// ---------------------------------------------------------------------------
// Model variant
// ---------------------------------------------------------------------------

/**
 * A variant is a specific parameter-count configuration within a family.
 * Example: "DeepSeek Coder V2 16B".
 */
export interface ModelVariant {
  /** Unique slug, e.g. "deepseek-coder-v2-16b". */
  id: string;
  /** Reference to parent family id. */
  familyId: string;
  displayName: string;
  /** Parameter count label, e.g. "16B", "7B-instruct". */
  parameterLabel: string;
  sizeClass: SizeClass;
  /** Context window in tokens. */
  contextWindow?: number;
  /** Variant-level capability overrides (merged with family). */
  capabilityOverrides?: Partial<ModelCapabilities>;
  status: CatalogStatus;
}

// ---------------------------------------------------------------------------
// Model artifact
// ---------------------------------------------------------------------------

/**
 * An artifact is a concrete, installable distribution of a variant:
 * a specific quantization packaged for a specific runtime.
 */
export interface ModelArtifact {
  /** Unique slug, e.g. "deepseek-coder-v2-16b-q4_k_m-ollama". */
  id: string;
  /** Reference to parent variant id. */
  variantId: string;
  /** Reference to target runtime id. */
  runtimeId: string;
  quantization: QuantizationType;
  /** File size on disk in GB (approximate). */
  fileSizeGb?: number;
  /** Minimum system RAM in GB to load this artifact. */
  minimumRamGb: number;
  /** Recommended system RAM in GB for usable performance. */
  recommendedRamGb: number;
  /** Minimum VRAM in GB (0 = can run CPU-only). */
  minimumVramGb: number;
  /** Recommended VRAM in GB for full-speed inference. */
  recommendedVramGb: number;
  /** Runtime-specific pull/download command or URL. */
  pullCommand?: string;
  downloadUrl?: string;
  /** OS-specific notes, e.g. "macOS Metal only". */
  osNotes?: string;
  warningNotes?: string;
  status: CatalogStatus;
}

// ---------------------------------------------------------------------------
// Manifest wrapper (versioned)
// ---------------------------------------------------------------------------

/**
 * A model manifest bundles a family, its variants, and their artifacts
 * into a single versioned document that ships in data/models/.
 */
export interface ModelManifest {
  /** Schema format version — breaking changes bump major. */
  schemaVersion: string;
  /** Content revision — tracks data edits. */
  manifestVersion: string;
  family: ModelFamily;
  variants: ModelVariant[];
  artifacts: ModelArtifact[];
}
