BEGIN;

DO $$
DECLARE
  v_confirmed_auth_id UUID := '10000000-0000-0000-0000-000000000001';
  v_late_profile_auth_id UUID := '10000000-0000-0000-0000-000000000002';
  v_ambiguous_auth_id UUID := '10000000-0000-0000-0000-000000000003';
  v_new_patient_auth_id UUID := '10000000-0000-0000-0000-000000000004';
  v_branch_id UUID := '20000000-0000-0000-0000-000000000001';
  v_doctor_id UUID := '20000000-0000-0000-0000-000000000002';
  v_visit_id UUID := '20000000-0000-0000-0000-000000000003';
  v_patient_id UUID;
  v_account_patient_id TEXT;
  v_profile_count INTEGER;
  v_issued_rm TEXT;
BEGIN
  INSERT INTO public.patient_profiles (
    medical_record_number, name, phone, email, date_of_birth, gender, address
  )
  VALUES (
    'AUTO-LINK-ONE', 'Portal Link Test', '080000000001',
    'autolink-confirmed@example.test', '1990-01-01', 'P', 'Test'
  )
  RETURNING id INTO v_patient_id;

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_confirmed_auth_id, 'authenticated', 'authenticated',
    'autolink-confirmed@example.test', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"account_type":"patient_portal","name":"Portal Link Test"}'::jsonb
  );

  UPDATE auth.users
  SET email_confirmed_at = NOW()
  WHERE id = v_confirmed_auth_id;

  SELECT patient_id INTO v_account_patient_id
  FROM public.user_accounts
  WHERE auth_user_id = v_confirmed_auth_id;

  ASSERT v_account_patient_id = v_patient_id::TEXT,
    'A verified patient account must link to the unique matching profile.';

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_late_profile_auth_id, 'authenticated', 'authenticated',
    'autolink-late-profile@example.test', '', NULL,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"account_type":"patient_portal","name":"Late Profile Test"}'::jsonb
  );

  INSERT INTO public.patient_profiles (
    medical_record_number, name, phone, email, date_of_birth, gender, address
  )
  VALUES (
    'AUTO-LINK-TWO', 'Late Profile Test', '080000000002',
    'autolink-late-profile@example.test', '1990-01-01', 'L', 'Test'
  )
  RETURNING id INTO v_patient_id;

  UPDATE auth.users
  SET email_confirmed_at = NOW()
  WHERE id = v_late_profile_auth_id;

  SELECT patient_id INTO v_account_patient_id
  FROM public.user_accounts
  WHERE auth_user_id = v_late_profile_auth_id;

  ASSERT v_account_patient_id = v_patient_id::TEXT,
    'A verified account must link when the unique matching profile is added later.';

  INSERT INTO public.patient_profiles (
    medical_record_number, name, phone, email, date_of_birth, gender, address
  )
  VALUES
    ('AUTO-LINK-THREE-A', 'Ambiguous Profile A', '080000000003', 'autolink-ambiguous@example.test', '1990-01-01', 'P', 'Test'),
    ('AUTO-LINK-THREE-B', 'Ambiguous Profile B', '080000000004', 'autolink-ambiguous@example.test', '1990-01-01', 'L', 'Test');

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_ambiguous_auth_id, 'authenticated', 'authenticated',
    'autolink-ambiguous@example.test', '', NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"account_type":"patient_portal","name":"Ambiguous Profile Test"}'::jsonb
  );

  SELECT patient_id INTO v_account_patient_id
  FROM public.user_accounts
  WHERE auth_user_id = v_ambiguous_auth_id;

  ASSERT v_account_patient_id IS NULL,
    'An email matching multiple patient profiles must never be auto-linked.';

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_new_patient_auth_id, 'authenticated', 'authenticated',
    'autoprofile-new@example.test', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"account_type":"patient_portal","name":"New Patient Test","phone":"080000000005","date_of_birth":"1990-01-01","gender":"P","address":"Test address"}'::jsonb
  );

  UPDATE auth.users
  SET email_confirmed_at = NOW()
  WHERE id = v_new_patient_auth_id;

  SELECT patient_id INTO v_account_patient_id
  FROM public.user_accounts
  WHERE auth_user_id = v_new_patient_auth_id;

  ASSERT v_account_patient_id IS NOT NULL,
    'A verified signup without a matching profile must receive a new patient profile.';

  SELECT id, medical_record_number
  INTO v_patient_id, v_issued_rm
  FROM public.patient_profiles
  WHERE email = 'autoprofile-new@example.test';

  ASSERT v_patient_id::TEXT = v_account_patient_id,
    'A verified signup must link its account to the newly created profile.';
  ASSERT v_issued_rm IS NULL,
    'A new patient profile must not receive an RM before check-in.';
  ASSERT (
    SELECT registered_branch_id IS NULL
    FROM public.patient_profiles
    WHERE id = v_patient_id
  ),
    'Self-registration must not assign a home branch before booking or visit.';

  INSERT INTO public.dental_branches (id, name, address, phone)
  VALUES (v_branch_id, 'RM Check-in Test Branch', 'Test', '080000000006');

  INSERT INTO public.dental_doctors (id, doctor_code, name, specialization, phone)
  VALUES (v_doctor_id, 'RM-CHECKIN-TEST', 'RM Check-in Test Doctor', 'Umum', '080000000007');

  INSERT INTO public.patient_visits (
    id, patient_id, branch_id, visit_date_time, visit_type, visit_status, doctor_id
  )
  VALUES (
    v_visit_id, v_patient_id, v_branch_id, NOW(), 'WALK_IN', 'WAITING', v_doctor_id
  );

  INSERT INTO public.queue_items (
    branch_id, doctor_id, visit_id, patient_id, queue_number, status, arrival_at
  )
  VALUES (
    v_branch_id, v_doctor_id, v_visit_id, v_patient_id, 'TEST-01', 'WAITING', NOW()
  );

  SELECT medical_record_number
  INTO v_issued_rm
  FROM public.patient_profiles
  WHERE id = v_patient_id;

  ASSERT v_issued_rm IS NOT NULL AND BTRIM(v_issued_rm) <> '',
    'The first queue check-in must issue an RM.';

  UPDATE auth.users
  SET email_confirmed_at = NOW()
  WHERE id = v_new_patient_auth_id;

  SELECT COUNT(*)
  INTO v_profile_count
  FROM public.patient_profiles
  WHERE email = 'autoprofile-new@example.test';

  ASSERT v_profile_count = 1,
    'Repeated confirmation events must not create duplicate patient profiles.';

  ASSERT (
    SELECT medical_record_number = v_issued_rm
    FROM public.patient_profiles
    WHERE id = v_patient_id
  ),
    'Repeated confirmation events must preserve the RM already issued at check-in.';
END;
$$;

ROLLBACK;
