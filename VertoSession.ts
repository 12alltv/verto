import {Session, VertoLayout, VertoSessionParams} from './types';

import {generateNanoId} from './utils';

import Call from './Call';
import ConferenceManager from './conference/ConferenceManager';
import ConferenceLiveArray from './conference/ConferenceLiveArray';

import VertoNotification from './VertoNotification';
import VertoSubscription from './VertoSubscription';
import VertoWebSocket from './VertoWebSocket';
import {OutgoingMessage, OutgoingMessageTo} from '../models/OutgoingMessage';
import Participant from '../models/Participant';
import {WEBSOCKET_PASSWORD} from '../shared/constants';
import {RoomLayoutService} from '../services';
import {ChatMethod} from '../shared/enums';

type SocketMessage = { method: any; params: any };
type RPCMessage = {
  result: any;
  id: string | number;
  error: { code: string };
};
type Conf = {
  creationEvent: any;
  privateEventChannel: string;
  memberId: string;
  role: string;
  manager: ConferenceManager;
  liveArray: ConferenceLiveArray;
};

export default class VertoSession {
  private readonly sessId: string = generateNanoId();
  private readonly sessionParams: VertoSessionParams;
  private readonly callerDisplayName: string = '';
  private sessions: Session = {};
  private primarySession: { id: string; call: Call | null; conf: Conf | null } = {
    id: generateNanoId(),
    call: null,
    conf: null
  };
  private secondarySession: { id: string; call: Call | null } = {
    id: generateNanoId(),
    call: null
  };
  private vertoNotification = new VertoNotification();
  private vertoSubscription = new VertoSubscription(this.vertoNotification);
  private vertoWebSocket: VertoWebSocket;
  private isSharingVideo = false;
  private defaultLayout: VertoLayout | null = null;

  constructor(params: VertoSessionParams) {
    this.sessionParams = params;
    const loginUrl = params.fsUrl.replace('wss://', '').replace('/', '');
    this.vertoWebSocket = new VertoWebSocket(
      this.sessId,
      this.vertoNotification,
      this.sessionParams.moderatorUsername || `1008@${loginUrl}`,
      this.sessionParams.moderatorPassword || WEBSOCKET_PASSWORD,
      this.sessionParams.fsUrl
    );
    this.vertoNotification.onFreeswitchLogin.subscribe(() => {
      this.primaryCall();

      if (params.changeLayout) {
        this.vertoNotification.onBootstrappedParticipants.subscribe(
          (data: Participant[]) => {
            const id = this.primarySession.call?.getId();
            if (id) {
              const sharedSession = data.find(({callId}) => id === callId);
              if (sharedSession && this.primarySession.conf) {
                this.giveParticipantFloor(sharedSession.participantId);
                // this.primary.conf.manager.changeVideoLayout('1up_top_left+9');
              }
            }
          }
        );
      }
    });

    this.vertoNotification.onWebSocketMessage.subscribe(
      this.onWsMessage.bind(this)
    );

    this.vertoNotification.onNewSession.subscribe(
      ({request, onSuccess, onError}) => {
        this.sessions[request.id] = {
          request,
          onSuccess,
          onError
        };
      }
    );

    this.callerDisplayName = params.displayName || `User_${new Date().getUTCMilliseconds()}`;
  }

  get notification() {
    return this.vertoNotification;
  }

  get callerName() {
    return this.callerDisplayName;
  }

  giveParticipantFloor(participantId: string) {
    this.primarySession.conf?.manager
      .moderateMemberById(participantId)
      .toBeVideoFloor();
  }

  changeLayout(layout?: VertoLayout | null) {
    if (layout) {
      this.primarySession.conf?.manager.changeVideoLayout(layout);
    } else {
      const getDefaultLayout = async () => {
        if (!this.defaultLayout) {
          const {data} = await RoomLayoutService.getDefaultLayout();
          this.defaultLayout = data.layout;
        }

        this.primarySession.conf?.manager.changeVideoLayout(this.defaultLayout);
      };

      getDefaultLayout().catch();
    }
  }

  primaryCall() {
    const {
      destinationNumber,
      callerName,
      isHost,
      channelName,
      displayName,
      isHostSharedVideo,
      notifyOnStateChange,
      localStream,
      isVlrConnection
    } = this.sessionParams;

    this.primarySession.call = new Call({
      callID: this.primarySession.id,
      destination_number: destinationNumber,
      caller_id_name: callerName,
      localStream,
      notifyOnStateChange: notifyOnStateChange || false,
      notification: this.vertoNotification,
      showMe: true,
      isHost,
      channelName,
      displayName: displayName || callerName,
      receiveStream: true,
      isHostSharedVideo,
      isVlrConnection,
      onDestroy: () => this.notification.onPrimaryCallDestroy.notify(null),
      onRTCStateChange: () => this.notification.onPrimaryCallRTCStateChange.notify(null)
    });
  }

  secondaryCallStream(stream: MediaStream, streamName: string = 'Broadcast') {
    this.isSharingVideo = true;
    const {destinationNumber} = this.sessionParams;

    this.secondarySession.call = new Call({
      callID: this.secondarySession.id,
      destination_number: `${destinationNumber}_stream`,
      caller_id_name: streamName,
      localStream: stream,
      notifyOnStateChange: false,
      notification: this.vertoNotification,
      showMe: false,
      displayName: streamName,
      receiveStream: false,
      isHost: true,
      isHostSharedVideo: true,
      onDestroy: () => this.notification.onSecondaryCallDestroy.notify(null),
      onRTCStateChange: () => this.notification.onSecondaryCallRTCStateChange.notify(null)
    });
  }

  hangupSecondaryCall() {
    this.isSharingVideo = false;
    this.secondarySession.call?.hangup();
  }

  hangupScreenShareCall() {
    if (this.secondarySession.call) {
      this.secondarySession.call.hangup();
    } else if (this.primarySession.call) {
      this.primarySession.call.hangup();
    }
  }

  hangup() {
    this.vertoNotification.onStartingHangup.notify(null);
    this.secondarySession.call?.hangup();
    this.primarySession.call?.hangup();
  }

  hasPrimaryCall() {
    return !!this.primarySession.call;
  }

  askToUnmuteParticipantMic(to: string) {
    if (this.primarySession.call && this.primarySession.conf) {
      this.primarySession.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.AskToUnmuteMic,
          from: this.primarySession.call.getId(),
          to
        })
      );
    }
  }

  toggleParticipantMic(participantId: string) {
    this.primarySession.conf?.manager
      .moderateMemberById(participantId)
      .toToggleMicrophone();
  }

  askToStartParticipantCam(to: string) {
    if (this.primarySession.call && this.primarySession.conf) {
      this.primarySession.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.AskToStartCam,
          from: this.primarySession.call.getId(),
          to
        })
      );
    }
  }

  stopParticipantCam(participantId: string) {
    this.primarySession.conf?.manager
      .moderateMemberById(participantId)
      .toToggleCamera();
  }

  removeParticipant(participantId: string) {
    this.primarySession.conf?.manager
      .moderateMemberById(participantId)
      .toBeKickedOut();
  }

  showParticipantName(participantId: string, name: string) {
    this.primarySession.conf?.manager
      .moderateMemberById(participantId)
      .toHaveVideoBannerAs(name);
  }

  sendMessageMyMicToggled(value: boolean) {
    if (this.primarySession.call && this.primarySession.conf) {
      this.primarySession.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.ToggleMyMic,
          from: this.primarySession.call.getId(),
          to: OutgoingMessageTo.Everyone,
          message: value.toString()
        })
      );
    }
  }

  togglePrimaryMic() {
    this.primarySession.call?.sendTouchTone('0');
  }

  togglePrimaryCam() {
    this.primarySession.call?.sendTouchTone('*0');
  }

  toggleSecondaryMic() {
    this.secondarySession.call?.sendTouchTone('0');
  }

  toggleSecondaryCam() {
    this.secondarySession.call?.sendTouchTone('*0');
  }

  sendMessageToEveryone(message: string) {
    if (this.primarySession.call && this.primarySession.conf) {
      this.primarySession.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.ToEveryone,
          from: this.callerDisplayName,
          to: OutgoingMessageTo.Everyone,
          message,
          fromDisplay: this.callerDisplayName
        })
      );
    }
  }

  sendMessageOneToOne(message: string, to: string) {
    if (this.primarySession.call && this.primarySession.conf) {
      this.primarySession.conf.manager.broadcastChatMessage({
        method: ChatMethod.OneToOne,
        from: this.primarySession.call.getId(),
        to,
        message,
        fromDisplay: this.callerDisplayName
      });
    }
  }

  sendMessageSwitchHostStream(to: string, username: string, password: string) {
    if (this.primarySession.call && this.primarySession.conf) {
      this.primarySession.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.SwitchHostStream,
          from: this.primarySession.call.getId(),
          to,
          message: JSON.stringify({username, password})
        })
      );

      // For old versions
      this.primarySession.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.SwitchHost,
          from: this.primarySession.call.getId(),
          to,
          message: JSON.stringify({username, password})
        })
      );
    }
  }

  sendMessageSwitchHostCamera(to: string) {
    if (this.primarySession.call && this.primarySession.conf) {
      this.primarySession.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.SwitchHostCamera,
          from: this.primarySession.call.getId(),
          to,
          message: JSON.stringify({moderator: this.primarySession.conf.manager.moderator})
        })
      );
    }
  }

  sendMessageChangeParticipantState(participantId: string, isActive: boolean) {
    if (this.primarySession.call && this.primarySession.conf) {
      this.primarySession.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.ChangeParticipantState,
          from: this.primarySession.call.getId(),
          to: OutgoingMessageTo.Everyone,
          message: JSON.stringify({participantId, isActive})
        })
      );
    }
  }

  sendMessageStreamChange(streamUrl: string, streamName: string) {
    if (this.primarySession.call && this.primarySession.conf) {
      this.primarySession.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.StreamChange,
          from: this.primarySession.call.getId(),
          to: OutgoingMessageTo.Everyone,
          message: JSON.stringify({streamUrl, streamName})
        })
      );
    }
  }

  sendMessageHostLeft() {
    if (this.primarySession.call && this.primarySession.conf) {
      this.primarySession.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.HostLeft,
          from: this.primarySession.call.getId(),
          to: OutgoingMessageTo.Everyone
        })
      );
    }
  }

  replacePrimaryTracks(stream: MediaStream) {
    this.primarySession.call?.replaceTracks(stream);
  }

  stopPrimaryVideoTrack() {
    this.primarySession.call?.stopPrimaryVideoTrack();
  }

  replaceSecondaryTracks(stream: MediaStream) {
    this.secondarySession.call?.replaceTracks(stream);
  }

  replaceTracks(stream: MediaStream) {
    if (this.secondarySession.call) {
      this.secondarySession.call.replaceTracks(stream);
    } else if (this.primarySession.call) {
      this.primarySession.call.replaceTracks(stream);
    }
  }

  increaseVolume(participantId: string) {
    if (this.primarySession.conf) {
      this.primarySession.conf.manager
        .moderateMemberById(participantId)
        .toIncreaseVolumeInput();
    }
  }

  decreaseVolume(participantId: string) {
    if (this.primarySession.conf) {
      this.primarySession.conf.manager
        .moderateMemberById(participantId)
        .toDecreaseVolumeInput();
    }
  }

  get imSharingVideo() {
    return this.isSharingVideo;
  };

  private onWsMessage(wsMessage: string) {
    try {
      const message = JSON.parse(wsMessage) || {};

      // console.log(wsMessage);

      const {jsonrpc, id, result} = message;

      if (jsonrpc === '2.0' && this.sessions[id]) {
        result
          ? this.sessions[id].onSuccess(result)
          : this.handleJSONRPCMessage(message);
      } else {
        this.handleMessage(message || {});
      }
    } catch (e) {
      console.error('Websocket data json parse error', e);
    }
  }

  private destroy() {
    this.vertoSubscription.clear();
    this.vertoWebSocket.disconnect();
  }

  private checkIfCallExists(callID: string) {
    if (this.primarySession.call?.params.callID === callID) {
      return this.primarySession.call;
    }

    if (this.secondarySession.call?.params.callID === callID) {
      return this.secondarySession.call;
    }

    return false;
  }

  private handleChannelPrivateDataMessage(data: { params: any }) {
    const {params: event} = data;

    if (
      !this.primarySession.call ||
      event.pvtData.callID !== this.primarySession.call.getId()
    ) {
      return;
    }

    switch (event.pvtData.action) {
      case 'conference-liveArray-join':
        const {
          chatChannel,
          infoChannel,
          modChannel,
          conferenceMemberID,
          role,
          laChannel,
          laName,
          callID
        } = event.pvtData;

        const confManagerCb = {
          chat: chatChannel,
          info: infoChannel,
          mod: modChannel
        };

        this.primarySession.conf = {
          creationEvent: event,
          privateEventChannel: event.eventChannel,
          memberId: conferenceMemberID,
          role,
          manager: new ConferenceManager(
            this.vertoSubscription,
            this.vertoNotification,
            confManagerCb,
            this.primarySession.call.getId()
          ),
          liveArray: new ConferenceLiveArray(
            this.vertoSubscription,
            this.vertoNotification,
            laChannel,
            laName,
            callID
          )
        };
        break;
      case 'conference-liveArray-part':
        this.destroy();
        break;
      default:
        console.warn('Not implemented private data message', data);
        break;
    }
  }

  private handleMessageForCall({method, params}: SocketMessage) {
    const existingCall = this.checkIfCallExists(params.callID);

    if (existingCall) {
      switch (method) {
        case 'verto.bye':
          existingCall.hangup(params.callID);
          break;
        case 'verto.answer':
          existingCall.handleAnswer(params.sdp);
          break;
        case 'verto.media':
          existingCall.handleMedia(params.sdp);
          break;
        case 'verto.display':
          existingCall.handleDisplay(
            params.display_name,
            params.display_number
          );
          break;
        case 'verto.info':
          existingCall.handleInfo(params);
          break;
        default:
          console.warn(
            'Ignoring existing call event with invalid method',
            method
          );
          break;
      }
    } else if (
      method === 'verto.attach' ||
      method === 'verto.invite' ||
      method === 'verto.media' ||
      method === 'verto.answer'
    ) {
    } else {
      console.warn('Ignoring call event with invalid method', method);
    }
  }

  private handleMessageForClient({method, params}: SocketMessage) {
    const channel = params.eventChannel;
    const subscription =
      channel && this.vertoSubscription.getSubscription(channel);

    switch (method) {
      case 'verto.punt':
        this.destroy();
        break;
      case 'verto.event':
        if (params?.eventData?.canvasInfo) {
          this.notification.onLayoutChange.notify(params.eventData.canvasInfo.layoutName);
        } else if (
          !subscription &&
          (channel === this.sessId ||
            (channel && this.checkIfCallExists(channel)))
        ) {
          this.vertoNotification.onPrivateEvent.notify(params);
        } else if (!subscription) {
          console.warn(
            'Ignoring event for unsubscribed channel',
            channel,
            params
          );
        } else if (!subscription || !subscription.ready) {
          console.error(
            'Ignoring event for a not ready channel',
            channel,
            params
          );
        } else if (subscription.handler) {
          if (subscription.handler.notify) {
            subscription.handler.notify(params);
          } else {
            subscription.handler(params, subscription.userData);
          }
        } else if (this.vertoNotification.onEvent.hasSubscribers()) {
          this.vertoNotification.onEvent.notify({
            d: this,
            params: params,
            userData: subscription.userData
          });
        } else {
          console.warn('Ignoring event without callback', channel, params);
        }
        break;
      case 'verto.info':
        this.vertoNotification.onInfo.notify(params);
        break;
      case 'verto.clientReady':
        break;
      default:
        console.warn('Ignoring invalid method with no call id', method);
        break;
    }
  }

  private handleMessage(data: any) {
    if (!data?.method) {
      console.error('Invalid WebSocket message', data);
      return;
    }

    if (data.params.eventType === 'channelPvtData') {
      this.handleChannelPrivateDataMessage(data);
    } else if (data.params.callID) {
      this.handleMessageForCall(data);
    } else {
      this.handleMessageForClient(data);
    }
  }

  private handleJSONRPCMessage({result, id, error}: RPCMessage) {
    if (result) {
      const {onSuccess} = this.sessions[id];
      delete this.sessions[id];
      onSuccess(result);
      return;
    }

    if (!error) {
      return;
    }

    const {onError} = this.sessions[id];
    delete this.sessions[id];
    onError && onError(error);
  }
}
