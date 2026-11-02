'use client'
import { useEffect, useState } from 'react'
import { api } from './api'

// What the signed-in account's plan includes, as set on the admin page.
// Mirrors planFor in backend/src/services/plans.ts. The backend enforces it;
// this is for showing or locking things in the app.

export type PlanFeature =
  | 'helper' | 'analyze' | 'summary' | 'news' | 'top10' | 'opportunities'
  | 'ipo' | 'deep_dive' | 'draft_post' | 'inbox' | 'business' | 'verified'
export type PlanLimit = 'daily_ai_calls' | 'holdings' | 'discover_results'

export interface Plan {
  tier: 'free' | 'premium'
  features: Record<PlanFeature, boolean>
  /** 0 means no limit */
  limits: Record<PlanLimit, number>
}

// One request per page load, shared by everything that asks.
let pending: Promise<Plan | null> | null = null

export function loadPlan(): Promise<Plan | null> {
  if (!pending) pending = api.getPlan().catch(() => { pending = null; return null })
  return pending
}

/** The plan, or null while loading. If it can't load, nothing is locked: the backend still checks. */
export function usePlan() {
  const [plan, setPlan] = useState<Plan | null>(null)
  useEffect(() => { loadPlan().then(setPlan) }, [])
  return {
    plan,
    can: (f: PlanFeature) => plan ? plan.features[f] !== false : true,
    limit: (l: PlanLimit) => plan?.limits[l] ?? 0,
  }
}
