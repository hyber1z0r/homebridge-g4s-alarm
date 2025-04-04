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
  private readonly DEFAULT_POLL_INTERVAL = 10000;
  private readonly FAST_POLL_INTERVAL = 3000;
  private readonly MAX_WAIT_TIME = 10000;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastUserActionTime = 0;

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

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      this.platform.config.name ?? 'Alarmpanel',
    );

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
      .getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
      .onGet(this.handleGetCurrentState.bind(this));

    this.startPolling(this.DEFAULT_POLL_INTERVAL);
  }

  private async handleGetCurrentState(): Promise<CharacteristicValue> {
    this.platform.log.info('GET: CurrentState, asking G4S API');
    try {
      const armType = await Promise.race([
        this.G4S.getArmType(),
        new Promise<ArmType>((_, reject) => setTimeout(() => reject(new Error('API timeout')), this.MAX_WAIT_TIME)),
      ]);
      return this.armTypeToHomekit(armType);
    } catch (e) {
      this.platform.log.error('Error fetching current state:', (e as Error).message);
      return this.state.targetArmType;
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

  private startPolling(interval: number) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    this.pollInterval = setInterval(this.pollCurrentState.bind(this), interval);
  }

  private async pollCurrentState() {
    if (Date.now() - this.lastUserActionTime < 15000) {
      this.platform.log.info('Skipping polling update to avoid overriding a recent user action.');
      return;
    }
    try {
      const isAlarmTriggered = await this.G4S.isAlarmTriggered();
      if (isAlarmTriggered) {
        this.service.updateCharacteristic(
          this.platform.Characteristic.SecuritySystemCurrentState,
          this.platform.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED,
        );
        return;
      }
      const armType = await this.G4S.getArmType();
      const value = this.armTypeToHomekit(armType);
      this.service.updateCharacteristic(
        this.platform.Characteristic.SecuritySystemCurrentState,
        value,
      );
      if (Date.now() - this.lastUserActionTime > 15000) {
        this.state.targetArmType = value;
        this.service.updateCharacteristic(
          this.platform.Characteristic.SecuritySystemTargetState,
          value,
        );
      }
    } catch (e) {
      this.platform.log.error('Polling error:', (e as Error).message);
    }
  }

  handleGetTargetState(callback: CharacteristicGetCallback) {
    this.platform.log.info('GET: TargetState requested');
    if (Date.now() - this.lastUserActionTime < 15000) {
      return callback(null, this.state.targetArmType);
    }
    this.handleGetCurrentState()
      .then((currentState) => {
        this.state.targetArmType = currentState;
        callback(null, currentState);
      })
      .catch((error) => {
        this.platform.log.error('Error fetching current state for TargetState:', error.message);
        callback(null, this.state.targetArmType);
      });
  }

  async handleSetTargetState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info('SET: TargetState', value);
    this.state.targetArmType = value;
    this.lastUserActionTime = Date.now();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    try {
      const panelId = this.accessory.context.panelId;
      switch (value) {
        case this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM:
          await this.G4S.armPanel(panelId);
          break;
        case this.platform.Characteristic.SecuritySystemTargetState.NIGHT_ARM:
          await this.G4S.nightArmPanel(panelId);
          break;
        case this.platform.Characteristic.SecuritySystemTargetState.DISARM:
          await this.G4S.disarmPanel(panelId);
          break;
        default:
          throw new Error(`Unsupported value ${value}`);
      }
      callback();
      setTimeout(() => {
        this.startPolling(this.DEFAULT_POLL_INTERVAL);
      }, 15000);
    } catch (e) {
      this.platform.log.error('Failed to arm/disarm:', (e as Error).message);
      callback(e as Error);
      this.startPolling(this.DEFAULT_POLL_INTERVAL);
    }
  }
}
