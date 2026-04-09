const express = require('express');
const path    = require('path');
const db      = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ok  = (res, data) => res.json(data ?? { success: true });
const err = (res, msg, code = 400) => res.status(code).json({ error: msg });

app.get('/api/stats',    (req, res) => ok(res, db.getStats()));
app.get('/api/spots',    (req, res) => ok(res, db.getSpots()));
app.get('/api/zones',    (req, res) => ok(res, db.getZones()));
app.get('/api/vehicles', (req, res) => ok(res, db.getVehicles()));
app.get('/api/current',  (req, res) => ok(res, db.getCurrent()));
app.get('/api/history',  (req, res) => ok(res, db.getHistory(Math.min(parseInt(req.query.limit) || 100, 500))));

app.get('/api/find/:plate', (req, res) => {
  const r = db.find(req.params.plate.toUpperCase());
  ok(res, r ? { found: true, ...r } : { found: false });
});

app.post('/api/zones', (req, res) => {
  const { name } = req.body;
  if (!name) return err(res, '区域名称不能为空');
  try { db.addZone(name.trim()); ok(res); } catch (e) { err(res, e.message); }
});

app.post('/api/spots', (req, res) => {
  const { code, zone_name } = req.body;
  if (!code || !zone_name) return err(res, '参数不完整');
  try { db.addSpot(code.trim(), zone_name.trim()); ok(res); } catch (e) { err(res, e.message); }
});

app.delete('/api/spots/:code', (req, res) => {
  try { db.deleteSpot(req.params.code); ok(res); } catch (e) { err(res, e.message); }
});

app.post('/api/vehicles', (req, res) => {
  const { plate, type, owner } = req.body;
  if (!plate) return err(res, '车牌号不能为空');
  try { db.addVehicle(plate.toUpperCase().trim(), type, owner); ok(res); } catch (e) { err(res, e.message); }
});

app.delete('/api/vehicles/:plate', (req, res) => {
  db.deleteVehicle(req.params.plate); ok(res);
});

app.post('/api/park', (req, res) => {
  const { plate, spot_code, operator } = req.body;
  if (!plate || !spot_code) return err(res, '参数不完整');
  try { db.park(plate.toUpperCase().trim(), spot_code, operator); ok(res); } catch (e) { err(res, e.message); }
});

app.post('/api/leave', (req, res) => {
  const { plate, operator } = req.body;
  if (!plate) return err(res, '车牌不能为空');
  const spot = db.leave(plate.toUpperCase().trim(), operator);
  ok(res, { success: true, spot_code: spot });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ 停车管理系统已启动: http://localhost:${PORT}`));
