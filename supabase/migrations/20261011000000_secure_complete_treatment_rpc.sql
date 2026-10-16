-- =====================================================================
-- MIGRATION: Secure Transactional RPC for Treatment Completion
-- File: /supabase/migrations/20261011000000_secure_complete_treatment_rpc.sql
-- 
-- DESCRIPTION:
-- Implements an atomic, secure PostgreSQL function `complete_treatment_job_secure`
-- that verifies authentication (auth.uid()), role authorization (blocking Branch Admin,
-- validating Doctor/Assistant branch/assignment), state transition (must be DALAM_PROSES,
-- rejects BELUM_DIMULAI and already completed jobs), updates treatment_jobs, and inserts
-- into treatment_activities in a single ACID transaction.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.complete_treatment_job_secure(
  p_treatment_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS SETOF public.treatment_jobs
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_uid UUID;
  v_user RECORD;
  v_treatment RECORD;
  v_now TIMESTAMPTZ;
BEGIN
  -- 1. Get auth.uid()
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user not authenticated';
  END IF;

  -- 2. Lookup user profile in public.user_accounts
  SELECT * INTO v_user
  FROM public.user_accounts
  WHERE auth_user_id = v_auth_uid AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: user account not found or inactive';
  END IF;

  -- 3. Branch Admin restriction per security plan: Branch Admin cannot complete clinical treatment
  IF v_user.role = 'BRANCH_ADMIN' THEN
    RAISE EXCEPTION 'Branch Admin tidak diizinkan menyelesaikan tindakan medis';
  END IF;

  -- 4. Lock and fetch treatment job
  SELECT * INTO v_treatment
  FROM public.treatment_jobs
  WHERE id = p_treatment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TreatmentJob tidak ditemukan';
  END IF;

  -- 5. State transition check: MUST be DALAM_PROSES
  IF v_treatment.status = 'SELESAI' OR v_treatment.status = 'DISERAHKAN' THEN
    RAISE EXCEPTION 'Treatment sudah selesai atau diserahkan';
  END IF;

  IF v_treatment.status <> 'DALAM_PROSES' THEN
    RAISE EXCEPTION 'Treatment belum dimulai atau status tidak valid untuk diselesaikan';
  END IF;

  -- 6. Role-based authorization & branch scoping
  IF v_user.role = 'SUPER_ADMIN' THEN
    -- Super Admin has global access across branches
    NULL;
  ELSIF v_user.role = 'DOCTOR' THEN
    -- Doctor branch & assignment check:
    -- If primary branch matches treatment branch, allow. Otherwise, verify valid active assignment via dental_doctors / doctor_branch_assignments.
    IF v_user.branch_id IS NOT NULL AND v_user.branch_id::text = v_treatment.branch_id::text THEN
      NULL;
    ELSE
      -- Check if doctor is assigned to target branch via dental_doctors or doctor_branch_assignments
      IF NOT EXISTS (
        SELECT 1 FROM public.dental_doctors d
        WHERE (d.id::text = v_user.id::text OR d.user_id = v_user.id)
          AND public.doctor_is_assigned_to_branch(d.id, d.assigned_branch_id, v_treatment.branch_id)
      ) THEN
        RAISE EXCEPTION 'Doctor tidak memiliki izin menyelesaikan treatment di cabang ini';
      END IF;
    END IF;
  ELSIF v_user.role = 'DOCTOR_ASSISTANT' THEN
    IF v_user.branch_id IS NULL OR v_user.branch_id::text <> v_treatment.branch_id::text THEN
      RAISE EXCEPTION 'Doctor Assistant tidak dapat mengelola treatment cabang lain';
    END IF;
  ELSE
    RAISE EXCEPTION 'Role tidak memiliki izin menyelesaikan treatment';
  END IF;

  v_now := timezone('utc'::text, now());

  -- 7. Update treatment job status atomically
  UPDATE public.treatment_jobs
  SET 
    status = 'SELESAI',
    completed_at = v_now,
    updated_at = v_now
  WHERE id = p_treatment_id;

  -- 8. Insert treatment activity log (COMPLETED) atomically in the same transaction
  INSERT INTO public.treatment_activities (
    treatment_id,
    actor_id,
    actor_role,
    actor_name_snapshot,
    activity_type,
    activity_at,
    branch_id,
    notes
  ) VALUES (
    p_treatment_id,
    v_user.id,
    v_user.role,
    v_user.name,
    'COMPLETED',
    v_now,
    v_treatment.branch_id,
    COALESCE(p_notes, 'Penyelesaian tindakan medis (Secure RPC)')
  );

  -- 9. Return updated record
  RETURN QUERY
  SELECT * FROM public.treatment_jobs WHERE id = p_treatment_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute privilege
GRANT EXECUTE ON FUNCTION public.complete_treatment_job_secure(UUID, TEXT) TO authenticated, service_role;
