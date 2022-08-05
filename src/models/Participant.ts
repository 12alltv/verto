type Audio = { muted: boolean; talking: boolean };
type Video = { muted: boolean; floor: boolean };

const colors = [
  '#204c72',
  '#e28679',
  '#cfd68b',
  '#8a879a',
  '#7f2524',
  '#9b9ea5',
  '#e6b300',
  '#a89b28',
  '#d7743b',
  '#571038',
  '#973367',
  '#dd7035',
  '#bd937d',
  '#fdbc5e',
  '#a27d60',
  '#89b4c4',
  '#548999',
  '#553973',
  '#aa6288',
  '#f8b703',
  '#7d3865',
  '#566f1b'
];

export interface ParticipantParams {
  callId: string;
  participantId: string;
  user: string;
  displayName: string;
  audio: Audio;
  video: Video;
  me?: boolean;
  showMe?: boolean;
  isHost?: boolean;
  channelName?: string;
  isHostSharedVideo?: boolean;
  isMobileApp?: boolean;
  isVlrConnection?: boolean;
  isCoHost?: boolean;
  isPrimaryCall?: boolean;
  userId?: number;
}

export default class Participant {
  readonly callId: string;
  readonly participantId: string;
  readonly user: string;
  readonly displayName: string;
  readonly avatar: { text: string; color: string; };
  readonly me?: boolean;
  readonly showMe?: boolean;
  readonly isHost?: boolean;
  readonly isHostSharedVideo?: boolean;
  readonly channelName?: string;
  readonly isMobileApp?: boolean;
  readonly isVlrConnection?: boolean;
  readonly isPrimaryCall?: boolean;
  readonly userId?: number;
  private _unread = 0;
  private _isActive = true;
  private _isCoHost = false;
  private _isSendingPingInterval = false;
  private _audio: Audio = { muted: true, talking: false };
  private _video: Video = { muted: true, floor: false };

  constructor(params: ParticipantParams) {
    const {
      callId,
      participantId,
      me,
      showMe,
      user,
      displayName,
      audio,
      video,
      isHost,
      isHostSharedVideo,
      channelName,
      isMobileApp,
      isVlrConnection,
      isPrimaryCall,
      userId,
      isCoHost
    } = params;
    this.callId = callId;
    this.participantId = participantId;
    this.user = user;
    this.displayName = displayName;
    this.avatar = {
      text: user.charAt(0),
      color: colors[Math.floor(Math.random() * colors.length)]
    };
    this.audio = audio;
    this.video = video;
    this.me = me;
    this.showMe = showMe;
    this.isHost = isHost;
    this.isHostSharedVideo = isHostSharedVideo;
    this.channelName = channelName;
    this.isMobileApp = isMobileApp;
    this.isVlrConnection = isVlrConnection;
    this.isPrimaryCall = isPrimaryCall;
    this.userId = userId;
    this.isCoHost = isCoHost || false;
  }

  get unread() {
    return this._unread;
  }

  set unread(value: number) {
    this._unread = value;
  }

  get isActive() {
    return this._isActive;
  }

  set isActive(value: boolean) {
    this._isActive = value;
  }

  get isCoHost() {
    return this._isCoHost;
  }

  set isCoHost(value: boolean) {
    this._isCoHost = value;
  }

  get isSendingPingInterval() {
    return this._isSendingPingInterval;
  }

  set isSendingPingInterval(value: boolean) {
    this._isSendingPingInterval = value;
  }

  get audio() {
    return this._audio;
  }

  set audio(value: Audio) {
    this._audio = value;
  }

  get video() {
    return this._video;
  }

  set video(value: Video) {
    this._video = value;
  }
}
