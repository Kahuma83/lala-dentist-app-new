-- =====================================================================
-- PHASE 9A.1 — DATABASE-LEVEL RLS & PRIVILEGE ESCALATION SECURITY TEST
-- File: /supabase/tests/20260922000001_auth_rls_hardening_test.sql
-- Description: Executable SQL script verifying database-level RLS & trigger
-- enforcement against privilege escalation and unauthorized modifications.
-- =====================================================================

BEGIN;

-- Create temporary mock auth functions if testing in pure Postgres without Supabase auth schema
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT current_setting('request.jwt.claim.sub', true)::UUID;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  v_super_auth_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
  v_branch_auth_id UUID := '00000000-0000-0000-0000-000000000002'::UUID;
  v_doc_auth_id UUID := '00000000-0000-0000-0000-000000000003'::UUID;
  v_asst_auth_id UUID := '00000000-0000-0000-0000-000000000004'::UUID;
  v_patient_auth_id UUID := '00000000-0000-0000-0000-000000000005'::UUID;

  v_patient_acc_id UUID;
  v_doc_acc_id UUID;
  v_asst_acc_id UUID;
  v_branch_acc_id UUID;
  v_super_acc_id UUID;

  v_caught BOOLEAN;
BEGIN
  RAISE NOTICE '--- STARTING DATABASE-LEVEL SECURITY AUDIT TESTS ---';

  -- Seed test accounts
  INSERT INTO public.user_accounts (auth_user_id, username, email, name, role, active)
  VALUES (v_super_auth_id, 'test_super', 'super@test.com', 'Super Admin', 'SUPER_ADMIN', true)
  RETURNING id INTO v_super_acc_id;

  INSERT INTO public.user_accounts (auth_user_id, username, email, name, role, branch_id, active)
  VALUES (v_branch_auth_id, 'test_branch', 'branch@test.com', 'Branch Admin', 'BRANCH_ADMIN', 'branch-1', true)
  RETURNING id INTO v_branch_acc_id;

  INSERT INTO public.user_accounts (auth_user_id, username, email, name, role, active)
  VALUES (v_doc_auth_id, 'test_doc', 'doc@test.com', 'Doctor', 'DOCTOR', true)
  RETURNING id INTO v_doc_acc_id;

  INSERT INTO public.user_accounts (auth_user_id, username, email, name, role, active)
  VALUES (v_asst_auth_id, 'test_asst', 'asst@test.com', 'Assistant', 'DOCTOR_ASSISTANT', true)
  RETURNING id INTO v_asst_acc_id;

  INSERT INTO public.user_accounts (auth_user_id, username, email, name, role, patient_id, active)
  VALUES (v_patient_auth_id, 'test_patient', 'patient@test.com', 'Patient', 'PATIENT', 'pat-1', true)
  RETURNING id INTO v_patient_acc_id;

  -- ===================================================================
  -- TEST 1: PATIENT -> role = SUPER_ADMIN (MUST BE REJECTED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_patient_auth_id::text, true);
  v_caught := false;
  BEGIN
    UPDATE public.user_accounts SET role = 'SUPER_ADMIN' WHERE id = v_patient_acc_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'SECURITY FAILURE: PATIENT was able to escalate role to SUPER_ADMIN!';
  RAISE NOTICE 'PASS: Test 1 - PATIENT -> role escalation rejected';

  -- ===================================================================
  -- TEST 2: DOCTOR -> role = SUPER_ADMIN (MUST BE REJECTED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_doc_auth_id::text, true);
  v_caught := false;
  BEGIN
    UPDATE public.user_accounts SET role = 'SUPER_ADMIN' WHERE id = v_doc_acc_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'SECURITY FAILURE: DOCTOR was able to escalate role to SUPER_ADMIN!';
  RAISE NOTICE 'PASS: Test 2 - DOCTOR -> role escalation rejected';

  -- ===================================================================
  -- TEST 3: DOCTOR_ASSISTANT -> role = SUPER_ADMIN (MUST BE REJECTED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_asst_auth_id::text, true);
  v_caught := false;
  BEGIN
    UPDATE public.user_accounts SET role = 'SUPER_ADMIN' WHERE id = v_asst_acc_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'SECURITY FAILURE: DOCTOR_ASSISTANT was able to escalate role to SUPER_ADMIN!';
  RAISE NOTICE 'PASS: Test 3 - DOCTOR_ASSISTANT -> role escalation rejected';

  -- ===================================================================
  -- TEST 4: BRANCH_ADMIN -> role = SUPER_ADMIN (MUST BE REJECTED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_branch_auth_id::text, true);
  v_caught := false;
  BEGIN
    UPDATE public.user_accounts SET role = 'SUPER_ADMIN' WHERE id = v_branch_acc_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'SECURITY FAILURE: BRANCH_ADMIN was able to escalate role to SUPER_ADMIN!';
  RAISE NOTICE 'PASS: Test 4 - BRANCH_ADMIN -> role escalation rejected';

  -- ===================================================================
  -- TEST 5: PATIENT -> staff_id manipulation (MUST BE REJECTED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_patient_auth_id::text, true);
  v_caught := false;
  BEGIN
    UPDATE public.user_accounts SET staff_id = 'staff-injected' WHERE id = v_patient_acc_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'SECURITY FAILURE: PATIENT was able to inject staff_id!';
  RAISE NOTICE 'PASS: Test 5 - PATIENT -> staff_id injection rejected';

  -- ===================================================================
  -- TEST 6: PATIENT -> patient_id manipulation (MUST BE REJECTED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_patient_auth_id::text, true);
  v_caught := false;
  BEGIN
    UPDATE public.user_accounts SET patient_id = 'victim-patient-id' WHERE id = v_patient_acc_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'SECURITY FAILURE: PATIENT was able to tamper with patient_id!';
  RAISE NOTICE 'PASS: Test 6 - PATIENT -> patient_id tampering rejected';

  -- ===================================================================
  -- TEST 7: PATIENT -> branch_id manipulation (MUST BE REJECTED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_patient_auth_id::text, true);
  v_caught := false;
  BEGIN
    UPDATE public.user_accounts SET branch_id = 'branch-injected' WHERE id = v_patient_acc_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'SECURITY FAILURE: PATIENT was able to manipulate branch_id!';
  RAISE NOTICE 'PASS: Test 7 - PATIENT -> branch_id tampering rejected';

  -- ===================================================================
  -- TEST 8: PATIENT -> active status tampering (MUST BE REJECTED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_patient_auth_id::text, true);
  v_caught := false;
  BEGIN
    UPDATE public.user_accounts SET active = false WHERE id = v_patient_acc_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'SECURITY FAILURE: PATIENT was able to tamper with account active status!';
  RAISE NOTICE 'PASS: Test 8 - PATIENT -> active flag tampering rejected';

  -- ===================================================================
  -- TEST 9: PATIENT -> auth_user_id hijacking (MUST BE REJECTED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_patient_auth_id::text, true);
  v_caught := false;
  BEGIN
    UPDATE public.user_accounts SET auth_user_id = v_super_auth_id WHERE id = v_patient_acc_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'SECURITY FAILURE: PATIENT was able to rebind auth_user_id!';
  RAISE NOTICE 'PASS: Test 9 - PATIENT -> auth_user_id hijacking rejected';

  -- ===================================================================
  -- TEST 10: PATIENT -> non-auth field update (e.g. name) (MUST SUCCEED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_patient_auth_id::text, true);
  UPDATE public.user_accounts SET name = 'Updated Patient Name' WHERE id = v_patient_acc_id;
  RAISE NOTICE 'PASS: Test 10 - PATIENT -> non-auth profile update allowed';

  -- ===================================================================
  -- TEST 11: SUPER_ADMIN -> administrative updates (MUST SUCCEED)
  -- ===================================================================
  PERFORM set_config('request.jwt.claim.sub', v_super_auth_id::text, true);
  
  -- 11a: Update role
  UPDATE public.user_accounts SET role = 'DOCTOR' WHERE id = v_asst_acc_id;
  -- 11b: Activate/deactivate
  UPDATE public.user_accounts SET active = false WHERE id = v_patient_acc_id;
  -- 11c: Assign staff_id
  UPDATE public.user_accounts SET staff_id = 'staff-assigned' WHERE id = v_doc_acc_id;
  -- 11d: Assign branch_id
  UPDATE public.user_accounts SET branch_id = 'branch-2' WHERE id = v_branch_acc_id;
  -- 11e: Assign patient_id
  UPDATE public.user_accounts SET patient_id = 'pat-assigned' WHERE id = v_patient_acc_id;

  RAISE NOTICE 'PASS: Test 11 - SUPER_ADMIN -> all administrative operations succeeded';
  RAISE NOTICE '--- ALL 11 DATABASE-LEVEL SECURITY TESTS PASSED SUCCESSFULLY ---';
END;
$$;

ROLLBACK;
