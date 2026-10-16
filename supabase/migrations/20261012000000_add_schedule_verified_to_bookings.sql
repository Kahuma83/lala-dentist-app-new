-- Migration: 20261012000000_add_schedule_verified_to_bookings.sql
-- Adds schedule_verified column to bookings table to track unverified bookings when doctor schedules are not yet defined

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS schedule_verified BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_bookings_schedule_verified ON public.bookings(schedule_verified);
