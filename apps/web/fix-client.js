var fs = require('fs');
var s = fs.readFileSync('app/page.tsx', 'utf8');

s = s.replace(/^import Link from "next\/link";\n"use client";\n/, '"use client";\nimport Link from "next/link";\n');

fs.writeFileSync('app/page.tsx', s);
console.log("OK: Fixed 'use client' placement.");
