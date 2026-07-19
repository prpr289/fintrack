import { effectiveDue, addDays } from "./notif-due.mjs";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var JWT_EXPIRY_HOURS = 24 * 30;
var DEFAULT_CATEGORIES = [
  { name: "\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E22", color: "#1A7A4A", type: "both" },
  { name: "Delivery", color: "#7C3AED", type: "both" },
  { name: "\u0E27\u0E31\u0E15\u0E16\u0E38\u0E14\u0E34\u0E1A", color: "#C0392B", type: "expense" },
  { name: "\u0E04\u0E48\u0E32\u0E40\u0E0A\u0E48\u0E32", color: "#B45309", type: "expense" },
  { name: "\u0E04\u0E48\u0E32\u0E44\u0E1F/\u0E19\u0E49\u0E33", color: "#0369A1", type: "expense" },
  { name: "\u0E40\u0E07\u0E34\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19", color: "#BE185D", type: "expense" },
  { name: "\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27", color: "#6B7280", type: "both" },
  { name: "\u0E2D\u0E37\u0E48\u0E19\u0E46", color: "#9CA3AF", type: "both" }
];
var DEFAULT_WALLETS = [
  { name: "\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14", scope: "business", type: "cash", color: "#1A7A4A" },
  { name: "\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E18\u0E19\u0E32\u0E04\u0E32\u0E23", scope: "business", type: "bank", color: "#0369A1" },
  { name: "\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27", scope: "personal", type: "cash", color: "#6B7280" }
];
var worker_default = {
  async scheduled(event, env, ctx) {
    const thaiHour = (new Date(event.scheduledTime).getUTCHours() + 7) % 24;
    await processRecurring(env, thaiHour);
    if (thaiHour === 0) await cleanupDrafts(env);
  },
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    try {
      if (path === "/auth/register" && method === "POST") return cors(await handleRegister(request, env));
      if (path === "/auth/login" && method === "POST") return cors(await handleLogin(request, env));
      if (path === "/health") return cors(json({ ok: true, time: (/* @__PURE__ */ new Date()).toISOString(), version: "v2" }));
      if (path === "/ws") return handleWebSocket(request, env);
      const auth = await requireAuth(request, env);
      if (!auth.ok) return cors(json({ error: auth.error }, auth.status || 401));
      const user = auth.user;
      if (path === "/me" && method === "GET") { const fullUser = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND is_active = 1").bind(user.id).first(); return cors(json({ user: formatUser(fullUser || user) })); }
      if (path === "/me" && method === "PATCH") return cors(await updateMyProfile(request, env, user));
      if (path === "/me/password" && method === "POST") return cors(await changeMyPassword(request, env, user));
      if (path === "/transactions" && method === "GET") return cors(await listTransactions(request, env, user));
      if (path === "/transactions" && method === "POST") return cors(await createTransaction(request, env, user));
      const txMatch = path.match(/^\/transactions\/([a-zA-Z0-9_-]+)$/);
      if (txMatch && method === "PATCH") return cors(await updateTransaction(txMatch[1], request, env, user));
      if (txMatch && method === "DELETE") return cors(await deleteTransaction(txMatch[1], env, user));
      if (path === "/transfers" && method === "POST") return cors(await createTransfer(request, env, user));
      if (path === "/wallets" && method === "GET") return cors(await listWallets(env, user));
      if (path === "/wallets" && method === "POST") return cors(await createWallet(request, env, user));
      const walletMatch = path.match(/^\/wallets\/([a-zA-Z0-9_-]+)$/);
      if (walletMatch && method === "PATCH") return cors(await updateWallet(walletMatch[1], request, env, user));
      if (walletMatch && method === "DELETE") return cors(await deleteWallet(walletMatch[1], env, user));
      if (path === "/categories" && method === "GET") return cors(await listCategories(env, user));
      if (path === "/categories" && method === "POST") return cors(await createCategory(request, env, user));
      const catMatch = path.match(/^\/categories\/([a-zA-Z0-9_-]+)$/);
      if (catMatch && method === "PATCH") return cors(await updateCategory(catMatch[1], request, env, user));
      if (catMatch && method === "DELETE") return cors(await deleteCategory(catMatch[1], env, user));
      if (path === "/users" && method === "GET") return cors(await listUsers(env, user));
      if (path === "/users" && method === "POST") return cors(await createUser(request, env, user));
      const userMatch = path.match(/^\/users\/([a-zA-Z0-9_-]+)$/);
      if (userMatch && method === "PATCH") return cors(await updateUser(userMatch[1], request, env, user));
      if (userMatch && method === "DELETE") return cors(await deleteUser(userMatch[1], env, user));
      if (path === "/recurring" && method === "GET") return cors(await listRecurring(env, user));
      if (path === "/recurring" && method === "POST") return cors(await createRecurring(request, env, user));
      const recMatch = path.match(/^\/recurring\/([a-zA-Z0-9_-]+)$/);
      if (recMatch && method === "PATCH") return cors(await updateRecurring(recMatch[1], request, env, user));
      if (recMatch && method === "DELETE") return cors(await deleteRecurring(recMatch[1], env, user));
      const triggerMatch = path.match(/^\/recurring\/([a-zA-Z0-9_-]+)\/trigger$/);
      if (triggerMatch && method === "POST") return cors(await triggerRecurring(triggerMatch[1], env, user));
      if (path === "/notifications" && method === "GET") return cors(await listNotifications(env, user));
      const reconcileMatch = path.match(/^\/transactions\/([a-zA-Z0-9_-]+)\/reconcile$/);
      if (reconcileMatch && method === "PATCH") return cors(await toggleReconcile(reconcileMatch[1], env, user));
      const confirmMatch = path.match(/^\/transactions\/([a-zA-Z0-9_-]+)\/confirm$/);
      if (confirmMatch && method === "POST") return cors(await confirmTransaction(confirmMatch[1], request, env, user));
      const confirmEditMatch = path.match(/^\/transactions\/([a-zA-Z0-9_-]+)\/confirm-edit$/);
      if (confirmEditMatch && method === "POST") return cors(await confirmEditTransaction(confirmEditMatch[1], env, user));
      const cancelEditMatch = path.match(/^\/transactions\/([a-zA-Z0-9_-]+)\/cancel-edit$/);
      if (cancelEditMatch && method === "POST") return cors(await cancelEditTransaction(cancelEditMatch[1], env, user));
      const printMatch = path.match(/^\/transactions\/([a-zA-Z0-9_-]+)\/print$/);
      if (printMatch && method === "POST") return cors(await printTransaction(printMatch[1], env, user));
      if (path === "/audit-log" && method === "GET") return cors(await listAuditLog(request, env, user));
      if (path === "/budgets" && method === "GET") return cors(await listBudgets(env, user));
      if (path === "/budgets" && method === "POST") return cors(await createBudget(request, env, user));
      if (path === "/reports/wallets" && method === "GET") return cors(await reportWallets(request, env, user));
      const budgetMatch = path.match(/^\/budgets\/([a-zA-Z0-9_-]+)$/);
      if (budgetMatch && method === "PATCH") return cors(await updateBudget(budgetMatch[1], request, env, user));
      if (budgetMatch && method === "DELETE") return cors(await deleteBudget(budgetMatch[1], env, user));
      if (path === "/slips" && method === "GET") return cors(await listAllSlips(request, env, user));
      if (path === "/slips/ocr" && method === "POST") return cors(await ocrSlipAnalyze(request, env, user));
      const slipsTxMatch = path.match(/^\/transactions\/([a-zA-Z0-9_-]+)\/slips$/);
      if (slipsTxMatch && method === "GET") return cors(await listSlips(slipsTxMatch[1], env, user));
      if (slipsTxMatch && method === "POST") return cors(await uploadSlip(slipsTxMatch[1], request, env, user));
      const slipMatch = path.match(/^\/slips\/([a-zA-Z0-9_-]+)$/);
      if (slipMatch && method === "GET") return cors(await getSlipUrl(slipMatch[1], env, user));
      if (slipMatch && method === "DELETE") return cors(await deleteSlip(slipMatch[1], env, user));
      if (path === "/vendor-profiles" && method === "GET") return cors(await listVendorProfiles(request, env, user));
      if (path === "/vendor-profiles" && method === "POST") return cors(await learnVendorProfile(request, env, user));
      const vendorMatch = path.match(/^\/vendor-profiles\/([a-zA-Z0-9_-]+)$/);
      if (vendorMatch && method === "PATCH") return cors(await updateVendorProfile(vendorMatch[1], request, env, user));
      if (vendorMatch && method === "DELETE") return cors(await deleteVendorProfile(vendorMatch[1], env, user));
      if (path === "/category-rules" && method === "GET") return cors(await listCategoryRules(env, user));
      if (path === "/category-rules" && method === "POST") return cors(await createCategoryRule(request, env, user));
      const ruleMatch = path.match(/^\/category-rules\/([a-zA-Z0-9_-]+)$/);
      if (ruleMatch && method === "PATCH") return cors(await updateCategoryRule(ruleMatch[1], request, env, user));
      if (ruleMatch && method === "DELETE") return cors(await deleteCategoryRule(ruleMatch[1], env, user));
      if (path === "/line-users" && method === "GET") return cors(await listLineUsers(env, user));
      if (path === "/line-users" && method === "POST") return cors(await upsertLineUser(request, env, user));
      const lineUserMatch = path.match(/^\/line-users\/([a-zA-Z0-9_-]+)$/);
      if (lineUserMatch && method === "DELETE") return cors(await deleteLineUser(lineUserMatch[1], env, user));
      if (path === "/line-users/lookup" && method === "GET") return cors(await lookupLineUser(request, env, user));
      return cors(json({ error: "Not found" }, 404));
    } catch (err) {
      console.error("Error:", err);
      return cors(json({ error: "Internal server error: " + err.message }, 500));
    }
  }
};
async function handleRegister(request, env) {
  const body = await request.json();
  const { email, password, name, workspaceName } = body;
  if (!email || !password || !name || !workspaceName) {
    return json({ error: "email, password, name, workspaceName required" }, 400);
  }
  if (password.length < 6) return json({ error: "password must be at least 6 chars" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return json({ error: "\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E41\u0E25\u0E49\u0E27" }, 409);
  const workspaceId = "ws_" + crypto.randomUUID();
  const userId = "u_" + crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const stmts = [
    env.DB.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)").bind(workspaceId, workspaceName, userId),
    env.DB.prepare("INSERT INTO users (id, workspace_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?, ?)").bind(userId, workspaceId, email, passwordHash, name, "admin")
  ];
  for (const cat of DEFAULT_CATEGORIES) {
    stmts.push(env.DB.prepare("INSERT INTO categories (id, workspace_id, name, color, type) VALUES (?, ?, ?, ?, ?)").bind("c_" + crypto.randomUUID().slice(0, 12), workspaceId, cat.name, cat.color, cat.type));
  }
  for (const w of DEFAULT_WALLETS) {
    stmts.push(env.DB.prepare("INSERT INTO wallets (id, workspace_id, name, scope, type, color) VALUES (?, ?, ?, ?, ?, ?)").bind("w_" + crypto.randomUUID().slice(0, 12), workspaceId, w.name, w.scope, w.type, w.color));
  }
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    if (String(e.message || "").includes("UNIQUE constraint")) {
      return json({ error: "\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E41\u0E25\u0E49\u0E27" }, 409);
    }
    throw e;
  }
  const token = await signJWT({ sub: userId, ws: workspaceId, role: "admin", name }, env);
  return json({ token, user: formatUser({ id: userId, email, name, role: "admin", workspace_id: workspaceId, is_active: 1, language: "th", theme: "light" }) });
}
__name(handleRegister, "handleRegister");
async function handleLogin(request, env) {
  const { email, password } = await request.json();
  if (!email || !password) return json({ error: "email and password required" }, 400);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? AND is_active = 1").bind(email).first();
  if (!user) return json({ error: "\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" }, 401);
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return json({ error: "\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" }, 401);
  await env.DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
  const token = await signJWT({ sub: user.id, ws: user.workspace_id, role: user.role, name: user.name }, env);
  return json({ token, user: formatUser(user) });
}
__name(handleLogin, "handleLogin");
async function requireAuth(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return { ok: false, error: "Missing token", status: 401 };
  const token = authHeader.slice(7);
  // Long-lived service token (LINE bot etc.) — never expires; resolves to the
  // explicitly-configured service user (SERVICE_USER_ID), so it always targets
  // the correct workspace regardless of account creation order.
  if (env.SERVICE_TOKEN && env.SERVICE_USER_ID && token === env.SERVICE_TOKEN) {
    const svc = await env.DB.prepare("SELECT id, workspace_id, role, name FROM users WHERE id = ? AND is_active = 1").bind(env.SERVICE_USER_ID).first();
    if (svc) return { ok: true, user: { id: svc.id, workspace_id: svc.workspace_id, role: svc.role, name: svc.name || "LINE Bot" } };
  }
  const payload = await verifyJWT(token, env);
  if (!payload) return { ok: false, error: "Invalid token", status: 401 };
  const user = { id: payload.sub, workspace_id: payload.ws, role: payload.role, name: payload.name || "" };
  return { ok: true, user };
}
__name(requireAuth, "requireAuth");
function requireRole(user, ...roles) {
  return roles.includes(user.role);
}
__name(requireRole, "requireRole");
async function updateMyProfile(request, env, user) {
  const body = await request.json();
  const allowed = ["name", "avatar_url", "phone", "language", "theme", "settings"];
  const updates = [], args = [];
  if (body.language !== void 0 && !["th", "en"].includes(body.language)) return json({ error: "invalid language" }, 400);
  if (body.theme !== void 0 && !["light", "dark"].includes(body.theme)) return json({ error: "invalid theme" }, 400);
  for (const f of allowed) {
    const camelKey = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const val = body[f] !== void 0 ? body[f] : body[camelKey];
    if (val !== void 0) {
      updates.push(`${f} = ?`);
      args.push(f === "settings" && typeof val === "object" ? JSON.stringify(val) : val);
    }
  }
  if (updates.length === 0) return json({ error: "no fields to update" }, 400);
  updates.push("updated_at = CURRENT_TIMESTAMP");
  args.push(user.id);
  await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).bind(...args).run();
  const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
  return json({ user: formatUser(updated) });
}
__name(updateMyProfile, "updateMyProfile");
async function changeMyPassword(request, env, user) {
  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword) return json({ error: "currentPassword and newPassword required" }, 400);
  if (newPassword.length < 6) return json({ error: "password must be at least 6 chars" }, 400);
  const dbUser = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ? AND is_active = 1").bind(user.id).first();
  if (!dbUser) return json({ error: "ไม่พบผู้ใช้" }, 404);
  const ok = await verifyPassword(currentPassword, dbUser.password_hash);
  if (!ok) return json({ error: "\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" }, 401);
  const newHash = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(newHash, user.id).run();
  return json({ ok: true });
}
__name(changeMyPassword, "changeMyPassword");
async function listWallets(env, user) {
  const visibilityFilter = user.role === "staff" || user.role === "viewer" ? " AND staff_visible = 1" : "";
  const result = await env.DB.prepare(`SELECT * FROM wallets WHERE workspace_id = ? AND is_active = 1${visibilityFilter} ORDER BY scope, sort_order, name`).bind(user.workspace_id).all();
  return json({ wallets: (result.results || []).map(formatWallet) });
}
__name(listWallets, "listWallets");
async function createWallet(request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const body = await request.json();
  const { name, scope, type, initialBalance, creditLimit, color, icon } = body;
  if (!name || !scope || !type) return json({ error: "name, scope, type required" }, 400);
  if (!["business", "personal"].includes(scope)) return json({ error: "invalid scope" }, 400);
  if (!["cash", "bank", "credit"].includes(type)) return json({ error: "invalid type" }, 400);
  const id = "w_" + crypto.randomUUID().slice(0, 12);
  const initBal = Number(initialBalance) || 0;
  await env.DB.prepare(
    "INSERT INTO wallets (id, workspace_id, name, scope, type, current_balance, initial_balance, credit_limit, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, user.workspace_id, name, scope, type, initBal, initBal, creditLimit || null, color || "#9CA3AF", icon || null).run();
  await broadcastChange(env, user.workspace_id, { event: "wallet.created", id, by: user.name });
  const wallet = await env.DB.prepare("SELECT * FROM wallets WHERE id = ?").bind(id).first();
  return json({ wallet: formatWallet(wallet) }, 201);
}
__name(createWallet, "createWallet");
async function updateWallet(id, request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const wallet = await env.DB.prepare("SELECT * FROM wallets WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!wallet) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32" }, 404);
  const body = await request.json();
  if (body.scope !== void 0 && !["business", "personal"].includes(body.scope)) return json({ error: "invalid scope" }, 400);
  if (body.type !== void 0 && !["cash", "bank", "credit"].includes(body.type)) return json({ error: "invalid type" }, 400);
  const fields = ["name", "scope", "type", "credit_limit", "color", "icon", "sort_order", "staff_visible"];
  const updates = [], args = [];
  for (const f of fields) {
    const camelKey = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const val = body[f] !== void 0 ? body[f] : body[camelKey];
    if (val !== void 0) {
      updates.push(`${f} = ?`);
      args.push(val);
    }
  }
  if (updates.length === 0) return json({ error: "no fields" }, 400);
  updates.push("updated_at = CURRENT_TIMESTAMP");
  args.push(id);
  await env.DB.prepare(`UPDATE wallets SET ${updates.join(", ")} WHERE id = ?`).bind(...args).run();
  await broadcastChange(env, user.workspace_id, { event: "wallet.updated", id, by: user.name });
  const updated = await env.DB.prepare("SELECT * FROM wallets WHERE id = ?").bind(id).first();
  return json({ wallet: formatWallet(updated) });
}
__name(updateWallet, "updateWallet");
async function deleteWallet(id, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const wallet = await env.DB.prepare("SELECT * FROM wallets WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!wallet) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32" }, 404);
  const txCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM transactions WHERE wallet_id = ?").bind(id).first();
  if (txCount.cnt > 0) {
    await env.DB.prepare("UPDATE wallets SET is_active = 0 WHERE id = ?").bind(id).run();
  } else {
    await env.DB.prepare("DELETE FROM wallets WHERE id = ?").bind(id).run();
  }
  await broadcastChange(env, user.workspace_id, { event: "wallet.deleted", id, by: user.name });
  return json({ ok: true });
}
__name(deleteWallet, "deleteWallet");
async function listTransactions(request, env, user) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const dateFrom = params.get("from");
  const dateTo = params.get("to");
  const type = params.get("type");
  const scope = params.get("scope");
  const walletId = params.get("walletId");
  const categoryId = params.get("categoryId");
  const search = params.get("search");
  const limit = Math.min(parseInt(params.get("limit") || "50"), 1e3);
  const offset = parseInt(params.get("offset") || "0");
  const joinClause = `FROM transactions t
    LEFT JOIN users u ON t.created_by_user_id = u.id
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN categories sc ON t.sub_category_id = sc.id
    LEFT JOIN wallets w ON t.wallet_id = w.id
    WHERE t.workspace_id = ?`;
  const args = [user.workspace_id];
  let filters = "";
  if (dateFrom) {
    filters += " AND t.date >= ?";
    args.push(dateFrom);
  }
  if (dateTo) {
    filters += " AND t.date <= ?";
    args.push(dateTo);
  }
  if (type) {
    filters += " AND t.type = ?";
    args.push(type);
  }
  if (scope) {
    filters += " AND t.scope = ?";
    args.push(scope);
  }
  if (walletId) {
    filters += " AND t.wallet_id = ?";
    args.push(walletId);
  }
  if (categoryId) {
    filters += " AND (t.category_id = ? OR t.sub_category_id = ?)";
    args.push(categoryId, categoryId);
  }
  if (search) {
    filters += " AND (t.name LIKE ? OR t.note LIKE ?)";
    args.push(`%${search}%`, `%${search}%`);
  }
  const [countRow, result] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as cnt FROM transactions t WHERE t.workspace_id = ?${filters}`).bind(...args).first(),
    env.DB.prepare(`SELECT t.*, u.name AS created_by_name,
      c.name AS category_name, c.color AS category_color,
      sc.name AS sub_category_name, sc.color AS sub_category_color,
      w.name AS wallet_name, w.color AS wallet_color, w.type AS wallet_type
      ${joinClause}${filters}
      ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?`).bind(...args, limit, offset).all()
  ]);
  return json({
    transactions: (result.results || []).map(formatTransaction),
    total: countRow?.cnt || 0,
    limit,
    offset
  });
}
__name(listTransactions, "listTransactions");
async function createTransaction(request, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C" }, 403);
  const body = await request.json();
  const { name, amount, type, scope, date, note, walletId, categoryId, subCategoryId, submittedBy } = body;
  if (!name || !amount || !type || !scope || !date) {
    return json({ error: "fields required: name, amount, type, scope, date" }, 400);
  }
  if (!["income", "expense"].includes(type)) return json({ error: "invalid type" }, 400);
  if (!["business", "personal"].includes(scope)) return json({ error: "invalid scope" }, 400);
  if (Number(amount) <= 0 || isNaN(Number(amount))) return json({ error: "amount must be positive" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "invalid date format (YYYY-MM-DD)" }, 400);
  let resolvedWalletId = walletId;
  if (!resolvedWalletId) {
    const defaultWallet = await env.DB.prepare(
      "SELECT id FROM wallets WHERE workspace_id = ? AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
    ).bind(user.workspace_id).first();
    if (!defaultWallet) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32" }, 404);
    resolvedWalletId = defaultWallet.id;
  }
  const wallet = await env.DB.prepare("SELECT * FROM wallets WHERE id = ? AND workspace_id = ? AND is_active = 1").bind(resolvedWalletId, user.workspace_id).first();
  if (!wallet) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32" }, 404);
  const id = "tx_" + crypto.randomUUID();
  const amt = Number(amount);
  const balanceChange = type === "income" ? amt : -amt;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO transactions (id, workspace_id, created_by_user_id, wallet_id, category_id, sub_category_id, name, amount, type, scope, date, note, submitted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, user.workspace_id, user.id, resolvedWalletId, categoryId || null, subCategoryId || null, name, amt, type, scope, date, note || null, submittedBy || null),
    env.DB.prepare("UPDATE wallets SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(balanceChange, resolvedWalletId)
  ]);
  await logAudit(env, user, "create", "transaction", id, { name, amount: amt });
  await broadcastChange(env, user.workspace_id, { event: "tx.created", txId: id, walletId: resolvedWalletId, by: user.name });
  const tx = await env.DB.prepare(`SELECT t.*, u.name AS created_by_name, c.name AS category_name, c.color AS category_color, sc.name AS sub_category_name, sc.color AS sub_category_color, w.name AS wallet_name, w.color AS wallet_color, w.type AS wallet_type FROM transactions t LEFT JOIN users u ON t.created_by_user_id = u.id LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN categories sc ON t.sub_category_id = sc.id LEFT JOIN wallets w ON t.wallet_id = w.id WHERE t.id = ?`).bind(id).first();
  return json({ transaction: formatTransaction(tx) }, 201);
}
__name(createTransaction, "createTransaction");
async function updateTransaction(id, request, env, user) {
  const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!tx) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23" }, 404);
  if (user.role === "viewer") return json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E41\u0E01\u0E49\u0E44\u0E02" }, 403);
  if (user.role === "staff" && tx.created_by_user_id !== user.id) return json({ error: "\u0E41\u0E01\u0E49\u0E44\u0E02\u0E44\u0E14\u0E49\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E02\u0E2D\u0E07\u0E15\u0E31\u0E27\u0E40\u0E2D\u0E07" }, 403);
  const body = await request.json();
  if (body.type !== void 0 && !["income", "expense"].includes(body.type)) return json({ error: "invalid type" }, 400);
  if (body.scope !== void 0 && !["business", "personal"].includes(body.scope)) return json({ error: "invalid scope" }, 400);
  if (body.amount !== void 0 && (Number(body.amount) <= 0 || isNaN(Number(body.amount)))) return json({ error: "amount must be positive" }, 400);
  if (body.date !== void 0 && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return json({ error: "invalid date format" }, 400);
  const oldAmount = Number(tx.amount);
  const oldType = tx.type;
  const oldWalletId = tx.wallet_id;
  const newAmount = body.amount !== void 0 ? Number(body.amount) : oldAmount;
  const newType = body.type !== void 0 ? body.type : oldType;
  const newWalletId = body.walletId !== void 0 ? body.walletId : body.wallet_id !== void 0 ? body.wallet_id : oldWalletId;
  if (newWalletId !== oldWalletId) {
    const newWallet = await env.DB.prepare("SELECT id FROM wallets WHERE id = ? AND workspace_id = ? AND is_active = 1").bind(newWalletId, user.workspace_id).first();
    if (!newWallet) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32\u0E1B\u0E25\u0E32\u0E22\u0E17\u0E32\u0E07" }, 404);
  }
  const fields = ["name", "amount", "type", "scope", "date", "note", "category_id", "sub_category_id", "wallet_id"];
  const changes = {};
  for (const f of fields) {
    const camelKey = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    let val = body[f] !== void 0 ? body[f] : body[camelKey];
    if (val === void 0) continue;
    if (f === "amount") val = Number(val);
    const same = f === "amount" ? Number(tx[f]) === val : String(tx[f] ?? "") === String(val ?? "");
    if (!same) changes[f] = val;
  }
  if (Object.keys(changes).length === 0) return json({ error: "no changes" }, 400);

  // Draft tx isn't reflected in the balance yet -> edit fields directly (no staging).
  if (tx.is_draft) {
    const updates = [], args = [];
    for (const [f, val] of Object.entries(changes)) { updates.push(`${f} = ?`); args.push(val); }
    updates.push("updated_at = CURRENT_TIMESTAMP");
    args.push(id);
    await env.DB.prepare(`UPDATE transactions SET ${updates.join(", ")} WHERE id = ?`).bind(...args).run();
    await logAudit(env, user, "update", "transaction", id, changes);
    await broadcastChange(env, user.workspace_id, { event: "tx.updated", txId: id, by: user.name });
    return json({ transaction: formatTransaction(await fetchTxFull(env, id)) });
  }

  // Live tx -> stage the edit; it takes effect only after the owner/admin confirms.
  await env.DB.prepare("UPDATE transactions SET pending_changes = ?, edited_by = ?, edited_at = datetime('now'), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(JSON.stringify(changes), user.name, id).run();
  await logAudit(env, user, "edit_pending", "transaction", id, changes);
  await broadcastChange(env, user.workspace_id, { event: "tx.updated", txId: id, by: user.name });
  return json({ transaction: formatTransaction(await fetchTxFull(env, id)), pending: true });
}
__name(updateTransaction, "updateTransaction");

// Full transaction row with joined names — used by update/confirm paths.
async function fetchTxFull(env, id) {
  return env.DB.prepare(`SELECT t.*, u.name AS created_by_name, c.name AS category_name, c.color AS category_color, sc.name AS sub_category_name, sc.color AS sub_category_color, w.name AS wallet_name, w.color AS wallet_color, w.type AS wallet_type FROM transactions t LEFT JOIN users u ON t.created_by_user_id = u.id LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN categories sc ON t.sub_category_id = sc.id LEFT JOIN wallets w ON t.wallet_id = w.id WHERE t.id = ?`).bind(id).first();
}
__name(fetchTxFull, "fetchTxFull");

// Apply a validated change set to a LIVE transaction: update columns, move wallet
// balance, clear the pending edit, and learn vendor->category from slip edits.
async function applyTxChanges(env, user, tx, changes) {
  const oldAmount = Number(tx.amount), oldType = tx.type, oldWalletId = tx.wallet_id;
  const newAmount = changes.amount !== void 0 ? Number(changes.amount) : oldAmount;
  const newType = changes.type !== void 0 ? changes.type : oldType;
  const newWalletId = changes.wallet_id !== void 0 ? changes.wallet_id : oldWalletId;
  const updates = [], args = [];
  for (const [f, val] of Object.entries(changes)) { updates.push(`${f} = ?`); args.push(val); }
  updates.push("pending_changes = NULL", "edited_by = NULL", "edited_at = NULL", "updated_at = CURRENT_TIMESTAMP");
  args.push(tx.id);
  const oldEffect = oldType === "income" ? oldAmount : -oldAmount;
  const newEffect = newType === "income" ? newAmount : -newAmount;
  const stmts = [env.DB.prepare(`UPDATE transactions SET ${updates.join(", ")} WHERE id = ?`).bind(...args)];
  if (newWalletId === oldWalletId) {
    const delta = newEffect - oldEffect;
    if (delta !== 0) stmts.push(env.DB.prepare("UPDATE wallets SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(delta, oldWalletId));
  } else {
    stmts.push(env.DB.prepare("UPDATE wallets SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(oldEffect, oldWalletId));
    stmts.push(env.DB.prepare("UPDATE wallets SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(newEffect, newWalletId));
  }
  await env.DB.batch(stmts);
  const finalCategoryId = changes.category_id !== void 0 ? changes.category_id : tx.category_id;
  if (changes.category_id !== void 0 && finalCategoryId) {
    const vendorName = recipientFromTxName(changes.name !== void 0 ? changes.name : tx.name);
    if (vendorName) {
      const finalSubId = changes.sub_category_id !== void 0 ? changes.sub_category_id : tx.sub_category_id;
      try { await learnVendorByName(env, user.workspace_id, vendorName, finalCategoryId, finalSubId || null, newWalletId || null, null); } catch (e) { console.error("learnVendorByName:", e); }
    }
  }
}
__name(applyTxChanges, "applyTxChanges");

// Confirm a staged edit — owner of the record or an admin. Applies it + moves balance.
async function confirmEditTransaction(id, env, user) {
  const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!tx) return json({ error: "ไม่พบรายการ" }, 404);
  if (!tx.pending_changes) return json({ error: "ไม่มีการแก้ไขที่รอยืนยัน" }, 400);
  if (user.role !== "admin" && tx.created_by_user_id !== user.id) return json({ error: "ยืนยันได้เฉพาะรายการของตัวเอง" }, 403);
  let changes;
  try { changes = JSON.parse(tx.pending_changes); } catch { return json({ error: "pending data corrupt" }, 400); }
  if (changes.wallet_id) {
    const w = await env.DB.prepare("SELECT id FROM wallets WHERE id = ? AND workspace_id = ? AND is_active = 1").bind(changes.wallet_id, user.workspace_id).first();
    if (!w) return json({ error: "ไม่พบกระเป๋าปลายทาง" }, 404);
  }
  await applyTxChanges(env, user, tx, changes);
  await logAudit(env, user, "confirm_edit", "transaction", id, changes);
  await broadcastChange(env, user.workspace_id, { event: "tx.updated", txId: id, by: user.name });
  return json({ transaction: formatTransaction(await fetchTxFull(env, id)) });
}
__name(confirmEditTransaction, "confirmEditTransaction");

// Discard a staged edit without applying it — owner or admin.
async function cancelEditTransaction(id, env, user) {
  const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!tx) return json({ error: "ไม่พบรายการ" }, 404);
  if (!tx.pending_changes) return json({ error: "ไม่มีการแก้ไขที่รอยืนยัน" }, 400);
  if (user.role !== "admin" && tx.created_by_user_id !== user.id) return json({ error: "ยกเลิกได้เฉพาะรายการของตัวเอง" }, 403);
  await env.DB.prepare("UPDATE transactions SET pending_changes = NULL, edited_by = NULL, edited_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  await logAudit(env, user, "cancel_edit", "transaction", id, {});
  await broadcastChange(env, user.workspace_id, { event: "tx.updated", txId: id, by: user.name });
  return json({ ok: true });
}
__name(cancelEditTransaction, "cancelEditTransaction");

// Record a print event (admin + staff, any record in the workspace). viewer is blocked.
async function printTransaction(id, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "ไม่มีสิทธิ์พิมพ์เอกสาร" }, 403);
  const tx = await env.DB.prepare("SELECT id, name FROM transactions WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!tx) return json({ error: "ไม่พบรายการ" }, 404);
  await env.DB.prepare("UPDATE transactions SET printed_by = ?, printed_at = datetime('now'), print_count = print_count + 1 WHERE id = ?").bind(user.name, id).run();
  await logAudit(env, user, "print", "transaction", id, { name: tx.name });
  await broadcastChange(env, user.workspace_id, { event: "tx.updated", txId: id, by: user.name });
  const row = await env.DB.prepare("SELECT printed_by, printed_at, print_count FROM transactions WHERE id = ?").bind(id).first();
  return json({ printedBy: row.printed_by, printedAt: row.printed_at, printCount: row.print_count });
}
__name(printTransaction, "printTransaction");
async function deleteTransaction(id, env, user) {
  const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!tx) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23" }, 404);
  if (user.role === "viewer") return json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E25\u0E1A" }, 403);
  if (user.role === "staff" && tx.created_by_user_id !== user.id) return json({ error: "\u0E25\u0E1A\u0E44\u0E14\u0E49\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E02\u0E2D\u0E07\u0E15\u0E31\u0E27\u0E40\u0E2D\u0E07" }, 403);
  const reverseEffect = tx.type === "income" ? -Number(tx.amount) : Number(tx.amount);
  await env.DB.batch([
    env.DB.prepare("UPDATE wallets SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reverseEffect, tx.wallet_id),
    env.DB.prepare("DELETE FROM transactions WHERE id = ?").bind(id)
  ]);
  await logAudit(env, user, "delete", "transaction", id, { name: tx.name, amount: tx.amount });
  await broadcastChange(env, user.workspace_id, { event: "tx.deleted", txId: id, by: user.name });
  return json({ ok: true });
}
__name(deleteTransaction, "deleteTransaction");
async function createTransfer(request, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C" }, 403);
  const { fromWalletId, toWalletId, amount, date, note } = await request.json();
  if (!fromWalletId || !toWalletId || !amount || !date) return json({ error: "fromWalletId, toWalletId, amount, date required" }, 400);
  if (fromWalletId === toWalletId) return json({ error: "fromWalletId and toWalletId must differ" }, 400);
  if (Number(amount) <= 0 || isNaN(Number(amount))) return json({ error: "amount must be positive" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "invalid date format" }, 400);
  const fromW = await env.DB.prepare("SELECT * FROM wallets WHERE id = ? AND workspace_id = ? AND is_active = 1").bind(fromWalletId, user.workspace_id).first();
  const toW = await env.DB.prepare("SELECT * FROM wallets WHERE id = ? AND workspace_id = ? AND is_active = 1").bind(toWalletId, user.workspace_id).first();
  if (!fromW || !toW) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32" }, 404);
  const pairId = "xfer_" + crypto.randomUUID().slice(0, 12);
  const outId = "tx_" + crypto.randomUUID();
  const inId = "tx_" + crypto.randomUUID();
  const amt = Number(amount);
  const transferNote = note || `\u0E42\u0E2D\u0E19 ${fromW.name} \u2192 ${toW.name}`;
  await env.DB.batch([
    // Outgoing tx (expense from source wallet)
    env.DB.prepare("INSERT INTO transactions (id, workspace_id, created_by_user_id, wallet_id, name, amount, type, scope, date, note, transfer_pair_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(outId, user.workspace_id, user.id, fromWalletId, transferNote, amt, "expense", fromW.scope, date, note || null, pairId),
    // Incoming tx (income to target wallet)
    env.DB.prepare("INSERT INTO transactions (id, workspace_id, created_by_user_id, wallet_id, name, amount, type, scope, date, note, transfer_pair_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(inId, user.workspace_id, user.id, toWalletId, transferNote, amt, "income", toW.scope, date, note || null, pairId),
    // Update balances
    env.DB.prepare("UPDATE wallets SET current_balance = current_balance - ? WHERE id = ?").bind(amt, fromWalletId),
    env.DB.prepare("UPDATE wallets SET current_balance = current_balance + ? WHERE id = ?").bind(amt, toWalletId)
  ]);
  await logAudit(env, user, "transfer", "transaction", pairId, { fromWalletId, toWalletId, amount: amt });
  await broadcastChange(env, user.workspace_id, { event: "transfer.created", pairId, by: user.name });
  return json({ ok: true, transferPairId: pairId, outgoingId: outId, incomingId: inId }, 201);
}
__name(createTransfer, "createTransfer");

// Per-wallet report (admin): separates real income/expense from transfer legs
// (transfer_pair_id IS NULL = real) over a date range, plus an all-time
// reconcile check (initial + lifetime net vs current balance) to surface drift.
async function reportWallets(request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "เฉพาะ Admin" }, 403);
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const scope = url.searchParams.get("scope");
  const ws = user.workspace_id;

  const conds = ["workspace_id = ?"];
  const args = [ws];
  if (from) { conds.push("date >= ?"); args.push(from); }
  if (to) { conds.push("date <= ?"); args.push(to); }
  if (scope === "business" || scope === "personal") { conds.push("scope = ?"); args.push(scope); }

  const catConds = conds.map((c) => "t." + c);

  const [rangeRes, lifeRes, walletRes, catRes] = await Promise.all([
    env.DB.prepare(
      `SELECT wallet_id,
         SUM(CASE WHEN type='income'  AND transfer_pair_id IS NULL THEN amount ELSE 0 END) AS real_income,
         SUM(CASE WHEN type='expense' AND transfer_pair_id IS NULL THEN amount ELSE 0 END) AS real_expense,
         SUM(CASE WHEN type='income'  AND transfer_pair_id IS NOT NULL THEN amount ELSE 0 END) AS transfer_in,
         SUM(CASE WHEN type='expense' AND transfer_pair_id IS NOT NULL THEN amount ELSE 0 END) AS transfer_out,
         COUNT(*) AS cnt
       FROM transactions WHERE ${conds.join(" AND ")} GROUP BY wallet_id`
    ).bind(...args).all(),
    env.DB.prepare(
      `SELECT wallet_id,
         SUM(CASE WHEN type='income' THEN amount ELSE 0 END) - SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS lifetime_net
       FROM transactions WHERE workspace_id = ? GROUP BY wallet_id`
    ).bind(ws).all(),
    env.DB.prepare(
      `SELECT id, name, color, scope, type, is_active, current_balance, initial_balance
       FROM wallets WHERE workspace_id = ? ORDER BY scope, sort_order, name`
    ).bind(ws).all(),
    env.DB.prepare(
      `SELECT t.wallet_id, t.category_id, c.name AS cat_name, c.color AS cat_color,
         SUM(t.amount) AS total, COUNT(*) AS cnt
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE ${catConds.join(" AND ")} AND t.type='expense' AND t.transfer_pair_id IS NULL
       GROUP BY t.wallet_id, t.category_id`
    ).bind(...args).all(),
  ]);

  const rangeMap = {}; (rangeRes.results || []).forEach(r => { rangeMap[r.wallet_id] = r; });
  const lifeMap = {}; (lifeRes.results || []).forEach(r => { lifeMap[r.wallet_id] = Number(r.lifetime_net) || 0; });
  const catMap = {};
  (catRes.results || []).forEach(r => {
    (catMap[r.wallet_id] || (catMap[r.wallet_id] = [])).push({
      id: r.category_id || null,
      name: r.cat_name || "ไม่ระบุหมวด",
      color: r.cat_color || "#64748b",
      total: Number(r.total) || 0,
      count: Number(r.cnt) || 0,
    });
  });

  const wallets = (walletRes.results || []).map(w => {
    const r = rangeMap[w.id] || {};
    const realIncome = Number(r.real_income) || 0;
    const realExpense = Number(r.real_expense) || 0;
    const transferIn = Number(r.transfer_in) || 0;
    const transferOut = Number(r.transfer_out) || 0;
    const initial = Number(w.initial_balance) || 0;
    const current = Number(w.current_balance) || 0;
    const expected = initial + (lifeMap[w.id] || 0);
    const diff = current - expected;
    return {
      id: w.id, name: w.name, color: w.color, scope: w.scope, type: w.type,
      isActive: !!w.is_active, currentBalance: current, initialBalance: initial,
      realIncome, realExpense, transferIn, transferOut,
      net: realIncome + transferIn - realExpense - transferOut,
      count: Number(r.cnt) || 0,
      categories: (catMap[w.id] || []).sort((a, b) => b.total - a.total),
      reconcile: { expected, diff, ok: Math.abs(diff) < 0.005 },
    };
  });

  const totals = wallets.reduce((a, w) => ({
    realIncome: a.realIncome + w.realIncome,
    realExpense: a.realExpense + w.realExpense,
    transferIn: a.transferIn + w.transferIn,
    transferOut: a.transferOut + w.transferOut,
    net: a.net + w.net,
  }), { realIncome: 0, realExpense: 0, transferIn: 0, transferOut: 0, net: 0 });

  return json({ wallets, totals, range: { from: from || null, to: to || null } });
}
__name(reportWallets, "reportWallets");
async function listCategories(env, user) {
  const result = await env.DB.prepare("SELECT * FROM categories WHERE workspace_id = ? AND is_active = 1 ORDER BY parent_id NULLS FIRST, sort_order, name").bind(user.workspace_id).all();
  const usageRows = await env.DB.prepare(
    "SELECT id, SUM(n) AS n FROM (SELECT category_id AS id, COUNT(*) AS n FROM transactions WHERE workspace_id = ? AND category_id IS NOT NULL GROUP BY category_id UNION ALL SELECT sub_category_id AS id, COUNT(*) AS n FROM transactions WHERE workspace_id = ? AND sub_category_id IS NOT NULL GROUP BY sub_category_id) GROUP BY id"
  ).bind(user.workspace_id, user.workspace_id).all();
  const usage = {};
  for (const r of usageRows.results || []) usage[r.id] = Number(r.n) || 0;
  return json({ categories: (result.results || []).map((c) => formatCategory(c, usage)) });
}
__name(listCategories, "listCategories");
async function createCategory(request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const { name, color, type, parentId, parent_id, groupName, group_name } = await request.json();
  if (!name) return json({ error: "name required" }, 400);
  if (type && !["income", "expense", "both"].includes(type)) return json({ error: "invalid type" }, 400);
  const parent = parentId || parent_id || null;
  if (parent) {
    const p = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND workspace_id = ? AND parent_id IS NULL").bind(parent, user.workspace_id).first();
    if (!p) return json({ error: "parent category not found or is itself a sub-category" }, 400);
  }
  const group = ((groupName ?? group_name) || "").trim() || null;
  const id = "c_" + crypto.randomUUID().slice(0, 12);
  await env.DB.prepare("INSERT INTO categories (id, workspace_id, parent_id, name, color, type, group_name) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, user.workspace_id, parent, name, color || "#9CA3AF", type || "both", group).run();
  await broadcastChange(env, user.workspace_id, { event: "category.created", id, by: user.name });
  const cat = await env.DB.prepare("SELECT * FROM categories WHERE id = ?").bind(id).first();
  return json({ category: formatCategory(cat) }, 201);
}
__name(createCategory, "createCategory");
async function updateCategory(id, request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const cat = await env.DB.prepare("SELECT * FROM categories WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!cat) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48" }, 404);
  const body = await request.json();
  if (body.type !== void 0 && !["income", "expense", "both"].includes(body.type)) return json({ error: "invalid type" }, 400);
  const fields = ["name", "color", "type", "sort_order", "parent_id", "group_name"];
  const updates = [], args = [];
  for (const f of fields) {
    const camelKey = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const val = body[f] !== void 0 ? body[f] : body[camelKey];
    if (val !== void 0) {
      updates.push(`${f} = ?`);
      args.push(val);
    }
  }
  if (updates.length === 0) return json({ error: "no fields" }, 400);
  args.push(id);
  await env.DB.prepare(`UPDATE categories SET ${updates.join(", ")} WHERE id = ?`).bind(...args).run();
  await broadcastChange(env, user.workspace_id, { event: "category.updated", id, by: user.name });
  return json({ ok: true });
}
__name(updateCategory, "updateCategory");
async function deleteCategory(id, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  await env.DB.prepare("UPDATE categories SET is_active = 0 WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).run();
  await env.DB.prepare("UPDATE categories SET is_active = 0 WHERE parent_id = ? AND workspace_id = ?").bind(id, user.workspace_id).run();
  await broadcastChange(env, user.workspace_id, { event: "category.deleted", id, by: user.name });
  return json({ ok: true });
}
__name(deleteCategory, "deleteCategory");
async function listUsers(env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const result = await env.DB.prepare("SELECT id, email, name, role, is_active, last_login_at, created_at, workspace_id, language, theme, avatar_url, phone FROM users WHERE workspace_id = ? ORDER BY created_at").bind(user.workspace_id).all();
  return json({ users: (result.results || []).map(formatUser) });
}
__name(listUsers, "listUsers");
async function createUser(request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const { email, password, name, role } = await request.json();
  if (!email || !password || !name || !role) return json({ error: "fields required" }, 400);
  if (!["admin", "staff", "viewer"].includes(role)) return json({ error: "invalid role" }, 400);
  if (password.length < 6) return json({ error: "password must be at least 6 chars" }, 400);
  const id = "u_" + crypto.randomUUID();
  const hash = await hashPassword(password);
  try {
    await env.DB.prepare("INSERT INTO users (id, workspace_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?, ?)").bind(id, user.workspace_id, email, hash, name, role).run();
  } catch (e) {
    if (String(e.message || "").includes("UNIQUE constraint")) {
      return json({ error: "\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E41\u0E25\u0E49\u0E27" }, 409);
    }
    throw e;
  }
  await logAudit(env, user, "create", "user", id, { email, role });
  return json({ user: formatUser({ id, email, name, role, workspace_id: user.workspace_id, is_active: 1, language: "th", theme: "light" }) }, 201);
}
__name(createUser, "createUser");
async function updateUser(id, request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const target = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!target) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A user" }, 404);
  const body = await request.json();
  const updates = [], args = [];
  if (body.name !== void 0) {
    updates.push("name = ?");
    args.push(body.name);
  }
  if (body.role !== void 0) {
    if (!["admin", "staff", "viewer"].includes(body.role)) return json({ error: "invalid role" }, 400);
    updates.push("role = ?");
    args.push(body.role);
  }
  if (body.isActive !== void 0) {
    updates.push("is_active = ?");
    args.push(body.isActive ? 1 : 0);
  }
  if (body.password) {
    if (body.password.length < 6) return json({ error: "password too short" }, 400);
    updates.push("password_hash = ?");
    args.push(await hashPassword(body.password));
  }
  if (updates.length === 0) return json({ error: "no fields" }, 400);
  updates.push("updated_at = CURRENT_TIMESTAMP");
  args.push(id);
  await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).bind(...args).run();
  await logAudit(env, user, "update", "user", id, body);
  return json({ ok: true });
}
__name(updateUser, "updateUser");
async function deleteUser(id, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  if (id === user.id) return json({ error: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E25\u0E1A\u0E15\u0E31\u0E27\u0E40\u0E2D\u0E07" }, 400);
  await env.DB.prepare("UPDATE users SET is_active = 0 WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).run();
  await logAudit(env, user, "delete", "user", id, {});
  return json({ ok: true });
}
__name(deleteUser, "deleteUser");
async function listRecurring(env, user) {
  const result = await env.DB.prepare("SELECT * FROM recurring_templates WHERE workspace_id = ? AND is_active = 1 ORDER BY next_due_date").bind(user.workspace_id).all();
  return json({ recurring: (result.results || []).map(formatRecurring) });
}
__name(listRecurring, "listRecurring");
async function listNotifications(env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ notifications: [] });
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const horizon = addDays(today, 3);
  const out = [];
  const recs = await env.DB.prepare(
    "SELECT * FROM recurring_templates WHERE workspace_id = ? AND is_active = 1"
  ).bind(user.workspace_id).all();
  for (const r of recs.results || []) {
    if (r.auto_create && r.draft_mode) continue; // handled by the draft alert below
    const eff = effectiveDue(r, today);
    if (!eff || eff > horizon) continue;
    // auto items charge themselves -> heads-up only; manual items must be recorded -> due/overdue
    const kind = r.auto_create ? "upcoming" : eff < today ? "overdue" : "due";
    out.push({ id: `${kind}:${r.id}:${eff}`, kind, name: r.name, amount: Number(r.amount), type: r.type, dueDate: eff, sortDate: eff, refId: r.id });
  }
  const drafts = await env.DB.prepare(
    "SELECT * FROM transactions WHERE workspace_id = ? AND is_draft = 1 AND recurring_id IS NOT NULL ORDER BY created_at DESC"
  ).bind(user.workspace_id).all();
  for (const t of drafts.results || []) {
    out.push({ id: `draft:${t.id}`, kind: "draft", name: t.name, amount: Number(t.amount), type: t.type, dueDate: null, sortDate: t.date, refId: t.id });
  }
  const order = { overdue: 0, due: 1, draft: 2, upcoming: 3 };
  out.sort((a, b) => order[a.kind] - order[b.kind] || (a.sortDate < b.sortDate ? -1 : a.sortDate > b.sortDate ? 1 : 0));
  return json({ notifications: out });
}
__name(listNotifications, "listNotifications");
async function createRecurring(request, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C" }, 403);
  const body = await request.json();
  const { name, amount, type, scope, frequency, dueDay, walletId, categoryId, subCategoryId, autoCreate, nextDueDate, dueHour } = body;
  if (!name || !amount || !type || !scope || !frequency || !dueDay || !walletId) {
    return json({ error: "fields required" }, 400);
  }
  if (!["income", "expense"].includes(type)) return json({ error: "invalid type" }, 400);
  if (!["business", "personal"].includes(scope)) return json({ error: "invalid scope" }, 400);
  if (!["daily", "weekly", "monthly", "yearly"].includes(frequency)) return json({ error: "invalid frequency" }, 400);
  if (dueHour != null && (!Number.isInteger(dueHour) || dueHour < 0 || dueHour > 23)) return json({ error: "invalid dueHour" }, 400);
  const { draftMode } = body;
  const id = "rec_" + crypto.randomUUID().slice(0, 12);
  await env.DB.prepare(
    "INSERT INTO recurring_templates (id, workspace_id, created_by_user_id, wallet_id, category_id, sub_category_id, name, amount, type, scope, frequency, due_day, auto_create, next_due_date, draft_mode, due_hour) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, user.workspace_id, user.id, walletId, categoryId || null, subCategoryId || null, name, Number(amount), type, scope, frequency, dueDay, autoCreate ? 1 : 0, nextDueDate || null, draftMode ? 1 : 0, dueHour ?? null).run();
  const rec = await env.DB.prepare("SELECT * FROM recurring_templates WHERE id = ?").bind(id).first();
  return json({ recurring: formatRecurring(rec) }, 201);
}
__name(createRecurring, "createRecurring");
async function updateRecurring(id, request, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C" }, 403);
  const rec = await env.DB.prepare("SELECT * FROM recurring_templates WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!rec) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A recurring" }, 404);
  const body = await request.json();
  const fields = ["name", "amount", "type", "scope", "frequency", "due_day", "auto_create", "next_due_date", "is_active", "wallet_id", "category_id", "sub_category_id", "draft_mode", "due_hour"];
  const updates = [], args = [];
  for (const f of fields) {
    const camelKey = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const val = body[f] !== void 0 ? body[f] : body[camelKey];
    if (val !== void 0) {
      updates.push(`${f} = ?`);
      args.push(val);
    }
  }
  if (updates.length === 0) return json({ error: "no fields" }, 400);
  args.push(id);
  await env.DB.prepare(`UPDATE recurring_templates SET ${updates.join(", ")} WHERE id = ?`).bind(...args).run();
  return json({ ok: true });
}
__name(updateRecurring, "updateRecurring");
async function deleteRecurring(id, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C" }, 403);
  await env.DB.prepare("UPDATE recurring_templates SET is_active = 0 WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).run();
  return json({ ok: true });
}
__name(deleteRecurring, "deleteRecurring");
async function logAudit(env, user, action, entityType, entityId, details) {
  try {
    await env.DB.prepare("INSERT INTO audit_log (id, workspace_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("a_" + crypto.randomUUID().slice(0, 12), user.workspace_id, user.id, action, entityType, entityId, JSON.stringify(details || {})).run();
  } catch (e) {
    console.error("audit log fail:", e);
  }
}
__name(logAudit, "logAudit");
async function toggleReconcile(id, env, user) {
  const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!tx) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23" }, 404);
  if (user.role === "viewer") return json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C" }, 403);
  const newVal = tx.is_reconciled ? 0 : 1;
  await env.DB.prepare("UPDATE transactions SET is_reconciled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(newVal, id).run();
  return json({ ok: true, isReconciled: !!newVal });
}
__name(toggleReconcile, "toggleReconcile");
async function listAuditLog(request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const [result, countRow] = await Promise.all([
    env.DB.prepare("SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON a.user_id = u.id WHERE a.workspace_id = ? ORDER BY a.created_at DESC LIMIT ? OFFSET ?").bind(user.workspace_id, limit, offset).all(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM audit_log WHERE workspace_id = ?").bind(user.workspace_id).first()
  ]);
  return json({
    logs: (result.results || []).map((l) => ({
      id: l.id,
      userId: l.user_id,
      userName: l.user_name || "?",
      action: l.action,
      entityType: l.entity_type,
      entityId: l.entity_id,
      details: l.details ? (() => {
        try {
          return JSON.parse(l.details);
        } catch {
          return {};
        }
      })() : {},
      createdAt: l.created_at
    })),
    total: countRow?.cnt || 0
  });
}
__name(listAuditLog, "listAuditLog");
async function listBudgets(env, user) {
  const result = await env.DB.prepare(
    "SELECT b.*, c.name AS category_name, c.color AS category_color FROM budgets b LEFT JOIN categories c ON b.category_id = c.id WHERE b.workspace_id = ? AND b.is_active = 1 ORDER BY b.year DESC, b.month DESC"
  ).bind(user.workspace_id).all();
  return json({ budgets: (result.results || []).map(formatBudget) });
}
__name(listBudgets, "listBudgets");
async function createBudget(request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const { categoryId, year, month, amount } = await request.json();
  if (!categoryId || !year || !month || !amount) return json({ error: "categoryId, year, month, amount required" }, 400);
  if (Number(amount) <= 0) return json({ error: "amount must be positive" }, 400);
  const id = "b_" + crypto.randomUUID().slice(0, 12);
  try {
    await env.DB.prepare("INSERT INTO budgets (id, workspace_id, category_id, year, month, amount) VALUES (?, ?, ?, ?, ?, ?)").bind(id, user.workspace_id, categoryId, year, month, Number(amount)).run();
  } catch (e) {
    if (String(e.message || "").includes("UNIQUE constraint")) {
      await env.DB.prepare("UPDATE budgets SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND category_id = ? AND year = ? AND month = ? AND is_active = 1").bind(Number(amount), user.workspace_id, categoryId, year, month).run();
      return json({ ok: true });
    }
    throw e;
  }
  return json({ ok: true, id }, 201);
}
__name(createBudget, "createBudget");
async function updateBudget(id, request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  const { amount } = await request.json();
  if (!amount || Number(amount) <= 0) return json({ error: "amount must be positive" }, 400);
  await env.DB.prepare("UPDATE budgets SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?").bind(Number(amount), id, user.workspace_id).run();
  return json({ ok: true });
}
__name(updateBudget, "updateBudget");
async function deleteBudget(id, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30 Admin" }, 403);
  await env.DB.prepare("UPDATE budgets SET is_active = 0 WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).run();
  return json({ ok: true });
}
__name(deleteBudget, "deleteBudget");
function formatBudget(b) {
  if (!b) return null;
  return {
    id: b.id,
    workspaceId: b.workspace_id,
    categoryId: b.category_id,
    categoryName: b.category_name || null,
    categoryColor: b.category_color || null,
    year: b.year,
    month: b.month,
    amount: Number(b.amount),
    isActive: !!b.is_active,
    createdAt: b.created_at,
    updatedAt: b.updated_at
  };
}
__name(formatBudget, "formatBudget");
async function triggerRecurring(id, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C" }, 403);
  const rec = await env.DB.prepare("SELECT * FROM recurring_templates WHERE id = ? AND workspace_id = ? AND is_active = 1").bind(id, user.workspace_id).first();
  if (!rec) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A recurring" }, 404);
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const txId = "tx_" + crypto.randomUUID();
  const balanceChange = rec.type === "income" ? Number(rec.amount) : -Number(rec.amount);
  const wallet = await env.DB.prepare("SELECT id FROM wallets WHERE id = ? AND is_active = 1").bind(rec.wallet_id).first();
  if (!wallet) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32" }, 404);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO transactions (id, workspace_id, created_by_user_id, wallet_id, category_id, sub_category_id, name, amount, type, scope, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(txId, rec.workspace_id, user.id, rec.wallet_id, rec.category_id, rec.sub_category_id, rec.name + " (manual trigger)", Number(rec.amount), rec.type, rec.scope, today, "triggered manually"),
    env.DB.prepare("UPDATE wallets SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(balanceChange, rec.wallet_id)
  ]);
  const nextDue = calcNextDueDate(rec.frequency, rec.due_day, today);
  await env.DB.prepare("UPDATE recurring_templates SET next_due_date = ? WHERE id = ?").bind(nextDue, rec.id).run();
  await broadcastChange(env, user.workspace_id, { event: "tx.created", txId, by: user.name });
  return json({ ok: true, txId, nextDueDate: nextDue });
}
__name(triggerRecurring, "triggerRecurring");
async function processRecurring(env, thaiHour = 8) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const result = await env.DB.prepare(
    "SELECT * FROM recurring_templates WHERE is_active = 1 AND auto_create = 1 AND COALESCE(due_hour, 8) = ? AND (next_due_date IS NULL OR next_due_date <= ?)"
  ).bind(thaiHour, today).all();
  for (const rec of result.results || []) {
    try {
      const isDraft = !!rec.draft_mode;
      if (isDraft) {
        const existing = await env.DB.prepare(
          "SELECT id FROM transactions WHERE recurring_id = ? AND date = ? AND is_draft = 1"
        ).bind(rec.id, today).first();
        if (existing) continue;
      }
      const txId = "tx_" + crypto.randomUUID();
      if (isDraft) {
        await env.DB.prepare(
          "INSERT INTO transactions (id, workspace_id, created_by_user_id, wallet_id, category_id, sub_category_id, name, amount, type, scope, date, note, is_draft, recurring_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)"
        ).bind(txId, rec.workspace_id, rec.created_by_user_id, rec.wallet_id, rec.category_id, rec.sub_category_id, rec.name, Number(rec.amount), rec.type, rec.scope, today, "draft \u2014 \u0E23\u0E2D\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19", rec.id).run();
      } else {
        const balanceChange = rec.type === "income" ? Number(rec.amount) : -Number(rec.amount);
        await env.DB.batch([
          env.DB.prepare("INSERT INTO transactions (id, workspace_id, created_by_user_id, wallet_id, category_id, sub_category_id, name, amount, type, scope, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(txId, rec.workspace_id, rec.created_by_user_id, rec.wallet_id, rec.category_id, rec.sub_category_id, rec.name + " (auto)", Number(rec.amount), rec.type, rec.scope, today, "auto-created from recurring template"),
          env.DB.prepare("UPDATE wallets SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(balanceChange, rec.wallet_id)
        ]);
      }
      const nextDue = calcNextDueDate(rec.frequency, rec.due_day, today);
      await env.DB.prepare("UPDATE recurring_templates SET next_due_date = ? WHERE id = ?").bind(nextDue, rec.id).run();
    } catch (e) {
      console.error("processRecurring failed for", rec.id, e);
    }
  }
}
__name(processRecurring, "processRecurring");
async function cleanupDrafts(env) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  try {
    const slips = await env.DB.prepare(`
      SELECT s.file_key FROM slips s
      JOIN transactions t ON s.transaction_id = t.id
      WHERE t.is_draft = 1 AND t.date <= ?
    `).bind(today).all();
    for (const s of slips.results || []) {
      try {
        await env.SLIPS.delete(s.file_key);
      } catch {
      }
    }
    await env.DB.prepare(
      "DELETE FROM slips WHERE transaction_id IN (SELECT id FROM transactions WHERE is_draft = 1 AND date <= ?)"
    ).bind(today).run();
    await env.DB.prepare("DELETE FROM transactions WHERE is_draft = 1 AND date <= ?").bind(today).run();
  } catch (e) {
    console.error("cleanupDrafts failed:", e);
  }
}
__name(cleanupDrafts, "cleanupDrafts");
async function confirmTransaction(id, request, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C" }, 403);
  const tx = await env.DB.prepare(
    "SELECT * FROM transactions WHERE id = ? AND workspace_id = ? AND is_draft = 1"
  ).bind(id, user.workspace_id).first();
  if (!tx) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A draft \u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48 draft" }, 404);
  const wallet = await env.DB.prepare(
    "SELECT * FROM wallets WHERE id = ? AND is_active = 1"
  ).bind(tx.wallet_id).first();
  if (!wallet) return json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32" }, 404);
  const body = await request.json().catch(() => ({}));
  const newAmount = body.amount ? Number(body.amount) : Number(tx.amount);
  if (newAmount <= 0 || isNaN(newAmount)) return json({ error: "amount must be positive" }, 400);
  const note = body.note !== void 0 ? body.note : tx.note;
  const balanceChange = tx.type === "income" ? newAmount : -newAmount;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE transactions SET is_draft = 0, amount = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(newAmount, note || null, id),
    env.DB.prepare(
      "UPDATE wallets SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(balanceChange, tx.wallet_id)
  ]);
  await logAudit(env, user, "confirm", "transaction", id, { amount: newAmount });
  await broadcastChange(env, user.workspace_id, { event: "tx.created", txId: id, walletId: tx.wallet_id, by: user.name });
  return json({ ok: true });
}
__name(confirmTransaction, "confirmTransaction");
function calcNextDueDate(frequency, dueDay, fromDate) {
  const d = new Date(fromDate);
  switch (frequency) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(dueDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      d.setDate(Math.min(dueDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      break;
  }
  return d.toISOString().slice(0, 10);
}
__name(calcNextDueDate, "calcNextDueDate");
async function listAllSlips(request, env, user) {
  const params = new URL(request.url).searchParams;
  const year = params.get("year");
  const month = params.get("month");
  const from = params.get("from");
  const to = params.get("to");
  let filter = "";
  const args = [user.workspace_id];
  if (from && to) {
    filter = " AND t.date >= ? AND t.date <= ?";
    args.push(from, to);
  } else if (from) {
    filter = " AND t.date >= ?";
    args.push(from);
  } else if (year && month) {
    filter = " AND t.date LIKE ?";
    args.push(`${year}-${String(month).padStart(2, "0")}-%`);
  } else if (year) {
    filter = " AND t.date LIKE ?";
    args.push(`${year}-%`);
  }
  const rows = await env.DB.prepare(`
    SELECT s.id, s.transaction_id, s.file_key, s.file_name, s.file_size,
           s.mime_type, s.slip_type, s.created_at,
           t.date AS tx_date, t.name AS tx_name, t.type AS tx_type, t.amount AS tx_amount
    FROM slips s
    JOIN transactions t ON s.transaction_id = t.id
    WHERE s.workspace_id = ?${filter}
    ORDER BY t.date DESC, s.created_at DESC
  `).bind(...args).all();
  return json({
    slips: (rows.results || []).map((s) => ({
      ...formatSlip(s),
      txDate: s.tx_date,
      txName: s.tx_name,
      txType: s.tx_type,
      txAmount: Number(s.tx_amount)
    }))
  });
}
__name(listAllSlips, "listAllSlips");
// ── OCR helpers ──────────────────────────────────────────────
function toBase64Worker(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
// Thai bank slips print the year in Buddhist era (พ.ศ., e.g. 2569). We store CE, so
// convert deterministically here instead of trusting the OCR model to do the math.
function normalizeSlipYear(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  let y = Number(dateStr.slice(0, 4));
  if (y >= 2400) y -= 543; // Buddhist era -> Gregorian (2569 -> 2026)
  const now = new Date().getUTCFullYear();
  if (y < 2015 || y > now + 1) return null; // implausible OCR guess -> let the user fill it in
  return String(y) + dateStr.slice(4);
}
__name(normalizeSlipYear, "normalizeSlipYear");
async function ocrDocument(imageBuffer, mediaType, apiKey) {
  if (!apiKey) return null;
  try {
    const base64 = toBase64Worker(imageBuffer);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `อ่านเอกสารการเงินนี้ ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:
{
  "doc_type": "tax_invoice" หรือ "receipt" หรือ "transfer" หรือ "other",
  "vendor_name": "ชื่อร้าน/บริษัทผู้ขาย (ผู้ออกเอกสาร)" หรือ null,
  "tax_id": "เลขประจำตัวผู้เสียภาษี 13 หลัก" หรือ null,
  "address": "ที่อยู่ร้าน/บริษัท" หรือ null,
  "phone": "เบอร์โทรศัพท์" หรือ null,
  "doc_number": "เลขที่เอกสาร" หรือ null,
  "doc_date": "YYYY-MM-DD" (ปีตามที่พิมพ์บนเอกสาร พ.ศ. เช่น 2569 ไม่ต้องแปลงเป็น ค.ศ.) หรือ null,
  "subtotal": ตัวเลขก่อน VAT หรือ null,
  "vat": ตัวเลข VAT หรือ null,
  "total": ตัวเลขยอดรวมสุดท้าย หรือ null,
  "items": [{"name":"ชื่อสินค้า/บริการ","qty":จำนวน,"unit_price":ราคาต่อหน่วย,"amount":ราคารวม}] หรือ []
}` }
        ]}]
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed && parsed.doc_date) parsed.doc_date = normalizeSlipYear(parsed.doc_date);
    return parsed;
  } catch { return null; }
}
__name(ocrDocument, "ocrDocument");

// ── Bulk slip OCR + vendor suggestion (web bulk-upload) ─────────
// Analyze ONE slip without writing anything: OCR the image, then suggest a
// vendor/category/wallet match from learned profiles + history + bank. The web
// client renders these as an editable review row and only calls POST
// /transactions on confirm, so the create path stays the battle-tested one.
async function ocrSlipAnalyze(request, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "ไม่มีสิทธิ์" }, 403);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "OCR ยังไม่พร้อมใช้งาน (ไม่มี API key)" }, 503);
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.startsWith("image/")) {
    return json({ error: "รองรับเฉพาะรูปภาพสำหรับการอ่านอัตโนมัติ" }, 400);
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > 10 * 1024 * 1024) return json({ error: "ไฟล์ใหญ่เกิน 10MB" }, 400);

  const ocr = await ocrSlipUnified(buffer, contentType, env.ANTHROPIC_API_KEY);
  if (!ocr || !ocr.is_slip || !ocr.amount) {
    return json({ ok: true, isSlip: false, ocr: ocr || null });
  }

  const slipType = ocr.slip_type === "receipt" ? "receipt" : ocr.slip_type === "transfer" ? "transfer" : "other";
  const recipientName = ocr.recipient_name ? String(ocr.recipient_name).slice(0, 60) : null;
  const txType = "expense"; // default — user can flip to income in the review grid
  const suggest = await matchSuggest(env, user.workspace_id, recipientName, txType, ocr.bank);

  return json({
    ok: true,
    isSlip: true,
    slipType,
    ocr: {
      amount: Number(ocr.amount) || 0,
      date: ocr.date || null,
      recipientName,
      bank: ocr.bank || null,
      reference: ocr.reference || null,
      taxId: ocr.tax_id || null,
      address: ocr.address || null,
      phone: ocr.phone || null,
    },
    suggest,
  });
}
__name(ocrSlipAnalyze, "ocrSlipAnalyze");

// Unified slip OCR — discriminates transfer (payer vs payee) and receipt, and
// also pulls vendor detail fields used for learning. Prompt ported from the
// proven LINE-bot reader (functions/api/line-webhook.js ocrSlip).
async function ocrSlipUnified(imageBuffer, mediaType, apiKey) {
  if (!apiKey) return null;
  try {
    const base64 = toBase64Worker(imageBuffer);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `คุณคือผู้เชี่ยวชาญอ่านเอกสารการเงินไทย อ่านรูปนี้แล้วระบุข้อมูลให้ถูกต้อง

== ประเภทเอกสารที่รองรับ ==
1. สลิปโอนเงินธนาคาร (transfer)
2. ใบกำกับภาษี / ใบเสร็จรับเงิน / ใบแจ้งหนี้ (receipt)

== สลิปโอนเงิน: วิธีระบุผู้รับเงิน (สำคัญมาก) ==
สลิปโอนเงินมี 2 ฝั่งเสมอ:
• ต้นทาง/ผู้โอน/From/จาก = คนส่งเงิน → "ไม่ใช่" recipient_name
• ปลายทาง/ผู้รับ/To/ถึง/ไปยัง = คนรับเงิน → นี่คือ recipient_name
ถ้าเห็นลูกศร (→) ชื่อที่อยู่หลังลูกศร = ผู้รับ
รูปแบบสลิปธนาคารไทย: SCB / KBank / Krungthai / BBL / PromptPay

== ใบกำกับภาษี / ใบเสร็จรับเงิน ==
• recipient_name = ชื่อร้านค้า/บริษัทผู้ขาย (ผู้ออกเอกสาร) ไม่ใช่ผู้ซื้อ
• amount = ยอดรวมทั้งสิ้น (รวม VAT ถ้ามี)
• reference = เลขที่ใบกำกับภาษี / เลขที่ใบเสร็จ
• slip_type = "receipt"

ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอกจาก JSON:
{
  "is_slip": true หรือ false,
  "slip_type": "transfer" หรือ "receipt",
  "amount": ตัวเลข (บาท ไม่มี comma ไม่มีหน่วย),
  "date": "YYYY-MM-DD" (ปีตามที่พิมพ์บนสลิป พ.ศ. เช่น 2569 ไม่ต้องแปลงเป็น ค.ศ.) หรือ null,
  "recipient_name": "ชื่อผู้รับเงิน หรือ ชื่อร้านค้า/บริษัทผู้ขาย" หรือ null,
  "bank": "ธนาคารของผู้รับ (เฉพาะสลิปโอนเงิน)" หรือ null,
  "reference": "เลขที่รายการ / เลขที่ใบกำกับ / เลขที่ใบเสร็จ" หรือ null,
  "tax_id": "เลขประจำตัวผู้เสียภาษี 13 หลัก (ถ้ามี)" หรือ null,
  "address": "ที่อยู่ร้าน/บริษัท (ใบเสร็จ)" หรือ null,
  "phone": "เบอร์โทร (ถ้ามี)" หรือ null
}
ถ้าไม่ใช่เอกสารการเงิน ตอบ {"is_slip":false}` }
        ]}]
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed && parsed.date) parsed.date = normalizeSlipYear(parsed.date);
    return parsed;
  } catch { return null; }
}
__name(ocrSlipUnified, "ocrSlipUnified");

// Bank name → wallet matching (mirrors the LINE bot's BANK_ALIASES table).
var BANK_ALIASES_WORKER = [
  ['กสิกร', 'kbank', 'kasikorn'],
  ['ไทยพาณิชย์', 'scb'],
  ['กรุงเทพ', 'bbl', 'bangkok'],
  ['กรุงไทย', 'ktb', 'krungthai'],
  ['ทหารไทย', 'ttb', 'tmb'],
  ['ออมสิน', 'gsb'],
  ['ธกส', 'baac'],
  ['ยูโอบี', 'uob'],
  ['ซีไอเอ็มบี', 'cimb'],
  ['ซิตี้', 'citi'],
];

function matchWalletByBank(bank, wallets) {
  if (!bank || !wallets.length) return null;
  const b = String(bank).toLowerCase();
  const group = BANK_ALIASES_WORKER.find(aliases => aliases.some(a => b.includes(a)));
  return wallets.find(w => {
    const name = (w.name || '').toLowerCase();
    if (group) return group.some(a => name.includes(a));
    return name.includes(b);
  }) || null;
}
__name(matchWalletByBank, "matchWalletByBank");

// Suggest vendor/category/wallet for a slip, read-only. Priority for CATEGORY:
// (1) explicit keyword rules → (2) EXACT learned vendor → (3) history.
// Wallet: vendor's typical → bank guess → history. Never writes.
// Note: vendor matching is EXACT-name only (no fuzzy LIKE) to stop wrong-vendor
// matches that produced bogus categories.
async function matchSuggest(env, workspaceId, recipientName, txType, bank) {
  const walletRows = await env.DB.prepare(
    "SELECT id, name FROM wallets WHERE workspace_id = ? AND is_active = 1"
  ).bind(workspaceId).all();
  const wallets = walletRows.results || [];
  const bankWallet = matchWalletByBank(bank, wallets);

  const result = {
    vendorId: null, vendorName: recipientName, taxId: null,
    categoryId: null, categoryName: null, subCategoryId: null, subCategoryName: null,
    walletId: bankWallet ? bankWallet.id : null,
    walletName: bankWallet ? bankWallet.name : null,
    source: null,
  };
  if (!recipientName) return result;

  // 1) Explicit keyword rules — deterministic, highest priority
  const rule = await matchCategoryRule(env, workspaceId, recipientName);
  if (rule && rule.categoryId) {
    result.categoryId = rule.categoryId;
    result.categoryName = rule.categoryName;
    result.subCategoryId = rule.subCategoryId;
    result.subCategoryName = rule.subCategoryName;
    result.source = 'rule';
  }

  // 2) Learned vendor profile — EXACT name match only (no fuzzy)
  const vendor = await env.DB.prepare(
    "SELECT * FROM vendor_profiles WHERE workspace_id = ? AND vendor_name = ? COLLATE NOCASE"
  ).bind(workspaceId, recipientName).first();
  if (vendor) {
    result.vendorId = vendor.id;
    result.vendorName = vendor.vendor_name;
    result.taxId = vendor.tax_id || null;
    if (!result.categoryId) { // a rule already won → keep it
      result.categoryId = vendor.typical_category_id || null;
      result.categoryName = vendor.typical_category_name || null;
      result.subCategoryId = vendor.typical_sub_category_id || null;
      result.subCategoryName = vendor.typical_sub_category_name || null;
      if (result.categoryId && !result.source) result.source = 'vendor_profile';
    }
    if (vendor.typical_wallet_id) {
      result.walletId = vendor.typical_wallet_id;
      result.walletName = vendor.typical_wallet_name;
    }
    if (!result.source) result.source = 'vendor_profile';
  }

  // 3) History fallback — only fills gaps that rule + vendor left empty
  if (!result.categoryId || !result.walletId) {
    const hist = await env.DB.prepare(
      `SELECT t.category_id, t.sub_category_id, t.wallet_id,
              c.name AS category_name, sc.name AS sub_category_name, w.name AS wallet_name,
              COUNT(*) AS cnt
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN categories sc ON t.sub_category_id = sc.id
       LEFT JOIN wallets w ON t.wallet_id = w.id
       WHERE t.workspace_id = ? AND t.type = ? AND t.name LIKE ?
         AND (t.category_id IS NOT NULL OR t.wallet_id IS NOT NULL)
       GROUP BY t.category_id, t.sub_category_id, t.wallet_id
       ORDER BY cnt DESC LIMIT 1`
    ).bind(workspaceId, txType, `%${recipientName}%`).first();
    if (hist) {
      if (!result.categoryId) {
        result.categoryId = hist.category_id || null;
        result.categoryName = hist.category_name || null;
        result.subCategoryId = hist.sub_category_id || null;
        result.subCategoryName = hist.sub_category_name || null;
        if (result.categoryId && !result.source) result.source = 'history';
      }
      if (!result.walletId) {
        result.walletId = hist.wallet_id || null;
        result.walletName = hist.wallet_name || null;
      }
    }
  }

  return result;
}
__name(matchSuggest, "matchSuggest");

async function upsertVendorProfile(workspaceId, ocr, txCategoryId, txCategoryName, txSubCategoryId, txSubCategoryName, txWalletId, txWalletName, env) {
  if (!ocr?.vendor_name) return;
  const existing = await env.DB.prepare(
    "SELECT * FROM vendor_profiles WHERE workspace_id = ? AND vendor_name = ? COLLATE NOCASE"
  ).bind(workspaceId, ocr.vendor_name).first();
  const now = new Date().toISOString().slice(0, 10);
  if (existing) {
    await env.DB.prepare(`UPDATE vendor_profiles SET
      tax_id = COALESCE(?, tax_id), address = COALESCE(?, address), phone = COALESCE(?, phone),
      typical_category_id = COALESCE(?, typical_category_id),
      typical_category_name = COALESCE(?, typical_category_name),
      typical_sub_category_id = COALESCE(?, typical_sub_category_id),
      typical_sub_category_name = COALESCE(?, typical_sub_category_name),
      typical_wallet_id = COALESCE(?, typical_wallet_id),
      typical_wallet_name = COALESCE(?, typical_wallet_name),
      occurrence_count = occurrence_count + 1, last_seen = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      ocr.tax_id || null, ocr.address || null, ocr.phone || null,
      txCategoryId || null, txCategoryName || null,
      txSubCategoryId || null, txSubCategoryName || null,
      txWalletId || null, txWalletName || null,
      now, existing.id
    ).run();
  } else {
    const id = 'vp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await env.DB.prepare(`INSERT INTO vendor_profiles
      (id, workspace_id, vendor_name, tax_id, address, phone,
       typical_category_id, typical_category_name,
       typical_sub_category_id, typical_sub_category_name,
       typical_wallet_id, typical_wallet_name, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, workspaceId, ocr.vendor_name, ocr.tax_id || null, ocr.address || null, ocr.phone || null,
      txCategoryId || null, txCategoryName || null,
      txSubCategoryId || null, txSubCategoryName || null,
      txWalletId || null, txWalletName || null, now
    ).run();
  }
}
__name(upsertVendorProfile, "upsertVendorProfile");

async function listVendorProfiles(request, env, user) {
  const name = new URL(request.url).searchParams.get('name') || '';
  let rows;
  if (name) {
    rows = await env.DB.prepare(
      "SELECT * FROM vendor_profiles WHERE workspace_id = ? AND vendor_name LIKE ? ORDER BY occurrence_count DESC LIMIT 10"
    ).bind(user.workspace_id, `%${name}%`).all();
  } else {
    rows = await env.DB.prepare(
      "SELECT * FROM vendor_profiles WHERE workspace_id = ? ORDER BY occurrence_count DESC, last_seen DESC LIMIT 50"
    ).bind(user.workspace_id).all();
  }
  return json({ vendors: (rows.results || []).map(formatVendor) });
}
__name(listVendorProfiles, "listVendorProfiles");

function formatVendor(v) {
  return {
    id: v.id, vendorName: v.vendor_name, taxId: v.tax_id, address: v.address, phone: v.phone,
    typicalCategoryId: v.typical_category_id, typicalCategoryName: v.typical_category_name,
    typicalSubCategoryId: v.typical_sub_category_id, typicalSubCategoryName: v.typical_sub_category_name,
    typicalWalletId: v.typical_wallet_id, typicalWalletName: v.typical_wallet_name,
    occurrenceCount: v.occurrence_count, lastSeen: v.last_seen,
  };
}
__name(formatVendor, "formatVendor");

// Manage a learned vendor profile (admin) — correct the category/wallet the AI
// stored, fix details, or rename. Empty string clears a field; undefined leaves it.
async function updateVendorProfile(id, request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "เฉพาะ Admin" }, 403);
  const v = await env.DB.prepare("SELECT * FROM vendor_profiles WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!v) return json({ error: "ไม่พบ vendor" }, 404);
  const body = await request.json();
  const updates = [], args = [];
  const setField = (col, val) => { updates.push(`${col} = ?`); args.push(val); };
  if (body.vendorName !== void 0) {
    if (!String(body.vendorName).trim()) return json({ error: "ชื่อ vendor ห้ามว่าง" }, 400);
    setField("vendor_name", String(body.vendorName).trim());
  }
  if (body.taxId !== void 0) setField("tax_id", body.taxId || null);
  if (body.address !== void 0) setField("address", body.address || null);
  if (body.phone !== void 0) setField("phone", body.phone || null);
  if (body.categoryId !== void 0) {
    const c = body.categoryId ? await env.DB.prepare("SELECT name FROM categories WHERE id = ? AND workspace_id = ?").bind(body.categoryId, user.workspace_id).first() : null;
    if (body.categoryId && !c) return json({ error: "ไม่พบหมวดหมู่" }, 404);
    setField("typical_category_id", body.categoryId || null);
    setField("typical_category_name", c?.name || null);
  }
  if (body.subCategoryId !== void 0) {
    const sc = body.subCategoryId ? await env.DB.prepare("SELECT name FROM categories WHERE id = ? AND workspace_id = ?").bind(body.subCategoryId, user.workspace_id).first() : null;
    if (body.subCategoryId && !sc) return json({ error: "ไม่พบหมวดย่อย" }, 404);
    setField("typical_sub_category_id", body.subCategoryId || null);
    setField("typical_sub_category_name", sc?.name || null);
  }
  if (body.walletId !== void 0) {
    const w = body.walletId ? await env.DB.prepare("SELECT name FROM wallets WHERE id = ? AND workspace_id = ?").bind(body.walletId, user.workspace_id).first() : null;
    if (body.walletId && !w) return json({ error: "ไม่พบกระเป๋า" }, 404);
    setField("typical_wallet_id", body.walletId || null);
    setField("typical_wallet_name", w?.name || null);
  }
  if (updates.length === 0) return json({ error: "no fields" }, 400);
  updates.push("updated_at = datetime('now')");
  args.push(id);
  await env.DB.prepare(`UPDATE vendor_profiles SET ${updates.join(", ")} WHERE id = ?`).bind(...args).run();
  await logAudit(env, user, "update", "vendor", id, body);
  const updated = await env.DB.prepare("SELECT * FROM vendor_profiles WHERE id = ?").bind(id).first();
  return json({ vendor: formatVendor(updated) });
}
__name(updateVendorProfile, "updateVendorProfile");

async function deleteVendorProfile(id, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "เฉพาะ Admin" }, 403);
  const v = await env.DB.prepare("SELECT id FROM vendor_profiles WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!v) return json({ error: "ไม่พบ vendor" }, 404);
  await env.DB.prepare("DELETE FROM vendor_profiles WHERE id = ?").bind(id).run();
  await logAudit(env, user, "delete", "vendor", id, {});
  return json({ ok: true });
}
__name(deleteVendorProfile, "deleteVendorProfile");

// Shared: upsert a vendor profile from a vendor name + chosen category/wallet,
// resolving human-readable names from the DB. Used by the LINE bot endpoint and
// by web-app category edits so the bot learns from corrections made anywhere.
async function learnVendorByName(env, workspaceId, vendorName, categoryId, subCategoryId, walletId, taxId) {
  if (!vendorName) return;
  let catName = null, subName = null, walName = null;
  if (categoryId) {
    const c = await env.DB.prepare("SELECT name FROM categories WHERE id = ? AND workspace_id = ?").bind(categoryId, workspaceId).first();
    catName = c?.name || null;
  }
  if (subCategoryId) {
    const sc = await env.DB.prepare("SELECT name FROM categories WHERE id = ? AND workspace_id = ?").bind(subCategoryId, workspaceId).first();
    subName = sc?.name || null;
  }
  if (walletId) {
    const w = await env.DB.prepare("SELECT name FROM wallets WHERE id = ? AND workspace_id = ?").bind(walletId, workspaceId).first();
    walName = w?.name || null;
  }
  await upsertVendorProfile(
    workspaceId,
    { vendor_name: vendorName, tax_id: taxId || null },
    categoryId || null, catName,
    subCategoryId || null, subName,
    walletId || null, walName,
    env
  );
}
__name(learnVendorByName, "learnVendorByName");

// LINE bot calls this after the user confirms / fixes a slip's category.
async function learnVendorProfile(request, env, user) {
  const { vendorName, categoryId, subCategoryId, walletId, taxId } = await request.json();
  if (!vendorName) return json({ error: "vendorName required" }, 400);
  await learnVendorByName(env, user.workspace_id, vendorName, categoryId || null, subCategoryId || null, walletId || null, taxId || null);
  return json({ ok: true }, 201);
}
__name(learnVendorProfile, "learnVendorProfile");

// ── Category rules ─────────────────────────────────────────────
// User-defined keyword → category mappings. Deterministic and highest
// priority — applied before vendor memory / history / AI so the bot stops
// guessing the wrong category.
function formatCategoryRule(r) {
  return {
    id: r.id, keyword: r.keyword,
    categoryId: r.category_id, categoryName: r.cat_name || null,
    subCategoryId: r.sub_category_id, subCategoryName: r.sub_name || null,
    priority: r.priority || 0, createdAt: r.created_at,
  };
}
__name(formatCategoryRule, "formatCategoryRule");

async function listCategoryRules(env, user) {
  const rows = await env.DB.prepare(
    `SELECT r.*, c.name AS cat_name, sc.name AS sub_name
     FROM category_rules r
     LEFT JOIN categories c ON r.category_id = c.id
     LEFT JOIN categories sc ON r.sub_category_id = sc.id
     WHERE r.workspace_id = ?
     ORDER BY r.priority DESC, length(r.keyword) DESC, r.keyword`
  ).bind(user.workspace_id).all();
  return json({ rules: (rows.results || []).map(formatCategoryRule) });
}
__name(listCategoryRules, "listCategoryRules");

async function createCategoryRule(request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "เฉพาะ Admin" }, 403);
  const { keyword, categoryId, subCategoryId, priority } = await request.json();
  if (!keyword || !keyword.trim()) return json({ error: "keyword required" }, 400);
  if (!categoryId) return json({ error: "categoryId required" }, 400);
  const id = "cr_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await env.DB.prepare(
    "INSERT INTO category_rules (id, workspace_id, keyword, category_id, sub_category_id, priority) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, user.workspace_id, keyword.trim(), categoryId, subCategoryId || null, Number(priority) || 0).run();
  return json({ ok: true, id }, 201);
}
__name(createCategoryRule, "createCategoryRule");

async function updateCategoryRule(id, request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "เฉพาะ Admin" }, 403);
  const existing = await env.DB.prepare("SELECT id FROM category_rules WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!existing) return json({ error: "Rule not found" }, 404);
  const body = await request.json();
  const updates = [], args = [];
  if (body.keyword !== void 0) { updates.push("keyword = ?"); args.push(String(body.keyword).trim()); }
  if (body.categoryId !== void 0) { updates.push("category_id = ?"); args.push(body.categoryId || null); }
  if (body.subCategoryId !== void 0) { updates.push("sub_category_id = ?"); args.push(body.subCategoryId || null); }
  if (body.priority !== void 0) { updates.push("priority = ?"); args.push(Number(body.priority) || 0); }
  if (!updates.length) return json({ error: "no fields" }, 400);
  args.push(id);
  await env.DB.prepare(`UPDATE category_rules SET ${updates.join(", ")} WHERE id = ?`).bind(...args).run();
  return json({ ok: true });
}
__name(updateCategoryRule, "updateCategoryRule");

async function deleteCategoryRule(id, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "เฉพาะ Admin" }, 403);
  const r = await env.DB.prepare("SELECT id FROM category_rules WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!r) return json({ error: "Rule not found" }, 404);
  await env.DB.prepare("DELETE FROM category_rules WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
__name(deleteCategoryRule, "deleteCategoryRule");

// Find the best keyword rule whose keyword is contained in `text`
// (case-insensitive). Most specific wins: higher priority, then longer keyword.
async function matchCategoryRule(env, workspaceId, text) {
  if (!text) return null;
  const rows = await env.DB.prepare(
    `SELECT r.*, c.name AS cat_name, sc.name AS sub_name
     FROM category_rules r
     LEFT JOIN categories c ON r.category_id = c.id
     LEFT JOIN categories sc ON r.sub_category_id = sc.id
     WHERE r.workspace_id = ?`
  ).bind(workspaceId).all();
  const t = String(text).toLowerCase();
  let best = null;
  for (const r of (rows.results || [])) {
    const kw = (r.keyword || "").toLowerCase().trim();
    if (!kw || !t.includes(kw)) continue;
    const better = !best
      || (r.priority || 0) > (best.priority || 0)
      || ((r.priority || 0) === (best.priority || 0) && kw.length > (best.keyword || "").length);
    if (better) best = r;
  }
  return best ? formatCategoryRule(best) : null;
}
__name(matchCategoryRule, "matchCategoryRule");

// Extract the recipient/vendor name from a slip-derived transaction name
// ("โอนให้ X" / "รับจาก X"). Returns null for manually-named transactions so we
// only learn from real slip records and stay key-compatible with the LINE bot.
function recipientFromTxName(name) {
  if (!name) return null;
  const m = String(name).match(/^(?:โอนให้|รับจาก)\s+(.+)$/);
  return m ? m[1].trim().slice(0, 25) : null;
}
__name(recipientFromTxName, "recipientFromTxName");

async function uploadSlip(transactionId, request, env, user) {
  const tx = await env.DB.prepare(
    "SELECT id FROM transactions WHERE id = ? AND workspace_id = ?"
  ).bind(transactionId, user.workspace_id).first();
  if (!tx) return json({ error: "Transaction not found" }, 404);
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.startsWith("image/") && contentType !== "application/pdf") {
    return json({ error: "Only images and PDF allowed" }, 400);
  }
  const slipType = new URL(request.url).searchParams.get("type") || "receipt";
  const fileName = new URL(request.url).searchParams.get("name") || "slip_" + Date.now();
  const slipId = "s_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const fileKey = `${user.workspace_id}/${transactionId}/${slipId}`;
  const body = await request.arrayBuffer();
  if (body.byteLength > 10 * 1024 * 1024) return json({ error: "File too large (max 10MB)" }, 400);
  await env.SLIPS.put(fileKey, body, {
    httpMetadata: { contentType },
    customMetadata: { workspaceId: user.workspace_id, transactionId, fileName }
  });

  // OCR for receipt / tax_invoice (images only)
  let ocrText = null, ocrData = null;
  if ((slipType === 'receipt' || slipType === 'tax_invoice') && contentType.startsWith('image/') && env.ANTHROPIC_API_KEY) {
    const ocr = await ocrDocument(body, contentType, env.ANTHROPIC_API_KEY);
    if (ocr) {
      ocrData = JSON.stringify(ocr);
      ocrText = ocr.vendor_name || null;
      // Learn vendor profile — fetch category/wallet names for context
      const txFull = await env.DB.prepare(
        `SELECT t.category_id, t.sub_category_id, t.wallet_id,
                c.name AS cat_name, sc.name AS sub_cat_name, w.name AS wallet_name
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         LEFT JOIN categories sc ON t.sub_category_id = sc.id
         LEFT JOIN wallets w ON t.wallet_id = w.id
         WHERE t.id = ?`
      ).bind(transactionId).first();
      await upsertVendorProfile(
        user.workspace_id, ocr,
        txFull?.category_id || null, txFull?.cat_name || null,
        txFull?.sub_category_id || null, txFull?.sub_cat_name || null,
        txFull?.wallet_id || null, txFull?.wallet_name || null,
        env
      );
    }
  }

  await env.DB.prepare(
    "INSERT INTO slips (id, workspace_id, transaction_id, file_key, file_name, file_size, mime_type, slip_type, ocr_text, ocr_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(slipId, user.workspace_id, transactionId, fileKey, fileName, body.byteLength, contentType, slipType, ocrText, ocrData).run();
  return json({ slip: { id: slipId, fileName, slipType, mimeType: contentType, fileSize: body.byteLength, ocrData: ocrData ? JSON.parse(ocrData) : null } }, 201);
}
__name(uploadSlip, "uploadSlip");
async function listSlips(transactionId, env, user) {
  const tx = await env.DB.prepare("SELECT id FROM transactions WHERE id = ? AND workspace_id = ?").bind(transactionId, user.workspace_id).first();
  if (!tx) return json({ error: "Transaction not found" }, 404);
  const rows = await env.DB.prepare(
    "SELECT * FROM slips WHERE transaction_id = ? ORDER BY created_at ASC"
  ).bind(transactionId).all();
  const slips = await Promise.all((rows.results || []).map(async (s) => {
    const signed = await env.SLIPS.createPresignedUrl ? await env.SLIPS.createPresignedUrl(s.file_key, { expiresIn: 3600 }) : null;
    return formatSlip(s, signed);
  }));
  return json({ slips });
}
__name(listSlips, "listSlips");
async function getSlipUrl(slipId, env, user) {
  const s = await env.DB.prepare("SELECT * FROM slips WHERE id = ? AND workspace_id = ?").bind(slipId, user.workspace_id).first();
  if (!s) return json({ error: "Slip not found" }, 404);
  const obj = await env.SLIPS.get(s.file_key);
  if (!obj) return json({ error: "File not found in storage" }, 404);
  const headers = new Headers();
  headers.set("Content-Type", s.mime_type || "image/jpeg");
  headers.set("Content-Disposition", `inline; filename="${s.file_name}"`);
  headers.set("Cache-Control", "private, max-age=3600");
  return cors(new Response(obj.body, { headers }));
}
__name(getSlipUrl, "getSlipUrl");
async function deleteSlip(slipId, env, user) {
  const s = await env.DB.prepare("SELECT * FROM slips WHERE id = ? AND workspace_id = ?").bind(slipId, user.workspace_id).first();
  if (!s) return json({ error: "Slip not found" }, 404);
  await env.SLIPS.delete(s.file_key);
  await env.DB.prepare("DELETE FROM slips WHERE id = ?").bind(slipId).run();
  return json({ ok: true });
}
__name(deleteSlip, "deleteSlip");
function formatSlip(s, url = null) {
  return {
    id: s.id,
    transactionId: s.transaction_id,
    fileName: s.file_name,
    fileSize: s.file_size,
    mimeType: s.mime_type,
    slipType: s.slip_type,
    ocrData: s.ocr_data ? (() => { try { return JSON.parse(s.ocr_data); } catch { return null; } })() : null,
    url: url || null,
    createdAt: s.created_at
  };
}
__name(formatSlip, "formatSlip");

// ── LINE User Mappings ────────────────────────────────────────
async function listLineUsers(env, user) {
  const rows = await env.DB.prepare(
    "SELECT * FROM line_user_mappings WHERE workspace_id = ? ORDER BY created_at DESC"
  ).bind(user.workspace_id).all();
  return json({ lineUsers: (rows.results || []).map(r => ({
    id: r.id, lineUserId: r.line_user_id, employeeName: r.employee_name,
    lineDisplayName: r.line_display_name, createdAt: r.created_at,
  })) });
}
__name(listLineUsers, "listLineUsers");

async function upsertLineUser(request, env, user) {
  const { lineUserId, employeeName, lineDisplayName } = await request.json();
  if (!lineUserId || !employeeName) return json({ error: "lineUserId and employeeName required" }, 400);
  const existing = await env.DB.prepare(
    "SELECT id FROM line_user_mappings WHERE line_user_id = ?"
  ).bind(lineUserId).first();
  if (existing) {
    await env.DB.prepare(
      "UPDATE line_user_mappings SET employee_name = ?, line_display_name = ? WHERE id = ?"
    ).bind(employeeName, lineDisplayName || null, existing.id).run();
    return json({ ok: true, updated: true });
  }
  const id = "lu_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await env.DB.prepare(
    "INSERT INTO line_user_mappings (id, workspace_id, line_user_id, employee_name, line_display_name) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, user.workspace_id, lineUserId, employeeName, lineDisplayName || null).run();
  return json({ ok: true, id });
}
__name(upsertLineUser, "upsertLineUser");

async function deleteLineUser(id, env, user) {
  const r = await env.DB.prepare(
    "SELECT id FROM line_user_mappings WHERE id = ? AND workspace_id = ?"
  ).bind(id, user.workspace_id).first();
  if (!r) return json({ error: "Not found" }, 404);
  await env.DB.prepare("DELETE FROM line_user_mappings WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
__name(deleteLineUser, "deleteLineUser");

async function lookupLineUser(request, env, user) {
  const lineUserId = new URL(request.url).searchParams.get("lid") || "";
  if (!lineUserId) return json({ employee: null });
  const r = await env.DB.prepare(
    "SELECT employee_name, line_display_name FROM line_user_mappings WHERE line_user_id = ? AND workspace_id = ?"
  ).bind(lineUserId, user.workspace_id).first();
  return json({ employee: r ? { name: r.employee_name, displayName: r.line_display_name } : null });
}
__name(lookupLineUser, "lookupLineUser");

async function handleWebSocket(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("Token required", { status: 401 });
  const payload = await verifyJWT(token, env);
  if (!payload) return new Response("Invalid token", { status: 401 });
  const id = env.REALTIME.idFromName(payload.ws);
  const stub = env.REALTIME.get(id);
  return stub.fetch(request);
}
__name(handleWebSocket, "handleWebSocket");
async function broadcastChange(env, workspaceId, message) {
  try {
    const id = env.REALTIME.idFromName(workspaceId);
    const stub = env.REALTIME.get(id);
    await stub.fetch("https://internal/broadcast", { method: "POST", body: JSON.stringify(message) });
  } catch (e) {
    console.error("broadcast fail:", e);
  }
}
__name(broadcastChange, "broadcastChange");
var WorkspaceRoom = class {
  static {
    __name(this, "WorkspaceRoom");
  }
  constructor(state, env) {
    this.state = state;
    this.sessions = /* @__PURE__ */ new Set();
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/broadcast") {
      const message = await request.json();
      const data = JSON.stringify({ ...message, ts: (/* @__PURE__ */ new Date()).toISOString() });
      for (const ws of this.sessions) {
        try {
          ws.send(data);
        } catch {
          this.sessions.delete(ws);
        }
      }
      return new Response("ok");
    }
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      await this.handleSession(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return new Response("Expected websocket or /broadcast", { status: 400 });
  }
  async handleSession(ws) {
    ws.accept();
    this.sessions.add(ws);
    ws.send(JSON.stringify({ event: "connected", ts: (/* @__PURE__ */ new Date()).toISOString() }));
    ws.addEventListener("close", () => this.sessions.delete(ws));
    ws.addEventListener("error", () => this.sessions.delete(ws));
    ws.addEventListener("message", (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
      } catch {
      }
    });
  }
};
function formatUser(u) {
  if (!u) return null;
  let settings = null;
  if (u.settings) {
    try {
      settings = JSON.parse(u.settings);
    } catch {
    }
  }
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    workspaceId: u.workspace_id,
    isActive: u.is_active === void 0 ? true : !!u.is_active,
    avatarUrl: u.avatar_url || null,
    phone: u.phone || null,
    language: u.language || "th",
    theme: u.theme || "light",
    settings,
    lastLoginAt: u.last_login_at || null,
    createdAt: u.created_at || null
  };
}
__name(formatUser, "formatUser");
function formatWallet(w) {
  if (!w) return null;
  return {
    id: w.id,
    workspaceId: w.workspace_id,
    name: w.name,
    scope: w.scope,
    type: w.type,
    currentBalance: Number(w.current_balance),
    initialBalance: Number(w.initial_balance),
    creditLimit: w.credit_limit !== null ? Number(w.credit_limit) : null,
    color: w.color,
    icon: w.icon,
    sortOrder: w.sort_order,
    isActive: !!w.is_active,
    staffVisible: w.staff_visible === void 0 ? true : !!w.staff_visible,
    createdAt: w.created_at,
    updatedAt: w.updated_at
  };
}
__name(formatWallet, "formatWallet");
function formatCategory(c, usage) {
  if (!c) return null;
  return {
    id: c.id,
    workspaceId: c.workspace_id,
    parentId: c.parent_id,
    name: c.name,
    color: c.color,
    type: c.type,
    sortOrder: c.sort_order,
    groupName: c.group_name || null,
    usageCount: usage ? (usage[c.id] || 0) : 0,
    isActive: c.is_active === void 0 ? true : !!c.is_active
  };
}
__name(formatCategory, "formatCategory");
function formatTransaction(t) {
  if (!t) return null;
  return {
    id: t.id,
    workspaceId: t.workspace_id,
    createdByUserId: t.created_by_user_id,
    createdByName: t.created_by_name || null,
    walletId: t.wallet_id,
    walletName: t.wallet_name || null,
    walletColor: t.wallet_color || null,
    walletType: t.wallet_type || null,
    categoryId: t.category_id,
    categoryName: t.category_name || null,
    categoryColor: t.category_color || null,
    subCategoryId: t.sub_category_id,
    subCategoryName: t.sub_category_name || null,
    subCategoryColor: t.sub_category_color || null,
    name: t.name,
    amount: Number(t.amount),
    type: t.type,
    scope: t.scope,
    date: t.date,
    note: t.note,
    transferPairId: t.transfer_pair_id || null,
    isReconciled: !!t.is_reconciled,
    isDraft: !!t.is_draft,
    recurringId: t.recurring_id || null,
    submittedBy: t.submitted_by || null,
    pendingChanges: t.pending_changes ? (() => { try { return JSON.parse(t.pending_changes); } catch { return null; } })() : null,
    editedBy: t.edited_by || null,
    editedAt: t.edited_at || null,
    printedBy: t.printed_by || null,
    printedAt: t.printed_at || null,
    printCount: t.print_count || 0,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
}
__name(formatTransaction, "formatTransaction");
function formatRecurring(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    walletId: r.wallet_id,
    categoryId: r.category_id,
    subCategoryId: r.sub_category_id,
    name: r.name,
    amount: Number(r.amount),
    type: r.type,
    scope: r.scope,
    frequency: r.frequency,
    dueDay: r.due_day,
    dueHour: r.due_hour == null ? null : Number(r.due_hour),
    autoCreate: !!r.auto_create,
    draftMode: !!r.draft_mode,
    nextDueDate: r.next_due_date,
    isActive: !!r.is_active,
    createdAt: r.created_at
  };
}
__name(formatRecurring, "formatRecurring");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
__name(json, "json");
function cors(response) {
  const h = new Headers(response.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, { status: response.status, headers: h });
}
__name(cors, "cors");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" }, key, 256);
  return b64(salt) + ":" + b64(new Uint8Array(hash));
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split(":");
  if (!saltB64 || !hashB64) return false;
  const salt = unb64(saltB64);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" }, key, 256);
  return b64(new Uint8Array(hash)) === hashB64;
}
__name(verifyPassword, "verifyPassword");
function b64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}
__name(b64, "b64");
function unb64(str) {
  return new Uint8Array(atob(str).split("").map((c) => c.charCodeAt(0)));
}
__name(unb64, "unb64");
async function signJWT(payload, env) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1e3);
  const fullPayload = { ...payload, iat: now, exp: now + JWT_EXPIRY_HOURS * 3600 };
  const encoder = new TextEncoder();
  const headerB64 = b64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = b64url(encoder.encode(JSON.stringify(fullPayload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}
__name(signJWT, "signJWT");
async function verifyJWT(token, env) {
  try {
    const [headerB64, payloadB64, sigB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) return null;
    const data = `${headerB64}.${payloadB64}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sig = unb64url(sigB64);
    const ok = await crypto.subtle.verify("HMAC", key, sig, encoder.encode(data));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64url(payloadB64)));
    if (payload.exp < Math.floor(Date.now() / 1e3)) return null;
    return payload;
  } catch {
    return null;
  }
}
__name(verifyJWT, "verifyJWT");
function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(b64url, "b64url");
function unb64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return new Uint8Array(atob(str).split("").map((c) => c.charCodeAt(0)));
}
__name(unb64url, "unb64url");
export {
  WorkspaceRoom,
  worker_default as default
};
//# sourceMappingURL=worker.js.map

