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
  callerName: string;
  destinationNumber: string;
  localStream: MediaStream;
  secondary?: boolean;
  changeLayout?: boolean;
  displayName: string;
  channelName?: string;
  moderatorUsername?: string;
  moderatorPassword?: string;
  fsUrl: string;
  isHost?: boolean;
  isHostSharedVideo?: boolean;
  notifyOnStateChange?: boolean;
  isVlrConnection?: boolean;
};

export type VertoCallParams = {
  callID: string;
  caller_id_name: string;
  destination_number: string;
  localStream: MediaStream;
  notifyOnStateChange: boolean;
  notification: VertoNotification;
  showMe: boolean;
  displayName: string;
  isHostSharedVideo?: boolean;
  receiveStream: boolean;
  isHost?: boolean;
  channelName?: string;
  isVlrConnection?: boolean;
  onDestroy: () => void;
  onRTCStateChange: () => void;
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
