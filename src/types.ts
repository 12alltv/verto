import VertoNotification from './VertoNotification';

export type WsRequest = {
  method: string;
  id: number;
  jsonrpc: string;
  params: { sessid: string }
};

export type Session = {
  [id: string]: {
    request: WsRequest,
    onSuccess: (data: any) => void,
    onError?: (err?: any) => void
  }
};

export type VertoSessionParams = {
  defaultLayout: VertoLayout;
  iceServers: IceServer[];
  callerName: string;
  apiUrl: string;
  platforms: Platform[];
  changeLayout?: boolean;
  isIos: boolean;
  isVlrConnection?: boolean;
  realNumber: string;
  streamNumber?: string;
  localStream: MediaStream;
  secondary?: boolean;
  giveFloor?: boolean;
  displayName?: string;
  channelName?: string;
  moderatorUsername?: string;
  moderatorPassword: string;
  fsUrl: string;
  isHost?: boolean;
  isHostSharedVideo?: boolean;
  notifyOnStateChange?: boolean;
  receivePrimaryCallStream?: boolean;
  userId?: number;
};

export type VertoCallParams = {
  isIos: boolean;
  iceServers: IceServer[];
  callID: string;
  caller_id_name: string;
  destination_number: string;
  localStream: MediaStream;
  notifyOnStateChange: boolean;
  notification: VertoNotification;
  showMe: boolean;
  displayName: string;
  receiveStream: boolean;
  isPrimaryCall?: boolean;
  isHost?: boolean;
  isHostSharedVideo?: boolean;
  channelName?: string;
  userId?: number;
  onDestroy?: () => void;
  onRTCStateChange?: () => void;
  onReceiveStream?: (stream: MediaStream) => void;
};

export enum VertoLayout {
  OnlyVideo = '1x1',
  VideoLeftSmall = '1up_top_left+9',
  VideoLeftLarge = '1up_top_left+9_orig',
  VideoCenter = '1center_left_10_right_10_bbottom_10'
}

export type StreamSnapshot = {
  id: number;
  snapshot: string;
};

export type IceServer = {
  urls: string | string[];
  username?: string;
  password?: string;
};

export type SendWsRequest = {
  method: string,
  params: any,
  onSuccess: (data: any) => void,
  onError: (err?: any) => void
};

export type RoomLayout = {
  id: number;
  name: string;
  layout: VertoLayout;
  key: string;
  default: boolean;
};

export type Platform = "ios" | "ipad" | "iphone" | "android" | "phablet" | "tablet" | "cordova" | "capacitor" | "electron" | "pwa" | "mobile" | "mobileweb" | "desktop" | "hybrid";
