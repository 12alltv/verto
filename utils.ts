import {nanoid} from 'nanoid';

export const generateNanoId = () => nanoid();

export const ENUM: {state: any; direction: any; states: CallStates | any} = {
  state: {
    new: {name: 'new', val: 0},
    requesting: {name: 'requesting', val: 1},
    trying: {name: 'trying', val: 2},
    recovering: {name: 'recovering', val: 3},
    ringing: {name: 'ringing', val: 4},
    answering: {name: 'answering', val: 5},
    early: {name: 'early', val: 6},
    active: {name: 'active', val: 7},
    held: {name: 'held', val: 8},
    hangup: {name: 'hangup', val: 9},
    destroy: {name: 'destroy', val: 10},
    purge: {name: 'purge', val: 11},
  },
  direction: {
    inbound: {name: 'inbound', val: 0},
    outbound: {name: 'outbound', val: 1},
  },
  states: {
    new: {
      requesting: 1,
      recovering: 1,
      ringing: 1,
      destroy: 1,
      answering: 1,
      hangup: 1,
    },
    requesting: {
      trying: 1,
      hangup: 1,
      active: 1,
    },
    recovering: {
      answering: 1,
      hangup: 1,
    },
    trying: {
      active: 1,
      early: 1,
      hangup: 1,
    },
    ringing: {
      answering: 1,
      hangup: 1,
    },
    answering: {
      active: 1,
      hangup: 1,
    },
    active: {
      answering: 1,
      requesting: 1,
      hangup: 1,
      held: 1,
    },
    held: {
      hangup: 1,
      active: 1,
    },
    early: {
      hangup: 1,
      active: 1,
    },
    hangup: {
      destroy: 1,
    },
    destroy: {},
    purge: {
      destroy: 1,
    },
  },
};

export interface CallStates {
  new: any;
  requesting: any;
  recovering: any;
  trying: any;
  ringing: any;
  answering: any;
  active: any;
  held: any;
  early: any;
  hangup: any;
  destroy: any;
  purge: any;
}
