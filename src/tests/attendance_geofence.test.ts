import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_BRANCHES } from "../data/mockData";
import {
  getCurrentAttendanceLocation,
  getGeofenceDistanceMeters,
  isWithinAttendanceGeofence
} from "../utils/attendanceGeofence";

const gebang = {
  latitude: -8.165344263852493,
  longitude: 113.68344824639699,
  radiusMeters: 100
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Attendance geofence validation", () => {
  it("uses the first GPS fix that meets the branch accuracy threshold", async () => {
    let onSuccess: PositionCallback | undefined;
    const clearWatch = vi.fn();
    const watchPosition = vi.fn((
      success: PositionCallback,
      _error: PositionErrorCallback | null | undefined,
      _options?: PositionOptions
    ) => {
      onSuccess = success;
      return 7;
    });
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { watchPosition, getCurrentPosition, clearWatch } });

    const locationPromise = getCurrentAttendanceLocation(100);
    onSuccess?.({
      coords: { latitude: gebang.latitude, longitude: gebang.longitude, accuracy: 12 }
    } as GeolocationPosition);

    await expect(locationPromise).resolves.toEqual({
      latitude: gebang.latitude,
      longitude: gebang.longitude,
      accuracyMeters: 12
    });
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(watchPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 35_000
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: false,
      maximumAge: 30_000,
      timeout: 15_000
    });
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it("accepts a precise location from the standard-accuracy provider", async () => {
    const clearWatch = vi.fn();
    const watchPosition = vi.fn(() => 11);
    const getCurrentPosition = vi.fn((
      success: PositionCallback,
      _error: PositionErrorCallback | null | undefined,
      _options?: PositionOptions
    ) => success({
      coords: { latitude: gebang.latitude, longitude: gebang.longitude, accuracy: 25 }
    } as GeolocationPosition));
    vi.stubGlobal("navigator", { geolocation: { watchPosition, getCurrentPosition, clearWatch } });

    await expect(getCurrentAttendanceLocation()).resolves.toMatchObject({
      latitude: gebang.latitude,
      longitude: gebang.longitude,
      accuracyMeters: 25
    });
    expect(clearWatch).toHaveBeenCalledWith(11);
  });

  it("returns the best available fix after waiting for improved accuracy", async () => {
    vi.useFakeTimers();
    let onSuccess: PositionCallback | undefined;
    const watchPosition = vi.fn((success: PositionCallback) => {
      onSuccess = success;
      return 8;
    });
    vi.stubGlobal("navigator", { geolocation: { watchPosition, clearWatch: vi.fn() } });

    const locationPromise = getCurrentAttendanceLocation(100);
    onSuccess?.({
      coords: { latitude: gebang.latitude, longitude: gebang.longitude, accuracy: 250 }
    } as GeolocationPosition);
    onSuccess?.({
      coords: { latitude: gebang.latitude, longitude: gebang.longitude, accuracy: 140 }
    } as GeolocationPosition);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(locationPromise).resolves.toMatchObject({ accuracyMeters: 140 });
    vi.useRealTimers();
  });

  it("reports when the device never provides a GPS fix", async () => {
    vi.useFakeTimers();
    const watchPosition = vi.fn((
      _success: PositionCallback,
      error: PositionErrorCallback | null | undefined
    ) => {
      error?.({
        code: 2,
        message: "Position unavailable",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      } as GeolocationPositionError);
      return 9;
    });
    const getCurrentPosition = vi.fn((
      _success: PositionCallback,
      error: PositionErrorCallback | null | undefined
    ) => error?.({
      code: 2,
      message: "Position unavailable",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3
    } as GeolocationPositionError));
    vi.stubGlobal("navigator", { geolocation: { watchPosition, getCurrentPosition, clearWatch: vi.fn() } });

    const locationPromise = getCurrentAttendanceLocation();
    const rejection = expect(locationPromise).rejects.toThrow("Android belum memberikan lokasi ke Chrome");
    await vi.advanceTimersByTimeAsync(35_000);
    await rejection;
    vi.useRealTimers();
  });

  it("stops watching when location permission is denied", async () => {
    const clearWatch = vi.fn();
    const watchPosition = vi.fn((
      _success: PositionCallback,
      error: PositionErrorCallback | null | undefined
    ) => {
      error?.({
        code: 1,
        message: "Permission denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      } as GeolocationPositionError);
      return 10;
    });
    vi.stubGlobal("navigator", { geolocation: { watchPosition, clearWatch } });

    await expect(getCurrentAttendanceLocation()).rejects.toThrow("Izin lokasi ditolak");
    expect(clearWatch).toHaveBeenCalledWith(10);
  });

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
