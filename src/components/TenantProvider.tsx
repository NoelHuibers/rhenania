"use client";

import { createContext, useContext } from "react";
import type { FeatureFlags, FeatureKey } from "~/lib/features";

// Carries the resolved tenant's identity to client components — primarily used
// by upload helpers that need to prefix blob paths with `tenants/<slug>/` —
// plus the tenant's feature flags. Populated from a server component (see
// (protected)/layout.tsx).

type TenantClientContext = {
	slug: string;
	displayName: string;
	features: FeatureFlags;
};

const Ctx = createContext<TenantClientContext | null>(null);

export function TenantProvider({
	value,
	children,
}: {
	value: TenantClientContext;
	children: React.ReactNode;
}) {
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant(): TenantClientContext {
	const v = useContext(Ctx);
	if (!v) {
		throw new Error(
			"useTenant() called outside of <TenantProvider> — wrap the tree in TenantProvider in your server-rendered layout.",
		);
	}
	return v;
}

export function useTenantSlug(): string {
	return useTenant().slug;
}

/**
 * Whether a feature is switched on for this tenant. Presentation only — the
 * server action behind the UI must check `hasFeature()` itself.
 */
export function useFeature(key: FeatureKey): boolean {
	return useTenant().features[key];
}
