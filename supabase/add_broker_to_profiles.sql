-- Add broker preference to user profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS broker text;
