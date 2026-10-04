// js/ble.js

const BLE = {
    // Services
    SERVICES: {
        HR: 0x180D,
        POWER: 0x1818,
        FTMS: 0x1826
    },
    // Characteristics
    CHARACTERISTICS: {
        HR_MEASUREMENT: 0x2A37,
        POWER_MEASUREMENT: 0x2A63,
        FTMS_CONTROL_POINT: 0x2AD9,
        FTMS_INDOOR_BIKE_DATA: 0x2AD2,
        FTMS_STATUS: 0x2ADA
    },

    // State
    trainerDevice: null,
    hrDevice: null,

    ftmsControlCharacteristic: null,

    onPowerData: null,
    onCadenceData: null,
    onHrData: null,

    async connectTrainer() {
        try {
            console.log("Requesting Bluetooth Device for Trainer...");
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [this.SERVICES.FTMS] }],
                optionalServices: [this.SERVICES.POWER]
            });

            console.log("Connecting to GATT Server...");
            const server = await device.gatt.connect();
            this.trainerDevice = device;

            device.addEventListener('gattserverdisconnected', () => {
                console.log("Trainer disconnected");
                this.trainerDevice = null;
                this.ftmsControlCharacteristic = null;
            });

            // Set up Power/Cadence if available
            try {
                const powerService = await server.getPrimaryService(this.SERVICES.POWER);
                const powerCharacteristic = await powerService.getCharacteristic(this.CHARACTERISTICS.POWER_MEASUREMENT);
                await powerCharacteristic.startNotifications();
                powerCharacteristic.addEventListener('characteristicvaluechanged', (e) => this.handlePowerData(e));
                console.log("Power notifications started.");
            } catch (err) {
                console.warn("Could not set up Cycling Power service. Falling back to FTMS Indoor Bike Data if needed.", err);
            }

            // Set up FTMS
            const ftmsService = await server.getPrimaryService(this.SERVICES.FTMS);

            // Indoor Bike Data for power/cadence fallback (if CPS not available)
            try {
                const indoorBikeData = await ftmsService.getCharacteristic(this.CHARACTERISTICS.FTMS_INDOOR_BIKE_DATA);
                await indoorBikeData.startNotifications();
                indoorBikeData.addEventListener('characteristicvaluechanged', (e) => this.handleIndoorBikeData(e));
                console.log("Indoor Bike Data notifications started.");
            } catch (err) {
                console.log("Could not setup Indoor Bike Data", err);
            }

            // Control Point for SIM/ERG commands
            this.ftmsControlCharacteristic = await ftmsService.getCharacteristic(this.CHARACTERISTICS.FTMS_CONTROL_POINT);

            // Request control
            await this.requestControl();

            return true;
        } catch (error) {
            console.error("Trainer connection failed", error);
            return false;
        }
    },

    async connectHR() {
        try {
            console.log("Requesting Bluetooth Device for HR...");
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [this.SERVICES.HR] }]
            });

            console.log("Connecting to GATT Server...");
            const server = await device.gatt.connect();
            this.hrDevice = device;

            device.addEventListener('gattserverdisconnected', () => {
                console.log("HR disconnected");
                this.hrDevice = null;
            });

            const service = await server.getPrimaryService(this.SERVICES.HR);
            const characteristic = await service.getCharacteristic(this.CHARACTERISTICS.HR_MEASUREMENT);
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', (e) => this.handleHrData(e));

            console.log("HR notifications started.");
            return true;
        } catch (error) {
            console.error("HR connection failed", error);
            return false;
        }
    },

    handlePowerData(event) {
        const value = event.target.value;
        const flags = value.getUint16(0, true);
        const power = value.getInt16(2, true);

        if (this.onPowerData) this.onPowerData(power);

        // Check if crank data (cadence) is present
        const hasCrankData = (flags & 0x20) !== 0;
        if (hasCrankData) {
            // Simplified cadence calculation logic would go here.
            // Full CPS parsing requires maintaining previous revolution count and time.
            // For this scaffold, we notify app.js that data arrived.
            // Often, Indoor Bike Data is easier for raw instant cadence.
        }
    },

    handleIndoorBikeData(event) {
        const value = event.target.value;
        const flags = value.getUint16(0, true);

        let offset = 2;

        // Instantaneous Speed
        const hasSpeed = (flags & 0x01) === 0;
        if (hasSpeed) offset += 2;

        // Average Speed
        if ((flags & 0x02) !== 0) offset += 2;

        // Instantaneous Cadence
        const hasCadence = (flags & 0x04) !== 0;
        if (hasCadence) {
            const cadence = value.getUint16(offset, true) / 2; // RPM is 0.5/bit
            if (this.onCadenceData) this.onCadenceData(cadence);
            offset += 2;
        }

        // Average Cadence
        if ((flags & 0x08) !== 0) offset += 2;

        // Total Distance
        if ((flags & 0x10) !== 0) offset += 3;

        // Resistance Level
        if ((flags & 0x20) !== 0) offset += 2;

        // Instantaneous Power
        const hasPower = (flags & 0x40) !== 0;
        if (hasPower) {
            const power = value.getInt16(offset, true);
            if (this.onPowerData) this.onPowerData(power); // Call if CPS didn't already
            offset += 2;
        }
    },

    handleHrData(event) {
        const value = event.target.value;
        const flags = value.getUint8(0);
        const format = flags & 0x01;
        const hr = format === 1 ? value.getUint16(1, true) : value.getUint8(1);

        if (this.onHrData) this.onHrData(hr);
    },

    async requestControl() {
        if (!this.ftmsControlCharacteristic) return;
        try {
            // Opcode 0x00: Request Control
            const command = new Uint8Array([0x00]);
            await this.ftmsControlCharacteristic.writeValue(command);
            console.log("Requested FTMS control.");
        } catch (error) {
            console.error("Failed to request FTMS control", error);
        }
    },

    async setTargetPower(watts) {
        if (!this.ftmsControlCharacteristic) return;
        try {
            // Opcode 0x05: Set Target Power
            const buffer = new ArrayBuffer(3);
            const view = new DataView(buffer);
            view.setUint8(0, 0x05); // Opcode
            view.setInt16(1, watts, true); // Watts (Little Endian)
            await this.ftmsControlCharacteristic.writeValue(new Uint8Array(buffer));
        } catch (error) {
            console.error("Failed to set Target Power", error);
        }
    },

    async setTargetInclination(gradePercent) {
        if (!this.ftmsControlCharacteristic) return;
        try {
            // Opcode 0x03: Set Target Inclination
            // Resolution: 0.01%
            const val = Math.round(gradePercent * 100);

            const buffer = new ArrayBuffer(3);
            const view = new DataView(buffer);
            view.setUint8(0, 0x03); // Opcode
            view.setInt16(1, val, true); // Incline (Little Endian)
            await this.ftmsControlCharacteristic.writeValue(new Uint8Array(buffer));
        } catch (error) {
            console.error("Failed to set Target Inclination", error);
        }
    }
};
