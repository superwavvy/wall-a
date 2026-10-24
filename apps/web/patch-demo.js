var fs = require('fs');
var s = fs.readFileSync('app/demo/page.tsx', 'utf8');

var oldFetch = `      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firewallEnabled: firewall, scenario: selectedScenario, step, actionId: pendingActionId })
      });
      const data = await res.json();`;

var newFetch = `      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firewallEnabled: firewall, scenario: selectedScenario, step, actionId: pendingActionId })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        setLogs(prev => [...prev, \`[SERVER ERROR] \${res.status}: \${errorText}\`]);
        setRunning(false);
        return;
      }
      
      const data = await res.json();
      if (!data.logs) {
        setLogs(prev => [...prev, "[SERVER ERROR] Invalid response format."]);
        setRunning(false);
        return;
      }`;

s = s.replace(oldFetch, newFetch);
fs.writeFileSync('app/demo/page.tsx', s);
console.log("OK: Demo page patched with error handling.");
