import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { G4SPlatform } from '../platform';

type State = {
  targetArmType: CharacteristicValue
}

export class PanelAccessory {
  private service: Service;

  private state: State = {
    targetArmType: 3,
  };

  constructor(
    private readonly platform: G4SPlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'G4S')
      .setCharacteristic(this.platform.Characteristic.Model, 'SMART Alarm')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, '0000-0000-0000-0000');

    this.service = this.accessory.getService(this.platform.Service.SecuritySystem) ??
      this.accessory.addService(this.platform.Service.SecuritySystem);

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.exampleDisplayName);

    // register handlers for the TargetState Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .on('get', this.handleGetTargetState.bind(this))
      .on('set', this.handleSetTargetState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
      .on('get', this.handleGetCurrentState.bind(this));

    setInterval(this.handleGetCurrentStateInterval.bind(this), 10000);
  }

  handleGetCurrentState(callback: CharacteristicGetCallback) {
    this.platform.log.info('Calling get current state');
    callback(null, 3);
  }

  handleGetCurrentStateInterval() {
    // Contact api here
    this.platform.log.info('Calling interval and updating');
    const currentArmType = 3;
    this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState, currentArmType);

    this.platform.log.info('Pushed updated current armtype state to HomeKit:', currentArmType);
  }

  handleGetTargetState(callback: CharacteristicSetCallback) {
    const value = this.state.targetArmType;
    this.platform.log.info('Get Characteristic "targetArmType" ->', value);
    callback(null, value);
  }

  handleSetTargetState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.state.targetArmType = value;
    this.platform.log.debug('Set Characteristic "targetArmType" ->', value);
    // Call API here to trigger a change.
    callback(null);
  }

}
