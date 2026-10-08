export function generateTCX(session) {
  if (!session.records.length) return null;
  const start = session.startedAt.toISOString();
  // Activity timestamps exclude pauses, matching active workout time and lap duration.
  const track = session.records
    .map(
      (point) => `
      <Trackpoint>
        <Time>${new Date(session.startedAt.getTime() + point.time * 1000).toISOString()}</Time>
        <AltitudeMeters>${point.altitude.toFixed(2)}</AltitudeMeters>
        <DistanceMeters>${point.distance.toFixed(2)}</DistanceMeters>
        ${point.hr > 0 ? `<HeartRateBpm><Value>${Math.round(point.hr)}</Value></HeartRateBpm>` : ""}
        <Cadence>${Math.round(point.cadence)}</Cadence>
        <Extensions><ns3:TPX><ns3:Speed>${point.speed.toFixed(3)}</ns3:Speed><ns3:Watts>${Math.round(point.power)}</ns3:Watts></ns3:TPX></Extensions>
      </Trackpoint>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities><Activity Sport="Biking"><Id>${start}</Id>
    <Lap StartTime="${start}"><TotalTimeSeconds>${session.elapsed.toFixed(2)}</TotalTimeSeconds><DistanceMeters>${session.distance.toFixed(2)}</DistanceMeters><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>${track}
    </Track></Lap><Creator xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="Device_t"><Name>Yahooligan</Name><UnitId>0</UnitId><ProductID>0</ProductID><Version><VersionMajor>2</VersionMajor><VersionMinor>0</VersionMinor><BuildMajor>0</BuildMajor><BuildMinor>0</BuildMinor></Version></Creator>
  </Activity></Activities>
</TrainingCenterDatabase>`;
}

export function downloadTCX(session) {
  const xml = generateTCX(session);
  if (!xml) return;
  const url = URL.createObjectURL(
    new Blob([xml], { type: "application/vnd.garmin.tcx+xml" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `Yahooligan_${session.startedAt.toISOString().replace(/:/g, "-")}.tcx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
