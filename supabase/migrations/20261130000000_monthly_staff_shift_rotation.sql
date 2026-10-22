CREATE TABLE IF NOT EXISTS public.staff_shift_rotation_templates (
  branch_id UUID NOT NULL REFERENCES public.dental_branches(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  initial_shift_id UUID NOT NULL REFERENCES public.work_shifts(id) ON DELETE RESTRICT,
  rotation_anchor_monday DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (branch_id, staff_id)
);

ALTER TABLE public.staff_shift_rotation_templates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staff_shift_rotation_templates FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_shift_rotation_templates TO authenticated, service_role;

DROP POLICY IF EXISTS "Staff shift rotation branch management" ON public.staff_shift_rotation_templates;
CREATE POLICY "Staff shift rotation branch management"
  ON public.staff_shift_rotation_templates
  FOR ALL
  TO authenticated
  USING (public.employee_portal_can_manage_branch(branch_id))
  WITH CHECK (public.employee_portal_can_manage_branch(branch_id));

CREATE OR REPLACE FUNCTION public.save_staff_shift_monthly_roster(
  p_branch_id UUID,
  p_rotation_anchor_monday DATE,
  p_templates JSONB,
  p_assignments JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template RECORD;
  v_assignment RECORD;
  v_existing_count INTEGER;
  v_saved_count INTEGER := 0;
BEGIN
  IF NOT public.employee_portal_can_manage_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Tidak memiliki akses untuk mengelola jadwal cabang ini.'
      USING ERRCODE = '42501';
  END IF;

  IF p_rotation_anchor_monday IS NULL
    OR EXTRACT(ISODOW FROM p_rotation_anchor_monday) <> 1
    OR p_templates IS NULL
    OR p_assignments IS NULL THEN
    RAISE EXCEPTION 'Data pola rotasi atau jadwal bulanan tidak valid.';
  END IF;

  IF jsonb_typeof(p_templates) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_assignments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Data pola rotasi atau jadwal bulanan tidak valid.';
  END IF;

  IF jsonb_array_length(p_templates) = 0 OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Data pola rotasi atau jadwal bulanan tidak valid.';
  END IF;

  FOR v_template IN
    SELECT *
    FROM jsonb_to_recordset(p_templates) AS item(staff_id UUID, initial_shift_id UUID)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = v_template.staff_id
        AND s.branch_id = p_branch_id
        AND s.active = true
        AND s.employment_status = 'ACTIVE'
        AND s.position IN ('BRANCH_ADMIN', 'ASSISTANT')
    ) THEN
      RAISE EXCEPTION 'Pola rotasi berisi pegawai tidak aktif atau di luar cabang.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.work_shifts ws
      WHERE ws.id = v_template.initial_shift_id
        AND ws.branch_id = p_branch_id
        AND ws.active = true
        AND (
          (ws.start_time = '08:00' AND ws.end_time = '14:00')
          OR (ws.start_time = '14:00' AND ws.end_time = '21:00')
        )
    ) THEN
      RAISE EXCEPTION 'Pola rotasi menggunakan shift standar yang tidak aktif atau milik cabang lain.';
    END IF;

    INSERT INTO public.staff_shift_rotation_templates (
      branch_id, staff_id, initial_shift_id, rotation_anchor_monday, updated_at
    )
    VALUES (
      p_branch_id, v_template.staff_id, v_template.initial_shift_id,
      p_rotation_anchor_monday, timezone('utc'::text, now())
    )
    ON CONFLICT (branch_id, staff_id) DO UPDATE
      SET initial_shift_id = EXCLUDED.initial_shift_id,
          rotation_anchor_monday = EXCLUDED.rotation_anchor_monday,
          updated_at = EXCLUDED.updated_at;
  END LOOP;

  FOR v_assignment IN
    SELECT *
    FROM jsonb_to_recordset(p_assignments)
      AS item(staff_id UUID, shift_id UUID, date DATE, active BOOLEAN, notes TEXT)
  LOOP
    IF v_assignment.date IS NULL
      OR EXTRACT(ISODOW FROM v_assignment.date) = 7
      OR NOT EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = v_assignment.staff_id
          AND s.branch_id = p_branch_id
          AND s.active = true
          AND s.employment_status = 'ACTIVE'
          AND s.position IN ('BRANCH_ADMIN', 'ASSISTANT')
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.work_shifts ws
        WHERE ws.id = v_assignment.shift_id
          AND ws.branch_id = p_branch_id
          AND ws.active = true
      ) THEN
      RAISE EXCEPTION 'Jadwal berisi tanggal, pegawai, atau shift yang tidak valid.';
    END IF;

    SELECT count(*) INTO v_existing_count
    FROM public.staff_shift_assignments ssa
    WHERE ssa.branch_id = p_branch_id
      AND ssa.staff_id = v_assignment.staff_id
      AND ssa.date = v_assignment.date;

    IF v_existing_count > 1 THEN
      RAISE EXCEPTION 'Ada jadwal duplikat untuk pegawai dan tanggal yang sama; periksa jadwal sebelum membuat roster.';
    ELSIF v_existing_count = 1 THEN
      UPDATE public.staff_shift_assignments AS existing
      SET shift_id = v_assignment.shift_id,
          active = COALESCE(v_assignment.active, true),
          notes = COALESCE(v_assignment.notes, existing.notes),
          updated_at = timezone('utc'::text, now())
      WHERE existing.branch_id = p_branch_id
        AND existing.staff_id = v_assignment.staff_id
        AND existing.date = v_assignment.date;
    ELSE
      INSERT INTO public.staff_shift_assignments (
        staff_id, branch_id, shift_id, date, active, notes
      )
      VALUES (
        v_assignment.staff_id, p_branch_id, v_assignment.shift_id,
        v_assignment.date, COALESCE(v_assignment.active, true), v_assignment.notes
      );
    END IF;
    v_saved_count := v_saved_count + 1;
  END LOOP;

  RETURN v_saved_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_staff_shift_monthly_roster(UUID, DATE, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_staff_shift_monthly_roster(UUID, DATE, JSONB, JSONB) TO authenticated;
