import VertoNotification from './VertoNotification';

export default class VertoSubscription {
  private subscriptions: { [id: string]: any } = {};
  private notification: VertoNotification;

  constructor(notification: VertoNotification) {
    this.notification = notification;
  }

  subscribe(
    eventChannel: string,
    handler: any,
  ) {
    const eventSubscription = {
      eventChannel,
      handler,
      ready: false
    };

    if (this.subscriptions[eventChannel]) {
      console.warn('Overwriting an already subscribed channel', eventChannel);
    }

    this.subscriptions[eventChannel] = eventSubscription;
    this.broadcastMethod('verto.subscribe', {eventChannel});
    return eventSubscription;
  }

  unsubscribe(eventChannel: string | number) {
    delete this.subscriptions[eventChannel];
    this.broadcastMethod('verto.unsubscribe', {eventChannel});
  }

  broadcast(eventChannel: any, data: any) {
    this.broadcastMethod('verto.broadcast', {eventChannel, data});
  }

  clear() {
    this.subscriptions = {};
  }

  getSubscription(id: string) {
    return this.subscriptions[id];
  }

  private setDroppedSubscription(channel: string | number) {
    delete this.subscriptions[channel];
  }

  private setReadySubscription(channel: string | number) {
    const subscription = this.subscriptions[channel];
    if (subscription) {
      subscription.ready = true;
    }
  }

  private processReply(method: string, {subscribedChannels, unauthorizedChannels}: any) {
    if (method !== 'verto.subscribe') {
      return;
    }

    Object.keys(subscribedChannels || {}).forEach((channelKey) => {
      const channel = subscribedChannels[channelKey];
      this.setReadySubscription(channel);
    });

    Object.keys(unauthorizedChannels || {}).forEach((channelKey) => {
      const channel = unauthorizedChannels[channelKey];
      console.error('Unauthorized', channel);
      this.setDroppedSubscription(channel);
    });
  }

  private broadcastMethod(method: string, params: {} | undefined) {
    const reply = (event: any) => this.processReply(method, event);
    this.notification.sendWsRequest.notify({method, params, onSuccess: reply, onError: reply});
  }
}
