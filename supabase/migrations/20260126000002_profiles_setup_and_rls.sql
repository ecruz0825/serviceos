BEGIN;

-- =============================================================================
-- Profiles Table Setup and RLS
-- - Ensure profiles.id = auth.uid() for all users
-- - Auto-create profiles on auth.users insert
-- - Add RLS policies for tenant-safe profile reads
-- =============================================================================

-- 1) Create current_company_id() helper function if it doesn't exist
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- 2) Ensure profiles table exists with required columns
-- (This is idempotent - won't fail if table/columns already exist)
DO $$
BEGIN
  -- Create table if it doesn't exist
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text,
      full_name text,
      role text,
      company_id uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  END IF;

  -- Add columns if they don't exist
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email') THEN
    ALTER TABLE public.profiles ADD COLUMN email text;
  END IF;
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name') THEN
    ALTER TABLE public.profiles ADD COLUMN full_name text;
  END IF;
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE public.profiles ADD COLUMN role text;
  END IF;
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'company_id') THEN
    ALTER TABLE public.profiles ADD COLUMN company_id uuid;
  END IF;
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'created_at') THEN
    ALTER TABLE public.profiles ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at') THEN
    ALTER TABLE public.profiles ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 3) Create trigger function to auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4) Create trigger on auth.users (if it doesn't exist)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5) Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 6) Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS profiles_select_same_company ON public.profiles;
DROP POLICY IF EXISTS profiles_select_admin_all_company ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

-- 7) RLS Policy: Users can SELECT profiles in their same company
CREATE POLICY profiles_select_same_company
ON public.profiles
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
);

-- 8) RLS Policy: Admins can SELECT all profiles in their company (more permissive)
CREATE POLICY profiles_select_admin_all_company
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.current_user_role() = 'admin'
  AND public.current_company_id() IS NOT NULL
  AND company_id = public.current_company_id()
);

-- 9) RLS Policy: Users can always SELECT their own profile
CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 10) Allow users to UPDATE their own profile (for accepting invites, etc.)
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 11) Add foreign key constraint from payments.received_by to profiles.id (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'payments_received_by_fkey' 
    AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_received_by_fkey
      FOREIGN KEY (received_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 12) Allow service role to INSERT/UPDATE profiles (for invite-user function)
-- Note: Service role bypasses RLS, so no policy needed

COMMIT;

