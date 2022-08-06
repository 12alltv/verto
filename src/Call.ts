import VertoRTC from './webrtc/VertoRTC';
import {ENUM} from './utils';
import {VertoCallParams} from './types';

interface CallParams extends VertoCallParams {
  remote_caller_id_name: string;
  remote_caller_id_number: string;
  callID: string;
  attach?: boolean;
  login?: string;
  caller_id_number?: string;
  dedEnc: boolean;
  userVariables: any;
  screenShare: boolean;
  receiveStream: boolean;
}

export default class Call {
  readonly params: CallParams;
  private lastState: { val: number; name: string };
  private state: { val: number; name: string };
  private causeCode: any;
  private cause: any;
  private gotAnswer: boolean = false;
  private gotEarly: any;
  private ringer: any;
  private rtc?: VertoRTC;

  constructor(params: VertoCallParams) {
    const {
      destination_number,
      showMe,
      isHost,
      isHostSharedVideo,
      channelName,
      displayName,
      isPrimaryCall,
      userId,
      isIos
    } = params;

    this.params = {
      remote_caller_id_name: 'OUTBOUND CALL',
      remote_caller_id_number: destination_number,
      screenShare: false,
      dedEnc: false,
      userVariables: {
        showMe,
        isHost,
        isHostSharedVideo,
        channelName,
        displayName,
        isPrimaryCall: isPrimaryCall || false,
        userId: `${userId}`,
        isIos
      },
      ...params
    };

    this.lastState = ENUM.state.new;
    this.state = this.lastState;

    this.params.remote_caller_id_name = 'OUTBOUND CALL';
    this.params.remote_caller_id_number = this.params.destination_number;

    this.bootstrapRealtimeConnection();
  }

  bootstrapRealtimeConnection() {
    const callbacks = {
      onIceSdp: () => {
        if (!this.rtc) {
          throw new Error('RTC is not initialized');
        }

        const {requesting, answering, active} = ENUM.state;

        if ([requesting, answering, active].includes(this.state)) {
          console.error('This ICE SDP should not being received, reload your page!');
          return;
        }

        let sdp = this.rtc.mediaData.SDP;

        // Check if H264 is supported
        const h264Codec = sdp.match(/a=rtpmap:(\d+) H264/);

        // If H264 is supported remove all others codec
        if (h264Codec && h264Codec.length > 1) {
          const sdpSplit = sdp.split('\n');

          for (let i = 0; i < sdpSplit.length; i++) {
            const line = sdpSplit[i];
            // const fmtp = line.match(/^a=fmtp:(\d+)/);
            // if (fmtp) {
            //   sdpSplit[i] = sdpSplit[i] + `\na=fmtp:${fmtp[1]} max-fr=30;max-recv-width=320;max-recv-height=180`;
            //   continue;
            // }

            const videoMatch = line.match(/^(m=video \d+ [^ ]+ )/g);
            if (videoMatch) {
              sdpSplit[i] = `${videoMatch[0]}${h264Codec[1]}`;
              break;
            }
          }

          sdp = sdpSplit.join('\n');
        }

        const options = {sdp};

        if (this.rtc.type === 'offer') {
          if (this.state === active) {
            this.setState(requesting);
            this.broadcastMethod('verto.attach', options);
          } else {
            this.setState(requesting);
            this.broadcastMethod('verto.invite', options);
          }
        } else {
          this.setState(answering);
          this.broadcastMethod(
            this.params.attach ? 'verto.attach' : 'verto.answer',
            options,
          );
        }
      },
      onPeerStreamingError: (error: any) => {
        this.params.notification.onPeerStreamingError.notify(error);
        this.hangup({cause: 'Device or Permission Error'});
      },
    };

    const {iceServers, localStream, notification, receiveStream, notifyOnStateChange, onRTCStateChange, onReceiveStream} = this.params;

    this.rtc = new VertoRTC({
      iceServers,
      callbacks,
      localStream,
      notifyOnStateChange,
      notification,
      receiveStream,
      onStateChange: onRTCStateChange,
      onReceiveStream
    });

    this.rtc.inviteRemotePeerConnection();
  }

  broadcastMethod(
    method: string,
    options: {
      [x: string]: any;
      sdp?: any;
      dtmf?: any;
      txt?: { code: any; chars: any };
      noDialogParams?: any;
      action?: string;
      destination?: any;
      msg?: { from: any; to: any; body: any };
    },
  ) {
    const {noDialogParams, ...methodParams} = options;

    const dialogParams = Object.keys(this.params).reduce(
      (accumulator, currentKey) => {
        if (
          currentKey === 'sdp' &&
          method !== 'verto.invite' &&
          method !== 'verto.attach'
        ) {
          return accumulator;
        }

        if (currentKey === 'callID' && noDialogParams === true) {
          return accumulator;
        }

        // @ts-ignore
        return {...accumulator, [currentKey]: this.params[currentKey]};
      },
      {},
    );

    this.params.notification.sendWsRequest.notify({
        method,
        params: {
          ...methodParams,
          dialogParams,
        },
        onSuccess: (x: any) => this.handleMethodResponse(method, true, x),
        onError: (x: any) => this.handleMethodResponse(method, false, x),
      }
    );
  }

  setState(state: { name: any; val: number }) {
    if (this.state === ENUM.state.ringing) {
      this.stopRinging();
    }

    const checkStateChange = state === ENUM.state.purge || ENUM.states[this.state.name][state.name];
    if (this.state === state || !checkStateChange) {
      console.error(`Invalid call state change from ${this.state.name} to ${state.name}. ${this}`);
      this.hangup();
      return false;
    }

    this.lastState = this.state;
    this.state = state;

    this.params.notification.onCallStateChange.notify({
      previous: this.lastState,
      current: this.state,
    });

    const isAfterRequesting = this.lastState.val > ENUM.state.requesting.val;
    const isBeforeHangup = this.lastState.val < ENUM.state.hangup.val;

    switch (this.state) {
      case ENUM.state.purge:
        this.setState(ENUM.state.destroy);
        break;

      case ENUM.state.hangup:
        if (isAfterRequesting && isBeforeHangup) {
          this.broadcastMethod('verto.bye', {});
        }

        this.setState(ENUM.state.destroy);
        break;

      case ENUM.state.destroy:
        this.rtc?.stop();
        this.params.notification.onDestroy.notify(null);
        this.params.onDestroy && this.params.onDestroy();
        break;

      case ENUM.state.early:
      case ENUM.state.active:
      case ENUM.state.trying:
      default:
        break;
    }

    return true;
  }

  stopRtc() {
    this.broadcastMethod('verto.bye', {});
    this.rtc?.stop();
  }

  handleMethodResponse(
    method: string,
    success: boolean,
    response: any
  ) {
    switch (method) {
      case 'verto.answer':
      case 'verto.attach':
        if (success) {
          this.setState(ENUM.state.active);
        } else {
          this.hangup();
        }
        break;

      case 'verto.invite':
        if (success) {
          this.setState(ENUM.state.trying);
        } else {
          this.setState(ENUM.state.destroy);
        }
        break;

      case 'verto.bye':
        this.hangup();
        if (success) {
          this.params.notification.onUserHangup.notify(null);
        } else {
          console.error(`Method ${method}`, response);
          this.params.notification.onHangupError.notify({errorMessage: response.message});
        }
        break;

      case 'verto.modify':
        if (response.holdState === 'held' && this.state !== ENUM.state.held) {
          this.setState(ENUM.state.held);
        }

        if (
          response.holdState === 'active' &&
          this.state !== ENUM.state.active
        ) {
          this.setState(ENUM.state.active);
        }
        break;

      default:
        break;
    }
  }

  hangup(params?: { cause: any; causeCode?: any }) {
    if (params) {
      this.causeCode = params.causeCode;
      this.cause = params.cause;
    }

    if (!this.cause && !this.causeCode) {
      this.cause = 'NORMAL_CLEARING';
    }


    const isNotNew = this.state.val >= ENUM.state.new.val;
    const didntHangupYet = this.state.val < ENUM.state.hangup.val;
    if (isNotNew && didntHangupYet) {
      this.setState(ENUM.state.hangup);
    }

    const didntDestroyYet = this.state.val < ENUM.state.destroy;
    if (didntDestroyYet) {
      this.setState(ENUM.state.destroy);
    }
  }

  stopRinging() {
    if (!this.ringer) {
      return;
    }

    this.ringer
      .getTracks()
      .forEach((ringer: { stop: () => any }) => ringer.stop());
  }

  indicateRing() {
    if (!this.ringer) {
      console.warn(`Call is ringing, but no ringer set. ${this}`);
      return;
    }

    // if (!this.ringer.src && this.verto.options.ringFile) {
    //   this.verto.ringer.src = this.verto.options.ringFile;
    // }

    this.ringer.play();

    setTimeout(() => {
      this.stopRinging();
      if (this.state === ENUM.state.ringing) {
        this.indicateRing();
      } else {
        console.warn(`Call stopped ringing, but no ringer set. ${this}`);
      }
    }, 6000);
  }

  ring() {
    this.setState(ENUM.state.ringing);
    this.indicateRing();
  }

  sendTouchTone(digit: string) {
    this.broadcastMethod('verto.info', {dtmf: digit});
  }

  sendRealTimeText({code, chars}: any) {
    this.broadcastMethod('verto.info', {
      txt: {code, chars},
      noDialogParams: true,
    });
  }

  transferTo(destination: any) {
    this.broadcastMethod('verto.modify', {action: 'transfer', destination});
  }

  hold() {
    this.broadcastMethod('verto.modify', {action: 'hold'});
  }

  unhold() {
    this.broadcastMethod('verto.modify', {action: 'unhold'});
  }

  toggleHold() {
    this.broadcastMethod('verto.modify', {action: 'toggleHold'});
  }

  sendMessageTo(to: any, body: any) {
    this.broadcastMethod('verto.info', {
      msg: {from: this.params.login, to, body},
    });
  }

  handleAnswer(sdp: any) {
    this.gotAnswer = true;

    if (this.state.val >= ENUM.state.active.val) {
      return;
    }

    const afterOrAtEarly = this.state.val >= ENUM.state.early.val;
    if (afterOrAtEarly) {
      this.setState(ENUM.state.active);
      return;
    }

    const shouldDelayForNow = this.gotEarly;
    if (shouldDelayForNow) {
      return;
    }

    this.rtc?.answer(
      sdp,
      () => {
        this.setState(ENUM.state.active);
      },
      (error: any) => {
        console.error('Error while answering', error);
        this.hangup();
      },
    );
  }

  getDestinationNumber() {
    return this.params.destination_number;
  }

  getCallerName() {
    return this.params.caller_id_name;
  }

  getId() {
    return this.params.callID;
  }

  getCallerIdentification({useCaracterEntities}: any) {
    return [
      this.params.remote_caller_id_name,
      ' ',
      useCaracterEntities ? '&lt;' : '<',
      this.params.remote_caller_id_number,
      useCaracterEntities ? '&gt;' : '>',
    ].join('');
  }

  handleInfo(params: any) {
    this.params.notification.onInfo.notify(params);
  }

  handleDisplay(displayName?: any, displayNumber?: any) {
    if (displayName !== undefined) {
      this.params.remote_caller_id_name = displayName;
    }

    if (displayNumber !== undefined) {
      this.params.remote_caller_id_number = displayNumber;
    }

    this.params.notification.onDisplay.notify({
      name: displayName,
      number: displayNumber,
    });
  }

  handleMedia(sdp: string) {
    if (this.state.val >= ENUM.state.early.val) {
      return;
    }

    this.gotEarly = true;

    this.rtc?.answer(
      sdp,
      () => {
        this.setState(ENUM.state.early);

        if (this.gotAnswer) {
          this.setState(ENUM.state.active);
        }
      },
      (error: any) => {
        console.error('Error on answering early', error);
        this.params.notification.onEarlyCallError.notify(null);
        this.hangup();
      },
    );
  }

  replaceTracks(stream: MediaStream) {
    this.rtc?.replaceTracks(stream);
  }

  toString() {
    const {
      callID: id,
      destination_number: destination,
      caller_id_name: callerName,
      caller_id_number: callerNumber,
      remote_caller_id_name: calleeName,
      remote_caller_id_number: calleeNumber,
    } = this.params;

    const attributes = [
      {key: 'id', value: id},
      {key: 'destination', value: destination},
      {key: 'from', value: `${callerName} (${callerNumber})`},
      {key: 'to', value: `${calleeName} (${calleeNumber})`},
    ]
      .map(({key, value}) => `${key}: "${value}"`)
      .join(', ');
    return `Call<${attributes}>`;
  }
}
