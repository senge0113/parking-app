// 纯 JSON 文件数据库，零依赖，无需编译
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data.json');

function now() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
    .replace(/\//g, '-');
}

function initData() {
  const zoneDef = [
    { name: 'A区', count: 20 },
    { name: 'B区', count: 20 },
    { name: 'C区', count: 10 },
  ];
  const spots = [];
  zoneDef.forEach(({ name, count }) => {
    for (let i = 1; i <= count; i++) {
      spots.push({ code: `${name}-${String(i).padStart(2, '0')}`, zone_name: name, display_order: i });
    }
  });
  return {
    zones: zoneDef.map(({ name }, i) => ({ name, sort: i })),
    spots,
    vehicles:        [],
    current_parking: [],   // { spot_code, plate, operator, parked_at }
    history:         [],   // { id, plate, spot_code, action, operator, timestamp }
    _nextId: 1,
  };
}

let _d = null;

function load() {
  if (_d) return _d;
  _d = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : initData();
  if (!_d._nextId) _d._nextId = (_d.history.length ? Math.max(..._d.history.map(h => h.id)) + 1 : 1);
  return _d;
}

function save() { fs.writeFileSync(FILE, JSON.stringify(_d, null, 2)); }

// ── 查询 ───────────────────────────────────────────────────────────────────
exports.getStats = () => {
  const d = load();
  return { total: d.spots.length, occupied: d.current_parking.length,
           available: d.spots.length - d.current_parking.length, vehicles: d.vehicles.length };
};

exports.getSpots = () => {
  const d = load();
  return d.spots.map(s => {
    const cp = d.current_parking.find(p => p.spot_code === s.code) || {};
    return { ...s, plate: cp.plate || null, operator: cp.operator || null, parked_at: cp.parked_at || null };
  }).sort((a, b) => {
    const zc = a.zone_name.localeCompare(b.zone_name, 'zh');
    return zc !== 0 ? zc : a.display_order - b.display_order;
  });
};

exports.getZones   = () => load().zones.slice().sort((a, b) => a.sort - b.sort);
exports.getVehicles= () => load().vehicles.slice().sort((a, b) => a.plate.localeCompare(b.plate));
exports.getHistory = (limit) => load().history.slice().reverse().slice(0, limit);
exports.getCurrent = () => {
  const d = load();
  return d.current_parking.map(cp => {
    const s = d.spots.find(x => x.code === cp.spot_code) || {};
    return { ...cp, zone_name: s.zone_name || '' };
  }).sort((a, b) => b.parked_at.localeCompare(a.parked_at));
};

exports.find = (plate) => {
  const d = load();
  const cp = d.current_parking.find(p => p.plate === plate);
  if (!cp) return null;
  const s = d.spots.find(x => x.code === cp.spot_code) || {};
  return { ...cp, zone_name: s.zone_name || '' };
};

// ── 写操作 ─────────────────────────────────────────────────────────────────
exports.addZone = (name) => {
  const d = load();
  if (d.zones.find(z => z.name === name)) throw new Error('区域已存在');
  d.zones.push({ name, sort: d.zones.length });
  save();
};

exports.addSpot = (code, zone_name) => {
  const d = load();
  if (d.spots.find(s => s.code === code)) throw new Error('车位编号已存在');
  const maxOrd = d.spots.filter(s => s.zone_name === zone_name).reduce((m, s) => Math.max(m, s.display_order), 0);
  d.spots.push({ code, zone_name, display_order: maxOrd + 1 });
  save();
};

exports.deleteSpot = (code) => {
  const d = load();
  if (d.current_parking.find(p => p.spot_code === code)) throw new Error('车位有车辆停放，无法删除');
  d.spots = d.spots.filter(s => s.code !== code);
  save();
};

exports.addVehicle = (plate, type, owner) => {
  const d = load();
  if (d.vehicles.find(v => v.plate === plate)) throw new Error('车牌已存在');
  d.vehicles.push({ plate, type: type || '', owner: owner || '', created_at: now() });
  save();
};

exports.deleteVehicle = (plate) => {
  const d = load(); d.vehicles = d.vehicles.filter(v => v.plate !== plate); save();
};

exports.park = (plate, spot_code, operator) => {
  const d = load();
  const atSpot = d.current_parking.find(p => p.spot_code === spot_code);
  if (atSpot && atSpot.plate !== plate) throw new Error(`该车位已被 ${atSpot.plate} 占用`);

  const prev = d.current_parking.find(p => p.plate === plate);
  if (prev) {
    d.current_parking = d.current_parking.filter(p => p.plate !== plate);
    d.history.push({ id: d._nextId++, plate, spot_code: prev.spot_code, action: 'leave', operator: operator || '系统移车', timestamp: now() });
  }

  d.current_parking = d.current_parking.filter(p => p.spot_code !== spot_code);
  d.current_parking.push({ spot_code, plate, operator: operator || '', parked_at: now() });
  d.history.push({ id: d._nextId++, plate, spot_code, action: 'park', operator: operator || '', timestamp: now() });
  save();
};

exports.leave = (plate, operator) => {
  const d = load();
  const rec = d.current_parking.find(p => p.plate === plate);
  if (rec) {
    d.current_parking = d.current_parking.filter(p => p.plate !== plate);
    d.history.push({ id: d._nextId++, plate, spot_code: rec.spot_code, action: 'leave', operator: operator || '', timestamp: now() });
    save();
    return rec.spot_code;
  }
  return null;
};
