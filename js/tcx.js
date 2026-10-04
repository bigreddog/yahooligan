// js/tcx.js

window.TCX = {
    recordingData: [],
    startTime: null,

    recordPoint(data) {
        if (!this.startTime) {
            this.startTime = new Date();
        }

        // data expects: { timeOffset, distance, hr, cadence, power, speed, altitude }
        this.recordingData.push({
            timestamp: new Date(this.startTime.getTime() + data.timeOffset * 1000),
            distance: data.distance,
            hr: data.hr,
            cadence: data.cadence,
            power: data.power,
            speed: data.speed,
            altitude: data.altitude
        });
    },

    generateTCX() {
        if (this.recordingData.length === 0) return null;

        const startTimeIso = this.recordingData[0].timestamp.toISOString();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns2="http://www.garmin.com/xmlschemas/UserProfile/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2" xmlns:ns4="http://www.garmin.com/xmlschemas/ProfileExtension/v1" xmlns:ns5="http://www.garmin.com/xmlschemas/ActivityGoals/v1">
  <Activities>
    <Activity Sport="Biking">
      <Id>${startTimeIso}</Id>
      <Lap StartTime="${startTimeIso}">
        <TotalTimeSeconds>${this.recordingData.length}</TotalTimeSeconds>
        <DistanceMeters>${this.recordingData[this.recordingData.length - 1].distance}</DistanceMeters>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>`;

        for (const pt of this.recordingData) {
            xml += `
          <Trackpoint>
            <Time>${pt.timestamp.toISOString()}</Time>
            <DistanceMeters>${pt.distance.toFixed(2)}</DistanceMeters>
            <HeartRateBpm>
              <Value>${pt.hr}</Value>
            </HeartRateBpm>
            <Cadence>${pt.cadence}</Cadence>
            <Extensions>
              <ns3:TPX>
                <ns3:Speed>${pt.speed.toFixed(3)}</ns3:Speed>
                <ns3:Watts>${pt.power}</ns3:Watts>
              </ns3:TPX>
            </Extensions>
          </Trackpoint>`;
        }

        xml += `
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

        return xml;
    },

    downloadTCX() {
        const tcxString = this.generateTCX();
        if (!tcxString) {
            alert("No data recorded.");
            return;
        }

        const blob = new Blob([tcxString], { type: 'application/vnd.garmin.tcx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Yahooligan_Activity_${this.recordingData[0].timestamp.toISOString().replace(/:/g, '-')}.tcx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Enable the Strava Upload link button
        const btnStrava = document.getElementById('btn-upload-strava');
        if (btnStrava) {
            btnStrava.classList.remove('disabled');
        }
    }
};

// Bind UI buttons if they exist in the DOM (assuming this loads after DOM or in DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
    const btnTcx = document.getElementById('btn-download-tcx');

    if (btnTcx) {
        btnTcx.addEventListener('click', () => {
            window.TCX.downloadTCX();
        });
    }
});
