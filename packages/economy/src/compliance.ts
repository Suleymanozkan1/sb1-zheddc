// Compliance hooks: region restrictions, age/KYC requirements and global kill switches.
// Features are evaluated server-side for every sensitive action; nothing is hidden or bypassed.

import type { AppConfig } from "@cryptoarena/config";
import type { ComplianceFeature, Tx } from "@cryptoarena/database";
import { AppError } from "./errors";

const FEATURE_FLAGS: Record<ComplianceFeature, string> = {
  DEPOSIT: "deposits_enabled",
  WITHDRAWAL: "withdrawals_enabled",
  CRYPTO_REWARDS: "crypto_rewards_enabled",
  PURCHASE: "purchases_enabled",
  PLAY: "play_enabled",
};

export interface ComplianceSubject {
  id: string;
  status: "ACTIVE" | "SUSPENDED" | "BANNED";
  countryCode: string | null;
  ageVerified: boolean;
  kycStatus: "NONE" | "PENDING" | "VERIFIED" | "REJECTED";
}

export async function evaluateFeature(
  tx: Tx,
  config: AppConfig,
  user: ComplianceSubject,
  feature: ComplianceFeature,
): Promise<{ allowed: true } | { allowed: false; code: "REGION_RESTRICTED" | "ACCOUNT_RESTRICTED" | "FORBIDDEN"; reason: string }> {
  if (user.status !== "ACTIVE") return { allowed: false, code: "ACCOUNT_RESTRICTED", reason: `Account is ${user.status.toLowerCase()}` };

  const flag = await tx.featureFlag.findUnique({ where: { key: FEATURE_FLAGS[feature] } });
  if (flag && !flag.enabled) return { allowed: false, code: "FORBIDDEN", reason: `${feature.toLowerCase()} is temporarily disabled` };

  if (feature === "PLAY") return { allowed: true };

  const country = user.countryCode?.toUpperCase() ?? null;
  if (country && config.blockedCountries.has(country)) {
    return { allowed: false, code: "REGION_RESTRICTED", reason: "This feature is not available in your region" };
  }
  if (country) {
    const rule = await tx.complianceRule.findUnique({ where: { countryCode_feature: { countryCode: country, feature } } });
    if (rule) {
      if (!rule.allowed) return { allowed: false, code: "REGION_RESTRICTED", reason: rule.note ?? "Not available in your region" };
      if (rule.requiresKyc && user.kycStatus !== "VERIFIED") return { allowed: false, code: "ACCOUNT_RESTRICTED", reason: "Identity verification required" };
      if (rule.minAge && !user.ageVerified) return { allowed: false, code: "ACCOUNT_RESTRICTED", reason: "Age verification required" };
    }
  }
  if (feature === "WITHDRAWAL" && config.REQUIRE_KYC_FOR_WITHDRAWAL && user.kycStatus !== "VERIFIED") {
    return { allowed: false, code: "ACCOUNT_RESTRICTED", reason: "Identity verification required before withdrawing" };
  }
  return { allowed: true };
}

export async function requireFeature(tx: Tx, config: AppConfig, user: ComplianceSubject, feature: ComplianceFeature): Promise<void> {
  const res = await evaluateFeature(tx, config, user, feature);
  if (!res.allowed) throw new AppError(res.code, res.reason);
}
