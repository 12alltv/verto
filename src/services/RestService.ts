import BaseService from './BaseService';
import {IceServer, RoomLayout} from '../types';

export class RestService extends BaseService {
  static getIceServers() {
    return this.get<IceServer[]>('/ice-servers');
  }

  static getDefaultLayout() {
    return this.get<RoomLayout>('/default-room-layout');
  }
}
