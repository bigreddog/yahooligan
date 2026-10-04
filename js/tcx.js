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
    },

    async uploadToStrava() {
        const token = localStorage.getItem('strava_access_token');
        if (!token) {
            alert("Strava access token not found in localStorage ('strava_access_token'). Please authenticate first.");
            return;
        }

        const tcxString = this.generateTCX();
        if (!tcxString) {
            alert("No data recorded.");
            return;
        }

        const file = new File([tcxString], 'activity.tcx', { type: 'application/vnd.garmin.tcx+xml' });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', 'Yahooligan Virtual Ride');
        formData.append('description', 'Recorded with Yahooligan Interactive Trainer');
        formData.append('trainer', '1');
        formData.append('commute', '0');
        formData.append('data_type', 'tcx');

        try {
            const response = await fetch('https://www.strava.com/api/v3/uploads', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                alert("Successfully uploaded to Strava! Upload ID: " + data.id);
            } else {
                const errorData = await response.json();
                console.error("Strava Upload Error:", errorData);
                alert("Failed to upload to Strava: " + (errorData.message || response.statusText));
            }
        } catch (error) {
            console.error("Error uploading to Strava", error);
            alert("Error uploading to Strava. Check console.");
        }
    }
};

// Bind UI buttons if they exist in the DOM (assuming this loads after DOM or in DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
    const btnTcx = document.getElementById('btn-download-tcx');
    const btnStrava = document.getElementById('btn-upload-strava');

    if (btnTcx) {
        btnTcx.addEventListener('click', () => {
            window.TCX.downloadTCX();
        });
    }

    if (btnStrava) {
        btnStrava.addEventListener('click', () => {
            window.TCX.uploadToStrava();
        });
    }
});
