# Student submission CSV contract

Each row is one measured or simulated observation. UTF-8, comma delimiter, LF
or CRLF, a single header row, and decimal points are required. Unknown values
are empty; never encode missing data as zero.

Required columns:

| Column | Type | Unit / rule |
|---|---|---|
| `team_id` | string | anonymous classroom identifier |
| `run_id` | string | stable within the submitted manifest |
| `sample_index` | uint | monotonic from zero |
| `time_s` | number | monotonic SI seconds |
| `theta1_rad` | number | radians, documented angle convention |
| `theta2_rad` | number/empty | radians; empty for a single pendulum |
| `omega1_rad_s` | number/empty | radians per second |
| `omega2_rad_s` | number/empty | radians per second |
| `source` | enum | `simulation`, `camera`, or `imu` |
| `quality_flag` | enum | `ok`, `interpolated`, `marker_lost`, `sensor_gap`, `rejected` |

The companion `manifest.json` must contain the model parameters, units,
integrator/controller settings, seed, calibration metadata, application
version, source SHA, and SHA-256 of every submitted file. Sensor exports must
not contain a raw camera device ID or other persistent device identifier.

