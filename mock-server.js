import express from "express";

const app = express();
const PORT = process.env.MOCK_PORT || 5174;

// Simple in-memory entitlement flag for the single book
let active = true;

app.get("/entitlement/status", (req, res) => {
  res.json({
    active,
    checkedAt: new Date().toISOString(),
  });
});

app.post("/admin/entitlement/set", express.json(), (req, res) => {
  if (typeof req.body.active === "boolean") {
    active = req.body.active;
  }
  res.json({ active });
});

app.get("/admin/entitlement/set", (req, res) => {
  const val = req.query.active;
  if (val === "true" || val === "1") active = true;
  if (val === "false" || val === "0") active = false;
  res.json({ active });
});

app.listen(PORT, () => {
  console.log(`Mock entitlement server running on http://localhost:${PORT}`);
});
