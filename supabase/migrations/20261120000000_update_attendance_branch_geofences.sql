UPDATE public.dental_branches
SET geofence_latitude = -8.1654362,
    geofence_longitude = 113.6833396,
    geofence_radius_meters = 100
WHERE LOWER(TRIM(name)) = 'cabang gebang';

UPDATE public.dental_branches
SET geofence_latitude = -8.341838671620868,
    geofence_longitude = 113.60715332633036,
    geofence_radius_meters = 100
WHERE LOWER(TRIM(name)) = 'cabang ambulu';

UPDATE public.dental_branches
SET geofence_latitude = -8.234393255102521,
    geofence_longitude = 113.70794484805077,
    geofence_radius_meters = 100
WHERE LOWER(TRIM(name)) = 'cabang lengkong mumbul';

UPDATE public.dental_branches
SET geofence_latitude = -8.284968412220492,
    geofence_longitude = 113.38248204927665,
    geofence_radius_meters = 100
WHERE LOWER(TRIM(name)) = 'cabang kencong';
