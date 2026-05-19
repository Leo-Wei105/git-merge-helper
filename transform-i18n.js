const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const i18nDict = {}; 

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

function transform(context) {
    const factory = context.factory;
    return (sourceFile) => {
        let hasVscodeImport = false;
        
        function visitor(node) {
            if (ts.isImportDeclaration(node)) {
                if (node.moduleSpecifier.text === 'vscode') {
                    hasVscodeImport = true;
                }
            }
            
            if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
                if (/[\u4e00-\u9fa5]/.test(node.text)) {
                    if (node.parent && ts.isCallExpression(node.parent) && 
                        node.parent.expression.getText(sourceFile) === 'vscode.l10n.t') {
                        return node;
                    }
                    
                    i18nDict[node.text] = node.text; 
                    
                    return factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            factory.createPropertyAccessExpression(
                                factory.createIdentifier("vscode"),
                                factory.createIdentifier("l10n")
                            ),
                            factory.createIdentifier("t")
                        ),
                        undefined,
                        [factory.createStringLiteral(node.text)]
                    );
                }
            } 
            else if (ts.isTemplateExpression(node)) {
                let fullText = node.head.text;
                const args = [];
                node.templateSpans.forEach((span, index) => {
                    fullText += '{' + index + '}' + span.literal.text;
                    let argNode = ts.visitNode(span.expression, visitor);
                    
                    // Wrap argNode in String() to prevent type errors (e.g. string | null)
                    args.push(
                        factory.createCallExpression(
                            factory.createIdentifier("String"),
                            undefined,
                            [argNode]
                        )
                    );
                });
                
                if (/[\u4e00-\u9fa5]/.test(fullText)) {
                    i18nDict[fullText] = fullText; 
                    
                    return factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            factory.createPropertyAccessExpression(
                                factory.createIdentifier("vscode"),
                                factory.createIdentifier("l10n")
                            ),
                            factory.createIdentifier("t")
                        ),
                        undefined,
                        [factory.createStringLiteral(fullText), ...args]
                    );
                }
            }
            return ts.visitEachChild(node, visitor, context);
        }
        
        const transformedFile = ts.visitNode(sourceFile, visitor);
        
        const hasChinese = /[\u4e00-\u9fa5]/.test(sourceFile.getFullText());
        if (hasChinese && !hasVscodeImport) {
            const importDecl = factory.createImportDeclaration(
                undefined,
                factory.createImportClause(
                    false,
                    undefined,
                    factory.createNamespaceImport(factory.createIdentifier("vscode"))
                ),
                factory.createStringLiteral("vscode"),
                undefined
            );
            return factory.updateSourceFile(transformedFile, [importDecl, ...transformedFile.statements]);
        }
        return transformedFile;
    };
}

files.forEach(file => {
    const code = fs.readFileSync(file, 'utf-8');
    if (!/[\u4e00-\u9fa5]/.test(code)) return;
    
    const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    
    const result = ts.transform(sourceFile, [transform]);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const newCode = printer.printFile(result.transformed[0]);
    
    fs.writeFileSync(file, newCode);
});

fs.writeFileSync('i18n-extract.json', JSON.stringify(i18nDict, null, 2));
console.log('Done.');
