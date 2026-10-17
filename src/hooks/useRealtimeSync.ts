/**
 * REALTIME SYNCHRONIZATION HOOK (SUPABASE POSTGRES CHANGES)
 * Subscribes to live operational tables: queue_items, bookings, treatment_jobs, clinical_medical_records, invoices, payments
 * Enforces duplicate protection, cleanup on unmount, and debounced state invalidation.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

export interface RealtimeSyncOptions {
  enabled?: boolean;
  branchId?: string | null;
  tables?: string[];
  onQueueChange?: (payload: any) => void;
  onBookingChange?: (payload: any) => void;
  onTreatmentChange?: (payload: any) => void;
  onMedicalRecordChange?: (payload: any) => void;
  onInvoiceChange?: (payload: any) => void;
  onPaymentChange?: (payload: any) => void;
  onAnyChange?: (table: string, eventType: string, payload: any) => void;
}

export interface RealtimeSyncStatus {
  isConnected: boolean;
  channelName: string | null;
  lastEventAt: string | null;
  lastEventTable: string | null;
  error: string | null;
}

export function useRealtimeSync(options: RealtimeSyncOptions = {}): RealtimeSyncStatus {
  const [status, setStatus] = useState<RealtimeSyncStatus>({
    isConnected: false,
    channelName: null,
    lastEventAt: null,
    lastEventTable: null,
    error: null
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChangesRef = useRef(new Map<string, { eventType: string; payload: any }>());
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Helper to deduplicate events and prevent rapid re-render bursts
  const handleEvent = useCallback(
    (table: string, eventType: string, payload: any) => {
      const recordId = payload?.new?.id || payload?.old?.id;
      const eventSignature = `${table}:${eventType}:${recordId}:${payload?.commit_timestamp || Date.now()}`;

      // Duplicate event protection: skip if exact event was recently processed
      if (recordId && processedEventIdsRef.current.has(eventSignature)) {
        return;
      }
      if (recordId) {
        processedEventIdsRef.current.add(eventSignature);
        // Retain max 500 signatures in memory
        if (processedEventIdsRef.current.size > 500) {
          const firstItem = processedEventIdsRef.current.values().next().value;
          if (firstItem) processedEventIdsRef.current.delete(firstItem);
        }
      }

      setStatus((prev) => ({
        ...prev,
        lastEventAt: new Date().toISOString(),
        lastEventTable: table
      }));

      // Trigger table-specific handlers
      const currentOptions = optionsRef.current;
      if (table === "queue_items" && currentOptions.onQueueChange) {
        currentOptions.onQueueChange(payload);
      } else if (table === "bookings" && currentOptions.onBookingChange) {
        currentOptions.onBookingChange(payload);
      } else if (table === "treatment_jobs" && currentOptions.onTreatmentChange) {
        currentOptions.onTreatmentChange(payload);
      } else if (table === "clinical_medical_records" && currentOptions.onMedicalRecordChange) {
        currentOptions.onMedicalRecordChange(payload);
      } else if (table === "invoices" && currentOptions.onInvoiceChange) {
        currentOptions.onInvoiceChange(payload);
      } else if (table === "payment_transactions" && currentOptions.onPaymentChange) {
        currentOptions.onPaymentChange(payload);
      }

      // Debounce generic change trigger
      if (currentOptions.onAnyChange) {
        pendingChangesRef.current.set(table, { eventType, payload });
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          const pendingChanges = Array.from(pendingChangesRef.current.entries());
          pendingChangesRef.current.clear();
          pendingChanges.forEach(([changedTable, change]) => {
            optionsRef.current.onAnyChange?.(changedTable, change.eventType, change.payload);
          });
        }, 500);
      }
    },
    []
  );

  useEffect(() => {
    if (options.enabled === false || !isSupabaseConfigured || !supabase) {
      setStatus({
        isConnected: false,
        channelName: null,
        lastEventAt: null,
        lastEventTable: null,
        error: null
      });
      return;
    }

    const channelName = options.branchId
      ? `clinic_live_${options.branchId}`
      : "clinic_live_global";

    try {
      const channel = supabase.channel(channelName);
      const tables = options.tables || [
        "attendance_records",
        "backup_jobs",
        "booking_confirmations_h1",
        "bookings",
        "branch_service_tariffs",
        "chart_of_accounts",
        "clinic_branding",
        "compensation_accruals",
        "compensation_rules",
        "dental_branches",
        "dental_doctors",
        "doctor_branch_assignments",
        "doctor_schedules",
        "invoices",
        "invoice_items",
        "journal_entries",
        "master_services",
        "medical_records",
        "monthly_payrolls",
        "overtime_records",
        "patient_profiles",
        "patient_visits",
        "patients",
        "payment_transactions",
        "payroll_items",
        "promotion_media",
        "queue_items",
        "staff",
        "staff_shift_assignments",
        "treatment_activities",
        "treatment_jobs",
        "work_shifts"
      ];

      tables.forEach((table) => {
        channel.on(
          "postgres_changes" as any,
          {
            event: "*",
            schema: "public",
            table
          },
          (payload: any) => handleEvent(table, payload.eventType, payload)
        );
      });

      // Subscribe and manage connection status
      channel.subscribe((statusResult: string) => {
        if (statusResult === "SUBSCRIBED") {
          setStatus({
            isConnected: true,
            channelName,
            lastEventAt: new Date().toISOString(),
            lastEventTable: null,
            error: null
          });
        } else if (statusResult === "CHANNEL_ERROR" || statusResult === "TIMED_OUT") {
          setStatus((prev) => ({
            ...prev,
            isConnected: false,
            error: "Koneksi realtime terputus. Sistem akan otomatis menyambungkan kembali."
          }));
        } else if (statusResult === "CLOSED") {
          setStatus((prev) => ({
            ...prev,
            isConnected: false
          }));
        }
      });

      channelRef.current = channel;
    } catch (err: any) {
      console.error("Realtime subscription init error:", err);
      setStatus({
        isConnected: false,
        channelName,
        lastEventAt: null,
        lastEventTable: null,
        error: err?.message || "Gagal menginisialisasi subscription realtime."
      });
    }

    // Cleanup subscription cleanly on unmount or branch change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        pendingChangesRef.current.clear();
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [options.enabled, options.branchId, options.tables, handleEvent]);

  return status;
}
