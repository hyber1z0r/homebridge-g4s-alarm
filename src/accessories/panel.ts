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
    this.service.setCharacteristic(this.platform.Characteristic.Name, 'Alarmpanel');

    // register handlers for the TargetState Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .on('get', this.handleGetTargetState.bind(this))
      .on('set', this.handleSetTargetState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
      .on('get', this.handleGetCurrentState.bind(this));

  }

  async handleGetCurrentState(callback: CharacteristicGetCallback) {
    this.platform.log.info('Calling get current state');

    try {
      const armType = await this.G4S.getArmType();

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
      callback(e);
    }
  }

  handleGetTargetState(callback: CharacteristicSetCallback) {
    const value = this.state.targetArmType;

    this.platform.log.info('Get Characteristic "targetArmType" ->', value);

    callback(null, value);
  }

  async handleSetTargetState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.state.targetArmType = value;
    this.platform.log.debug('Set Characteristic "targetArmType" ->', value);

    try {
      const panelId = this.accessory.context.panelId;
      switch (value) {
        case 1:
          await this.G4S.armPanel(panelId);
          break;
        case 2:
          await this.G4S.nightArmPanel(panelId);
          break;
        case 3:
          await this.G4S.disarmPanel(panelId);
          break;
        default:
          callback(new Error(`Unsupported value ${value}`));
      }
    } catch (e) {
      callback(e);
    }
  }

}
