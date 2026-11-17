import type { Wire } from '@velxio/types/wire';
import type { BoardInstance } from '@velxio/types/board';
export const boards: BoardInstance[] = [{ id: 'arduino-mega', boardKind: 'arduino-mega', x: 100, y: 200 } as BoardInstance];
export const components = [
  {
    id: 'TOUCH1',
    metadataId: 'mpr121',
    x: 500,
    y: 80
  },
  {
    id: 'R0',
    metadataId: 'resistor',
    x: 600,
    y: 190,
    properties: {
      value: '10k'
    }
  },
  {
    id: 'R1',
    metadataId: 'resistor',
    x: 600,
    y: 250,
    properties: {
      value: '20k'
    }
  },
  {
    id: 'R2',
    metadataId: 'resistor',
    x: 600,
    y: 310,
    properties: {
      value: '10k'
    }
  },
  {
    id: 'R3',
    metadataId: 'resistor',
    x: 600,
    y: 370,
    properties: {
      value: '10k'
    }
  }
];
export const wires: Wire[] = [
  {
    id: 'w0',
    start: {
      componentId: 'arduino-mega',
      pinName: '20',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'TOUCH1',
      pinName: 'SDA',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w1',
    start: {
      componentId: 'arduino-mega',
      pinName: '21',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'TOUCH1',
      pinName: 'SCL',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w2',
    start: {
      componentId: 'arduino-mega',
      pinName: '5V',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'TOUCH1',
      pinName: 'VIN',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w3',
    start: {
      componentId: 'arduino-mega',
      pinName: 'GND',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'TOUCH1',
      pinName: 'GND',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w4',
    start: {
      componentId: 'arduino-mega',
      pinName: '2',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'TOUCH1',
      pinName: 'INT',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w5',
    start: {
      componentId: 'TOUCH1',
      pinName: '4',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'R0',
      pinName: '1',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w6',
    start: {
      componentId: 'R0',
      pinName: '2',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'arduino-mega',
      pinName: '22',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w7',
    start: {
      componentId: 'TOUCH1',
      pinName: '4',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'R1',
      pinName: '1',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w8',
    start: {
      componentId: 'R1',
      pinName: '2',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'arduino-mega',
      pinName: 'GND',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w9',
    start: {
      componentId: 'TOUCH1',
      pinName: '5',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'arduino-mega',
      pinName: '23',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w10',
    start: {
      componentId: 'TOUCH1',
      pinName: '6',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'arduino-mega',
      pinName: '24',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w11',
    start: {
      componentId: 'TOUCH1',
      pinName: '7',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'arduino-mega',
      pinName: '25',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w12',
    start: {
      componentId: 'TOUCH1',
      pinName: '8',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'arduino-mega',
      pinName: '26',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w13',
    start: {
      componentId: 'TOUCH1',
      pinName: '9',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'arduino-mega',
      pinName: '27',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w14',
    start: {
      componentId: 'TOUCH1',
      pinName: '10',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'arduino-mega',
      pinName: '28',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w15',
    start: {
      componentId: 'TOUCH1',
      pinName: '11',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'arduino-mega',
      pinName: '29',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w16',
    start: {
      componentId: 'TOUCH1',
      pinName: '6',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'R2',
      pinName: '1',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w17',
    start: {
      componentId: 'R2',
      pinName: '2',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'TOUCH1',
      pinName: '3Vo',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w18',
    start: {
      componentId: 'TOUCH1',
      pinName: '7',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'R3',
      pinName: '1',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  },
  {
    id: 'w19',
    start: {
      componentId: 'R3',
      pinName: '2',
      x: 0,
      y: 0
    },
    end: {
      componentId: 'arduino-mega',
      pinName: 'GND',
      x: 0,
      y: 0
    },
    color: '#4488ff',
    waypoints: []
  }
];
