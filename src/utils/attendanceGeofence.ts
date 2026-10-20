export interface AttendanceLocationFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export interface Geofence {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export function getCurrentAttendanceLocation(targetAccuracyMeters = 100): Promise<AttendanceLocationFix> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Browser tidak mendukung GPS. Gunakan browser ponsel yang mendukung lokasi."));
  }

  return new Promise((resolve, reject) => {
    const geolocation = navigator.geolocation;
    let watchId: number | null = null;
    let firstFixTimer: ReturnType<typeof setTimeout> | null = null;
    let overallTimer: ReturnType<typeof setTimeout> | null = null;
    let bestFix: AttendanceLocationFix | null = null;
    let settled = false;

    const cleanup = () => {
      if (watchId !== null) geolocation.clearWatch(watchId);
      if (firstFixTimer !== null) clearTimeout(firstFixTimer);
      if (overallTimer !== null) clearTimeout(overallTimer);
    };

    const finish = (location: AttendanceLocationFix) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(location);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const onSuccess: PositionCallback = ({ coords }) => {
      const location = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters: coords.accuracy
      };

      if (!bestFix || location.accuracyMeters < bestFix.accuracyMeters) bestFix = location;
      if (location.accuracyMeters <= targetAccuracyMeters) {
        finish(location);
        return;
      }

      if (firstFixTimer === null) {
        firstFixTimer = setTimeout(() => {
          if (bestFix) finish(bestFix);
        }, 15_000);
      }
    };

    const onError: PositionErrorCallback = (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        fail("Izin lokasi ditolak. Izinkan akses lokasi untuk situs ini di pengaturan browser dan perangkat, lalu coba lagi.");
      }
    };

    try {
      watchId = geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 45_000
      });
      if (settled && watchId !== null) geolocation.clearWatch(watchId);
    } catch (error) {
      fail(`Browser gagal memulai GPS: ${error instanceof Error ? error.message : "kesalahan tidak diketahui"}.`);
      return;
    }

    overallTimer = setTimeout(() => {
      if (bestFix) {
        finish(bestFix);
      } else {
        fail("Perangkat belum mengirim posisi GPS. Aktifkan Lokasi pada perangkat, izinkan lokasi untuk situs ini, lalu coba dari ponsel di area terbuka. Komputer tanpa layanan lokasi/GPS biasanya tidak dapat menentukan posisi klinik dengan akurat.");
      }
    }, 45_000);
  });
}

export function getGeofenceDistanceMeters(
  latitude: number,
  longitude: number,
  geofence: Geofence
): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDifference = toRadians(geofence.latitude - latitude);
  const longitudeDifference = toRadians(geofence.longitude - longitude);
  const a = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(toRadians(latitude))
    * Math.cos(toRadians(geofence.latitude))
    * Math.sin(longitudeDifference / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function isWithinAttendanceGeofence(
  location: AttendanceLocationFix,
  geofence: Geofence
): boolean {
  return Number.isFinite(location.accuracyMeters)
    && location.accuracyMeters > 0
    && location.accuracyMeters <= geofence.radiusMeters
    && getGeofenceDistanceMeters(location.latitude, location.longitude, geofence) <= geofence.radiusMeters;
}
