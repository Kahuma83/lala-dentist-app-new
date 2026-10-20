import { describe, expect, it } from "vitest";
import { MOCK_BRANCHES } from "../data/mockData";
import {
  getGeofenceDistanceMeters,
  isWithinAttendanceGeofence
} from "../utils/attendanceGeofence";

const gebang = {
  latitude: -8.165344263852493,
  longitude: 113.68344824639699,
  radiusMeters: 100
};

describe("Attendance geofence validation", () => {
  it("uses the provided coordinates for each clinic branch", () => {
    const expectedCoordinates = {
      "Cabang Gebang": [-8.165344263852493, 113.68344824639699],
      "Cabang Ambulu": [-8.341838671620868, 113.60715332633036],
      "Cabang Lengkong Mumbul": [-8.234393255102521, 113.70794484805077],
      "Cabang Kencong": [-8.284968412220492, 113.38248204927665]
    } as const;

    for (const [name, [latitude, longitude]] of Object.entries(expectedCoordinates)) {
      expect(MOCK_BRANCHES.find(branch => branch.name === name)).toMatchObject({
        geofenceLatitude: latitude,
        geofenceLongitude: longitude,
        geofenceRadiusMeters: 100
      });
    }
  });

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
