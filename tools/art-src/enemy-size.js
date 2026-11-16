"use strict";
// Enemy size table (presentation only). Measured so ART V2 enemies are never
// smaller on screen than the old artist drew them: bosses are generated at
// rig scale k*mul and blitted at 2x (px:2) so they stay chunky and imposing
// (>= old height +8%); large normal enemies get k*mul at 1x to match their old
// height. Small/regular enemies keep the approved phase-1 size.
// Re-measure with /workspace/tdv/tooling/measure.js if the old sizes change.
module.exports={"brute":{"mul":1.424},
  "rbrute":{"mul":1.545},
  "molten":{"mul":1.839},
  "mmolten":{"mul":1.545},
  "mobsidian":{"mul":1.359},
  "crawling_obsidian":{"mul":2.105},
  "tunneller":{"mul":1.427},
  "lurker":{"mul":2.043},
  "faceless_guardian":{"mul":1.667},
  "blood_soldier":{"mul":1.515},
  "necromancer":{"mul":1.583},
  "royalguard":{"mul":1.432},
  "tank":{"px":2,"mul":0.725},
  "rtank":{"px":2,"mul":0.77},
  "fbrute":{"px":2,"mul":0.709},
  "crawler":{"px":2,"mul":0.776},
  "rmmolten":{"px":2,"mul":1.07},
  "oknight":{"px":2,"mul":1.063},
  "mking":{"px":2,"mul":1.153},
  "wfbrute":{"px":2,"mul":0.703},
  "oking":{"px":2,"mul":1.242},
  "endbringer":{"px":2,"mul":1.43},
  "silent_exec":{"px":2,"mul":0.818},
  "stealth_tunneller":{"px":2,"mul":0.641},
  "faceless":{"px":2,"mul":1.066},
  "fallen_oking":{"px":2,"mul":1.123},
  "the_unseen":{"px":2,"mul":1.515},
  "necro_monarch":{"px":2,"mul":1.17},
  "deformed_king":{"px":2,"mul":1.471},
  "endbringer_guardian":{"px":2,"mul":1.235},
  "error_void_leak":{"px":2,"mul":1.036},
  "the_misplaced":{"px":2,"mul":1.296}};
