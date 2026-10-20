UPDATE public.dental_branches
SET geofence_latitude = -8.1654362,
    geofence_longitude = 113.6833396,
    geofence_radius_meters = 100
WHERE LOWER(TRIM(name)) = 'cabang gebang';
