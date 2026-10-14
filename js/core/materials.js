/* SPAN — materials & cost constants (BG.Materials, BG.Costs, BG.MaterialOrder).
 * Game-tuned values (not real-world). All frame materials break at roughly 0.6 % strain
 * so loaded structures flex visibly and parallel members share load sensibly.
 *   stiffness = EA [N], tensionLimit / compressionLimit [N, positive], maxLength [m],
 *   massPerMeter [kg/m], costPerMeter [$ per m].
 * Road materials are continuous decks: consecutive road segments meeting at a joint
 * resist bending (bendStiffness [N·m/rad], momentLimit [N·m]). The bending ratio
 * |M|/momentLimit adds to the axial ratio, so an unsupported flat deck sags and snaps,
 * while the same road carried by a truss at every joint is fine.
 * Railway (SPEC §9.2): rail is a ballasted track deck (isRail; trains ride only on it, road
 * vehicles never do) - heavier and stiffer in bending than road. Masonry is cheap, very heavy,
 * enormously strong in compression and nearly useless in tension. Girder is a heavy steel box
 * member for the ore trains.
 * Jungle (docs/jungle/SPEC-JUNGLE.md §2; reachable only from levels that list them): jungle traffic is
 * ~100x lighter than road traffic, so these are cheap, light and weak. walkway = the light deck (isRoad;
 * bends at its joints like road with a 12x lower momentLimit, maxLength 4 m). bamboo = frame member, weak
 * in compression and flexible (1.4 % strain at the tension limit): an overloaded bamboo strut buckles at
 * once. liana = the cheapest, longest tension-only member, ~1/7 the strength of rope. Final values:
 *   walkway  $30/m  18 kg/m  EA 6.0e6  T 40e3  C 30e3  EI 1.5e4 / M 2.5e3 / ref 4  max 4 m
 *   bamboo   $15/m   5 kg/m  EA 2.5e6  T 35e3  C 20e3                              max 5 m
 *   liana     $5/m   1 kg/m  EA 1.0e6  T  8e3  C  8e3  (tension only)              max 24 m */
(function (root) {
  'use strict';
  const BG = (root.BG = root.BG || {});

  const M = {
    road: {
      id: 'road', name: 'Road', color: '#3b4049',
      costPerMeter: 100, massPerMeter: 120,
      stiffness: 5.0e7, tensionLimit: 300e3, compressionLimit: 300e3,
      bendStiffness: 2.4e5, momentLimit: 3.0e4, bendRefLength: 4,
      maxLength: 6, isRoad: true, tensionOnly: false, width: 0.5,
    },
    reinforced_road: {
      id: 'reinforced_road', name: 'Reinforced Road', color: '#5a4a3c',
      costPerMeter: 180, massPerMeter: 160,
      stiffness: 1.2e8, tensionLimit: 720e3, compressionLimit: 720e3,
      bendStiffness: 6.5e5, momentLimit: 1.1e5, bendRefLength: 4,
      maxLength: 6, isRoad: true, tensionOnly: false, width: 0.62,
    },
    wood: {
      id: 'wood', name: 'Wood', color: '#b07a43',
      costPerMeter: 50, massPerMeter: 15,
      stiffness: 1.0e7, tensionLimit: 130e3, compressionLimit: 110e3,
      maxLength: 6, isRoad: false, tensionOnly: false, width: 0.28,
    },
    steel: {
      id: 'steel', name: 'Steel', color: '#c0483e',
      costPerMeter: 120, massPerMeter: 45,
      stiffness: 1.1e8, tensionLimit: 650e3, compressionLimit: 550e3,
      maxLength: 10, isRoad: false, tensionOnly: false, width: 0.32,
    },
    rope: {
      id: 'rope', name: 'Rope', color: '#c9b58a',
      costPerMeter: 20, massPerMeter: 2,
      stiffness: 6.0e6, tensionLimit: 60e3, compressionLimit: 60e3,
      maxLength: 20, isRoad: false, tensionOnly: true, width: 0.08,
    },
    cable: {
      id: 'cable', name: 'Steel Cable', color: '#8d99a6',
      costPerMeter: 60, massPerMeter: 12,
      stiffness: 2.0e8, tensionLimit: 1.2e6, compressionLimit: 1.2e6,
      maxLength: 40, isRoad: false, tensionOnly: true, width: 0.12,
    },
    rail: {
      id: 'rail', name: 'Rail Track', color: '#5b4a3e',
      costPerMeter: 160, massPerMeter: 240,
      stiffness: 1.5e8, tensionLimit: 1.2e6, compressionLimit: 1.2e6,
      bendStiffness: 9.0e5, momentLimit: 1.6e5, bendRefLength: 4,
      maxLength: 6, isRoad: false, isRail: true, tensionOnly: false, width: 0.6,
    },
    masonry: {
      id: 'masonry', name: 'Masonry', color: '#a89a86',
      costPerMeter: 35, massPerMeter: 700,
      stiffness: 5.0e8, tensionLimit: 50e3, compressionLimit: 3.0e6,
      maxLength: 5, isRoad: false, tensionOnly: false, width: 0.75,
    },
    girder: {
      id: 'girder', name: 'Box Girder', color: '#3e5c78',
      costPerMeter: 480, massPerMeter: 260,
      stiffness: 7.0e8, tensionLimit: 4.0e6, compressionLimit: 3.4e6,
      maxLength: 12, isRoad: false, tensionOnly: false, width: 0.5,
    },
    // ---- jungle (SPEC-JUNGLE §2)
    walkway: {
      id: 'walkway', name: 'Bamboo Walkway', color: '#c9a35a',
      costPerMeter: 30, massPerMeter: 18,
      stiffness: 6.0e6, tensionLimit: 40e3, compressionLimit: 30e3,
      bendStiffness: 1.5e4, momentLimit: 2.5e3, bendRefLength: 4,
      maxLength: 4, isRoad: true, tensionOnly: false, width: 0.3,
    },
    bamboo: {
      id: 'bamboo', name: 'Bamboo', color: '#a3b84a',
      costPerMeter: 15, massPerMeter: 5,
      stiffness: 2.5e6, tensionLimit: 35e3, compressionLimit: 20e3,
      maxLength: 5, isRoad: false, tensionOnly: false, width: 0.18,
    },
    liana: {
      id: 'liana', name: 'Liana', color: '#4e7a2c',
      costPerMeter: 5, massPerMeter: 1,
      stiffness: 1.0e6, tensionLimit: 8e3, compressionLimit: 8e3,
      maxLength: 24, isRoad: false, tensionOnly: true, width: 0.07,
    },
  };

  // i18n (docs/I18N.md): `name` reads vehicles.material.<id> in the current language
  if (BG.i18n && BG.i18n.lazy) Object.keys(M).forEach(id => BG.i18n.lazy(M[id], { name: 'vehicles.material.' + id }));

  BG.Materials = M;
  /** Palette order (keys 1–6 on road levels; rail levels list their own materials). */
  BG.MaterialOrder = ['road', 'reinforced_road', 'wood', 'steel', 'rope', 'cable', 'rail', 'masonry', 'girder', 'walkway', 'bamboo', 'liana'];
  /** Cost constants. Pier cost = pierBase + pierPerMeter * (topY - floorY). */
  BG.Costs = { joint: 0, pierBase: 1000, pierPerMeter: 250 };
  /** Land pylons (SPEC §17: piers in a land pier zone, zone.ground): a rigid concrete column on a footing.
   *  The footing turns a little under moment (footingStiffness, N·m/rad) and resists at most momentLimit
   *  (N·m; a zone's `footing` overrides it): beyond that it yields, the pylon leans, and past ~3° it
   *  topples about its base - unless backstays take the pull. Cost as any pier, from the bank surface. */
  BG.LandPylon = { stiffness: 5e10, footingStiffness: 2e9, momentLimit: 3e5, massPerMeter: 900 };
  /** Flexible tree anchors (docs/challenges/SPEC-CHALLENGES.md §1; opt-in per anchor via anchors[i].tree): a rigid
   *  trunk from its root base to the anchor joint, with a soft rotational root spring (stiffness, N·m/rad). The roots
   *  resist at most rootLimit (N·m); beyond that the tree keeps leaning (a permanent, plastic lean), and past
   *  uprootTilt (rad from its rest direction) it is uprooted, which fails the run. topMass (kg) is the trunk mass
   *  felt at the anchor joint; colStiffness (N) the trunk's axial EA; damp the fraction of the top's velocity
   *  removed per substep. Tuned on a 62-like canopy (32 m gap, trees 8 m up, walkway deck on rope fans; see
   *  tools/test-tree-anchors.js): porters lean ~1.3-1.9°, hand carts ~2.7° at ~65 % root load; an unguyed ox cart
   *  uproots a tree (elastic up to ~4.2°, uprooted at 4.9°: a walkway deck kinks too much beyond that); a Rope guy
   *  to a stake keeps the lean near 1°. Per tree, anchors[i].tree overrides any of these. */
  BG.TreeAnchor = { stiffness: 1.5e6, rootLimit: 1.1e5, uprootTilt: 0.085, topMass: 80, colStiffness: 5e9, damp: 0.002 };
})(typeof window !== 'undefined' ? window : globalThis);
