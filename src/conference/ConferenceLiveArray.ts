import VertoSubscription from '../VertoSubscription';
import VertoNotification from '../VertoNotification';
import Participant, {ParticipantParams} from '../models/Participant';

export default class ConferenceLiveArray {
  private readonly vertoSubscription: VertoSubscription;
  private readonly vertoNotification: VertoNotification;
  private readonly liveArrayChannel: any;
  private readonly conferenceName: any;
  private readonly hashTable: any;
  private lastSerialNumber: number;
  private orderedCallIds: any[];
  private serialNumberErrors: number;
  private secondaryCallId: string | null = null;
  private readonly callId: string;

  constructor(
    vertoSubscription: VertoSubscription,
    vertoNotification: VertoNotification,
    liveArrayChannel: string,
    conferenceName: string,
    callId: string
  ) {
    this.vertoSubscription = vertoSubscription;
    this.vertoNotification = vertoNotification;
    this.callId = callId;
    this.hashTable = {};
    this.orderedCallIds = [];
    this.lastSerialNumber = 0;
    this.serialNumberErrors = 0;

    this.liveArrayChannel = liveArrayChannel;
    this.conferenceName = conferenceName;

    vertoSubscription.subscribe(liveArrayChannel, this.handleEvent.bind(this));

    this.bootstrap();
  }

  setSecondaryCallId(callId: string) {
    this.secondaryCallId = callId;
  }

  insertValue(
    callId: string | number,
    value: any,
    insertAt?: number | undefined
  ) {
    if (this.hashTable[callId]) {
      return;
    }

    this.hashTable[callId] = value;

    if (
      insertAt === undefined ||
      insertAt < 0 ||
      insertAt >= this.orderedCallIds.length
    ) {
      this.orderedCallIds = [...this.orderedCallIds, callId];
      return;
    }

    this.orderedCallIds = this.orderedCallIds.reduce(
      (accumulator, currentCallId, currentIndex) => {
        if (currentIndex === insertAt) {
          return [...accumulator, callId, currentCallId];
        }

        return [...accumulator, currentCallId];
      },
      []
    );
  }

  deleteValue(callId: string | number) {
    if (!this.hashTable[callId]) {
      return false;
    }

    this.orderedCallIds = this.orderedCallIds.filter(
      (existingCallId) => existingCallId !== callId
    );
    delete this.hashTable[callId];
    return true;
  }

  checkSerialNumber(serialNumber: number) {
    if (
      this.lastSerialNumber > 0 &&
      serialNumber !== this.lastSerialNumber + 1
    ) {
      this.serialNumberErrors += 1;
      if (this.serialNumberErrors < 3) {
        this.bootstrap();
      }
      return false;
    }

    if (serialNumber > 0) {
      this.lastSerialNumber = serialNumber;
    }

    return true;
  }

  handleBootingEvent(eventSerialNumber: number, dataArray: any[]) {
    if (!this.checkSerialNumber(eventSerialNumber)) {
      return;
    }

    dataArray.forEach(([callId, value]) => this.insertValue(callId, value));

    const participants: Participant[] = dataArray.map(([callId, value]) => this.parseParticipant(value, callId));

    this.vertoNotification.onBootstrappedParticipants.notify(participants);
  }

  handleAddingEvent(
    eventSerialNumber: number,
    value: string,
    callId: string,
    index?: number
  ) {
    if (!this.checkSerialNumber(eventSerialNumber)) {
      return;
    }

    this.insertValue(callId || eventSerialNumber, value, index);

    const participant = this.parseParticipant(value, callId);

    this.vertoNotification.onAddedParticipant.notify(participant);
  }

  handleModifyingEvent(
    eventSerialNumber: number,
    value: string,
    callId: string,
    index?: number
  ) {
    if (!this.checkSerialNumber(eventSerialNumber)) {
      return;
    }

    this.insertValue(callId || eventSerialNumber, value, index);

    const participant = this.parseParticipant(value, callId);

    this.vertoNotification.onModifiedParticipant.notify(participant);
  }

  handleDeleteEvent(eventSerialNumber: number, callId: string, payload: string) {
    if (!this.checkSerialNumber(eventSerialNumber)) {
      return;
    }

    const isDiffAfterBoot = this.deleteValue(callId || eventSerialNumber);
    if (!isDiffAfterBoot) {
      return;
    }

    this.vertoNotification.onRemovedParticipant.notify(this.parseParticipant(payload, callId));
  }

  handleEvent(
    event: {
      data: {
        wireSerno: any;
        arrIndex: any;
        name: string;
        data: any;
        hashKey: any;
        action: any;
      };
    }
  ) {
    const {
      wireSerno: serialNumber,
      arrIndex: arrayIndex,
      name,
      data: payload,
      hashKey: callId,
      action
    } = event.data;

    if (name !== this.conferenceName) {
      return;
    }

    switch (action) {
      case 'bootObj':
        this.handleBootingEvent(serialNumber, payload);
        break;
      case 'add':
        this.handleAddingEvent(serialNumber, payload, callId, arrayIndex);
        break;
      case 'modify':
        if (arrayIndex || callId) {
          this.handleModifyingEvent(serialNumber, payload, callId, arrayIndex);
        }
        break;
      case 'del':
        if (arrayIndex || callId) {
          this.handleDeleteEvent(serialNumber, callId, payload);
        }
        break;
      default:
        console.warn('Ignoring not implemented live array action', action);
        break;
    }
  }

  private bootstrap() {
    this.vertoSubscription.broadcast(this.liveArrayChannel, {
      liveArray: {
        command: 'bootstrap',
        context: this.liveArrayChannel,
        name: this.conferenceName
      }
    });
  }

  private parseParticipant(value: string, callId: string) {
    const {audio, video} = JSON.parse(value[4]);
    const me = this.callId === callId || this.secondaryCallId === callId;
    const participantId = value[0];
    const user = value[2];
    const pAudio = {
      muted: audio.muted,
      talking: audio.talking
    };
    let pVideo = {
      muted: true,
      floor: video.floor
    };
    if (video.mediaFlow === 'sendRecv') {
      pVideo.muted = video.muted;
    }
    const {
      showMe,
      isHost,
      channelName,
      displayName,
      isHostSharedVideo,
      isMobileApp,
      isVlrConnection,
      isPrimaryCall,
      userId
    }: any = value[5];

    const params: ParticipantParams = {
      callId,
      participantId,
      user,
      displayName,
      me,
      channelName,
      audio: pAudio,
      video: pVideo,
      showMe: showMe === 'true',
      isHost: isHost === 'true',
      isHostSharedVideo: isHostSharedVideo === 'true',
      isMobileApp: isMobileApp === 'true',
      isVlrConnection: isVlrConnection === 'true',
      isPrimaryCall: isPrimaryCall !== undefined ? isPrimaryCall === 'true' : undefined,
      userId: userId ? +userId : undefined
    };

    return new Participant(params);
  }
}
