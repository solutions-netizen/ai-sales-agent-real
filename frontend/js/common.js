// frontend/js/common.js — shared utilities

const STAGES = ["new", "contacted", "quoted", "applied", "placed", "lost"];

const STAGE_COLORS = {
  new: "#2980b9", contacted: "#d68910", quoted: "#8e44ad",
  applied: "#1a7fb5", placed: "#27ae60", lost: "#e74c3c",
};

const PRODUCT_LABELS = {
  "term-life":           "Term Life",
  "whole-life":          "Whole Life",
  "iul":                 "IUL",
  "final-expense":       "Final Expense",
  "mortgage-protection": "Mortgage Protection",
  "annuity":             "Annuity",
};

const ACTIVITY_ICONS = {
  call: "📞", sms: "💬", email: "📧", note: "📝",
  "stage-change": "🔄", "referral-sent": "🤝", "score-update": "⭐",
};

function toast(message, type = "default") {
  const container = document.getElementById("toast-container") ||
    (() => {
      const el = document.createElement("div");
      el.id = "toast-container";
      document.body.appendChild(el);
      return el;
    })();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function stageBadge(stage) {
  return `<span class="badge badge-${stage}">${stage}</span>`;
}

function scoreBar(score) {
  const cls = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return `<div class="score-bar">
    <div class="score-track"><div class="score-fill ${cls}" style="width:${score}%"></div></div>
    <span class="score-num">${score}</span>
  </div>`;
}

function productLabel(p) {
  return PRODUCT_LABELS[p] || p || "—";
}

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`/api${path}`, opts);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

function setActivePage(id) {
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === id);
  });
}
