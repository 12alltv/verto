import {IceServer} from '../../shared/types';
import {IceServerService} from '../../services';

type Options = {
  stream: MediaStream;
  constraints: RTCOfferOptions;
  onPeerStreamingError: (error: any) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onStateChange: () => void;
  onIceSdp: (sessionDescription: RTCSessionDescription) => void;
  onOfferSdp: (sessionDescription: RTCSessionDescriptionInit) => void;
}

let iceServers: IceServer[];

export default class FSRTCPeerConnection {
  private readonly options: Options;
  private pc: RTCPeerConnection | null = null;

  constructor(options: Options) {
    this.options = options;
    this.init().catch();
  }

  private async init() {
    const {
      stream,
      constraints,
      onIceSdp,
      onRemoteStream,
      onStateChange,
      onPeerStreamingError,
      onOfferSdp
    } = this.options;

    if (!iceServers) {
      try {
        const {data} = await IceServerService.getIceServers();
        iceServers = data;
      } catch (e) {
      }
    }

    this.pc = new RTCPeerConnection({iceServers});

    const tracks = stream.getTracks();
    if (tracks.length === 1) {
      if (stream.getAudioTracks().length > 0) {
        this.pc.addTrack(stream.getAudioTracks()[0]);
      } else {
        throw new Error('Audio stream is a must');
      }
    } else if (tracks.length === 2) {
      this.pc.addTrack(stream.getAudioTracks()[0]);
      this.pc.addTrack(stream.getVideoTracks()[0]);
    } else {
      throw new Error('Invalid tracks');
    }

    let addedTracks = 0;
    let iceCandidateTimeout: NodeJS.Timeout;
    const handleIceCandidateDone = () => {
      this.pc?.removeEventListener('icecandidate', listeners.icecandidate);
      this.pc?.localDescription && onIceSdp(this.pc.localDescription);
    };
    const listeners = {
      icecandidate: ({candidate}: RTCPeerConnectionIceEvent) => {
        iceCandidateTimeout && clearTimeout(iceCandidateTimeout);
        if (!candidate) {
          handleIceCandidateDone();
        } else {
          iceCandidateTimeout = setTimeout(handleIceCandidateDone, 1000);
        }
      },
      track: ({streams: [remote]}: RTCTrackEvent) => {
        if (remote) {
          onRemoteStream(remote);
          addedTracks++;
          if (tracks.length === addedTracks) {
            this.pc?.removeEventListener('track', listeners.track);
          }
        }
      },
      connectionstatechange: () => {
        this.pc?.removeEventListener('connectionstatechange', listeners.connectionstatechange);
        onStateChange();
      }
    };

    this.pc.addEventListener('icecandidate', listeners.icecandidate);
    this.pc.addEventListener('track', listeners.track);
    this.pc.addEventListener('connectionstatechange', listeners.connectionstatechange);

    try {
      const sessionDescription = await this.pc.createOffer(constraints);
      await this.pc.setLocalDescription(sessionDescription);
      onOfferSdp(sessionDescription);
    } catch (e) {
      onPeerStreamingError(e);
    }
  }

  addAnswerSDP(sdp: { sdp: string, type: any }, cbSuccess: any, cbError: any) {
    const {onPeerStreamingError} = this.options;

    this.pc?.setRemoteDescription(new RTCSessionDescription(sdp))
      .then(cbSuccess || ((...arg) => console.log(arg)))
      .catch(cbError || onPeerStreamingError);
  }

  stop() {
    this.pc?.close();
  }

  replaceTracks(stream: MediaStream) {
    stream.getTracks().forEach((track: MediaStreamTrack) => {
      const sender = this.pc?.getSenders().find((s: RTCRtpSender) => s.track?.kind === track.kind);
      if (sender) {
        sender
          .replaceTrack(track)
          .catch(err => console.error(err));
      }
    });
  }
}
