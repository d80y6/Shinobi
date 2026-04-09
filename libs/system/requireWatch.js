const Module = require('module');
const originalCompile = Module.prototype._compile;

Module.prototype._compile = function (content, filename) {
  if (!filename.includes('node_modules')) {

    const getLine = (src, index) => src.substring(0, index).split('\n').length;

    const inject = (src, regex, getName) => {
      return src.replace(regex, (match, ...args) => {
        const offset = args[args.length - 2]; // index of match in string
        const line = getLine(src, offset);
        const name = getName(...args);
        return match + '\n  console.log("[" + new Date().toISOString() + "] ' + name + '() line ' + line + ' — ' + filename + '");';
      });
    };

    // Named function declarations: function foo() {
    content = inject(
      content,
      /\bfunction\s+(\w+)\s*\([^)]*\)\s*\{/g,
      (name) => name
    );

    // Named function expressions: const/let/var foo = [async] function() {
    content = inject(
      content,
      /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function[^(]*\([^)]*\)\s*\{/g,
      (name) => name
    );

  }
  return originalCompile.call(this, content, filename);
};
