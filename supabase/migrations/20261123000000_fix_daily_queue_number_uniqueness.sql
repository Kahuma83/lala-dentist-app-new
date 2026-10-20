WITH ranked_queue AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY branch_id, doctor_id, (arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE
      ORDER BY arrival_at, created_at, id
    ) AS corrected_sequence
  FROM public.queue_items
)
UPDATE public.queue_items AS queue
SET
  sequence_order = ranked_queue.corrected_sequence,
  queue_number = COALESCE(NULLIF(SPLIT_PART(queue.queue_number, '-', 1), ''), 'A')
    || '-'
    || LPAD(ranked_queue.corrected_sequence::TEXT, 2, '0')
FROM ranked_queue
WHERE queue.id = ranked_queue.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_items_daily_sequence_unique
  ON public.queue_items (
    branch_id,
    doctor_id,
    ((arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE),
    sequence_order
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_items_daily_number_unique
  ON public.queue_items (
    branch_id,
    doctor_id,
    ((arrival_at AT TIME ZONE 'Asia/Jakarta')::DATE),
    queue_number
  );
