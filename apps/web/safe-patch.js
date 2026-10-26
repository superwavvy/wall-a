var fs = require('fs');
var s = fs.readFileSync('app/page.tsx', 'utf8');

// 1. Fix Caching
var oldApprovals = 'fetch("/api/approvals", { headers: { "x-client-id": cid } })';
var newApprovals = 'fetch("/api/approvals", { headers: { "x-client-id": cid }, cache: "no-store" })';
if (!s.includes(oldApprovals)) { console.error("FAIL: Could not find approvals fetch."); process.exit(1); }
s = s.replace(oldApprovals, newApprovals);

var oldAudit = 'fetch("/api/audit", { headers: { "x-client-id": cid } })';
var newAudit = 'fetch("/api/audit", { headers: { "x-client-id": cid }, cache: "no-store" })';
if (!s.includes(oldAudit)) { console.error("FAIL: Could not find audit fetch."); process.exit(1); }
s = s.replace(oldAudit, newAudit);

// 2. Add clearActivity function before fetchData
var oldFetch = '  const fetchData = async () => {';
var newFetch = `  const clearActivity = async () => {
    if (!confirm("Clear recent activity? (Audit logs will be kept)")) return;
    await fetch("/api/actions/clear", { method: "DELETE", headers: { "x-client-id": getClientId() } });
    fetchData();
  };

` + oldFetch;
if (!s.includes(oldFetch)) { console.error("FAIL: Could not find fetchData function."); process.exit(1); }
s = s.replace(oldFetch, newFetch);

// 3. Add the Clear activity button
var oldTitle = '<h2 className="text-lg font-semibold text-white">Recent activity</h2>';
var newTitle = `<div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Recent activity</h2>
              <button onClick={clearActivity} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Clear activity</button>
            </div>`;
if (!s.includes(oldTitle)) { console.error("FAIL: Could not find Recent activity title."); process.exit(1); }
s = s.replace(oldTitle, newTitle);

fs.writeFileSync('app/page.tsx', s);
console.log("OK: UI safely patched.");
