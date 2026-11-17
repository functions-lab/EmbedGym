/**
 * SENSOR_CONTROLS entries for fork-local components (see ./index.ts for the
 * layout rules). Merged into the upstream table by the one-line
 * Object.assign at the bottom of sensorControlConfig.ts.
 */

import type { SensorControlDef } from '@velxio/simulation/sensorControlConfig';

const oneDecimal = (v: number) => v.toFixed(1);
const twoDecimal = (v: number) => v.toFixed(2);
const fourDecimal = (v: number) => v.toFixed(4);

export const LOCAL_SENSOR_CONTROLS: Record<string, SensorControlDef> = {
  'line-sensor': {
    title: 'Three-channel Line Sensor',
    controls: [
      { type: 'slider', key: 'leftPhotocurrentUa', label: 'Left detector', min: 0, max: 400, step: 1, unit: 'µA', defaultValue: 200 },
      { type: 'slider', key: 'middlePhotocurrentUa', label: 'Middle detector', min: 0, max: 400, step: 1, unit: 'µA', defaultValue: 200 },
      { type: 'slider', key: 'rightPhotocurrentUa', label: 'Right detector', min: 0, max: 400, step: 1, unit: 'µA', defaultValue: 200 },
      { type: 'slider', key: 'thresholdPosition', label: 'Shared threshold', min: 0.2, max: 0.6, step: 0.01, unit: '', defaultValue: 0.5 },
    ],
    defaultValues: { leftPhotocurrentUa: 200, middlePhotocurrentUa: 200, rightPhotocurrentUa: 200, thresholdPosition: 0.5 },
  },
  mpr121: {
    title: 'MPR121 Capacitance',
    controls: Array.from({ length: 12 }, (_, i): SensorControlDef['controls'][number] => ({
      type: 'slider', key: `capacitance${i}`, label: `Electrode ${i}`, min: 5, max: 100, step: 0.1, unit: 'pF', defaultValue: 15,
    })),
    defaultValues: { rextOvercurrent: false, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`capacitance${i}`, 15])) },
  },
  amg8833: {
    title: 'AMG8833 Thermal Camera',
    controls: [
      { type: 'slider', key: 'thermistorTemperature', label: 'Thermistor', min: -20, max: 80, step: 0.0625, unit: '°C', defaultValue: 25 },
      ...Array.from({ length: 64 }, (_, i): SensorControlDef['controls'][number] => ({
        type: 'slider', key: `pixel${i}`, label: `Pixel ${i}`, min: -20, max: 80, step: 0.25, unit: '°C', defaultValue: 25,
      })),
    ],
    defaultValues: { thermistorTemperature: 25, pixelAdcOverflow: false, ...Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`pixel${i}`, 25])) },
  },
  max17048: {
    title: 'MAX17048 Lithium Cell',
    controls: [
      { type: 'button', key: 'toggleBattery', label: 'Connect/disconnect cell' },
      { type: 'slider', key: 'cellVoltage', label: 'Terminal voltage', min: 0, max: 4.5, step: 0.01, unit: 'V', defaultValue: 3.8 },
      { type: 'slider', key: 'openCircuitVoltage', label: 'Open-circuit voltage', min: 0, max: 4.5, step: 0.01, unit: 'V', defaultValue: 3.8 },
      { type: 'slider', key: 'stateOfCharge', label: 'Cell charge', min: 0, max: 100, step: 0.1, unit: '%', defaultValue: 50 },
      { type: 'slider', key: 'chargeRate', label: 'Charge/discharge rate', min: -100, max: 100, step: 0.1, unit: '%/h', defaultValue: 0 },
    ],
    defaultValues: { batteryConnected: false, cellVoltage: 3.8, openCircuitVoltage: 3.8, stateOfCharge: 50, chargeRate: 0 },
  },
  hmc5883l: {
    title: 'HMC5883L Magnetometer',
    controls: [
      { type: 'slider', key: 'magneticX', label: 'X', min: -8, max: 8, step: 0.01, unit: 'G', defaultValue: 0.3 },
      { type: 'slider', key: 'magneticY', label: 'Y', min: -8, max: 8, step: 0.01, unit: 'G', defaultValue: -0.2 },
      { type: 'slider', key: 'magneticZ', label: 'Z', min: -8, max: 8, step: 0.01, unit: 'G', defaultValue: 0.1 },
    ],
    defaultValues: { magneticX: 0.3, magneticY: -0.2, magneticZ: 0.1 },
  },
  mlx90614: {
    title: 'MLX90614 IR Thermometer',
    controls: [
      { type: 'slider', key: 'objectTemperature', label: 'Object', min: -70, max: 380, step: 0.02, unit: '°C', defaultValue: 25 },
      { type: 'slider', key: 'ambientTemperature', label: 'Ambient', min: -40, max: 125, step: 0.02, unit: '°C', defaultValue: 25 },
    ],
    defaultValues: { objectTemperature: 25, ambientTemperature: 25 },
  },
  // ── KY-020 tilt switch ─────────────────────────────────────────────────────
  'ky-020-tilt-switch': {
    title: 'KY-020 Tilt Switch',
    controls: [{ type: 'button', key: 'toggle', label: 'Toggle tilt' }],
    defaultValues: {},
  },

  // ── Shock sensor ───────────────────────────────────────────────────────────
  'shock-sensor': {
    title: 'Shock Sensor',
    controls: [{ type: 'button', key: 'shock', label: 'Shock' }],
    defaultValues: {},
  },

  // ── KY-023 joystick ────────────────────────────────────────────────────────
  joystick: {
    title: 'KY-023 Joystick',
    controls: [
      { type: 'slider', key: 'x', label: 'X Axis', min: 0, max: 1023, step: 1, unit: '', defaultValue: 512 },
      { type: 'slider', key: 'y', label: 'Y Axis', min: 0, max: 1023, step: 1, unit: '', defaultValue: 512 },
      { type: 'button', key: 'toggle', label: 'Toggle button' },
    ],
    defaultValues: { x: 512, y: 512 },
  },

  // ── KY-018 photoresistor ───────────────────────────────────────────────────
  'ky-018-photoresistor': {
    title: 'KY-018 Photoresistor',
    controls: [
      { type: 'slider', key: 'lightLevel', label: 'Light Level', min: 0, max: 1023, step: 1, unit: '', defaultValue: 512 },
    ],
    defaultValues: { lightLevel: 512 },
  },

  // ── KY-038 microphone sound sensor ─────────────────────────────────────────
  'ky-038-sound-sensor': {
    title: 'KY-038 Sound Sensor',
    controls: [
      { type: 'slider', key: 'soundLevel', label: 'Sound Level', min: 0, max: 1023, step: 1, unit: '', defaultValue: 0 },
      { type: 'slider', key: 'threshold', label: 'Threshold', min: 0, max: 1023, step: 1, unit: '', defaultValue: 512 },
    ],
    defaultValues: { soundLevel: 0, threshold: 512 },
  },

  // ── MQ-2 gas sensor module ─────────────────────────────────────────────────
  mq2: {
    title: 'MQ-2 Gas Sensor',
    controls: [
      { type: 'slider', key: 'voltage', label: 'AO Voltage', min: 0, max: 5, step: 0.01, unit: 'V', defaultValue: 0.5, formatValue: twoDecimal },
      { type: 'slider', key: 'threshold', label: 'Threshold', min: 0, max: 5, step: 0.01, unit: 'V', defaultValue: 2.5, formatValue: twoDecimal },
    ],
    defaultValues: { voltage: 0.5, threshold: 2.5 },
  },

  // ── SEN0244 analog TDS sensor ──────────────────────────────────────────────
  sen0244: {
    title: 'TDS Sensor',
    controls: [
      { type: 'slider', key: 'tds', label: 'TDS', min: 0, max: 1000, step: 1, unit: 'ppm', defaultValue: 0 },
    ],
    defaultValues: { tds: 0 },
  },

  // ── TMP36 analog temperature ───────────────────────────────────────────────
  tmp36: {
    title: 'TMP36 Temperature Sensor',
    controls: [
      {
        type: 'slider',
        key: 'temperature',
        label: 'Temperature',
        min: -40,
        max: 125,
        step: 1,
        unit: '°C',
        defaultValue: 25,
        formatValue: oneDecimal,
      },
    ],
    defaultValues: { temperature: 25 },
  },

  // ── Water level sensor ─────────────────────────────────────────────────────
  'water-level-sensor': {
    title: 'Water Level Sensor',
    controls: [
      { type: 'slider', key: 'level', label: 'Water Level', min: 0, max: 1023, step: 1, unit: '', defaultValue: 0 },
    ],
    defaultValues: { level: 0 },
  },

  // ── DS18B20 1-Wire temperature ─────────────────────────────────────────────
  ds18b20: {
    title: 'DS18B20 Temperature Sensor',
    controls: [
      {
        type: 'slider',
        key: 'temperature',
        label: 'Temperature',
        min: -55,
        max: 125,
        step: 0.5,
        unit: '°C',
        defaultValue: 25,
        formatValue: oneDecimal,
      },
    ],
    defaultValues: { temperature: 25 },
  },

  // ── DHT11 temperature / humidity ───────────────────────────────────────────
  dht11: {
    title: 'DHT11 Temperature & Humidity',
    controls: [
      { type: 'slider', key: 'temperature', label: 'Temperature', min: 0, max: 50, step: 1, unit: '°C', defaultValue: 25 },
      { type: 'slider', key: 'humidity', label: 'Humidity', min: 20, max: 90, step: 1, unit: '%', defaultValue: 50 },
    ],
    defaultValues: { temperature: 25, humidity: 50 },
  },

  // ── BME280 temperature / pressure / humidity ───────────────────────────────
  bme280: {
    title: 'BME280 Environmental Sensor',
    controls: [
      {
        type: 'slider',
        key: 'temperature',
        label: 'Temperature',
        min: -40,
        max: 85,
        step: 1,
        unit: '°C',
        defaultValue: 25,
        formatValue: oneDecimal,
      },
      {
        type: 'slider',
        key: 'pressure',
        label: 'Pressure',
        min: 300,
        max: 1100,
        step: 0.25,
        unit: 'hPa',
        defaultValue: 1013.25,
        formatValue: twoDecimal,
      },
      {
        type: 'slider',
        key: 'humidity',
        label: 'Humidity',
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
        defaultValue: 50,
        formatValue: oneDecimal,
      },
    ],
    defaultValues: { temperature: 25, pressure: 1013.25, humidity: 50 },
  },

  // ── PA1616S GPS module ─────────────────────────────────────────────────────
  pa1616s: {
    title: 'PA1616S GPS',
    controls: [
      { type: 'button', key: 'toggleFix', label: 'Toggle fix' },
      {
        type: 'slider',
        key: 'latitude',
        label: 'Latitude',
        min: -90,
        max: 90,
        step: 0.001,
        unit: '°',
        defaultValue: 37.7749,
        formatValue: fourDecimal,
      },
      {
        type: 'slider',
        key: 'longitude',
        label: 'Longitude',
        min: -180,
        max: 180,
        step: 0.001,
        unit: '°',
        defaultValue: -122.4194,
        formatValue: fourDecimal,
      },
      {
        type: 'slider',
        key: 'satellites',
        label: 'Satellites',
        min: 0,
        max: 12,
        step: 1,
        unit: '',
        defaultValue: 8,
      },
      {
        type: 'slider',
        key: 'altitude',
        label: 'Altitude',
        min: -100,
        max: 5000,
        step: 0.5,
        unit: 'm',
        defaultValue: 12.5,
        formatValue: oneDecimal,
      },
      {
        type: 'slider',
        key: 'speed',
        label: 'Speed',
        min: 0,
        max: 200,
        step: 0.1,
        unit: 'kn',
        defaultValue: 0,
        formatValue: twoDecimal,
      },
      {
        type: 'slider',
        key: 'course',
        label: 'Course',
        min: 0,
        max: 359.9,
        step: 0.1,
        unit: '°',
        defaultValue: 0,
        formatValue: twoDecimal,
      },
    ],
    defaultValues: {
      latitude: 37.7749,
      longitude: -122.4194,
      satellites: 8,
      altitude: 12.5,
      speed: 0,
      course: 0,
    },
  },

  // ── VL53L0X ToF distance sensor ────────────────────────────────────────────
  vl53l0x: {
    title: 'VL53L0X ToF Distance',
    controls: [
      {
        type: 'slider',
        key: 'distance',
        label: 'Distance',
        min: 30,
        max: 2500,
        step: 1,
        unit: 'mm',
        defaultValue: 100,
      },
    ],
    defaultValues: {
      distance: 100,
    },
  },

  // ── PMSA003I particulate-matter sensor ─────────────────────────────────────
  pmsa003i: {
    title: 'PMSA003I Air Quality',
    controls: [
      {
        type: 'slider',
        key: 'pm1_0',
        label: 'PM1.0',
        min: 0,
        max: 1000,
        step: 1,
        unit: 'µg/m³',
        defaultValue: 8,
      },
      {
        type: 'slider',
        key: 'pm2_5',
        label: 'PM2.5',
        min: 0,
        max: 1000,
        step: 1,
        unit: 'µg/m³',
        defaultValue: 12,
      },
      {
        type: 'slider',
        key: 'pm10',
        label: 'PM10',
        min: 0,
        max: 1000,
        step: 1,
        unit: 'µg/m³',
        defaultValue: 20,
      },
    ],
    defaultValues: {
      pm1_0: 8,
      pm2_5: 12,
      pm10: 20,
    },
  },

  // ── LTR390 UV + ambient light sensor ───────────────────────────────────────
  ltr390: {
    title: 'LTR390 UV / Ambient Light',
    controls: [
      {
        type: 'slider',
        key: 'als',
        label: 'Ambient light',
        min: 0,
        max: 200000,
        step: 100,
        unit: 'counts',
        defaultValue: 45000,
      },
      {
        type: 'slider',
        key: 'uvs',
        label: 'UV',
        min: 0,
        max: 50000,
        step: 10,
        unit: 'counts',
        defaultValue: 1200,
      },
    ],
    defaultValues: {
      als: 45000,
      uvs: 1200,
    },
  },

  // ── SGP40 MOX gas (VOC) sensor ─────────────────────────────────────────────
  sgp40: {
    title: 'SGP40 VOC Gas',
    controls: [
      {
        type: 'slider',
        key: 'raw',
        label: 'Raw gas signal',
        min: 0,
        max: 65535,
        step: 100,
        unit: 'ticks',
        defaultValue: 30000,
      },
    ],
    defaultValues: {
      raw: 30000,
    },
  },

  // ── MAX30101 + MAX32664 pulse oximeter / heart rate sensor ─────────────────
  max32664: {
    title: 'MAX32664 Pulse Oximeter',
    controls: [
      {
        type: 'slider',
        key: 'heartRate',
        label: 'Heart rate',
        min: 0,
        max: 240,
        step: 1,
        unit: 'BPM',
        defaultValue: 72,
      },
      {
        type: 'slider',
        key: 'oxygen',
        label: 'Blood oxygen',
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
        defaultValue: 98,
      },
      {
        type: 'slider',
        key: 'confidence',
        label: 'Confidence',
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
        defaultValue: 95,
      },
      {
        type: 'slider',
        key: 'status',
        label: 'Finger status',
        min: 0,
        max: 3,
        step: 1,
        unit: '',
        defaultValue: 3,
      },
      {
        type: 'slider',
        key: 'rValue',
        label: 'SpO2 R value',
        min: 0,
        max: 100,
        step: 0.1,
        unit: '',
        defaultValue: 12.5,
        formatValue: oneDecimal,
      },
      {
        type: 'slider',
        key: 'extStatus',
        label: 'Extended status',
        min: -128,
        max: 127,
        step: 1,
        unit: '',
        defaultValue: 0,
      },
    ],
    defaultValues: {
      heartRate: 72,
      oxygen: 98,
      confidence: 95,
      status: 3,
      rValue: 12.5,
      extStatus: 0,
    },
  },
};
