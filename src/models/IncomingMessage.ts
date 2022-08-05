// import urlRegexSafe from 'url-regex-safe';

export class IncomingMessage {
  toId: string;
  fromName: string;
  message: string;
  me: boolean;
  date: string;
  avatar: string;

  constructor(to: string, from: string, message: string, me: boolean, date: Date = new Date()) {
    this.toId = to;
    this.fromName = from;
    // const matchUrls = message.match(urlRegexSafe());
    // if (matchUrls) {
    //   const joined = matchUrls.join('|');
    //   const parts = message.split(new RegExp(`(${joined})`));
    //   this.message = parts.map(part => urlRegexSafe().test(part) ?
    //     <IonRouterLink href={part} target="_blank" rel="noreferrer">{part}</IonRouterLink>
    // :
    //   part
    // );
    // } else {
    //   this.message = message;
    // }
    this.message = message;
    this.me = me;
    this.avatar = from.charAt(0);

    const zeroPad = (value: number) => value.toString().padStart(2, '0');
    const timeString = `${date.getHours()}:${zeroPad(date.getMinutes())}`;
    const dateString = `${zeroPad(date.getDate())}/${zeroPad(date.getMonth() + 1)}`;
    this.date = `${timeString} ${dateString}`;
  }
}
