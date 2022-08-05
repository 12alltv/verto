import {Session, VertoLayout, VertoSessionParams} from './types';

import {generateNanoId} from './utils';

import Call from './Call';
import ConferenceManager from './conference/ConferenceManager';
import ConferenceLiveArray from './conference/ConferenceLiveArray';

import VertoNotification from './VertoNotification';
import VertoSubscription from './VertoSubscription';
import VertoWebSocket from './VertoWebSocket';
import {ChatMethod} from './enums';
import {OutgoingMessage, OutgoingMessageTo} from './models/OutgoingMessage';
import Participant from './models/Participant';
import {RestService} from './services';
import BaseService from "./services/BaseService";

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

type Connection = {
  id: string;
  call: Call;
};

type SecondaryCallParams = {
  stream: MediaStream,
  channelName: string,
  receiveStream: boolean
};

export default class VertoSession {
  private sessId: string = generateNanoId();
  private readonly sessionParams: VertoSessionParams;

  private sessions: Session = {};
  private primaryConnection: { id: string; call: Call | null; conf: Conf | null } = {
    id: generateNanoId(),
    call: null,
    conf: null
  };
  private secondaryConnection: { id: string; call: Call | null } = {
    id: generateNanoId(),
    call: null
  };
  private connections: Connection[] = [];
  private vertoNotification = new VertoNotification();
  private vertoSubscription = new VertoSubscription(this.vertoNotification);
  private vertoWebSocket: VertoWebSocket;
  private modToken: string | null = null;
  private defaultLayout: VertoLayout | null = null;
  private caller = '';

  constructor(params: VertoSessionParams) {
    BaseService.apiUrl = params.apiUrl;
    this.sessionParams = params;
    const loginUrl = params.fsUrl.replace('wss://', '').replace('/', '');
    this.vertoWebSocket = new VertoWebSocket(
      this.sessId,
      this.vertoNotification,
      this.sessionParams.moderatorUsername || `1008@${loginUrl}`,
      this.sessionParams.moderatorPassword,
      this.sessionParams.fsUrl,
      params.platforms
    );
    this.vertoNotification.onFSLogged.subscribe(() => {
      if (params.secondary && params.channelName) {
        this.secondaryCall({
          stream: params.localStream,
          channelName: params.channelName,
          receiveStream: true
        });
      } else {
        this.primaryCall();
      }

      if (params.giveFloor) {
        this.vertoNotification.onBootstrappedParticipants.subscribe(
          (participants: Participant[]) => {
            const id = this.secondaryConnection.call?.getId() || this.primaryConnection.call?.getId();

            if (id) {
              const sharedSession = participants.find(({callId}: Participant) => id === callId);
              if (sharedSession && this.primaryConnection.conf) {
                this.primaryConnection.conf.manager
                  .moderateMemberById(sharedSession.participantId)
                  .toBeVideoFloor();
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
  }

  get notification() {
    return this.vertoNotification;
  }

  get callerName() {
    return this.caller;
  }

  disconnectWebSocket() {
    this.vertoWebSocket.disconnect();
  }

  reconnectWebSocket() {
    this.vertoWebSocket.reconnect();
  }

  giveParticipantFloor(participantId: string) {
    if (this.primaryConnection.conf) {
      this.primaryConnection.conf.manager
        .moderateMemberById(participantId)
        .toBeVideoFloor();
    }
  }

  changeLayout(layout?: VertoLayout) {
    if (layout) {
      this.primaryConnection.conf?.manager.changeVideoLayout(layout);
    } else {
      const getDefaultLayout = async () => {
        if (!this.defaultLayout) {
          const {data} = await RestService.getDefaultLayout();
          this.defaultLayout = data.layout;
        }

        this.primaryConnection.conf?.manager.changeVideoLayout(this.defaultLayout);
      };

      getDefaultLayout().catch();
    }
  }

  primaryCall() {
    const {
      streamNumber,
      callerName,
      isHost,
      channelName,
      displayName,
      realNumber,
      localStream,
      isHostSharedVideo,
      notifyOnStateChange,
      receivePrimaryCallStream,
      userId,
      isIos
    } = this.sessionParams;

    this.caller = callerName || `User_${new Date().getUTCMilliseconds()}`;

    this.primaryConnection.call = new Call({
      callID: this.primaryConnection.id,
      destination_number: isHostSharedVideo ? (streamNumber as string) : realNumber,
      caller_id_name: this.caller,
      localStream,
      notifyOnStateChange: notifyOnStateChange || false,
      notification: this.vertoNotification,
      showMe: true,
      isHost,
      channelName,
      displayName: displayName || this.caller,
      receiveStream: receivePrimaryCallStream === undefined ? true : receivePrimaryCallStream,
      isHostSharedVideo,
      isPrimaryCall: true,
      userId,
      isIos,
      onDestroy: () => this.notification.onPrimaryCallDestroy.notify(null),
      onRTCStateChange: () => this.notification.onPrimaryCallRTCStateChange.notify(null),
      onReceiveStream: (stream) => this.notification.onPrimaryCallReceiveStream.notify(stream)
    });
  }

  secondaryCall({stream, channelName, receiveStream}: SecondaryCallParams) {
    const {streamNumber, userId, isIos} = this.sessionParams;
    this.secondaryConnection.call = new Call({
      callID: this.secondaryConnection.id,
      destination_number: streamNumber as string,
      caller_id_name: channelName,
      localStream: stream,
      notifyOnStateChange: false,
      notification: this.vertoNotification,
      showMe: false,
      isHostSharedVideo: true,
      displayName: channelName,
      receiveStream,
      isHost: false,
      userId,
      isIos,
      onDestroy: () => this.notification.onSecondaryCallDestroy.notify(null),
      onRTCStateChange: () => this.notification.onSecondaryCallRTCStateChange.notify(null),
      onReceiveStream: (stream) => this.notification.onSecondaryCallReceiveStream.notify(stream)
    });
  }

  secondaryCallStream(stream: MediaStream, streamName: string = 'Broadcast', mediaShare: boolean = false) {
    const {streamNumber, userId} = this.sessionParams;
    this.secondaryConnection.call = new Call({
      callID: this.secondaryConnection.id,
      destination_number: streamNumber as string,
      caller_id_name: streamName,
      localStream: stream,
      notifyOnStateChange: mediaShare,
      notification: this.vertoNotification,
      showMe: false,
      displayName: streamName,
      receiveStream: false,
      isHost: true,
      isHostSharedVideo: true,
      userId,
      onDestroy: () => this.notification.onSecondaryCallDestroy.notify(null),
      onRTCStateChange: () => this.notification.onSecondaryCallRTCStateChange.notify(null),
      onReceiveStream: (stream) => this.notification.onSecondaryCallReceiveStream.notify(stream)
    });
  }

  addConnection(stream: MediaStream, caller: string) {
    const id = generateNanoId();
    this.connections.push({
      id,
      call: new Call({
        callID: id,
        destination_number: this.sessionParams.realNumber,
        caller_id_name: caller,
        localStream: stream,
        notifyOnStateChange: true,
        notification: this.vertoNotification,
        showMe: true,
        displayName: caller,
        receiveStream: false
      })
    });
  }

  hasSecondaryCall() {
    return !!this.secondaryConnection.call;
  }

  hangupSecondaryCall() {
    this.secondaryConnection.call?.hangup();
  }

  hangupScreenShareCall() {
    if (this.secondaryConnection.call) {
      this.secondaryConnection.call.hangup();
    } else if (this.primaryConnection.call) {
      this.primaryConnection.call.hangup();
    }
  }

  hangup() {
    this.vertoNotification.onStartingHangup.notify(null);
    this.connections.forEach(c => c.call.hangup());
    this.secondaryConnection.call?.hangup();
    this.primaryConnection.call?.hangup();
  }

  askToUnmuteParticipantMic(to: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.AskToUnmuteMic,
          from: this.primaryConnection.call.getId(),
          to
        })
      );
    }
  }

  toggleParticipantMic(participantId: string) {
    this.primaryConnection.conf?.manager
      .moderateMemberById(participantId)
      .toToggleMicrophone();
  }

  askToStartParticipantCam(to: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.AskToStartCam,
          from: this.primaryConnection.call.getId(),
          to
        })
      );
    }
  }

  stopParticipantCam(participantId: string) {
    this.primaryConnection.conf?.manager
      .moderateMemberById(participantId)
      .toToggleCamera();
  }

  removeParticipant(participantId: string) {
    this.primaryConnection.conf?.manager
      .moderateMemberById(participantId)
      .toBeKickedOut();
  }

  togglePrimaryMic() {
    this.primaryConnection.call?.sendTouchTone('0');
  }

  togglePrimaryCam() {
    this.primaryConnection.call?.sendTouchTone('*0');
  }

  toggleSecondaryMic() {
    this.secondaryConnection.call?.sendTouchTone('0');
  }

  toggleSecondaryCam() {
    this.secondaryConnection.call?.sendTouchTone('*0');
  }

  sendMessageMyMicToggled(value: boolean) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.ToggleMyMic,
          from: this.primaryConnection.call.getId(),
          to: OutgoingMessageTo.Everyone,
          message: value.toString()
        })
      );
    }
  }

  sendMessageToEveryone(message: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.ToEveryone,
          from: this.caller,
          to: OutgoingMessageTo.Everyone,
          message,
          fromDisplay: this.caller
        })
      );
    }
  }

  sendMessageOneToOne(message: string, to: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.OneToOne,
          from: this.primaryConnection.call.getId(),
          to,
          message,
          fromDisplay: this.caller
        })
      );
    }
  }

  sendMessageSwitchHostStream(to: string, username: string, password: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.SwitchHostStream,
          from: this.primaryConnection.call.getId(),
          to,
          message: JSON.stringify({username, password})
        })
      );

      // For old versions
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.SwitchHost,
          from: this.primaryConnection.call.getId(),
          to,
          message: JSON.stringify({username, password})
        })
      );
    }
  }

  sendMessageSwitchHostCamera(to: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.SwitchHostCamera,
          from: this.primaryConnection.call.getId(),
          to
        })
      );
    }
  }

  sendMessageStreamChange(streamUrl: string, streamName: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.StreamChange,
          from: this.primaryConnection.call.getId(),
          to: OutgoingMessageTo.Everyone,
          message: JSON.stringify({streamUrl, streamName})
        })
      );
    }
  }

  sendMessageMakeCoHost(to: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf && this.modToken) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.MakeCoHost,
          from: this.primaryConnection.call.getId(),
          to,
          message: JSON.stringify({token: this.modToken})
        })
      );
    }
  }

  sendMessageRemoveCoHost(to: string, coHostCallIds: string[]) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.RemoveCoHost,
          from: this.primaryConnection.call.getId(),
          to,
          message: JSON.stringify({coHostCallIds})
        })
      );
    }
  }

  sendMessageYouHaveBeenRemoved(to: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.RemoveParticipant,
          from: this.primaryConnection.call.getId(),
          to
        })
      );
    }
  }

  sendMessageYouHaveBeenBlocked(to: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.BlockParticipant,
          from: this.primaryConnection.call.getId(),
          to
        })
      );
    }
  }

  sendMessageStopMediaShare(to: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.StopMediaShare,
          from: this.primaryConnection.call.getId(),
          to
        })
      );
    }
  }

  sendMessageHostLeft() {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.HostLeft,
          from: this.primaryConnection.call.getId(),
          to: OutgoingMessageTo.Everyone
        })
      );
    }
  }

  sendMessageStopAllMediaShare() {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.StopAllMediaShare,
          from: this.primaryConnection.call.getId(),
          to: OutgoingMessageTo.Everyone
        })
      );
    }
  }

  sendMessageYouAreHost(callId: string) {
    if (this.primaryConnection.call && this.primaryConnection.conf) {
      this.primaryConnection.conf.manager.broadcastChatMessage(
        new OutgoingMessage({
          method: ChatMethod.YouAreHost,
          from: this.primaryConnection.call.getId(),
          to: callId
        })
      );
    }
  }

  setModeratorToken(token: string) {
    this.primaryConnection.conf?.manager.setModeratorChannel(token);
  }

  removeModeratorToken() {
    this.primaryConnection.conf?.manager.removeModeratorChannel();
  }

  replacePrimaryTracks(stream: MediaStream) {
    this.primaryConnection.call?.replaceTracks(stream);
  }

  replaceSecondaryTracks(stream: MediaStream) {
    this.secondaryConnection.call?.replaceTracks(stream);
  }

  replaceTracks(stream: MediaStream) {
    if (this.secondaryConnection.call) {
      this.secondaryConnection.call.replaceTracks(stream);
    } else if (this.primaryConnection.call) {
      this.primaryConnection.call.replaceTracks(stream);
    }
  }

  replacePrimaryVideoSecondaryAudioTrack(
    audio: MediaStreamTrack,
    video: MediaStreamTrack
  ) {
    if (!this.primaryConnection.call || !this.secondaryConnection.call) {
      console.error('No primary or secondary call');
      return;
    }

    this.primaryConnection.call.replaceTracks(new MediaStream([video]));
    this.secondaryConnection.call.replaceTracks(new MediaStream([audio]));
  }

  increaseVolume(participantId: string) {
    if (this.primaryConnection.conf) {
      this.primaryConnection.conf.manager
        .moderateMemberById(participantId)
        .toIncreaseVolumeInput();
    }
  }

  decreaseVolume(participantId: string) {
    if (this.primaryConnection.conf) {
      this.primaryConnection.conf.manager
        .moderateMemberById(participantId)
        .toDecreaseVolumeInput();
    }
  }

  private onWsMessage(event: MessageEvent) {
    try {
      const message = JSON.parse(event.data) || {};

      // console.log(event.data);

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
    // this.secondary.call?.setState(ENUM.state.purge);
    // this.primary.call?.setState(ENUM.state.purge);
    this.vertoSubscription.clear();
    // this.vertoNotification.onDestroy.notify(null);
    this.disconnectWebSocket();
  }

  private checkIfCallExists(callID: string) {
    if (this.primaryConnection.call?.params.callID === callID) {
      return this.primaryConnection.call;
    }

    if (this.secondaryConnection.call?.params.callID === callID) {
      return this.secondaryConnection.call;
    }

    const connection = this.connections.find(c => c.call.params.callID === callID);
    if (connection) {
      return connection.call;
    }

    return false;
  }

  private handleChannelPrivateDataMessage(data: { params: any }) {
    const {params: event} = data;

    if (
      !this.primaryConnection.call ||
      event.pvtData.callID !== this.primaryConnection.call.getId()
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

        this.modToken = modChannel;

        const confManagerCb = {
          chat: chatChannel,
          info: infoChannel,
          mod: modChannel
        };
        this.primaryConnection.conf = {
          creationEvent: event,
          privateEventChannel: event.eventChannel,
          memberId: conferenceMemberID,
          role,
          manager: new ConferenceManager(
            this.vertoSubscription,
            this.vertoNotification,
            confManagerCb,
            this.primaryConnection.call.getId()
          ),
          liveArray: new ConferenceLiveArray(
            this.vertoSubscription,
            this.vertoNotification,
            laChannel,
            laName,
            callID
          )
        };
        this.primaryConnection.conf.liveArray.setSecondaryCallId(this.secondaryConnection.id);
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
          console.log(
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
