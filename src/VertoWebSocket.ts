import {WsRequest} from './types';
import VertoNotification from './VertoNotification';
import {
  CordovaWebsocketError,
  CordovaWebsocketEvent,
  CordovaWebsocketOptions,
  CordovaWebsocketSuccess
} from 'cordova-plugin-advanced-websocket-types';
import {isPlatform} from '@ionic/react';
import {SendWsRequest} from '../shared/types';

export default class VertoWebSocket {
  private wsRequestId = 0;
  private notifications: VertoNotification;
  private readonly sessionId: string;
  private readonly moderatorUsername: string;
  private readonly moderatorPassword: string;
  private readonly websocketOptions: CordovaWebsocketOptions = {url: ''};
  private websocketId: string | null = null;
  private websocket: WebSocket | null = null;

  constructor(
    sessionId: string,
    notifications: VertoNotification,
    moderatorUsername: string,
    moderatorPassword: string,
    fsUrl: string
  ) {
    this.sessionId = sessionId;
    this.notifications = notifications;
    this.moderatorUsername = moderatorUsername;
    this.moderatorPassword = moderatorPassword;
    this.websocketOptions.url = fsUrl;
    // this.wsOptions.url = 'wss://conf.mg-comm.com:8082';
    this.initWs();
    this.notifications.sendWsRequest.subscribe(this.publish.bind(this));
  }

  disconnect() {
    // this.websocketId && window.CordovaWebsocketPlugin.wsClose(this.websocketId);
  }

  private initWs(reconnecting?: boolean) {
    if (reconnecting) {
      this.notifications.onWebSocketReconnecting.notify(null);
    }

    const handleOnOpen = () => {
      this.publish({
        method: 'login',
        params: {
          login: this.moderatorUsername,
          passwd: this.moderatorPassword
        },
        onSuccess: () => {
          if (!reconnecting) {
            this.notifications.onFreeswitchLogin.notify(null);
          } else {
            this.notifications.onFreeswitchReconnectLogin.notify(null);
          }
        },
        onError: (err) => {
          this.notifications.onFreeswitchLoginError.notify(null);
          console.error('Error while publishing', err);
        }
      });
    };

    const handleOnMessage = (message: string) => {
      this.notifications.onWebSocketMessage.notify(message);
    };

    const handleOnClose = (code: number) => {
      if (code !== 1000) {
        setTimeout(() => this.initWs(true), 1000);
        console.log('WebSocket closed, attempting to reconnect');
      }
    };

    if (isPlatform('android') || isPlatform('desktop')) {
      this.websocket = new WebSocket(this.websocketOptions.url);

      this.websocket.onopen = () => {
        handleOnOpen();
      };

      this.websocket.onmessage = (event: MessageEvent) => {
        handleOnMessage(event.data);
      };

      this.websocket.onclose = ({code}: CloseEvent) => {
        handleOnClose(code);
      };

    } else {
      const receiveCallback = ({callbackMethod, message, code}: CordovaWebsocketEvent) => {
        switch (callbackMethod) {
          case 'onMessage':
            handleOnMessage(message);
            break;
          case 'onClose':
            handleOnClose(code)
            break;
        }
      };

      const successCallback = ({webSocketId}: CordovaWebsocketSuccess) => {
        this.websocketId = webSocketId;
        handleOnOpen();
      };

      const errorCallback = ({code, reason, exception}: CordovaWebsocketError) =>  {
        console.log(`Failed to connect to WebSocket: code: ${code}, reason: ${reason}, exception: ${exception}`);
      };

      window.CordovaWebsocketPlugin.wsConnect(this.websocketOptions, receiveCallback, successCallback, errorCallback);
    }
  }

  private publish({method, params, onSuccess, onError}: SendWsRequest) {


    const request: WsRequest = {
      jsonrpc: '2.0',
      method,
      params: {sessid: this.sessionId, ...params},
      id: ++this.wsRequestId
    };

    const requestStringify = JSON.stringify(request);

    this.notifications.onNewSession.notify({request, onSuccess, onError});

    if (isPlatform('android') || isPlatform('desktop')) {
      this.websocket && this.websocket.send(requestStringify);
    } else {
      if (!this.websocketId) {
        console.error('Websocket id is not provided');
        this.initWs(true);
        return;
      }

      window.CordovaWebsocketPlugin.wsSend(this.websocketId, requestStringify);
    }
  }
}
