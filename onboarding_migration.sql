-- Run this in Supabase SQL Editor

-- Add onboarding flag and feature preferences to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS enabled_features text[] DEFAULT ARRAY['investments','finance','news','community'];

-- Existing users are already onboarded — mark them complete
UPDATE profiles SET onboarding_complete = true WHERE onboarding_complete IS DISTINCT FROM true;
