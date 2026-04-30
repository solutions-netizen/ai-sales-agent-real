// backend/services/activityService.js
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";

export function logActivity(leadId, type, description, metadata = {}) {
  db.prepare(`
    INSERT INTO activity (id, lead_id, type, description, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), leadId || null, type, description, JSON.stringify(metadata));
}
