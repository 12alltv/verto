import {ChatMethod} from '../enums';

export enum OutgoingMessageTo {
  Everyone = 'everyone'
}

type Params = {
  method: ChatMethod,
  from: string,
  to: string,
  message?: string,
  fromDisplay?: string
}

export class OutgoingMessage {
  method: ChatMethod;
  from: string;
  to: string;
  message?: string;
  fromDisplay?: string;

  constructor(params: Params) {
    this.method = params.method;
    this.from = params.from;
    this.to = params.to;
    this.message = params.message;
    this.fromDisplay = params.fromDisplay;
  }
}
