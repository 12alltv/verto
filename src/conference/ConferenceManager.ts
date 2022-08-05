import VertoSubscription from '../VertoSubscription';
import {OutgoingMessage} from '../models/OutgoingMessage';
import {ChatMethod} from '../enums';
import VertoNotification from '../VertoNotification';
import {IncomingMessage} from '../models/IncomingMessage';
import {SwitchHost} from '../models/SwitchHost';

type SubscriptionType = 'mod' | 'chat' | 'info';

type Channels = {
  chat: string;
  info: string;
  mod?: string;
};

type ConferenceManagerSubscriptions = {
  chat: { channel: string; handler: (data: any) => void; };
  info: { channel: string; handler: (data: any) => void; };
  mod?: { channel: string; handler: (data: any) => void; };
}

let gSerialNumber = 0;

export default class ConferenceManager {
  private readonly subscriptions: ConferenceManagerSubscriptions;
  private readonly serno: number;
  private readonly vertoSubscription: VertoSubscription;
  private readonly vertoNotification: VertoNotification;
  private readonly callId: string;

  constructor(vertoSubscription: VertoSubscription, vertoNotification: VertoNotification, channels: Channels, callId: string) {
    this.vertoSubscription = vertoSubscription;
    this.vertoNotification = vertoNotification;
    this.callId = callId;

    this.subscriptions = {
      chat: {channel: channels.chat, handler: this.handleChatEvent.bind(this)},
      info: {channel: channels.info, handler: this.handleInfoEvent.bind(this)}
    };

    if (channels.mod) {
      this.subscriptions.mod = {
        channel: channels.mod,
        handler: this.handleModEvent.bind(this)
      };
    }

    this.serno = gSerialNumber;
    gSerialNumber += 1;

    Object.keys(this.subscriptions).forEach((key: string) => {
      const {channel, handler} = this.subscriptions[(key as SubscriptionType)] || {};
      if (channel && handler) {
        vertoSubscription.subscribe(channel, handler);
      }
    });
  }

  setModeratorChannel(token: string) {
    this.subscriptions.mod = {
      channel: token,
      handler: this.handleModEvent.bind(this)
    };
  }

  removeModeratorChannel() {
    this.subscriptions.mod = undefined;
  }

  handleChatEvent({data}: any) {
    try {
      const {message, method, to, from, fromDisplay}: OutgoingMessage = JSON.parse(data.message);

      switch (method) {
        case ChatMethod.ToEveryone:
          message && this.vertoNotification.onChatMessageToAll.notify(new IncomingMessage(to, fromDisplay || data.fromDisplay, message, this.callId === from));
          break;
        case ChatMethod.AskToUnmuteMic:
          if (this.callId === to) {
            this.vertoNotification.onAskToUnmuteMic.notify(null);
          }
          break;
        case ChatMethod.AskToStartCam:
          if (this.callId === to) {
            this.vertoNotification.onAskToStartCam.notify(null);
          }
          break;
        case ChatMethod.OneToOne:
          if (message && (this.callId === from || this.callId === to)) {
            const sendTo = this.callId === from ? to : from;
            const im = new IncomingMessage(sendTo, fromDisplay || data.fromDisplay, message, this.callId === from);
            this.vertoNotification.onChatMessageOneToOne.notify(im);
          }
          break;
        case ChatMethod.SwitchHost:
        case ChatMethod.SwitchHostStream:
          if (this.callId === to) {
            let username = '';
            let password = '';

            if (message) {
              try {
                const m = JSON.parse(message);
                username = m.username;
                password = m.password;
              } catch (e) {
                console.error(e);
              }
            } else {
              console.error('No moderator data');
            }

            this.vertoNotification.onChatMessageSwitchHost.notify(new SwitchHost(username, password));
            this.vertoNotification.onChatMessageSwitchHostStream.notify(new SwitchHost(username, password));
          }
          break;
        case ChatMethod.SwitchHostCamera:
          if (this.callId === to) {
            this.vertoNotification.onChatMessageSwitchHostCamera.notify(null);
          }
          break;
        case ChatMethod.ChangeParticipantState:
          if (message) {
            try {
              const m = JSON.parse(message);
              this.vertoNotification.onChatMessageChangeParticipantState.notify(m);
            } catch (e) {
              console.error('Cannot parse ChangeParticipantState message');
            }
          }
          break;
        case ChatMethod.StreamChange:
          if (this.callId !== from && message) {
            try {
              const m = JSON.parse(message);
              this.vertoNotification.onChatMessageStreamChange.notify(m);
            } catch (e) {
              console.error('Cannot parse StreamChange message');
            }
          }
          break;
        case ChatMethod.MakeCoHost:
          const callIds = to.split(',');
          if (callIds.indexOf(this.callId) !== -1 && message) {
            try {
              const m = JSON.parse(message);
              m.callIds = callIds;
              this.vertoNotification.onMakeCoHost.notify(m);
            } catch (e) {
              console.error('Cannot parse MakeCoHost message');
            }
          }
          break;
        case ChatMethod.RemoveCoHost:
          if (message) {
            try {
              const m = JSON.parse(message);
              m.me = this.callId === to;
              if (m.me || m.coHostCallIds.indexOf(this.callId)) {
                this.vertoNotification.onRemoveCoHost.notify(m);
              }
            } catch (e) {
              console.error('Cannot parse RemoveCoHost message');
            }
          }
          break;
        case ChatMethod.RemoveParticipant:
          if (this.callId === to) {
            this.vertoNotification.onYouHaveBeenRemoved.notify(null);
          }
          break;
        case ChatMethod.HostLeft:
          this.vertoNotification.onHostLeft.notify(null);
          break;
        case ChatMethod.StopMediaShare:
          if (this.callId !== to) {
            this.vertoNotification.onStopMediaShare.notify(null);
          }
          break;
        case ChatMethod.StopAllMediaShare:
          if (this.callId !== from) {
            this.vertoNotification.onStopAllMediaShare.notify(null);
          }
          break;
        case ChatMethod.BlockParticipant:
          if (this.callId === to) {
            this.vertoNotification.onYouHaveBeenBlocked.notify(null);
          }
          break;
        case ChatMethod.YouAreHost:
          if (this.callId === to) {
            this.vertoNotification.onYouAreHost.notify(null);
          }
          break;
      }
    } catch (e) {
      console.error('Invalid message');
    }
  }

  handleInfoEvent(data: any) {
    this.vertoNotification.onInfo.notify(data);
  }

  handleModEvent(data: any) {
    this.vertoNotification.onModeration.notify(data);
  }

  broadcast(
    eventChannel: string,
    data: {
      command?: any;
      id?: number | null;
      value?: any;
      application?: string;
      message?: string;
      action?: string;
      type?: string;
    }
  ) {
    if (!eventChannel) {
      return;
    }

    this.vertoNotification.sendWsRequest.notify(
      {
        method: 'verto.broadcast',
        params: {eventChannel, data},
        onSuccess: () => {
        },
        onError: (e: any) => console.error(e)
      }
    );
  }

  broadcastModeratorCommand(
    command: string,
    memberId: string | null,
    argument?: string | any[]
  ) {
    if (!this.subscriptions.mod) {
      console.error('No moderator rights');
      return;
    }

    let id: number | null = null;
    if (memberId) {
      id = parseInt(memberId, 10);
    }

    this.broadcast(this.subscriptions.mod.channel, {
      command,
      id,
      value: argument,
      application: 'conf-control'
    });
  }

  broadcastRoomCommand(command: string, argument?: string | any[]) {
    this.broadcastModeratorCommand(command, null, argument);
  }

  broadcastChatMessage(message: OutgoingMessage) {
    this.broadcast(this.subscriptions.chat.channel, {
      action: 'send',
      type: 'message',
      message: JSON.stringify(message)
    });
  }

  askVideoLayouts() {
    this.broadcastRoomCommand('list-videoLayouts');
  }

  playMediaFileFromServer(filename?: string) {
    this.broadcastRoomCommand('play', filename);
  }

  stopMediaFilesFromServer() {
    this.broadcastRoomCommand('stop', 'all');
  }

  startRecordingOnServer(filename: string) {
    this.broadcastRoomCommand('recording', ['start', filename]);
  }

  stopRecordingsOnServer() {
    this.broadcastRoomCommand('recording', ['stop', 'all']);
  }

  saveSnapshotOnServer(filename?: string | string[]) {
    this.broadcastRoomCommand('vid-write-png', filename);
  }

  changeVideoLayout(layout?: string | string[], canvas?: string) {
    this.broadcastRoomCommand('vid-layout', canvas ? [layout, canvas] : layout);
  }

  moderateMemberById(memberId: string | null) {
    const constantBroadcasterFor = (command: string) => (argument?: string | any[]) => () => {
      this.broadcastModeratorCommand(command, memberId, argument);
    };

    const parameterizedBroadcasterFor = (command: string) => (
      argument?: string | any[]
    ) => {
      this.broadcastModeratorCommand(command, memberId, argument);
    };

    const parameterizedBroadcasterForSettingVideoBanner = (text: string) => {
      // this.broadcastModeratorCommand('vid-banner', memberId, 'reset');

      if (text.trim().toLowerCase() === 'reset') {
        this.broadcastModeratorCommand('vid-banner', memberId, `${text}\n`);
      } else {
        this.broadcastModeratorCommand('vid-banner', memberId, encodeURI(text));
      }
    };

    const constantBroadcasterForCleaningVideoBanner = () => {
      this.broadcastModeratorCommand('vid-banner', memberId, 'reset');
    };

    return {
      toBeNotDeaf: constantBroadcasterFor('undeaf')(),
      toBeDeaf: constantBroadcasterFor('deaf')(),
      toBeKickedOut: constantBroadcasterFor('kick')(),
      toToggleMicrophone: constantBroadcasterFor('tmute')(),
      toToggleCamera: constantBroadcasterFor('tvmute')(),
      toBePresenter: constantBroadcasterFor('vid-res-id')('presenter'),
      toBeVideoFloor: constantBroadcasterFor('vid-floor')('force'),
      toHaveVideoBannerAs: parameterizedBroadcasterForSettingVideoBanner,
      toCleanVideoBanner: constantBroadcasterForCleaningVideoBanner,
      toIncreaseVolumeOutput: constantBroadcasterFor('volume_out')('up'),
      toDecreaseVolumeOutput: constantBroadcasterFor('volume_out')('down'),
      toIncreaseVolumeInput: constantBroadcasterFor('volume_in')('up'),
      toDecreaseVolumeInput: constantBroadcasterFor('volume_in')('down'),
      toTransferTo: parameterizedBroadcasterFor('transfer')
    };
  }
}
