import FSRTCPeerConnection from './FSRTCPeerConnection';
import VertoNotification from '../VertoNotification';

type VertoRTCOptions = {
  notifyOnStateChange: boolean;
  localStream: MediaStream;
  callbacks: {
    onICESDP: () => void;
    onPeerStreamingError: (err: any) => void;
  };
  notification: VertoNotification;
  receiveStream: boolean;
  onStateChange: () => void;
};

export default class VertoRTC {
  type: string | undefined;
  mediaData: {
    profile: {};
    candidateList: any[];
    SDP: string;
    candidate: any;
  };
  private readonly options: VertoRTCOptions;
  private peer?: FSRTCPeerConnection;

  constructor(options: VertoRTCOptions) {
    this.options = options;

    this.mediaData = {
      SDP: '',
      profile: {},
      candidateList: [],
      candidate: null
    };
  }

  answer(sdp: string, onSuccess: Function, onError: Function) {
    this.peer?.addAnswerSDP({sdp, type: 'answer'}, onSuccess, onError);
  }

  stop() {
    this.options.localStream
      .getTracks()
      .forEach((track: MediaStreamTrack) => track.stop());

    this.peer?.stop();
  }

  stopPrimaryVideoTrack() {
    if (this.options.localStream.getVideoTracks().length) {
      this.options.localStream.getVideoTracks()[0].stop();
    }
  }

  replaceTracks(stream: MediaStream) {
    this.peer?.replaceTracks(stream);

    if (stream.getVideoTracks().length) {
      this.stopPrimaryVideoTrack();

      this.options.localStream = new MediaStream([
        this.options.localStream.getAudioTracks()[0],
        stream.getVideoTracks()[0]
      ]);
    }
  }

  inviteRemotePeerConnection() {
    this.type = 'offer';

    const {callbacks: {onPeerStreamingError}, localStream, notifyOnStateChange, receiveStream} = this.options;
    const constraints: RTCOfferOptions = {
      offerToReceiveVideo: receiveStream,
      offerToReceiveAudio: receiveStream
    };

    const handleStream = (stream: MediaStream) => {
      this.peer = new FSRTCPeerConnection({
        stream,
        constraints,
        onPeerStreamingError,
        onIceSdp: ({sdp}: RTCSessionDescription) => {
          this.mediaData.SDP = sdp;
          this.options.callbacks.onICESDP();
        },
        onRemoteStream: (stream: MediaStream) => {
          this.options.notification.onPlayRemoteVideo.notify(stream);
        },
        onOfferSdp: ({sdp}: RTCSessionDescriptionInit) => {
          if (sdp) {
            this.mediaData.SDP = sdp;
          } else {
            console.error('onOfferSdp - no sdp');
          }
        },
        onStateChange: () => {
          notifyOnStateChange && this.options.notification.onSharedStateChange.notify(null);
          this.options.onStateChange();
        }
      });
    };

    handleStream(localStream);
  }
}
