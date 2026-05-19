const fs = require('fs');

const pkgStr = fs.readFileSync('package.json', 'utf-8');
const pkg = JSON.parse(pkgStr);

const zhCnDict = {};
const enDict = {};

let keyId = 1;
function genKey(prefix) {
    return prefix + '.' + (keyId++);
}

function processObj(obj, prefix) {
    if (!obj) return;
    for (const key in obj) {
        if (typeof obj[key] === 'string') {
            if (obj[key].match(/[\u4e00-\u9fa5]/)) { // has Chinese
                const dictKey = genKey(prefix + '.' + key);
                zhCnDict[dictKey] = obj[key];
                obj[key] = '%' + dictKey + '%';
            }
        } else if (typeof obj[key] === 'object') {
            processObj(obj[key], prefix + '.' + key);
        }
    }
}

// only process specific fields to avoid breaking configurations
processObj(pkg.contributes.commands, 'command');
processObj(pkg.contributes.configuration, 'config');
processObj(pkg.contributes.submenus, 'submenu');

if (pkg.description && pkg.description.match(/[\u4e00-\u9fa5]/)) {
    zhCnDict['extension.description'] = pkg.description;
    pkg.description = '%extension.description%';
}
if (pkg.displayName && pkg.displayName.match(/[\u4e00-\u9fa5]/)) {
    zhCnDict['extension.displayName'] = pkg.displayName;
    pkg.displayName = '%extension.displayName%';
}

fs.writeFileSync('package.json.new', JSON.stringify(pkg, null, 2));
fs.writeFileSync('package.nls.zh-cn.json', JSON.stringify(zhCnDict, null, 2));
fs.writeFileSync('package.nls.json.temp', JSON.stringify(zhCnDict, null, 2));

console.log('Done.');
