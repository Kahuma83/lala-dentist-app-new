import { describe, expect, it } from "vitest";
import {
  getGeofenceDistanceMeters,
  isWithinAttendanceGeofence
} from "../utils/attendanceGeofence";

const gebang = {
  latitude: -8.1654362,
  longitude: 113.6833396,
  radiusMeters: 100
};

describe("Attendance geofence validation", () => {
  it("accepts a precise fix at the configured clinic coordinates", () => {
    const location = {
      latitude: gebang.latitude,
      longitude: gebang.longitude,
      accuracyMeters: 8
    };

    expect(getGeofenceDistanceMeters(location.latitude, location.longitude, gebang)).toBe(0);
    expect(isWithinAttendanceGeofence(location, gebang)).toBe(true);
  });

  it("rejects a fix beyond the configured radius", () => {
    const location = {
      latitude: gebang.latitude + 0.002,
      longitude: gebang.longitude,
      accuracyMeters: 10
    };

    expect(getGeofenceDistanceMeters(location.latitude, location.longitude, gebang)).toBeGreaterThan(100);
    expect(isWithinAttendanceGeofence(location, gebang)).toBe(false);
  });

  it("rejects a fix whose accuracy is worse than the configured radius", () => {
    expect(isWithinAttendanceGeofence({
      latitude: gebang.latitude,
      longitude: gebang.longitude,
      accuracyMeters: 101
    }, gebang)).toBe(false);
  });
});
