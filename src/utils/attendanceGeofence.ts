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

export function getCurrentAttendanceLocation(): Promise<AttendanceLocationFix> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Browser tidak mendukung GPS. Gunakan browser ponsel yang mendukung lokasi."));
  }

  return new Promise((resolve, reject) => {
    const onSuccess: PositionCallback = ({ coords }) => resolve({
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracyMeters: coords.accuracy
    });
    const onFallbackError: PositionErrorCallback = (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? "Izin lokasi ditolak. Aktifkan izin lokasi untuk browser lalu coba lagi."
        : error.code === error.POSITION_UNAVAILABLE
          ? "Lokasi belum tersedia. Aktifkan layanan lokasi dan coba di area terbuka."
          : "Lokasi GPS belum didapat setelah dua percobaan. Pastikan layanan lokasi dan izin lokasi akurat aktif, lalu coba lagi.";
      reject(new Error(message));
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          onFallbackError(error);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          onSuccess,
          onFallbackError,
          { enableHighAccuracy: false, maximumAge: 0, timeout: 20_000 }
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 }
    );
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
