import {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import { G4SPlatform } from '../platform';
import G4S from 'g4s';
import { ArmType } from 'g4s/dist/types/ArmType';

type State = {
  targetArmType: CharacteristicValue;
};

export class PanelAccessory {
  private service: Service;
  private G4S: G4S;
  private readonly POLL_INTERVAL = 5000;

  private state: State = {
    targetArmType: 3,
  };

  constructor(
    private readonly platform: G4SPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.G4S = platform.G4S;

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'G4S')
      .setCharacteristic(this.platform.Characteristic.Model, 'SMART Alarm');

    this.service =
      this.accessory.getService(this.platform.Service.SecuritySystem) ??
      this.accessory.addService(this.platform.Service.SecuritySystem);

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      this.platform.config.name ?? 'Alarmpanel',
    );

    // register handlers for the TargetState Characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .on('get', this.handleGetTargetState.bind(this))
      .on('set', this.handleSetTargetState.bind(this))
      .setProps({
        validValues: [
          this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM,
          this.platform.Characteristic.SecuritySystemTargetState.NIGHT_ARM,
          this.platform.Characteristic.SecuritySystemTargetState.DISARM,
        ],
      });

    this.service
      .getCharacteristic(
        this.platform.Characteristic.SecuritySystemCurrentState,
      )
      .onGet(this.handleGetCurrentState.bind(this));

    setInterval(this.pollCurrentState.bind(this), this.POLL_INTERVAL);
  }

  private async handleGetCurrentState(): Promise<CharacteristicValue> {
    this.platform.log.info('GET: CurrentState');
    try {
      const isAlarmTriggered = await this.G4S.isAlarmTriggered();
      if (isAlarmTriggered) {
        this.platform.log.info('Alarm is triggered');
        return this.platform.Characteristic.SecuritySystemCurrentState
          .ALARM_TRIGGERED;
      }

      const armType = await this.G4S.getArmType();
      this.platform.log.info('CurrentState:', armType);

      return this.armTypeToHomekit(armType);
    } catch (e) {
      this.platform.log.error(
        'Caught an error while trying to get currentstate',
      );
      this.platform.log.error((e as Error).message);
      return false;
    }
  }

  private armTypeToHomekit(armType: ArmType): CharacteristicValue {
    switch (armType) {
      case ArmType.FULL_ARM:
        return this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM;
      case ArmType.NIGHT_ARM:
        return this.platform.Characteristic.SecuritySystemTargetState.NIGHT_ARM;
      case ArmType.DISARMED:
        return this.platform.Characteristic.SecuritySystemTargetState.DISARM;
      default:
        throw new Error(`Unsupported ArmType: ${armType}`);
    }
  }

  // TODO: Clean up the conversion and look into cancelling the request
  async pollCurrentState() {
    this.platform.log.info('POLL: CurrentState');

    const armType = await this.G4S.getArmType();
    this.platform.log.info('POLL - CurrentState:', armType);

    const value =
      armType === ArmType.FULL_ARM ? 1 : armType === ArmType.NIGHT_ARM ? 2 : 3;
    this.service.updateCharacteristic(
      this.platform.Characteristic.SecuritySystemCurrentState,
      value,
    );
    this.platform.log.info('POLL: Updated Characteristic');
  }

  handleGetTargetState(callback: CharacteristicGetCallback) {
    this.platform.log.info('GET: TargetState');
    this.platform.log.info('TargetState:', this.state.targetArmType);
    callback(null, this.state.targetArmType);
  }

  async handleSetTargetState(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.platform.log.info('SET: TargetState');
    this.state.targetArmType = value;
    this.platform.log.info('TargetState:', value);

    try {
      const panelId = this.accessory.context.panelId;
      switch (value) {
        case this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM:
          this.platform.log.info('ARMING...');
          await this.G4S.armPanel(panelId);
          callback();
          this.platform.log.info('ARMED!');
          break;
        case this.platform.Characteristic.SecuritySystemTargetState.NIGHT_ARM:
          this.platform.log.info('NIGHT ARMING...');
          await this.G4S.nightArmPanel(panelId);
          callback();
          this.platform.log.info('ARMED!');
          break;
        case this.platform.Characteristic.SecuritySystemTargetState.DISARM:
          this.platform.log.info('DISARMING...');
          await this.G4S.disarmPanel(panelId);
          callback();
          this.platform.log.info('DISARMED!');
          break;
        default:
          throw new Error(`Unsupported value ${value}`);
      }
    } catch (e) {
      this.platform.log.info('Failed to arm/disarm');
      this.platform.log.info((e as Error).message);
      callback(e as Error);
    }
  }
}
