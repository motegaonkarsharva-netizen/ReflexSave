/**
 * ReflexSave / NeuroRescue — Mission Control Dashboard
 * Modular simulation engine for hackathon demo
 */

'use strict';

/* ============================================================
   Configuration
   ============================================================ */
const CONFIG = {
  gridCols: 56,
  gridRows: 42,
  cellSize: 0, // computed from canvas size
  tickInterval: 1500,
  animationFPS: 60,
  robotSpeed: 0.035,
  abandonTimeoutTicks: 14, // legacy — abandonment disabled; robot reaches all survivors
  robotCount: 3,
};

const ROBOT_DEFS = [
  { id: 1, name: 'NR-1', color: '#00d4ff', glow: 'rgba(0, 212, 255, 0.85)', trail: '0, 212, 255' },
  { id: 2, name: 'NR-2', color: '#00e676', glow: 'rgba(0, 230, 118, 0.85)', trail: '0, 230, 118' },
  { id: 3, name: 'NR-3', color: '#ffd23f', glow: 'rgba(255, 210, 63, 0.85)', trail: '255, 210, 63' },
];

/* ============================================================
   Utility Helpers
   ============================================================ */
const Utils = {
  rand(min, max) {
    return Math.random() * (max - min) + min;
  },

  randInt(min, max) {
    return Math.floor(Utils.rand(min, max + 1));
  },

  clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  },

  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  },

  nowTimeStr() {
    return new Date().toLocaleTimeString('en-IN', { hour12: false });
  },
};

/** Obstacle type labels shown on map + legend */
const OBSTACLE_SYMBOLS = {
  car:   { label: 'CAR',  name: 'Broken car',      category: 'vehicle' },
  tire:  { label: 'TIR',  name: 'Tire',            category: 'vehicle' },
  metal: { label: 'MTL',  name: 'Metal scrap',     category: 'vehicle' },
  bike:  { label: 'BIK',  name: 'Bike debris',     category: 'vehicle' },
  slab:  { label: 'SLB',  name: 'Concrete slab',   category: 'building' },
  brick: { label: 'BRK',  name: 'Bricks',          category: 'building' },
  rod:   { label: 'ROD',  name: 'Steel rod',       category: 'building' },
  glass: { label: 'GLS',  name: 'Broken glass',    category: 'building' },
  wall:  { label: 'WAL',  name: 'Collapsed wall',  category: 'building' },
};

/* ============================================================
   World Generation — Large organic Indian urban earthquake zone
   ============================================================ */
class World {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = [];
    this.buildingStructures = [];
    this.buildingFootprints = [];
    this.collapsed = [];
    this.debrisZones = [];
    this.vehicleDebris = [];
    this.buildingDebris = [];
    this.cracks = [];
    this.dangerZones = [];
    this.parks = [];
    this.roads = [];
    this.survivors = [];
    this.obstacles = new Set();
    this.avoidableObstacles = new Set();
    this.dangerCrackCells = new Set();
    this.cautionCrackCells = new Set();

    this.generate();
  }

  generate() {
    // 0=open 1=road 2=building 3=collapsed 4=debris-zone 5=danger 8=park
    for (let y = 0; y < this.rows; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.cols; x++) {
        this.tiles[y][x] = 0;
      }
    }

    this._generateOrganicRoads();
    this._generateParks();
    this._generateNaturalArchitecture();
    this._generateCollapsedSites();
    this._generateDebrisAndObstacles();
    this._generateGroundCracks();
    this._generateDangerZones();
    this._generateSurvivors();
    this._buildObstacleMaps();
  }

  /* --- Organic road network with plaza and curved connectors --- */
  _generateOrganicRoads() {
    const setRoad = (x, y) => {
      if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
        if (this.tiles[y][x] !== 8) this.tiles[y][x] = 1;
        this.roads.push({ x, y });
      }
    };

    const drawRoadLine = (x0, y0, x1, y1, width = 2) => {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = Math.round(Utils.lerp(x0, x1, t));
        const cy = Math.round(Utils.lerp(y0, y1, t));
        for (let w = 0; w < width; w++) {
          setRoad(cx + w, cy);
          setRoad(cx, cy + w);
        }
      }
    };

    // Arterial grid with irregular spacing (Indian urban feel)
    [5, 12, 20, 28, 35].forEach(y => {
      for (let x = 2; x < this.cols - 2; x++) {
        setRoad(x, y);
        setRoad(x, y + 1);
      }
    });

    [6, 16, 26, 36, 48].forEach(x => {
      for (let y = 2; y < this.rows - 2; y++) {
        setRoad(x, y);
        setRoad(x + 1, y);
      }
    });

    // Diagonal connectors (stepped — natural damage-distorted lanes)
    drawRoadLine(6, 12, 16, 20, 1);
    drawRoadLine(26, 8, 36, 16, 1);
    drawRoadLine(16, 28, 26, 35, 1);
    drawRoadLine(36, 22, 48, 30, 1);
    drawRoadLine(6, 28, 16, 35, 1);

    // Central market plaza (Chowk)
    for (let y = 18; y <= 24; y++) {
      for (let x = 22; x <= 30; x++) {
        setRoad(x, y);
      }
    }
  }

  _generateParks() {
    const parkAreas = [
      { x: 38, y: 4, w: 5, h: 4 },
      { x: 8, y: 32, w: 6, h: 5 },
      { x: 44, y: 32, w: 4, h: 4 },
    ];
    parkAreas.forEach(p => {
      this.parks.push(p);
      for (let dy = 0; dy < p.h; dy++) {
        for (let dx = 0; dx < p.w; dx++) {
          const tx = p.x + dx;
          const ty = p.y + dy;
          if (tx < this.cols && ty < this.rows && this.tiles[ty][tx] === 0) {
            this.tiles[ty][tx] = 8;
          }
        }
      }
    });
  }

  /* --- Varied natural building footprints --- */
  _generateNaturalArchitecture() {
    const structures = [
      // North commercial strip — mixed shop fronts
      { type: 'shop', x: 8, y: 6, w: 3, h: 2, roof: 'flat', intact: true },
      { type: 'shop', x: 11, y: 6, w: 4, h: 2, roof: 'flat', intact: true },
      { type: 'shop', x: 18, y: 6, w: 3, h: 2, roof: 'flat', intact: false },
      { type: 'residential', x: 22, y: 6, w: 3, h: 3, roof: 'terrace', intact: true },
      { type: 'apartment', x: 28, y: 6, w: 5, h: 5, roof: 'flat', intact: true },
      { type: 'shop', x: 38, y: 6, w: 4, h: 2, roof: 'flat', intact: true },
      { type: 'residential', x: 44, y: 6, w: 3, h: 3, roof: 'terrace', intact: true },

      // East residential cluster — irregular sizes
      { type: 'residential', x: 50, y: 10, w: 3, h: 4, roof: 'terrace', intact: true },
      { type: 'residential', x: 50, y: 15, w: 4, h: 3, roof: 'terrace', intact: false },
      { type: 'compound', x: 38, y: 14, w: 5, h: 4, roof: 'courtyard', intact: true },
      { type: 'apartment', x: 44, y: 14, w: 4, h: 6, roof: 'flat', intact: true },

      // Central-west mixed block
      { type: 'temple', x: 8, y: 14, w: 4, h: 4, roof: 'dome', intact: true },
      { type: 'residential', x: 13, y: 14, w: 2, h: 3, roof: 'terrace', intact: true },
      { type: 'shop', x: 8, y: 18, w: 3, h: 2, roof: 'flat', intact: false },
      { type: 'residential', x: 13, y: 18, w: 2, h: 2, roof: 'terrace', intact: true },

      // Market-adjacent buildings
      { type: 'shop', x: 18, y: 14, w: 3, h: 2, roof: 'flat', intact: true },
      { type: 'shop', x: 18, y: 16, w: 2, h: 2, roof: 'flat', intact: true },
      { type: 'apartment', x: 32, y: 14, w: 3, h: 5, roof: 'flat', intact: true },
      { type: 'residential', x: 32, y: 20, w: 3, h: 3, roof: 'terrace', intact: false },

      // South dense urban blocks
      { type: 'apartment', x: 8, y: 22, w: 5, h: 5, roof: 'flat', intact: true },
      { type: 'residential', x: 14, y: 22, w: 2, h: 4, roof: 'terrace', intact: true },
      { type: 'compound', x: 18, y: 22, w: 6, h: 5, roof: 'courtyard', intact: false },
      { type: 'shop', x: 28, y: 22, w: 3, h: 2, roof: 'flat', intact: true },
      { type: 'apartment', x: 32, y: 22, w: 4, h: 6, roof: 'flat', intact: true },
      { type: 'residential', x: 38, y: 22, w: 3, h: 3, roof: 'terrace', intact: true },

      // Far south & west neighborhoods
      { type: 'residential', x: 8, y: 30, w: 4, h: 3, roof: 'terrace', intact: true },
      { type: 'shop', x: 14, y: 30, w: 2, h: 2, roof: 'flat', intact: false },
      { type: 'apartment', x: 18, y: 30, w: 5, h: 4, roof: 'flat', intact: true },
      { type: 'residential', x: 28, y: 30, w: 3, h: 3, roof: 'terrace', intact: true },
      { type: 'compound', x: 33, y: 30, w: 5, h: 4, roof: 'courtyard', intact: true },
      { type: 'apartment', x: 44, y: 28, w: 4, h: 5, roof: 'flat', intact: false },
      { type: 'residential', x: 50, y: 28, w: 3, h: 4, roof: 'terrace', intact: true },

      // Northwest & scattered
      { type: 'residential', x: 3, y: 8, w: 2, h: 3, roof: 'terrace', intact: true },
      { type: 'shop', x: 3, y: 12, w: 2, h: 2, roof: 'flat', intact: true },
      { type: 'apartment', x: 28, y: 36, w: 4, h: 4, roof: 'flat', intact: true },
      { type: 'residential', x: 18, y: 36, w: 3, h: 3, roof: 'terrace', intact: true },
      { type: 'shop', x: 44, y: 36, w: 3, h: 2, roof: 'flat', intact: true },
    ];

    structures.forEach(s => this._stampBuilding(s));
  }

  _stampBuilding(s) {
    const cells = [];
    for (let dy = 0; dy < s.h; dy++) {
      for (let dx = 0; dx < s.w; dx++) {
        const tx = s.x + dx;
        const ty = s.y + dy;
        if (tx >= this.cols || ty >= this.rows) continue;
        if (this.tiles[ty][tx] === 1 || this.tiles[ty][tx] === 8) continue;

        // L-shaped compound — leave inner courtyard open
        if (s.type === 'compound' && s.roof === 'courtyard') {
          const innerX = dx >= 1 && dx <= s.w - 2;
          const innerY = dy >= 1 && dy <= s.h - 2;
          if (innerX && innerY) continue;
        }

        if (s.intact) {
          this.tiles[ty][tx] = 2;
          cells.push({ x: tx, y: ty });
        }
      }
    }
    if (cells.length > 0) {
      this.buildingStructures.push({ ...s, cells });
      this.buildingFootprints.push({ x: s.x, y: s.y, w: s.w, h: s.h });
    }
  }

  /** True for intact building tiles and interior/courtyard — not collapsed rubble */
  _isInsideBuilding(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    if (this.tiles[y][x] === 2) return true;
    for (const fp of this.buildingFootprints) {
      if (x >= fp.x && x < fp.x + fp.w && y >= fp.y && y < fp.y + fp.h) {
        if (this.tiles[y][x] === 3) return false;
        return true;
      }
    }
    return false;
  }

  _canPlaceObstacle(x, y) {
    if (this._isInsideBuilding(x, y)) return false;
    const tile = this.tiles[y][x];
    return [0, 1, 4].includes(tile) && !this.avoidableObstacles.has(`${x},${y}`);
  }

  _purgeObstaclesFromBuildings() {
    for (const key of [...this.avoidableObstacles]) {
      const [x, y] = key.split(',').map(Number);
      if (this._isInsideBuilding(x, y)) this.avoidableObstacles.delete(key);
    }
    this.vehicleDebris = this.vehicleDebris.filter(d => !this._isInsideBuilding(d.x, d.y));
    this.buildingDebris = this.buildingDebris.filter(d => !this._isInsideBuilding(d.x, d.y));
  }

  _generateCollapsedSites() {
    const sites = [
      { x: 18, y: 6, w: 3, h: 2 },
      { x: 38, y: 14, w: 4, h: 3 },
      { x: 12, y: 18, w: 3, h: 3 },
      { x: 20, y: 22, w: 5, h: 4 },
      { x: 32, y: 20, w: 3, h: 3 },
      { x: 44, y: 28, w: 4, h: 3 },
      { x: 14, y: 30, w: 3, h: 2 },
      { x: 50, y: 15, w: 3, h: 2 },
    ];

    sites.forEach(c => {
      this.collapsed.push({ ...c });
      for (let dy = 0; dy < c.h; dy++) {
        for (let dx = 0; dx < c.w; dx++) {
          const tx = c.x + dx;
          const ty = c.y + dy;
          if (tx < this.cols && ty < this.rows) {
            this.tiles[ty][tx] = 3;
          }
        }
      }
    });
  }

  _generateDebrisAndObstacles() {
    const zones = [
      { x: 10, y: 10, w: 4, h: 3 },
      { x: 24, y: 10, w: 3, h: 2 },
      { x: 40, y: 10, w: 3, h: 3 },
      { x: 14, y: 24, w: 4, h: 2 },
      { x: 28, y: 26, w: 3, h: 3 },
      { x: 42, y: 20, w: 3, h: 2 },
      { x: 20, y: 32, w: 4, h: 2 },
      { x: 36, y: 34, w: 3, h: 2 },
    ];

    zones.forEach(z => {
      this.debrisZones.push(z);
      for (let dy = 0; dy < z.h; dy++) {
        for (let dx = 0; dx < z.w; dx++) {
          const tx = z.x + dx;
          const ty = z.y + dy;
          if (tx < this.cols && ty < this.rows && [0, 1].includes(this.tiles[ty][tx])) {
            this.tiles[ty][tx] = 4;
          }
        }
      }
    });

    // Vehicle debris — each piece is an avoidable obstacle
    const vehicleTypes = ['car', 'tire', 'metal', 'bike'];
    let placed = 0;
    let attempts = 0;
    while (placed < 45 && attempts < 400) {
      attempts++;
      const x = Utils.randInt(2, this.cols - 3);
      const y = Utils.randInt(2, this.rows - 3);
      if (!this._canPlaceObstacle(x, y)) continue;

      this.vehicleDebris.push({
        x, y,
        type: vehicleTypes[Utils.randInt(0, 3)],
        rotation: Utils.rand(0, Math.PI * 2),
        scale: Utils.rand(0.65, 1.25),
      });
      this._addAvoidableObstacle(x, y);
      placed++;
    }

    // Building debris near collapsed sites — avoidable
    const debrisTypes = ['slab', 'brick', 'rod', 'glass', 'wall'];
    this.collapsed.forEach(c => {
      for (let i = 0; i < 12; i++) {
        const bx = Utils.clamp(Math.round(c.x + Utils.rand(-1, c.w)), 1, this.cols - 2);
        const by = Utils.clamp(Math.round(c.y + Utils.rand(-1, c.h)), 1, this.rows - 2);
        if (this._isInsideBuilding(bx, by)) continue;
        if (this.tiles[by][bx] === 3 || this.tiles[by][bx] === 4) {
          this.buildingDebris.push({
            x: bx, y: by,
            type: debrisTypes[Utils.randInt(0, 4)],
            rotation: Utils.rand(0, Math.PI * 2),
          });
          this._addAvoidableObstacle(bx, by);
        }
      }
    });

    // Extra scattered building debris on roads
    for (let i = 0; i < 25; i++) {
      const x = Utils.randInt(3, this.cols - 4);
      const y = Utils.randInt(3, this.rows - 4);
      if (!this._canPlaceObstacle(x, y)) continue;
      this.buildingDebris.push({
        x, y,
        type: debrisTypes[Utils.randInt(0, 4)],
        rotation: Utils.rand(0, Math.PI * 2),
      });
      this._addAvoidableObstacle(x, y);
    }

    this._purgeObstaclesFromBuildings();
  }

  _addAvoidableObstacle(x, y) {
    this.avoidableObstacles.add(`${x},${y}`);
  }

  _generateGroundCracks() {
    const crackPaths = [
      { path: [[8, 14], [10, 15], [12, 14], [14, 16], [16, 15]], width: 0.35 },
      { path: [[20, 8], [22, 10], [24, 11], [26, 10]], width: 0.45 },
      { path: [[30, 12], [32, 14], [34, 15], [36, 14], [38, 16]], width: 0.9 },
      { path: [[42, 8], [44, 10], [46, 12]], width: 1.1 },
      { path: [[10, 22], [12, 24], [14, 23], [16, 25]], width: 0.3 },
      { path: [[22, 18], [24, 20], [26, 22], [28, 21]], width: 1.3 },
      { path: [[34, 24], [36, 26], [38, 28]], width: 2.1 },
      { path: [[44, 18], [46, 20], [48, 22], [50, 21]], width: 1.7 },
      { path: [[6, 30], [8, 32], [10, 31], [12, 33]], width: 0.55 },
      { path: [[28, 32], [30, 34], [32, 33], [34, 35]], width: 0.8 },
      { path: [[18, 34], [20, 36], [22, 35]], width: 0.4 },
      { path: [[40, 32], [42, 34], [44, 33], [46, 35]], width: 1.9 },
    ];

    this.cracks = crackPaths.map(def => {
      const type = def.width < 0.5 ? 'safe' : def.width <= 1.5 ? 'caution' : 'danger';
      const color = type === 'safe' ? '#00e676' : type === 'caution' ? '#ffd23f' : '#ff3b5c';
      // Stable jitter for rendering (no flicker)
      const points = def.path.map(([px, py]) => ({
        gx: px,
        gy: py,
        jx: Utils.rand(-0.15, 0.15),
        jy: Utils.rand(-0.15, 0.15),
      }));
      return { width: def.width, type, color, points };
    });
  }

  _generateDangerZones() {
    this.dangerZones = [
      { x: 20, y: 22, r: 3 },
      { x: 38, y: 14, r: 2.5 },
      { x: 44, y: 28, r: 2.8 },
      { x: 12, y: 18, r: 2 },
      { x: 34, y: 26, r: 2.2 },
    ];
  }

  _generateSurvivors() {
    const positions = [
      { x: 10, y: 8, zone: 'safe' },
      { x: 24, y: 8, zone: 'risk' },
      { x: 40, y: 8, zone: 'critical' },
      { x: 10, y: 15, zone: 'safe' },       // inside temple building
      { x: 20, y: 19, zone: 'risk' },       // market plaza
      { x: 29, y: 7, zone: 'critical' },    // inside apartment
      { x: 46, y: 12, zone: 'risk' },
      { x: 9, y: 24, zone: 'safe' },
      { x: 16, y: 26, zone: 'critical' },
      { x: 30, y: 24, zone: 'risk' },
      { x: 40, y: 24, zone: 'safe' },
      { x: 24, y: 32, zone: 'critical' },
      { x: 34, y: 32, zone: 'risk' },
      { x: 48, y: 32, zone: 'safe' },
      { x: 14, y: 34, zone: 'critical' },
      { x: 11, y: 7, zone: 'critical' },    // inside shop
      { x: 33, y: 15, zone: 'critical' },    // inside apartment block
      { x: 21, y: 23, zone: 'critical' },     // collapsed zone
    ];

    this.survivors = positions.map((p, i) => ({
      id: i + 1,
      x: p.x + 0.5,
      y: p.y + 0.5,
      zone: p.zone,
      rescued: false,
      abandoned: false,
      scanned: false,
      pulse: Utils.rand(0, Math.PI * 2),
    }));
  }

  _buildObstacleMaps() {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const t = this.tiles[y][x];
        if (t === 2 || t === 3 || t === 5) {
          this.obstacles.add(`${x},${y}`);
        }
      }
    }

    this.cracks.forEach(crack => {
      crack.points.forEach(pt => {
        const key = `${Math.round(pt.gx)},${Math.round(pt.gy)}`;
        if (crack.type === 'danger') {
          this.dangerCrackCells.add(key);
          this.obstacles.add(key);
        } else if (crack.type === 'caution') {
          this.cautionCrackCells.add(key);
          // Also block adjacent cells for caution (narrow pass)
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              this.cautionCrackCells.add(`${Math.round(pt.gx) + dx},${Math.round(pt.gy) + dy}`);
            }
          }
        }
      });
    });
  }

  isInBounds(x, y) {
    return x >= 0.5 && y >= 0.5 && x <= this.cols - 0.5 && y <= this.rows - 0.5;
  }

  clampToBounds(x, y) {
    return {
      x: Utils.clamp(x, 0.5, this.cols - 0.5),
      y: Utils.clamp(y, 0.5, this.rows - 0.5),
    };
  }

  /** Walkable everywhere except debris obstacles and danger cracks (buildings OK) */
  isWalkable(x, y) {
    const ix = Math.floor(x + 0.5);
    const iy = Math.floor(y + 0.5);
    if (!this.isInBounds(ix + 0.5, iy + 0.5)) return false;
    const key = `${ix},${iy}`;
    if (this.avoidableObstacles.has(key)) return false;
    if (this.dangerCrackCells.has(key)) return false;
    return true;
  }

  /** Line-of-sight movement check — prevents passing through obstacles */
  canTraverse(x0, y0, x1, y1) {
    if (!this.isWalkable(x1, y1)) return false;
    const dist = Utils.dist(x0, y0, x1, y1);
    const steps = Math.max(4, Math.ceil(dist * 5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(Utils.lerp(x0, x1, t), Utils.lerp(y0, y1, t))) return false;
    }
    return true;
  }

  findNearestWalkableCell(gx, gy, maxRadius = 12) {
    const ix = Math.floor(gx + 0.5);
    const iy = Math.floor(gy + 0.5);
    if (this.isWalkable(ix, iy)) return { x: ix, y: iy };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = ix + dx;
          const ny = iy + dy;
          if (this.isWalkable(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return { x: ix, y: iy };
  }

  findNearestWalkable(x, y) {
    const cell = this.findNearestWalkableCell(x, y, 12);
    return { x: cell.x + 0.5, y: cell.y + 0.5 };
  }

  /** BFS grid path that routes around debris + danger cracks */
  findPathBFS(startX, startY, endX, endY) {
    let sx = Math.floor(startX + 0.5);
    let sy = Math.floor(startY + 0.5);
    let ex = Math.floor(endX + 0.5);
    let ey = Math.floor(endY + 0.5);

    if (!this.isWalkable(sx, sy)) {
      const near = this.findNearestWalkableCell(sx, sy, 10);
      sx = near.x;
      sy = near.y;
    }
    if (!this.isWalkable(ex, ey)) {
      const near = this.findNearestWalkableCell(ex, ey, 10);
      ex = near.x;
      ey = near.y;
    }

    const key = (x, y) => `${x},${y}`;
    const startKey = key(sx, sy);
    const endKey = key(ex, ey);
    const queue = [{ x: sx, y: sy, path: [{ x: sx, y: sy }] }];
    const visited = new Set([startKey]);
    const dirs = [
      [0, 1], [0, -1], [1, 0], [-1, 0],
      [1, 1], [-1, 1], [1, -1], [-1, -1],
    ];

    while (queue.length > 0) {
      const node = queue.shift();
      if (key(node.x, node.y) === endKey) {
        return node.path.map(p => ({ x: p.x + 0.5, y: p.y + 0.5 }));
      }

      for (const [dx, dy] of dirs) {
        const nx = node.x + dx;
        const ny = node.y + dy;
        const k = key(nx, ny);
        if (visited.has(k) || !this.isWalkable(nx, ny)) continue;
        visited.add(k);
        queue.push({ x: nx, y: ny, path: [...node.path, { x: nx, y: ny }] });
      }
    }

    return null;
  }

  getSafeSpawn(usedPositions = []) {
    const candidates = this.roads.filter(r => this.isWalkable(r.x, r.y));
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    for (const pick of shuffled) {
      const pos = { x: pick.x + 0.5, y: pick.y + 0.5 };
      const farEnough = usedPositions.every(u => Utils.dist(u.x, u.y, pos.x, pos.y) > 5);
      if (farEnough) return pos;
    }
    if (candidates.length === 0) return { x: 2.5, y: 2.5 };
    const pick = candidates[Utils.randInt(0, candidates.length - 1)];
    return { x: pick.x + 0.5, y: pick.y + 0.5 };
  }

  getTerrainSpeedMultiplier(x, y) {
    const ix = Math.floor(x + 0.5);
    const iy = Math.floor(y + 0.5);
    if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) return 1;
    const key = `${ix},${iy}`;
    const t = this.tiles[iy][ix];

    if (t === 2) return 0.75;
    if (t === 3) return 0.6;
    if (this.cautionCrackCells.has(key)) return 0.5;
    if (t === 4) return 0.7;
    return 1;
  }

  isNearAvoidableObstacle(x, y, radius = 1.2) {
    for (const key of this.avoidableObstacles) {
      const [ox, oy] = key.split(',').map(Number);
      if (Utils.dist(x, y, ox, oy) < radius) return true;
    }
    return false;
  }
}

/* ============================================================
   Visual Pathfinding Simulator (demo-smart, not A*)
   ============================================================ */
class PathSimulator {
  constructor(world) {
    this.world = world;
    this.waypoints = [];
    this.fullPath = [];
    this.targetSurvivor = null;
    this.routeReachable = true;
  }

  /**
   * Pick nearest critical survivor, then risk, then safe.
   * Build a visually intelligent path using road-following + detours.
   */
  computeRoute(robotX, robotY, robotIndex = 0, robotCount = CONFIG.robotCount) {
    let active = this.world.survivors.filter(
      s => !s.rescued && !s.abandoned && (s.id - 1) % robotCount === robotIndex
    );
    if (active.length === 0) {
      active = this.world.survivors.filter(s => !s.rescued && !s.abandoned);
    }
    if (active.length === 0) {
      this.waypoints = [];
      this.fullPath = [];
      this.targetSurvivor = null;
      return;
    }

    // Priority: critical > risk > safe, then nearest
    const priority = { critical: 0, risk: 1, safe: 2 };
    active.sort((a, b) => {
      const pd = priority[a.zone] - priority[b.zone];
      if (pd !== 0) return pd;
      return Utils.dist(robotX, robotY, a.x, a.y) - Utils.dist(robotX, robotY, b.x, b.y);
    });

    this.targetSurvivor = active[0];
    const target = this.targetSurvivor;

    this.fullPath = this._buildVisualPath(robotX, robotY, target.x, target.y);
    this.waypoints = this.fullPath.filter((_, i) => i % 2 === 0 || i === this.fullPath.length - 1);
    const pathEnd = this.fullPath[this.fullPath.length - 1];
    this.routeReachable = pathEnd && Utils.dist(pathEnd.x, pathEnd.y, target.x, target.y) < 3;
  }

  _buildVisualPath(sx, sy, tx, ty) {
    const bfsPath = this.world.findPathBFS(sx, sy, tx, ty);
    if (bfsPath && bfsPath.length > 1) return bfsPath;

    // Fallback: greedy detour path
    const path = [{ x: sx, y: sy }];
    let cx = sx;
    let cy = sy;
    let steps = 0;

    while (Utils.dist(cx, cy, tx, ty) > 0.7 && steps < 400) {
      steps++;
      const dx = tx - cx;
      const dy = ty - cy;
      const len = Math.hypot(dx, dy) || 1;
      let nx = cx + (dx / len) * 0.85;
      let ny = cy + (dy / len) * 0.85;

      if (!this.world.canTraverse(cx, cy, nx, ny)) {
        const detours = [
          [0, -1], [0, 1], [-1, 0], [1, 0],
          [-1, -1], [1, -1], [-1, 1], [1, 1],
          [0, -2], [0, 2], [-2, 0], [2, 0],
        ].map(([dx2, dy2]) => ({ x: cx + dx2, y: cy + dy2 }))
          .sort((a, b) => Utils.dist(a.x, a.y, tx, ty) - Utils.dist(b.x, b.y, tx, ty));

        let found = false;
        for (const d of detours) {
          if (this.world.canTraverse(cx, cy, d.x, d.y)) {
            nx = d.x;
            ny = d.y;
            found = true;
            break;
          }
        }
        if (!found) {
          const safe = this.world.findNearestWalkable(cx, cy);
          nx = safe.x;
          ny = safe.y;
        }
      }

      if (this.world.canTraverse(cx, cy, nx, ny)) {
        cx = nx;
        cy = ny;
        path.push({ x: cx, y: cy });
      }
    }

    const targetCell = this.world.findNearestWalkable(tx, ty);
    path.push({ x: targetCell.x, y: targetCell.y });
    return path;
  }

  _nearestRoad(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const r of this.world.roads) {
      const d = Utils.dist(x, y, r.x, r.y);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  _smoothPath(path) {
    return path;
  }
}

/* ============================================================
   Robot Entity
   ============================================================ */
class Robot {
  constructor(x, y, def, robotIndex) {
    this.x = x;
    this.y = y;
    this.id = def.id;
    this.name = def.name;
    this.color = def.color;
    this.glow = def.glow;
    this.trailRgb = def.trail;
    this.robotIndex = robotIndex;
    this.pathSimulator = null;
    this.targetX = x;
    this.targetY = y;
    this.angle = 0;
    this.trail = [];
    this.maxTrail = 80;
    this.speed = CONFIG.robotSpeed;
    this.waypointIndex = 0;
    this.obstaclesAvoided = 0;
    this.stuckTicks = 0;
    this.state = 'patrol';
  }

  setPath(path) {
    this.path = (path || []).filter(p => p && typeof p.x === 'number');
    this.waypointIndex = 0;
    this.stuckTicks = 0;
    if (this.path.length > 0) {
      this.targetX = this.path[0].x;
      this.targetY = this.path[0].y;
    }
  }

  _tryMove(world, nextX, nextY, moveSpeed) {
    if (world.canTraverse(this.x, this.y, nextX, nextY)) {
      return { x: nextX, y: nextY, moved: true };
    }

    const dirs = [
      { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    dirs.sort((a, b) => {
      const da = Math.hypot(nextX - (this.x + a.x * moveSpeed), nextY - (this.y + a.y * moveSpeed));
      const db = Math.hypot(nextX - (this.x + b.x * moveSpeed), nextY - (this.y + b.y * moveSpeed));
      return da - db;
    });

    for (const scale of [1, 0.6, 0.35]) {
      const step = moveSpeed * scale;
      for (const d of dirs) {
        const sx = this.x + d.x * step;
        const sy = this.y + d.y * step;
        if (world.canTraverse(this.x, this.y, sx, sy)) {
          return { x: sx, y: sy, moved: true, avoided: true };
        }
      }
    }

    return { x: this.x, y: this.y, moved: false };
  }

  update(world) {
    if (!this.path || this.path.length === 0) return;

    if (world && !world.isWalkable(this.x, this.y)) {
      const safe = world.findNearestWalkable(this.x, this.y);
      this.x = safe.x;
      this.y = safe.y;
      this.stuckTicks = 0;
    }

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0.05) {
      this.angle = Math.atan2(dy, dx);
    }

    if (dist < 0.08) {
      this.waypointIndex++;
      this.stuckTicks = 0;
      if (this.waypointIndex < this.path.length) {
        this.targetX = this.path[this.waypointIndex].x;
        this.targetY = this.path[this.waypointIndex].y;
      }
      return;
    }

    const terrainMult = world ? world.getTerrainSpeedMultiplier(this.x, this.y) : 1;
    let moveSpeed = this.speed * terrainMult * (dist > 1 ? 1.15 : 1);
    if (this.stuckTicks > 5) moveSpeed *= 1.4;
    if (this.stuckTicks > 12) moveSpeed *= 1.8;

    const nextX = this.x + (dx / dist) * moveSpeed;
    const nextY = this.y + (dy / dist) * moveSpeed;

    const result = world
      ? this._tryMove(world, nextX, nextY, moveSpeed)
      : { x: nextX, y: nextY, moved: true };

    if (result.moved) {
      this.x = world.clampToBounds(result.x, result.y).x;
      this.y = world.clampToBounds(result.x, result.y).y;
      this.stuckTicks = 0;
      if (result.avoided) this.obstaclesAvoided++;
    } else {
      this.stuckTicks++;
      if (this.stuckTicks > 6 && this.waypointIndex < this.path.length - 1) {
        this.waypointIndex++;
        this.targetX = this.path[this.waypointIndex].x;
        this.targetY = this.path[this.waypointIndex].y;
        this.stuckTicks = 0;
      }
    }

    this.trail.push({ x: this.x, y: this.y, age: 0 });
    if (this.trail.length > this.maxTrail) this.trail.shift();
    this.trail.forEach(t => t.age++);
  }

  atTarget(threshold = 1.2) {
    if (!this.path || this.path.length === 0) return false;
    const last = this.path[this.path.length - 1];
    return Utils.dist(this.x, this.y, last.x, last.y) < threshold;
  }
}

/* ============================================================
   Simulation Map Renderer
   ============================================================ */
class MapRenderer {
  constructor(canvas, world, robots) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.robots = robots;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const container = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const pad = 4;
    const w = container.clientWidth - pad * 2;
    const h = container.clientHeight - pad * 2;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fit entire 56×42 grid in view
    CONFIG.cellSize = Math.min(w / CONFIG.gridCols, h / CONFIG.gridRows);
    const mapW = CONFIG.cellSize * CONFIG.gridCols;
    const mapH = CONFIG.cellSize * CONFIG.gridRows;
    this.offsetX = (w - mapW) / 2;
    this.offsetY = (h - mapH) / 2;
    this.displayW = w;
    this.displayH = h;
    this.mapW = mapW;
    this.mapH = mapH;
  }

  toScreen(gx, gy) {
    return {
      x: this.offsetX + gx * CONFIG.cellSize,
      y: this.offsetY + gy * CONFIG.cellSize,
    };
  }

  renderRoute(path, color = '#00d4ff', alpha = 0.55) {
    if (!path || path.length < 2) return;

    const ctx = this.ctx;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    ctx.save();
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = Math.max(1.5, CONFIG.cellSize * 0.12);
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();

    const start = this.toScreen(path[0].x, path[0].y);
    ctx.moveTo(start.x + CONFIG.cellSize / 2, start.y + CONFIG.cellSize / 2);

    for (let i = 1; i < path.length; i++) {
      const p = this.toScreen(path[i].x, path[i].y);
      ctx.lineTo(p.x + CONFIG.cellSize / 2, p.y + CONFIG.cellSize / 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  renderRoutes() {
    this.robots.forEach(robot => {
      const path = robot.pathSimulator?.fullPath;
      if (path) this.renderRoute(path, robot.color, 0.55);
    });
  }

  renderGrid() {
    const ctx = this.ctx;
    const cs = CONFIG.cellSize;

    // Background + full map bounds outline
    ctx.fillStyle = '#0a1018';
    ctx.fillRect(0, 0, this.displayW, this.displayH);

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.offsetX, this.offsetY, this.mapW, this.mapH);

    // Tiles
    for (let y = 0; y < this.world.rows; y++) {
      for (let x = 0; x < this.world.cols; x++) {
        const pos = this.toScreen(x, y);
        const t = this.world.tiles[y][x];

        switch (t) {
          case 1: // road
            ctx.fillStyle = '#141c28';
            ctx.fillRect(pos.x, pos.y, cs, cs);
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.strokeRect(pos.x, pos.y, cs, cs);
            break;
          case 2: // building
            ctx.fillStyle = '#1a2840';
            ctx.fillRect(pos.x + 1, pos.y + 1, cs - 2, cs - 2);
            break;
          case 3: // collapsed
            ctx.fillStyle = '#2a1a18';
            ctx.fillRect(pos.x, pos.y, cs, cs);
            break;
          case 4: // debris zone
            ctx.fillStyle = 'rgba(80, 60, 40, 0.35)';
            ctx.fillRect(pos.x, pos.y, cs, cs);
            break;
          case 8: // park
            ctx.fillStyle = 'rgba(20, 50, 35, 0.55)';
            ctx.fillRect(pos.x, pos.y, cs, cs);
            ctx.fillStyle = 'rgba(0, 180, 80, 0.12)';
            ctx.fillRect(pos.x + cs * 0.2, pos.y + cs * 0.2, cs * 0.6, cs * 0.6);
            break;
          default:
            ctx.fillStyle = '#0e1620';
            ctx.fillRect(pos.x, pos.y, cs, cs);
        }
      }
    }

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.04)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= this.world.cols; x++) {
      const px = this.offsetX + x * cs;
      ctx.beginPath();
      ctx.moveTo(px, this.offsetY);
      ctx.lineTo(px, this.offsetY + this.world.rows * cs);
      ctx.stroke();
    }
    for (let y = 0; y <= this.world.rows; y++) {
      const py = this.offsetY + y * cs;
      ctx.beginPath();
      ctx.moveTo(this.offsetX, py);
      ctx.lineTo(this.offsetX + this.world.cols * cs, py);
      ctx.stroke();
    }
  }

  renderBuildings() {
    const ctx = this.ctx;
    const cs = CONFIG.cellSize;

    const typeColors = {
      residential: '#1a3050',
      shop: '#243848',
      apartment: '#1e2848',
      compound: '#2a3548',
      temple: '#2a2840',
    };

    this.world.buildingStructures.forEach(b => {
      const pos = this.toScreen(b.x, b.y);
      const w = b.w * cs;
      const h = b.h * cs;
      const baseColor = typeColors[b.type] || '#1e3050';

      ctx.fillStyle = baseColor;
      ctx.fillRect(pos.x + 1, pos.y + 1, w - 2, h - 2);
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pos.x + 1, pos.y + 1, w - 2, h - 2);

      // Roof styles
      if (b.roof === 'dome') {
        ctx.fillStyle = 'rgba(255, 210, 63, 0.2)';
        ctx.beginPath();
        ctx.arc(pos.x + w / 2, pos.y + h * 0.3, w * 0.25, Math.PI, 0);
        ctx.fill();
      } else if (b.roof === 'terrace') {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.strokeRect(pos.x + 4, pos.y + 4, w - 8, h - 8);
      } else if (b.roof === 'courtyard') {
        const cx = pos.x + cs * 1.5;
        const cy = pos.y + cs * 1.5;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(cx, cy, (b.w - 3) * cs, (b.h - 3) * cs);
      }

      // Windows — varied by building type
      const windowColor = b.type === 'shop'
        ? 'rgba(255, 210, 63, 0.25)'
        : 'rgba(100, 180, 255, 0.18)';
      ctx.fillStyle = windowColor;
      for (let wy = 0; wy < b.h; wy++) {
        for (let wx = 0; wx < b.w; wx++) {
          if ((wx + wy + b.x) % (b.type === 'apartment' ? 1 : 2) === 0) {
            const wp = this.toScreen(b.x + wx, b.y + wy);
            ctx.fillRect(wp.x + cs * 0.25, wp.y + cs * 0.25, cs * 0.5, cs * 0.45);
          }
        }
      }
    });

    // Collapsed buildings
    this.world.collapsed.forEach((c, ci) => {
      const pos = this.toScreen(c.x, c.y);
      const w = c.w * cs;
      const h = c.h * cs;

      ctx.fillStyle = '#3a2018';
      ctx.fillRect(pos.x, pos.y, w, h);

      ctx.fillStyle = '#5a4030';
      for (let i = 0; i < 8; i++) {
        const seed = ci * 17 + i * 13;
        ctx.fillRect(
          pos.x + (seed * 7) % (w - 10) + 2,
          pos.y + (seed * 11) % (h - 8) + 2,
          4 + (seed % 8),
          3 + (seed % 6)
        );
      }
    });
  }

  renderCracks() {
    const ctx = this.ctx;
    const cs = CONFIG.cellSize;

    this.world.cracks.forEach(crack => {
      ctx.save();
      ctx.strokeStyle = crack.color;
      ctx.lineWidth = crack.type === 'danger' ? 3.5 : crack.type === 'caution' ? 2.5 : 1.5;
      ctx.shadowColor = crack.color;
      ctx.shadowBlur = crack.type === 'danger' ? 12 : 6;
      ctx.globalAlpha = 0.9;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      crack.points.forEach((pt, i) => {
        const sp = this.toScreen(pt.gx + pt.jx, pt.gy + pt.jy);
        const cx = sp.x + cs / 2;
        const cy = sp.y + cs / 2;
        i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
      });
      ctx.stroke();

      // Fissure width glow band
      if (crack.type !== 'safe') {
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = crack.type === 'danger' ? 8 : 5;
        ctx.stroke();
      }

      // Width label
      const mid = crack.points[Math.floor(crack.points.length / 2)];
      const mp = this.toScreen(mid.gx, mid.gy);
      ctx.font = '9px Rajdhani, sans-serif';
      ctx.fillStyle = crack.color;
      ctx.globalAlpha = 0.85;
      const label = crack.type === 'safe' ? `${crack.width}m ✓` : `${crack.width}m`;
      ctx.fillText(label, mp.x, mp.y - 5);

      ctx.restore();
    });
  }

  renderDangerZones() {
    const ctx = this.ctx;
    const cs = CONFIG.cellSize;

    this.world.dangerZones.forEach(dz => {
      const pos = this.toScreen(dz.x, dz.y);
      const r = dz.r * cs;

      const grad = ctx.createRadialGradient(
        pos.x + cs / 2, pos.y + cs / 2, 0,
        pos.x + cs / 2, pos.y + cs / 2, r
      );
      grad.addColorStop(0, 'rgba(255, 59, 92, 0.25)');
      grad.addColorStop(1, 'rgba(255, 59, 92, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pos.x + cs / 2, pos.y + cs / 2, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  renderVehicleDebris() {
    const ctx = this.ctx;
    const cs = CONFIG.cellSize;

    this.world.vehicleDebris.forEach(d => {
      const pos = this.toScreen(d.x, d.y);
      const cx = pos.x + cs / 2;
      const cy = pos.y + cs / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(d.rotation);
      ctx.scale(d.scale, d.scale);

      switch (d.type) {
        case 'car':
          ctx.fillStyle = '#4a3030';
          ctx.fillRect(-cs * 0.35, -cs * 0.15, cs * 0.7, cs * 0.3);
          ctx.fillStyle = '#555';
          ctx.fillRect(-cs * 0.28, -cs * 0.22, cs * 0.18, cs * 0.14);
          ctx.fillStyle = '#666';
          ctx.fillRect(cs * 0.08, -cs * 0.18, cs * 0.15, cs * 0.1);
          break;
        case 'tire':
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, cs * 0.18, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'metal':
          ctx.fillStyle = '#888';
          ctx.fillRect(-cs * 0.2, -cs * 0.08, cs * 0.4, cs * 0.06);
          ctx.fillRect(-cs * 0.1, -cs * 0.15, cs * 0.06, cs * 0.3);
          break;
        case 'bike':
          ctx.strokeStyle = '#555';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(-cs * 0.12, 0, cs * 0.1, 0, Math.PI * 2);
          ctx.arc(cs * 0.12, 0, cs * 0.1, 0, Math.PI * 2);
          ctx.moveTo(-cs * 0.12, 0);
          ctx.lineTo(cs * 0.12, 0);
          ctx.stroke();
          break;
      }
      ctx.restore();

      this._renderObstacleLabel(d.type, cx, cy + cs * 0.22, cs);

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(pos.x + 1, pos.y + 1, cs - 2, cs - 2);
      ctx.setLineDash([]);
      ctx.restore();
    });
  }

  _renderObstacleLabel(type, cx, cy, cs) {
    const sym = OBSTACLE_SYMBOLS[type];
    if (!sym) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `bold ${Math.max(6, cs * 0.22)}px Rajdhani, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 210, 63, 0.95)';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.fillText(sym.label, cx, cy);
    ctx.restore();
  }

  renderBuildingDebris() {
    const ctx = this.ctx;
    const cs = CONFIG.cellSize;

    this.world.buildingDebris.forEach(d => {
      const pos = this.toScreen(d.x, d.y);
      const cx = pos.x + cs / 2;
      const cy = pos.y + cs / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(d.rotation);

      switch (d.type) {
        case 'slab':
          ctx.fillStyle = '#6a6a6a';
          ctx.fillRect(-cs * 0.25, -cs * 0.08, cs * 0.5, cs * 0.16);
          break;
        case 'brick':
          ctx.fillStyle = '#8b4513';
          ctx.fillRect(-cs * 0.1, -cs * 0.06, cs * 0.2, cs * 0.12);
          break;
        case 'rod':
          ctx.strokeStyle = '#aaa';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-cs * 0.2, -cs * 0.15);
          ctx.lineTo(cs * 0.2, cs * 0.15);
          ctx.stroke();
          break;
        case 'glass':
          ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
          ctx.beginPath();
          ctx.moveTo(0, -cs * 0.12);
          ctx.lineTo(cs * 0.1, cs * 0.08);
          ctx.lineTo(-cs * 0.08, cs * 0.1);
          ctx.closePath();
          ctx.fill();
          break;
        case 'wall':
          ctx.fillStyle = '#5a5040';
          ctx.fillRect(-cs * 0.15, -cs * 0.2, cs * 0.08, cs * 0.4);
          ctx.fillRect(-cs * 0.05, -cs * 0.18, cs * 0.2, cs * 0.06);
          break;
      }
      ctx.restore();

      this._renderObstacleLabel(d.type, cx, cy + cs * 0.22, cs);

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pos.x + 2, pos.y + 2, cs - 4, cs - 4);
      ctx.restore();
    });
  }

  renderSurvivors(time) {
    const ctx = this.ctx;
    const cs = CONFIG.cellSize;

    this.world.survivors.forEach(s => {
      if (s.rescued) return;

      const pos = this.toScreen(s.x, s.y);
      const cx = pos.x + cs / 2;
      const cy = pos.y + cs / 2;
      const pulse = Math.sin(time * 0.003 + s.pulse) * 0.3 + 0.7;

      if (s.abandoned) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - cs * 0.12, cy - cs * 0.12);
        ctx.lineTo(cx + cs * 0.12, cy + cs * 0.12);
        ctx.moveTo(cx + cs * 0.12, cy - cs * 0.12);
        ctx.lineTo(cx - cs * 0.12, cy + cs * 0.12);
        ctx.stroke();
        ctx.fillStyle = '#555';
        ctx.font = '8px Rajdhani, sans-serif';
        ctx.fillText('ABANDONED', cx - cs * 0.28, cy + cs * 0.25);
        ctx.restore();
        return;
      }

      const colors = {
        safe: '#00e676',
        risk: '#ffd23f',
        critical: '#ff3b5c',
      };
      const color = colors[s.zone];

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = s.zone === 'critical' ? 16 * pulse : 8;

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3 + pulse * 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.28 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy - cs * 0.1, cs * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - cs * 0.06, cy - cs * 0.02, cs * 0.12, cs * 0.16);
      ctx.fillRect(cx - cs * 0.14, cy, cs * 0.08, cs * 0.04);
      ctx.fillRect(cx + cs * 0.06, cy, cs * 0.08, cs * 0.04);

      if (s.scanned) {
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - cs * 0.2, cy - cs * 0.22, cs * 0.4, cs * 0.38);
      }

      ctx.restore();
    });
  }

  renderTrails() {
    this.robots.forEach(robot => this.renderTrail(robot));
  }

  renderTrail(robot) {
    const ctx = this.ctx;
    const cs = CONFIG.cellSize;
    const trail = robot.trail;
    const rgb = robot.trailRgb;

    trail.forEach((t, i) => {
      const alpha = (i / trail.length) * 0.45;
      const pos = this.toScreen(t.x, t.y);
      ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pos.x + cs / 2, pos.y + cs / 2, Math.max(1.5, cs * 0.08), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  renderRobots() {
    this.robots.forEach(robot => this.renderRobot(robot));
  }

  renderRobot(robot) {
    const ctx = this.ctx;
    const cs = CONFIG.cellSize;
    const pos = this.toScreen(robot.x, robot.y);
    const cx = pos.x + cs / 2;
    const cy = pos.y + cs / 2;
    const angle = robot.angle;
    const s = cs * 0.85;
    const col = robot.color;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = robot.glow;
    ctx.lineWidth = Math.max(1, cs * 0.1);
    ctx.strokeRect(-s * 0.35, -s * 0.28, s * 0.7, s * 0.56);
    ctx.shadowBlur = 0;

    const wheelPositions = [
      [-s * 0.28, -s * 0.22], [s * 0.28, -s * 0.22],
      [-s * 0.28, s * 0.22], [s * 0.28, s * 0.22],
    ];
    wheelPositions.forEach(([wx, wy]) => {
      ctx.fillStyle = '#1a2030';
      ctx.fillRect(wx - s * 0.08, wy - s * 0.06, s * 0.16, s * 0.12);
      ctx.strokeStyle = '#334';
      ctx.lineWidth = 1;
      ctx.strokeRect(wx - s * 0.08, wy - s * 0.06, s * 0.16, s * 0.12);
    });

    ctx.fillStyle = '#2a3a50';
    ctx.fillRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.4);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.strokeRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.4);

    ctx.fillStyle = col;
    ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.005 + robot.id) * 0.3;
    ctx.beginPath();
    ctx.moveTo(s * 0.3, 0);
    ctx.lineTo(s * 0.5, -s * 0.12);
    ctx.lineTo(s * 0.5, s * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    const cr = parseInt(col.slice(1, 3), 16);
    const cg = parseInt(col.slice(3, 5), 16);
    const cb = parseInt(col.slice(5, 7), 16);
    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.1)`;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, -s * 0.12);
    ctx.lineTo(s * 0.9, -s * 0.25);
    ctx.lineTo(s * 0.9, s * 0.25);
    ctx.lineTo(s * 0.5, s * 0.12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ff3b5c';
    ctx.beginPath();
    ctx.arc(-s * 0.05, -s * 0.12, s * 0.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#8899aa';
    ctx.lineWidth = Math.max(1, cs * 0.06);
    ctx.beginPath();
    ctx.moveTo(-s * 0.15, s * 0.1);
    ctx.lineTo(-s * 0.25, s * 0.25);
    ctx.lineTo(-s * 0.15, s * 0.32);
    ctx.stroke();

    ctx.restore();

    // Robot label
    ctx.save();
    ctx.font = `bold ${Math.max(7, cs * 0.28)}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = col;
    ctx.fillText(robot.name, cx, cy - s * 0.38);
    ctx.restore();
  }

  render(time) {
    this.renderGrid();
    this.renderBuildings();
    this.renderDangerZones();
    this.renderCracks();
    this.renderVehicleDebris();
    this.renderBuildingDebris();
    this.renderTrails();
    this.renderRoutes();
    this.renderSurvivors(time);
    this.renderRobots();
  }
}

/* ============================================================
   Neuromorphic Network Visualizer
   ============================================================ */
class NeuralVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.connections = [];
    this.activeNodes = new Set();
    this._initNetwork();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
  }

  _initNetwork() {
    const layers = [4, 6, 5, 3];
    let nodeId = 0;

    layers.forEach((count, li) => {
      for (let i = 0; i < count; i++) {
        this.nodes.push({
          id: nodeId++,
          layer: li,
          index: i,
          pulse: Utils.rand(0, Math.PI * 2),
          activity: 0,
        });
      }
    });

    // Connect adjacent layers
    for (let li = 0; li < layers.length - 1; li++) {
      const curr = this.nodes.filter(n => n.layer === li);
      const next = this.nodes.filter(n => n.layer === li + 1);
      curr.forEach(a => {
        next.forEach(b => {
          if (Math.random() > 0.35) {
            this.connections.push({ from: a.id, to: b.id, strength: Utils.rand(0.2, 1) });
          }
        });
      });
    }
  }

  triggerPulse() {
    const inputNodes = this.nodes.filter(n => n.layer === 0);
    const count = Utils.randInt(2, 4);
    for (let i = 0; i < count; i++) {
      const node = inputNodes[Utils.randInt(0, inputNodes.length - 1)];
      this.activeNodes.add(node.id);
      node.activity = 1;
    }

    // Propagate
    setTimeout(() => {
      this.nodes.filter(n => n.layer === 1).forEach(n => {
        if (Math.random() > 0.4) {
          this.activeNodes.add(n.id);
          n.activity = Utils.rand(0.5, 1);
        }
      });
    }, 150);

    setTimeout(() => {
      this.nodes.filter(n => n.layer >= 2).forEach(n => {
        if (Math.random() > 0.5) {
          this.activeNodes.add(n.id);
          n.activity = Utils.rand(0.3, 0.9);
        }
      });
    }, 300);

    setTimeout(() => this.activeNodes.clear(), 800);
  }

  _getNodePos(node) {
    const layers = [4, 6, 5, 3];
    const layerCount = layers[node.layer];
    const x = ((node.layer + 1) / (layers.length + 1)) * this.w;
    const y = ((node.index + 1) / (layerCount + 1)) * this.h;
    return { x, y };
  }

  render(time) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // Connections
    this.connections.forEach(conn => {
      const from = this.nodes.find(n => n.id === conn.from);
      const to = this.nodes.find(n => n.id === conn.to);
      const fp = this._getNodePos(from);
      const tp = this._getNodePos(to);

      const active = this.activeNodes.has(from.id) && this.activeNodes.has(to.id);
      ctx.strokeStyle = active
        ? `rgba(168, 85, 247, ${conn.strength * 0.8})`
        : `rgba(100, 120, 160, ${conn.strength * 0.2})`;
      ctx.lineWidth = active ? 2 : 1;
      if (active) {
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.moveTo(fp.x, fp.y);
      ctx.lineTo(tp.x, tp.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // Nodes
    this.nodes.forEach(node => {
      const pos = this._getNodePos(node);
      const pulse = Math.sin(time * 0.004 + node.pulse) * 0.3 + 0.7;
      const isActive = this.activeNodes.has(node.id);
      const r = isActive ? 6 + pulse * 2 : 4 + pulse;

      ctx.save();
      if (isActive) {
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 14;
        ctx.fillStyle = `rgba(168, 85, 247, ${0.6 + node.activity * 0.4})`;
      } else {
        ctx.fillStyle = `rgba(60, 80, 120, ${0.4 + pulse * 0.2})`;
      }
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();

      if (isActive) {
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    });
  }
}

/* ============================================================
   Telemetry & Stats Manager
   ============================================================ */
class TelemetryManager {
  constructor() {
    this.missionStart = Date.now();
    this.missionSeconds = 0;

    this.robot = {
      battery: 87,
      speed: 1.4,
      temperature: 42,
      cpu: 34,
    };

    this.mission = {
      survivors: 12,
      saved: 3,
      safeZone: 4,
      riskZone: 3,
      criticalZone: 2,
      obstaclesAvoided: 0,
      efficiency: 76,
    };

    this.sensors = [
      { name: 'Proximity Sensor', value: 2.4, unit: 'm', status: 'safe', max: 5 },
      { name: 'Thermal Sensor', value: 36.8, unit: '°C', status: 'safe', max: 80 },
      { name: 'Gas Sensor', value: 12, unit: 'ppm', status: 'safe', max: 100 },
      { name: 'LiDAR Status', value: 98, unit: '%', status: 'safe', max: 100 },
      { name: 'Crack Width Scanner', value: 0.3, unit: 'm', status: 'safe', max: 3 },
    ];

    this._renderSensors();
  }

  _renderSensors() {
    const list = document.getElementById('sensorList');
    list.innerHTML = this.sensors.map((s, i) => `
      <div class="sensor-row" data-sensor="${i}">
        <div class="sensor-info">
          <span class="sensor-name">${s.name}</span>
          <span class="sensor-value" id="sensorVal${i}">${s.value}${s.unit === '%' ? '%' : ' ' + s.unit}</span>
        </div>
        <div class="sensor-right">
          <div class="sensor-bar-wrap">
            <div class="sensor-bar" id="sensorBar${i}" style="width:${(s.value / s.max) * 100}%;background:${this._barColor(s.status)}"></div>
          </div>
          <span class="status-badge ${s.status}" id="sensorBadge${i}">${s.status.toUpperCase()}</span>
        </div>
      </div>
    `).join('');
  }

  _barColor(status) {
    return status === 'safe' ? '#00e676' : status === 'warning' ? '#ffd23f' : '#ff3b5c';
  }

  _flashStat(id) {
    const card = document.querySelector(`[data-stat="${id}"]`);
    if (card) {
      card.classList.remove('updated');
      void card.offsetWidth;
      card.classList.add('updated');
    }
  }

  updateRobot() {
    this.robot.battery = Utils.clamp(this.robot.battery - Utils.rand(0, 0.3), 15, 100);
    this.robot.speed = Utils.clamp(this.robot.speed + Utils.rand(-0.15, 0.15), 0.4, 2.2);
    this.robot.temperature = Utils.clamp(this.robot.temperature + Utils.rand(-1, 1.5), 35, 65);
    this.robot.cpu = Utils.clamp(this.robot.cpu + Utils.rand(-5, 8), 15, 95);

    document.getElementById('statBattery').textContent = `${Math.round(this.robot.battery)}%`;
    document.getElementById('barBattery').style.width = `${this.robot.battery}%`;
    document.getElementById('statSpeed').textContent = `${this.robot.speed.toFixed(1)} m/s`;
    document.getElementById('statTemp').textContent = `${Math.round(this.robot.temperature)}°C`;
    document.getElementById('statCpu').textContent = `${Math.round(this.robot.cpu)}%`;
    document.getElementById('barCpu').style.width = `${this.robot.cpu}%`;

    ['battery', 'speed', 'temperature', 'cpu'].forEach(s => this._flashStat(s));
  }

  updateMission(world) {
    const pending = world.survivors.filter(s => !s.rescued && !s.abandoned);
    this.mission.survivors = world.survivors.filter(s => !s.abandoned).length;
    this.mission.saved = world.survivors.filter(s => s.rescued).length;
    this.mission.safeZone = pending.filter(s => s.zone === 'safe').length;
    this.mission.riskZone = pending.filter(s => s.zone === 'risk').length;
    this.mission.criticalZone = pending.filter(s => s.zone === 'critical').length;
    this.mission.efficiency = Utils.clamp(
      Math.round((this.mission.saved / Math.max(world.survivors.length, 1)) * 100 + Utils.rand(-2, 3)),
      40, 98
    );

    document.getElementById('statSurvivors').textContent = this.mission.survivors;
    document.getElementById('statSaved').textContent = this.mission.saved;
    document.getElementById('statSafeZone').textContent = this.mission.safeZone;
    document.getElementById('statRiskZone').textContent = this.mission.riskZone;
    document.getElementById('statCriticalZone').textContent = this.mission.criticalZone;
    document.getElementById('statObstacles').textContent = this.mission.obstaclesAvoided;
    document.getElementById('statEfficiency').textContent = `${this.mission.efficiency}%`;

    const ring = document.getElementById('efficiencyRing');
    const circumference = 213.6;
    ring.style.strokeDashoffset = circumference - (this.mission.efficiency / 100) * circumference;
  }

  updateSensors(world, robot) {
    // Proximity — distance to nearest obstacle/survivor
    let minDist = 5;
    world.survivors.filter(s => !s.rescued && !s.abandoned).forEach(s => {
      minDist = Math.min(minDist, Utils.dist(robot.x, robot.y, s.x, s.y));
    });
    this.sensors[0].value = Utils.clamp(minDist + Utils.rand(-0.3, 0.3), 0.5, 5);

    this.sensors[1].value = Utils.clamp(30 + Utils.rand(0, 15), 25, 70);
    this.sensors[2].value = Utils.clamp(Utils.rand(8, 45), 5, 100);
    this.sensors[3].value = Utils.clamp(Utils.rand(94, 100), 85, 100);

    // Crack scanner — detect nearby crack width
    let nearestCrackWidth = 0;
    world.cracks.forEach(c => {
      c.points.forEach(pt => {
        const d = Utils.dist(robot.x, robot.y, pt.gx, pt.gy);
        if (d < 3) nearestCrackWidth = Math.max(nearestCrackWidth, c.width);
      });
    });
    this.sensors[4].value = nearestCrackWidth || Utils.rand(0.1, 0.4);

    this.sensors.forEach((s, i) => {
      s.status = this._computeStatus(s, i);
      const valEl = document.getElementById(`sensorVal${i}`);
      const barEl = document.getElementById(`sensorBar${i}`);
      const badgeEl = document.getElementById(`sensorBadge${i}`);

      valEl.textContent = i === 3
        ? `${Math.round(s.value)}%`
        : `${s.value.toFixed(i === 4 ? 1 : 1)} ${s.unit}`;

      barEl.style.width = `${(s.value / s.max) * 100}%`;
      barEl.style.background = this._barColor(s.status);
      badgeEl.className = `status-badge ${s.status}`;
      badgeEl.textContent = s.status.toUpperCase();
    });
  }

  _computeStatus(sensor, index) {
    if (index === 0) return sensor.value < 1.5 ? 'critical' : sensor.value < 2.5 ? 'warning' : 'safe';
    if (index === 1) return sensor.value > 55 ? 'critical' : sensor.value > 45 ? 'warning' : 'safe';
    if (index === 2) return sensor.value > 60 ? 'critical' : sensor.value > 30 ? 'warning' : 'safe';
    if (index === 3) return sensor.value < 90 ? 'warning' : 'safe';
    if (index === 4) return sensor.value > 1.5 ? 'critical' : sensor.value > 0.5 ? 'warning' : 'safe';
    return 'safe';
  }
}

/* ============================================================
   Decision Log Manager
   ============================================================ */
class DecisionLog {
  constructor(container) {
    this.container = container;
    this.maxEntries = 20;
    this.messages = [
      { text: 'Obstacle detected ahead', type: 'warning' },
      { text: 'Unsafe crack detected — width <strong>1.8m</strong>', type: 'critical' },
      { text: 'Neural spike intensity: <strong>0.92</strong>', type: '' },
      { text: 'Concrete debris blocking route', type: 'warning' },
      { text: 'Alternate path computed', type: '' },
      { text: 'Survivor detected in <strong>critical zone</strong>', type: 'critical' },
      { text: 'Decision: <strong>Turn right</strong>', type: '' },
      { text: 'Confidence: <strong>93%</strong>', type: 'success' },
      { text: 'Rescue completed — evacuating survivor', type: 'success' },
      { text: 'Survivor unreachable — <strong>abandoning rescue attempt</strong>', type: 'critical' },
      { text: 'Vehicle debris blocking lane — rerouting', type: 'warning' },
      { text: 'Concrete slab detected — detour computed', type: 'warning' },
      { text: 'Safe crack crossed — width <strong>0.4m</strong>', type: '' },
      { text: 'Steel rod obstacle avoided', type: 'warning' },
      { text: 'Thermal signature detected behind debris', type: 'warning' },
      { text: 'Gas levels elevated — reducing speed', type: 'warning' },
      { text: 'Neuromorphic core adapting to terrain', type: '' },
      { text: 'Path recalculated — prioritizing critical survivor', type: 'critical' },
      { text: 'Caution crack ahead — reducing velocity', type: 'warning' },
      { text: 'Robotic arm deployed for debris clearance', type: '' },
      { text: 'Battery optimization mode engaged', type: '' },
      { text: 'Multi-sensor fusion confidence: <strong>89%</strong>', type: 'success' },
    ];
  }

  add(message, type = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `
      <span class="log-time">${Utils.nowTimeStr()}</span>
      <span class="log-msg">${message}</span>
    `;
    this.container.prepend(entry);

    while (this.container.children.length > this.maxEntries) {
      this.container.removeChild(this.container.lastChild);
    }
  }

  addRandom() {
    const msg = this.messages[Utils.randInt(0, this.messages.length - 1)];
    this.add(msg.text, msg.type);
  }
}

/* ============================================================
   Alert Manager
   ============================================================ */
class AlertManager {
  constructor() {
    this.banner = document.getElementById('alertBanner');
    this.text = document.getElementById('alertText');
    this.alerts = [
      { text: 'All systems nominal — monitoring active', level: 'normal' },
      { text: 'CRITICAL: Survivor detected in collapse zone Sector B-4', level: 'critical' },
      { text: 'WARNING: Unstable debris field ahead — rerouting', level: 'warning' },
      { text: 'Gas leak detected — proceeding with caution', level: 'warning' },
      { text: 'Rescue in progress — stand by for extraction', level: 'normal' },
      { text: 'EMERGENCY: Danger crack blocking primary route', level: 'critical' },
      { text: 'Thermal anomaly detected — possible survivor', level: 'warning' },
    ];
  }

  showRandom() {
    const alert = this.alerts[Utils.randInt(0, this.alerts.length - 1)];
    this.text.textContent = alert.text;
    this.banner.className = 'alert-banner';
    if (alert.level === 'warning') this.banner.classList.add('warning');
    if (alert.level === 'critical') this.banner.classList.add('critical');
  }
}

/* ============================================================
   Main Application Controller
   ============================================================ */
class App {
  constructor() {
    this.world = new World(CONFIG.gridCols, CONFIG.gridRows);
    const spawns = [];
    this.robots = ROBOT_DEFS.map((def, i) => {
      const spawn = this.world.getSafeSpawn(spawns);
      spawns.push(spawn);
      const robot = new Robot(spawn.x, spawn.y, def, i);
      robot.pathSimulator = new PathSimulator(this.world);
      return robot;
    });
    this.robot = this.robots[0];

    this.telemetry = new TelemetryManager();
    this.decisionLog = new DecisionLog(document.getElementById('decisionLog'));
    this.alertManager = new AlertManager();

    this.simCanvas = document.getElementById('simCanvas');
    this.neuralCanvas = document.getElementById('neuralCanvas');
    this.mapRenderer = new MapRenderer(this.simCanvas, this.world, this.robots);
    this.neuralViz = new NeuralVisualizer(this.neuralCanvas);

    this.pursuitTargetId = null;
    this.pursuitTicks = 0;

    this._init();
  }

  _init() {
    const count = this.world.survivors.length;
    this.decisionLog.add('NeuroRescue systems online — mission initiated', 'success');
    this.decisionLog.add('Loading neuromorphic decision core…', '');
    this.decisionLog.add(`Grid scan complete — <strong>${count} survivors</strong> detected`, 'warning');
    this.decisionLog.add(`<strong>3 rescue robots</strong> deployed — NR-1, NR-2, NR-3`, 'success');
    this.decisionLog.add('Avoidable debris mapped — pathfinding active', '');

    this._recalculatePaths();
    this._startClocks();
    this._startSimulationLoop();
    this._startTelemetryLoop();
  }

  _recalculatePaths() {
    const statusParts = [];

    this.robots.forEach(robot => {
      robot.pathSimulator.computeRoute(robot.x, robot.y, robot.robotIndex, CONFIG.robotCount);
      robot.setPath(robot.pathSimulator.fullPath);
      robot.stuckTicks = 0;

      const target = robot.pathSimulator.targetSurvivor;
      if (target) {
        target.scanned = true;
        statusParts.push(`${robot.name}→#${target.id}`);
      } else {
        statusParts.push(`${robot.name}: idle`);
      }
    });

    document.getElementById('robotStatus').textContent =
      statusParts.length ? statusParts.join('  |  ') : 'All robots: mission complete';
  }

  _recalculatePath() {
    this._recalculatePaths();
  }

  _abandonSurvivor(target, reason) {
    target.abandoned = true;
    this.pursuitTargetId = null;
    this.pursuitTicks = 0;
    this.decisionLog.add(
      `Survivor #${target.id} unreachable — <strong>${reason}</strong>`,
      'critical'
    );
    document.getElementById('alertText').textContent =
      `ABANDONED: Survivor #${target.id} — ${reason}`;
    document.getElementById('alertBanner').className = 'alert-banner critical';
    this._recalculatePath();
  }

  _startClocks() {
    setInterval(() => {
      document.getElementById('liveClock').textContent = Utils.nowTimeStr();
    }, 1000);

    setInterval(() => {
      this.telemetry.missionSeconds++;
      document.getElementById('missionTimer').textContent =
        Utils.formatTime(this.telemetry.missionSeconds);
    }, 1000);
  }

  _startSimulationLoop() {
    const loop = (time) => {
      this.robots.forEach(robot => {
        robot.update(this.world);
        if (robot.stuckTicks > 10) {
          robot.pathSimulator.computeRoute(robot.x, robot.y, robot.robotIndex, CONFIG.robotCount);
          robot.setPath(robot.pathSimulator.fullPath);
          robot.stuckTicks = 0;
        }
      });

      this.mapRenderer.render(time);
      this.neuralViz.render(time);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _startTelemetryLoop() {
    setInterval(() => this._tick(), CONFIG.tickInterval);
    // Initial tick after short delay
    setTimeout(() => this._tick(), 500);
  }

  _tick() {
    let rescuedThisTick = false;
    this.robots.forEach(robot => {
      const target = robot.pathSimulator.targetSurvivor;
      if (target && !target.rescued && !target.abandoned && robot.atTarget()) {
        target.rescued = true;
        rescuedThisTick = true;
        this.decisionLog.add(
          `${robot.name} rescue completed — Survivor #${target.id} evacuated`,
          'success'
        );
        this.alertManager.showRandom();
        this.neuralViz.triggerPulse();
      }
    });

    if (rescuedThisTick) this._recalculatePaths();

    if (Math.random() > 0.55) {
      this._recalculatePaths();
      const lead = this.robots[0];
      if (this.world.isNearAvoidableObstacle(lead.x, lead.y, 1.5)) {
        this.decisionLog.add('Obstacle detected — alternate path computed', 'warning');
      }
    }

    const totalAvoided = this.robots.reduce((sum, r) => sum + r.obstaclesAvoided, 0);
    this.telemetry.updateRobot();
    this.telemetry.updateMission(this.world);
    this.telemetry.mission.obstaclesAvoided = totalAvoided;
    document.getElementById('statObstacles').textContent = totalAvoided;
    this.telemetry.updateSensors(this.world, this.robots[0]);
    this.decisionLog.addRandom();
    this.neuralViz.triggerPulse();

    if (Math.random() > 0.7) {
      this.alertManager.showRandom();
    }

    this._contextualLogs();
  }

  _contextualLogs() {
    const lead = this.robots[0];
    const { x, y } = lead;

    this.world.cracks.forEach(c => {
      c.points.forEach(pt => {
        if (Utils.dist(x, y, pt.gx, pt.gy) < 1.5) {
          if (c.type === 'danger') {
            this.decisionLog.add(`Unsafe crack detected — width <strong>${c.width}m</strong>`, 'critical');
          } else if (c.type === 'caution') {
            this.decisionLog.add(`Caution crack — width <strong>${c.width}m</strong>, reducing speed`, 'warning');
          } else if (c.type === 'safe') {
            this.decisionLog.add(`Safe crack crossed — width <strong>${c.width}m</strong>`, '');
          }
        }
      });
    });

    if (this.world.isNearAvoidableObstacle(x, y, 1.0)) {
      this.decisionLog.add('Avoidable debris in proximity — steering around obstacle', 'warning');
    }
  }
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
