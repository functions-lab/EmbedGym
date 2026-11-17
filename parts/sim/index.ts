/**
 * parts/sim — components authored in this fork, kept out of the upstream
 * part files (BasicParts, SensorParts, ProtocolParts, …) so upstream merges
 * don't conflict with our additions.
 *
 * Rules:
 *  - Every net-new component we implement registers from its own file here,
 *    one part per file, named after the part. Never append a register()
 *    block to an upstream parts/*.ts file.
 *  - In-place fixes to upstream parts stay in the upstream files (they are
 *    edits by nature); only pure additions belong here.
 *  - Our SENSOR_CONTROLS entries live in ./sensorControls.ts, merged into the
 *    upstream table by a one-line Object.assign in sensorControlConfig.ts.
 *
 * Upstream imports this directory once: `import '@parts/sim';` in velxio's
 * simulation/parts/index.ts.
 */

import './Pa1616s';
import './Pmsa003i';
import './Vl53l0x';
import './Ltr390';
import './Sgp40';
import './Max32664';
import './Ky020TiltSwitch';
import './Ky008Laser';
import './ActiveBuzzer';
import './Ky023Joystick';
import './Ky018Photoresistor';
import './Ky038SoundSensor';
import './Mq2';
import './Sen0244';
import './Bme280';
import './Ds18b20';
import './Dht11';
import './HcSr04';
import './MembraneKeypad';
import './RelayModule';
import './Tmp36';
import './WaterLevelSensor';
import './PulseSensor';
import './Ky040';
import './BounceButton';
import './Hmc5883l';
import './Mlx90614';
import './Drv2605l';
import './Mpu6050';
import './Ds1307';
import './Max17048';
import './Amg8833';
import './Mpr121';
import './L298n';
import './LineSensor';

import './Hm10';
