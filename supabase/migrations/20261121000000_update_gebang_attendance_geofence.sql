UPDATE public.dental_branches
SET geofence_latitude = -8.165344263852493,
    geofence_longitude = 113.68344824639699,
    geofence_radius_meters = 100
WHERE LOWER(TRIM(name)) = 'cabang gebang';
