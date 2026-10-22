BEGIN;

DO $$
DECLARE
  branch_a UUID := '30000000-0000-0000-0000-000000000001';
  branch_b UUID := '30000000-0000-0000-0000-000000000002';
  doctor_id UUID := '30000000-0000-0000-0000-000000000003';
  patient_a UUID := '30000000-0000-0000-0000-000000000004';
  patient_b UUID := '30000000-0000-0000-0000-000000000005';
  patient_duplicate UUID := '30000000-0000-0000-0000-000000000006';
  patient_registered_at_a UUID := '30000000-0000-0000-0000-000000000007';
  rm_a TEXT;
  rm_b TEXT;
  rm_patient_a_at_b TEXT;
  rm_registered_patient_at_b TEXT;
BEGIN
  INSERT INTO public.dental_branches (id, name, address, phone, branch_code)
  VALUES
    (branch_a, 'Gebang RM Scope Test', 'Test', '080000000001', 'GBG'),
    (branch_b, 'Ambulu RM Scope Test', 'Test', '080000000002', 'AMB');

  INSERT INTO public.dental_doctors (id, doctor_code, name, specialization, phone)
  VALUES (doctor_id, 'RM-SCOPE-TEST', 'RM Scope Test', 'Umum', '080000000003');

  INSERT INTO public.patient_profiles (id, name, phone, address, date_of_birth, gender)
  VALUES
    (patient_a, 'Patient A', '080000000004', 'Test', NULL, NULL),
    (patient_b, 'Patient B', '080000000005', 'Test', NULL, NULL),
    (patient_duplicate, 'Patient Duplicate', '080000000006', 'Test', NULL, NULL);
  INSERT INTO public.patient_profiles (
    id, name, phone, address, date_of_birth, gender, registered_branch_id
  )
  VALUES (
    patient_registered_at_a, 'Patient Registered At A', '080000000007',
    'Test', NULL, NULL, branch_a
  );

  INSERT INTO public.patient_visits (
    id, patient_id, branch_id, visit_date_time, visit_type, visit_status, doctor_id
  )
  VALUES
    ('30000000-0000-0000-0000-000000000011', patient_a, branch_a, NOW(), 'WALK_IN', 'WAITING', doctor_id),
    ('30000000-0000-0000-0000-000000000012', patient_b, branch_b, NOW(), 'WALK_IN', 'WAITING', doctor_id);

  INSERT INTO public.queue_items (
    branch_id, doctor_id, visit_id, patient_id, queue_number, status, arrival_at
  )
  VALUES
    (branch_a, doctor_id, '30000000-0000-0000-0000-000000000011', patient_a, 'TEST-A-01', 'WAITING', NOW()),
    (branch_b, doctor_id, '30000000-0000-0000-0000-000000000012', patient_b, 'TEST-B-01', 'WAITING', NOW());

  SELECT medical_record_number INTO rm_a
  FROM public.patient_branch_medical_records
  WHERE patient_id = patient_a AND branch_id = branch_a;
  SELECT medical_record_number INTO rm_b
  FROM public.patient_branch_medical_records
  WHERE patient_id = patient_b AND branch_id = branch_b;

  ASSERT rm_a = '3000' AND rm_b = '3000',
    'Different branches must be able to issue the same local RM.';
  ASSERT (
    SELECT internal_patient_code = 'GBG-RM3000'
    FROM public.patient_profiles
    WHERE id = patient_a
  ), 'The first branch RM must create the immutable branch-prefixed internal code.';

  INSERT INTO public.patient_visits (
    id, patient_id, branch_id, visit_date_time, visit_type, visit_status, doctor_id
  )
  VALUES (
    '30000000-0000-0000-0000-000000000013',
    patient_a,
    branch_b,
    NOW(),
    'WALK_IN',
    'WAITING',
    doctor_id
  );

  INSERT INTO public.queue_items (
    branch_id, doctor_id, visit_id, patient_id, queue_number, status, arrival_at
  )
  VALUES (
    branch_b,
    doctor_id,
    '30000000-0000-0000-0000-000000000013',
    patient_a,
    'TEST-B-02',
    'WAITING',
    NOW()
  );

  SELECT medical_record_number INTO rm_patient_a_at_b
  FROM public.patient_branch_medical_records
  WHERE patient_id = patient_a AND branch_id = branch_b;

  ASSERT rm_patient_a_at_b = '3001',
    'A global patient visiting a second branch must receive that branch next local RM.';
  ASSERT (
    SELECT medical_record_number = '3000' AND internal_patient_code = 'GBG-RM3000'
    FROM public.patient_profiles
    WHERE id = patient_a
  ), 'Issuing a second branch RM must not rewrite the first RM or internal code.';

  INSERT INTO public.patient_visits (
    id, patient_id, branch_id, visit_date_time, visit_type, visit_status, doctor_id
  )
  VALUES (
    '30000000-0000-0000-0000-000000000014',
    patient_registered_at_a,
    branch_b,
    NOW(),
    'WALK_IN',
    'WAITING',
    doctor_id
  );

  INSERT INTO public.queue_items (
    branch_id, doctor_id, visit_id, patient_id, queue_number, status, arrival_at
  )
  VALUES (
    branch_b,
    doctor_id,
    '30000000-0000-0000-0000-000000000014',
    patient_registered_at_a,
    'TEST-B-03',
    'WAITING',
    NOW()
  );

  SELECT medical_record_number INTO rm_registered_patient_at_b
  FROM public.patient_branch_medical_records
  WHERE patient_id = patient_registered_at_a AND branch_id = branch_b;

  ASSERT rm_registered_patient_at_b = '3002',
    'The first check-in branch must receive the RM even when registration happened at another branch.';
  ASSERT (
    SELECT COUNT(*) = 1
    FROM public.patient_branch_medical_records
    WHERE patient_id = patient_registered_at_a
  ), 'The first RM must not be incorrectly copied to the registered branch.';
  ASSERT (
    SELECT internal_patient_code = 'AMB-RM3002'
    FROM public.patient_profiles
    WHERE id = patient_registered_at_a
  ), 'The internal code must identify the branch that issued the first RM.';

  BEGIN
    INSERT INTO public.patient_branch_medical_records (patient_id, branch_id, medical_record_number)
    VALUES (patient_duplicate, branch_a, '3000');
    RAISE EXCEPTION 'Expected duplicate branch RM to be rejected.';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END;
$$;

ROLLBACK;
