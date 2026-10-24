var fs = require('fs');
var s = fs.readFileSync('app/page.tsx', 'utf8');

var oldFetch = `  const fetchData = async () => {
    const [actionsRes, auditRes] = await Promise.all([
      fetch("/api/approvals"),
      fetch("/api/audit")
    ]);
    
    setActions(await actionsRes.json());
    
    const auditData = await auditRes.json();
    setAuditLogs(auditData.logs);
    setChainValid(auditData.isValid);
  };`;

var newFetch = `  const fetchData = async () => {
    try {
      const [actionsRes, auditRes] = await Promise.all([
        fetch("/api/approvals"),
        fetch("/api/audit")
      ]);
      
      if (actionsRes.ok) setActions(await actionsRes.json());
      
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAuditLogs(auditData.logs || []);
        setChainValid(auditData.isValid || false);
      } else {
        console.error("Audit API failed with status:", auditRes.status);
      }
    } catch (e) {
      console.error("Failed to fetch data:", e);
    }
  };`;

s = s.replace(oldFetch, newFetch);
fs.writeFileSync('app/page.tsx', s);
console.log("OK: Frontend patched with error handling.");
