/**
 * REALTIME SYNCHRONIZATION HOOK (SUPABASE POSTGRES CHANGES)
 * Subscribes to live operational tables: queue_items, bookings, treatment_jobs, clinical_medical_records, invoices, payments
 * Enforces duplicate protection, cleanup on unmount, and debounced state invalidation.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

export interface RealtimeSyncOptions {
  branchId?: string | null;
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
  error: string | null;
}

export function useRealtimeSync(options: RealtimeSyncOptions = {}): RealtimeSyncStatus {
  const [status, setStatus] = useState<RealtimeSyncStatus>({
    isConnected: false,
    channelName: null,
    lastEventAt: null,
    error: null
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedEventIdsRef = useRef<Set<string>>(new Set());

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
        lastEventAt: new Date().toISOString()
      }));

      // Trigger table-specific handlers
      if (table === "queue_items" && options.onQueueChange) {
        options.onQueueChange(payload);
      } else if (table === "bookings" && options.onBookingChange) {
        options.onBookingChange(payload);
      } else if (table === "treatment_jobs" && options.onTreatmentChange) {
        options.onTreatmentChange(payload);
      } else if (table === "clinical_medical_records" && options.onMedicalRecordChange) {
        options.onMedicalRecordChange(payload);
      } else if (table === "invoices" && options.onInvoiceChange) {
        options.onInvoiceChange(payload);
      } else if (table === "payment_transactions" && options.onPaymentChange) {
        options.onPaymentChange(payload);
      }

      // Debounce generic change trigger
      if (options.onAnyChange) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          options.onAnyChange?.(table, eventType, payload);
        }, 150);
      }
    },
    [options]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setStatus({
        isConnected: false,
        channelName: null,
        lastEventAt: null,
        error: null
      });
      return;
    }

    const channelName = options.branchId
      ? `clinic_live_${options.branchId}`
      : "clinic_live_global";

    try {
      const channel = supabase.channel(channelName);

      // 1. Queue Items Realtime
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "queue_items",
          ...(options.branchId ? { filter: `branch_id=eq.${options.branchId}` } : {})
        },
        (payload: any) => handleEvent("queue_items", payload.eventType, payload)
      );

      // 2. Bookings Realtime
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "bookings",
          ...(options.branchId ? { filter: `branch_id=eq.${options.branchId}` } : {})
        },
        (payload: any) => handleEvent("bookings", payload.eventType, payload)
      );

      // 3. Treatment Jobs Realtime
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "treatment_jobs",
          ...(options.branchId ? { filter: `branch_id=eq.${options.branchId}` } : {})
        },
        (payload: any) => handleEvent("treatment_jobs", payload.eventType, payload)
      );

      // 4. Clinical Medical Records Realtime
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "clinical_medical_records",
          ...(options.branchId ? { filter: `branch_id=eq.${options.branchId}` } : {})
        },
        (payload: any) => handleEvent("clinical_medical_records", payload.eventType, payload)
      );

      // 5. Invoices Realtime
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "invoices",
          ...(options.branchId ? { filter: `branch_id=eq.${options.branchId}` } : {})
        },
        (payload: any) => handleEvent("invoices", payload.eventType, payload)
      );

      // 6. Payment Transactions Realtime
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "payment_transactions"
        },
        (payload: any) => handleEvent("payment_transactions", payload.eventType, payload)
      );

      // Subscribe and manage connection status
      channel.subscribe((statusResult: string) => {
        if (statusResult === "SUBSCRIBED") {
          setStatus({
            isConnected: true,
            channelName,
            lastEventAt: new Date().toISOString(),
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
        error: err?.message || "Gagal menginisialisasi subscription realtime."
      });
    }

    // Cleanup subscription cleanly on unmount or branch change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [options.branchId, handleEvent]);

  return status;
}
