export const getBookingPlannedDurationMinutes = (plannedTreatments) => {
  const total = (Array.isArray(plannedTreatments) ? plannedTreatments : []).reduce((sum, treatment) => {
    const value = treatment?.estimatedDurationMinutes;
    const text = typeof value === "number" && Number.isInteger(value) ? String(value) : value;
    return typeof text === "string" && /^[0-9]{1,6}$/.test(text)
      ? sum + Number(text)
      : sum;
  }, 0);

  return Math.min(total || 30, 1440);
};
