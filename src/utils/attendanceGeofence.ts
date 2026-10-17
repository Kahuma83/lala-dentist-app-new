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
