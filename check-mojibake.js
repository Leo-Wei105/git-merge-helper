const fs = require('fs');
const path = require('path');

function checkFileForMojibake(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Check for common GBK decoding as UTF-8 mojibake patterns
        const mojibakePatterns = /[鏇鏇存柊锟斤拷鐣岄潰缂栬緫鍣]/;
        if (mojibakePatterns.test(content)) {
            console.log('Possible mojibake found in:', filePath);
            // Print surrounding context
            const match = content.match(new RegExp('.{0,20}' + mojibakePatterns.source + '.{0,20}'));
            if (match) console.log('Context:', match[0]);
        }
    } catch (e) {}
}

function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'out') continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            scanDir(fullPath);
        } else if (file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.ts')) {
            checkFileForMojibake(fullPath);
        }
    }
}

scanDir(__dirname);
console.log('Scan complete.');
