import {
  Booking,
  PatientVisit,
  QueueItem,
  QueueStatus,
  TreatmentJob,
  TreatmentJobStatus
} from "../types/domain";
import { getOperationalDateString } from "./dateUtils";

interface DashboardTodayRecordsInput {
  visits: PatientVisit[];
  bookings: Booking[];
  queueItems: QueueItem[];
  treatmentJobs: TreatmentJob[];
  today: string;
  branchId: string | null;
}

export function getDashboardTodayRecords({
  visits,
  bookings,
  queueItems,
  treatmentJobs,
  today,
  branchId
}: DashboardTodayRecordsInput) {
  const isTodayInBranch = (dateTime: string | undefined, recordBranchId: string) =>
    getOperationalDateString(dateTime) === today &&
    (!branchId || recordBranchId === branchId);

  const todayVisits = visits.filter((visit) =>
    isTodayInBranch(visit.visitDateTime, visit.branchId)
  );
  const todayBookings = bookings.filter((booking) =>
    isTodayInBranch(booking.bookingDateTime, booking.branchId)
  );
  const activeQueues = queueItems.filter((queueItem) =>
    isTodayInBranch(queueItem.arrivalAt, queueItem.branchId) &&
    (queueItem.status === QueueStatus.WAITING ||
      queueItem.status === QueueStatus.IN_PREPARATION ||
      queueItem.status === QueueStatus.IN_CONSULTATION)
  );
  const visitDateById = new Map(visits.map((visit) => [visit.id, visit.visitDateTime]));
  const ongoingTreatments = treatmentJobs.filter((treatment) =>
    treatment.status === TreatmentJobStatus.DALAM_PROSES &&
    isTodayInBranch(
      treatment.startedAt || visitDateById.get(treatment.visitId),
      treatment.branchId
    )
  );

  return { todayVisits, todayBookings, activeQueues, ongoingTreatments };
}
