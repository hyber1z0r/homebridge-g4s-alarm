import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { G4SPlatform } from '../platform';
import G4S from 'g4s';
import { ArmType } from 'g4s/dist/types/ArmType';

type State = {
  targetArmType: CharacteristicValue
}

export class PanelAccessory {
  private service: Service;
  private G4S: G4S;

  private state: State = {
    targetArmType: 3,
  };

  constructor(
    private readonly platform: G4SPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.G4S = platform.G4S;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'G4S')
      .setCharacteristic(this.platform.Characteristic.Model, 'SMART Alarm');

    this.service = this.accessory.getService(this.platform.Service.SecuritySystem) ??
      this.accessory.addService(this.platform.Service.SecuritySystem);

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.platform.config.name ?? 'Alarmpanel');

    // register handlers for the TargetState Characteristic
    // TODO test validValues to see if we can get rid of "Stay arm and away arm"
    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .on('get', this.handleGetTargetState.bind(this))
      .on('set', this.handleSetTargetState.bind(this))
      .setProps({
        validValues: [2, 3],
      });

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
      .on('get', this.handleGetCurrentState.bind(this));

  }

  async handleGetCurrentState(callback: CharacteristicGetCallback) {
    this.platform.log.info('GET: CurrentState');
    try {
      const armType = await this.G4S.getArmType();
      this.platform.log.info('CurrentState:', armType);

      switch (armType) {
        case ArmType.FULL_ARM:
          callback(null, 1);
          break;
        case ArmType.NIGHT_ARM:
          callback(null, 2);
          break;
        case ArmType.DISARMED:
          callback(null, 3);
          break;
        default:
          callback(null, 3);
      }
    } catch (e) {
      this.platform.log.error('Caught an error while trying to get currentstate');
      this.platform.log.error(e.message);
      callback(e);
    }
  }

  handleGetTargetState(callback: CharacteristicGetCallback) {
    this.platform.log.info('GET: TargetState');
    this.platform.log.info('TargetState:', this.state.targetArmType);
    callback(null, this.state.targetArmType);
  }

  async handleSetTargetState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('SET: TargetState');
    this.state.targetArmType = value;
    this.platform.log.info('TargetState:', value);

    try {
      const panelId = this.accessory.context.panelId;
      switch (value) {
        case 1:
          this.platform.log.info('ARMING...');
          await this.G4S.armPanel(panelId);
          callback(null);
          this.platform.log.info('ARMED!');
          break;
        case 2:
          this.platform.log.info('NIGHT ARMING...');
          await this.G4S.nightArmPanel(panelId);
          callback(null);
          this.platform.log.info('ARMED!');
          break;
        case 3:
          this.platform.log.info('DISARMING...');
          await this.G4S.disarmPanel(panelId);
          callback(null);
          this.platform.log.info('DISARMED!');
          break;
        default:
          throw new Error(`Unsupported value ${value}`);
      }

    } catch (e) {
      this.platform.log.info('Failed to arm/disarm');
      this.platform.log.info(e.message);
      callback(e);
    }
  }

}
