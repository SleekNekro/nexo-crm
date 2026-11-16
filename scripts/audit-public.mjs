import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
// Scan exactly the files Git would publish; never inspect local credentials.
const files = execFileSync('git', ['ls-files', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
if (!files.length) throw Error('Stage source files before running audit:public');
const blockedPath = /(^|\/)(\.env(?:\..*)?|backups|storage|\.storage|\.tools|node_modules|releases)(\/|$)|\.(dump|sql|pem|p12|jks|keystore|apk|exe|dmg)$/i;
const patterns = [
 /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
 /(?:ghp|gho|github_pat)_[A-Za-z0-9_]{25,}/,
 /AKIA[0-9A-Z]{16}/,
 /\bES\d{2}(?:\s?\d{4}){5}\b/,
 /\/Users\/[A-Za-z0-9_.-]+\//,
];
const errors=[];
for(const file of files){
 if(blockedPath.test(file) && file!=='.env.example') errors.push(`${file}: forbidden file`);
 if(/\.(png|ico|icns|jar|gif)$/.test(file))continue;
 const text=readFileSync(file,'utf8');
 for(const pattern of patterns)if(pattern.test(text)) errors.push(`${file}: sensitive-pattern match`);
}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`OK: ${files.length} tracked files; no blocked paths or secret patterns. Manual review still required.`);
