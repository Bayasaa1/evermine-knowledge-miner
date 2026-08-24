/** Ownership, licensing and marketplace metadata for a mined Mind. Stored locally only. */

export type AccessLevel = "private" | "marketplace";
export type RateUnit = "hour" | "query";

export type Ownership = {
  mindId: string;
  creatorName: string;
  creatorEmail: string;
  accessLevel: AccessLevel;
  rateUnit: RateUnit;
  rate: number;
  currency: string;
  licenseTerms: string;
};

export const DEFAULT_LICENSE =
  "The Mind Creator retains full ownership of this mind and all source material. Licensees may query the mind through authorised Evermind agents only. No resale, redistribution, model training or voice/face cloning outside the agreed interaction scope.";

export function createOwnership(): Ownership {
  return {
    mindId: newMindId(),
    creatorName: "",
    creatorEmail: "",
    accessLevel: "private",
    rateUnit: "query",
    rate: 0,
    currency: "EVM",
    licenseTerms: DEFAULT_LICENSE,
  };
}

export function newMindId(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2) + Date.now().toString(16);
  return `mind_${uuid.replace(/-/g, "")}`;
}

export function normalizeOwnership(raw: unknown): Ownership {
  const base = createOwnership();
  if (typeof raw !== "object" || raw === null) return base;
  const v = raw as Record<string, unknown>;
  const str = (k: string, fallback: string) => (typeof v[k] === "string" && v[k] ? (v[k] as string) : fallback);
  const num = typeof v['rate'] === "number" && Number.isFinite(v['rate']) ? (v['rate'] as number) : base.rate;
  return {
    mindId: str("mindId", base.mindId),
    creatorName: str("creatorName", ""),
    creatorEmail: str("creatorEmail", ""),
    accessLevel: v['accessLevel'] === "marketplace" ? "marketplace" : "private",
    rateUnit: v['rateUnit'] === "hour" ? "hour" : "query",
    rate: Math.max(0, num),
    currency: str("currency", base.currency),
    licenseTerms: str("licenseTerms", DEFAULT_LICENSE),
  };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type DigitalSignature = {
  algorithm: "SHA-256";
  signedAt: string;
  mindId: string;
  creator: string;
  contentHash: string;
  signature: string;
};

/**
 * Deterministic creator signature: hashes the mind id, creator identity, licensing
 * terms and a digest of the exported brain content. Computed and kept on-device.
 */
export async function signMind(ownership: Ownership, content: unknown): Promise<DigitalSignature> {
  const signedAt = new Date().toISOString();
  const contentHash = await sha256Hex(JSON.stringify(content));
  const payload = [
    ownership.mindId,
    ownership.creatorName,
    ownership.creatorEmail,
    ownership.accessLevel,
    `${ownership.rate}${ownership.currency}/${ownership.rateUnit}`,
    ownership.licenseTerms,
    contentHash,
    signedAt,
  ].join("|");
  return {
    algorithm: "SHA-256",
    signedAt,
    mindId: ownership.mindId,
    creator: ownership.creatorName || "unnamed-creator",
    contentHash,
    signature: await sha256Hex(payload),
  };
}
