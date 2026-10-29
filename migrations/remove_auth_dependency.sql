-- Migration: Remove Supabase Auth dependency from staff_users
-- This adds a password column and removes the foreign key to auth.users

-- Step 1: Drop triggers that depend on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_login ON auth.users;

-- Step 2: Drop the foreign key constraint to auth.users
DO $$
BEGIN
  -- Find and drop the FK constraint
  DECLARE
    constraint_name TEXT;
  BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'staff_users'::regclass
      AND confrelid = 'auth.users'::regclass
      AND contype = 'f';

    IF constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE staff_users DROP CONSTRAINT %I', constraint_name);
      RAISE NOTICE 'Dropped constraint: %', constraint_name;
    END IF;
  END;
END $$;

-- Step 3: Add password column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_users' AND column_name = 'password'
  ) THEN
    ALTER TABLE staff_users ADD COLUMN password TEXT;
  END IF;
END $$;

-- Step 4: Set default password for existing users (if any)
UPDATE staff_users
SET password = 'operator123!'
WHERE password IS NULL;

-- Step 5: Make password NOT NULL
ALTER TABLE staff_users ALTER COLUMN password SET NOT NULL;

-- Step 6: Add default value for id column to auto-generate UUIDs
ALTER TABLE staff_users ALTER COLUMN id SET DEFAULT gen_random_uuid();
