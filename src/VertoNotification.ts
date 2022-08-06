import {VertoLayout, WsRequest} from './types';
import {IncomingMessage} from './models/IncomingMessage';
import Participant from './models/Participant';
import {SwitchHost} from './models/SwitchHost';
import {SendWsRequest} from './types';

class Notification<T> {
  private id: number = 0;
  private subscribers: { [id: number]: ((data: T) => void) } = {};

  subscribe(subscription: (data: T) => void) {
    this.subscribers[this.id] = subscription;
    return this.id++;
  }

  unsubscribe(id: number) {
    delete this.subscribers[id];
  }

  unsubscribeAll() {
    this.subscribers = {};
  }

  notify(data: T) {
    Object.keys(this.subscribers).forEach((key: string) => this.subscribers[+key](data))
  }

  hasSubscribers() {
    return Object.keys(this.subscribers).length > 0;
  }
}

export default class VertoNotification {
  readonly onBootstrappedParticipants = new Notification<Participant[]>();
  readonly onAddedParticipant = new Notification<Participant>();
  readonly onModifiedParticipant = new Notification<Participant>();
  readonly onRemovedParticipant = new Notification<Participant>();
  readonly onChatMessageToAll = new Notification<IncomingMessage>();
  readonly onChatMessageOneToOne = new Notification<IncomingMessage>();
  readonly onChatMessageSwitchHost = new Notification<SwitchHost>();
  readonly onChatMessageSwitchHostStream = new Notification<SwitchHost>();
  readonly onChatMessageSwitchHostCamera = new Notification<null>();
  readonly onChatMessageChangeParticipantState = new Notification<{ participantId: string, isActive: boolean }>();
  readonly onChatMessageStreamChange = new Notification<{ streamUrl: string, streamName: string }>();
  readonly onMakeCoHost = new Notification<{ token: string, callIds: string[] }>();
  readonly onRemoveCoHost = new Notification<{ coHostCallIds: string[], me: boolean }>();
  readonly onYouHaveBeenRemoved = new Notification<null>();
  readonly onAskToUnmuteMic = new Notification<null>();
  readonly onAskToStartCam = new Notification<null>();
  readonly onInfo = new Notification<any>();
  readonly onModeration = new Notification<any>();
  readonly onDisplay = new Notification<{ name: any, number: any }>();
  readonly onCallStateChange = new Notification<{ previous: any, current: any }>();
  readonly onUserHangup = new Notification<null>();
  readonly onHangupError = new Notification<{errorMessage: string}>();
  readonly onPrimaryCallDestroy = new Notification<null>();
  readonly onSecondaryCallDestroy = new Notification<null>();
  readonly onDestroy = new Notification<null>();
  readonly onEarlyCallError = new Notification<null>();
  readonly onPeerStreamingError = new Notification<any>();
  readonly onEvent = new Notification<any>();
  readonly onPrivateEvent = new Notification<any>();
  readonly onPlayRemoteVideo = new Notification<MediaStream>();
  readonly onStateChange = new Notification<null>();
  readonly onReplaceTracksDone = new Notification<null>();
  readonly sendWsRequest = new Notification<SendWsRequest>();
  readonly onNewSession = new Notification<{ request: WsRequest, onSuccess: (data: any) => void, onError: (err?: any) => void }>();
  readonly onFreeswitchLogin = new Notification<null>();
  readonly onFreeswitchReconnectLogin = new Notification<null>();
  readonly onFreeswitchLoginError = new Notification<null>();
  readonly onWebSocketMessage = new Notification<string>();
  readonly onReplaceUserTracks = new Notification<MediaStream>();
  readonly onReplaceMediaTracks = new Notification<MediaStream>();
  readonly onPrimaryCallRTCStateChange = new Notification<null>();
  readonly onSecondaryCallRTCStateChange = new Notification<null>();
  readonly onLayoutChange = new Notification<VertoLayout>();
  readonly onPrimaryCallReceiveStream = new Notification<MediaStream>();
  readonly onSecondaryCallReceiveStream = new Notification<MediaStream>();
  readonly onStartingHangup = new Notification<null>();
  readonly onHostLeft = new Notification<null>();
  readonly onStartNewSession = new Notification<null>();
  readonly onStopMediaShare = new Notification<null>();
  readonly onStopAllMediaShare = new Notification<null>();
  readonly onYouHaveBeenBlocked = new Notification<null>();
  readonly onYouAreHost = new Notification<null>();

  readonly onShareHangup = new Notification<null>();
  readonly onPlayRemoteShareVideo = new Notification<MediaStream>();
  readonly onSharedStateChange = new Notification<null>();
  readonly failToConnectToWs = new Notification<null>();
  readonly onWebSocketReconnecting = new Notification<null>();

  removeAllSubscribers() {
    for (const property in this) {
      if (this.hasOwnProperty(property) && this[property] instanceof Notification) {
        (this[property] as any).unsubscribeAll();
      }
    }
  }
}
