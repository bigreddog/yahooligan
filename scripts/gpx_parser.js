const fs = require('fs');
const { DOMParser } = require('@xmldom/xmldom');

const GPX_FILE_PATH = 'Sella_Ronda_2026_from_Hotel_Cristallo_.gpx';
const OUTPUT_FILE_PATH = 'data/routes.json';

// Haversine formula to calculate distance between two points in km
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function parseGPX() {
    const gpxData = fs.readFileSync(GPX_FILE_PATH, 'utf8');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxData, "text/xml");

    const trackPoints = xmlDoc.getElementsByTagName('trkpt');

    let cumulativeDistance = 0;
    let segments = [];
    let lastPoint = null;

    // Decimation logic: Create a new segment roughly every 50 meters (0.05 km)
    const DECIMATION_DISTANCE_KM = 0.05;

    let currentSegmentStartPoint = null;
    let currentSegmentStartDistance = 0;

    for (let i = 0; i < trackPoints.length; i++) {
        const pt = trackPoints[i];
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));

        let eleElement = pt.getElementsByTagName('ele')[0];
        let ele = eleElement ? parseFloat(eleElement.textContent) : 0;

        const currentPoint = { lat, lon, ele };

        if (lastPoint) {
            const dist = calculateDistance(lastPoint.lat, lastPoint.lon, currentPoint.lat, currentPoint.lon);
            cumulativeDistance += dist;
        } else {
            currentSegmentStartPoint = currentPoint;
        }

        lastPoint = currentPoint;

        if (i === 0) continue;

        const distFromSegmentStart = cumulativeDistance - currentSegmentStartDistance;

        if (distFromSegmentStart >= DECIMATION_DISTANCE_KM || i === trackPoints.length - 1) {
            // Calculate grade
            // distFromSegmentStart is in km. We need it in meters for grade calculation.
            const distMeters = distFromSegmentStart * 1000;
            const eleDiffMeters = currentPoint.ele - currentSegmentStartPoint.ele;

            let grade = 0;
            if (distMeters > 0) {
                grade = (eleDiffMeters / distMeters) * 100;
            }

            // Smooth the grade (limit unreasonable grades, e.g., max 30%, min -30%)
            grade = Math.max(-30, Math.min(30, grade));

            segments.push({
                distance: parseFloat(cumulativeDistance.toFixed(3)),
                grade: parseFloat(grade.toFixed(2))
            });

            // Reset for next segment
            currentSegmentStartPoint = currentPoint;
            currentSegmentStartDistance = cumulativeDistance;
        }
    }

    const routeId = 'sella-ronda-2026';
    const youtubeId = '3wED7BS-BXM';

    const routeData = {
        id: routeId,
        youtubeId: youtubeId,
        baseSpeedKmh: 25.0, // Assuming 25 km/h base speed
        defaultMode: 'SIM',
        segments: segments
    };

    const routes = [routeData];

    fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(routes, null, 2));
    console.log(`Successfully generated ${OUTPUT_FILE_PATH}`);
}

parseGPX();
