/* LOOP THIEF — level data. Legend in simulation.js.
   `solution` lists ghost plans in creation order, then the winning player plan.
   Every solution is verified by tests/levels.test.js. */
(function (root) {
  'use strict';

  const LEVELS = [
    {
      id: 'first-echo', name: 'First Echo',
      objective: 'Reach the vault. The red door only opens while someone stands on the orange plate.',
      hint: 'Run once and end on the plate. Retry — your ghost will hold it for you.',
      maxGhosts: 3, maxActions: 16,
      map: [
        '##########',
        '#a.....#.#',
        '#...S..A.#',
        '#......#X#',
        '##########'
      ],
      solution: [['L', 'L', 'L', 'U'], ['W', 'W', 'W', 'R', 'R', 'R', 'R', 'D']]
    },
    {
      id: 'double-duty', name: 'Double Duty',
      objective: 'Two doors, two plates, only ONE ghost. Your ghost must move from plate to plate on time.',
      hint: 'Use WAIT so your ghost holds the first plate until you are through, then walks to the second.',
      maxGhosts: 1, maxActions: 20,
      map: [
        '##########',
        '#a......b#',
        '#...S....#',
        '#A########',
        '#......BX#',
        '##########'
      ],
      solution: [
        ['L', 'L', 'L', 'U', 'W', 'R', 'R', 'R', 'R', 'R', 'R', 'R'],
        ['L', 'L', 'L', 'W', 'D', 'D', 'R', 'R', 'R', 'R', 'R', 'W', 'R', 'R']
      ]
    },
    {
      id: 'laser-hall', name: 'Laser Hall',
      objective: 'A laser guards the hall. It switches off while the plate is held — but other lasers never switch off.',
      hint: 'Red striped lasers catch anyone, ghosts included. Route your ghost around them.',
      maxGhosts: 3, maxActions: 20,
      hazards: { '!': { offBy: ['a'] } },
      map: [
        '##########',
        '#......#X#',
        '#.%%...#.#',
        '#a%S...!.#',
        '##########'
      ],
      solution: [
        ['R', 'U', 'U', 'L', 'L', 'L', 'D', 'D'],
        ['R', 'R', 'R', 'W', 'W', 'W', 'W', 'W', 'R', 'R', 'U', 'U']
      ]
    },
    {
      id: 'the-decoy', name: 'The Decoy',
      objective: 'The switch opens the vault door — and locks the hall door behind it. Flip it at the right moment.',
      hint: 'Ghosts replay actions, not intentions. Have one wait on the switch and USE it after you pass.',
      maxGhosts: 3, maxActions: 20,
      doors: { B: { by: ['1'], invert: true }, A: { by: ['1'] } },
      map: [
        '##########',
        '#S..1....#',
        '#........#',
        '#######B##',
        '#X.A.....#',
        '##########'
      ],
      solution: [
        ['R', 'R', 'R', 'W', 'W', 'W', 'W', 'W', 'W', 'I'],
        ['R', 'R', 'R', 'R', 'R', 'R', 'D', 'D', 'D', 'L', 'L', 'L', 'L', 'L', 'L']
      ]
    },
    {
      id: 'three-of-you', name: 'Three of You',
      objective: 'The vault door needs BOTH plates held at the same time.',
      hint: 'Two ghosts, two plates. Then walk through yourself.',
      maxGhosts: 3, maxActions: 16,
      doors: { A: { by: ['a', 'b'], mode: 'all' } },
      map: [
        '##########',
        '#a......b#',
        '#........#',
        '#...S....#',
        '####A#####',
        '#...X....#',
        '##########'
      ],
      solution: [
        ['L', 'L', 'L', 'U', 'U'],
        ['R', 'R', 'R', 'R', 'U', 'U'],
        ['W', 'W', 'W', 'W', 'W', 'W', 'D', 'D']
      ]
    },
    {
      id: 'impossible-door', name: 'The Impossible Door',
      objective: 'The door needs both plates. One plate sits behind a laser that only the switch can kill.',
      hint: 'One ghost flips the switch and slips past the laser to the far plate. Another holds the near plate.',
      maxGhosts: 3, maxActions: 24,
      doors: { A: { by: ['a', 'b'], mode: 'all' } },
      hazards: { '!': { offBy: ['1'] } },
      map: [
        '##########',
        '#b.!..1..#',
        '####.....#',
        '#a...S...#',
        '########A#',
        '#X.......#',
        '##########'
      ],
      solution: [
        ['U', 'U', 'R', 'I', 'L', 'L', 'L', 'L', 'L'],
        ['L', 'L', 'L', 'L'],
        ['R', 'R', 'R', 'W', 'W', 'W', 'W', 'W', 'W', 'D', 'D', 'L', 'L', 'L', 'L', 'L', 'L', 'L']
      ]
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  else root.LoopThief = Object.assign(root.LoopThief || {}, { LEVELS });
})(typeof window !== 'undefined' ? window : globalThis);
