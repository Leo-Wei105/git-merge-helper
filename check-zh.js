const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function getFiles(dir, files = []) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            getFiles(fullPath, files);
        } else if (fullPath.endsWith('.ts')) {
            files.push(fullPath);
        }
    }
    return files;
}

const files = getFiles(srcDir);
let count = 0;
files.forEach(file => {
    const code = fs.readFileSync(file, 'utf-8');
    const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    function visit(node) {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            if (/[\u4e00-\u9fa5]/.test(node.text)) count++;
        } else if (ts.isTemplateExpression(node)) {
            let fullText = node.head.text;
            node.templateSpans.forEach((span, index) => {
                fullText += '{' + index + '}' + span.literal.text;
            });
            if (/[\u4e00-\u9fa5]/.test(fullText)) count++;
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
});
console.log('Total Chinese strings:', count);
